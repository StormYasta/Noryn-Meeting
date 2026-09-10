import crypto from 'crypto';
import { AudioPipelineConfig } from './audio-config';
import { Speaker } from '../../src/types/meeting';

export interface ReadyAudioChunk {
  chunkId: string;
  sequence: number;
  meetingId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  samples: Float32Array;
  sampleRate: number;
  speaker: Speaker;
  rms: number;
  peak: number;
  speechRatio: number;
  hash: string;
}

export class AudioSegmenter {
  private meetingId: string;
  private sampleRate: number;
  private buffer: number[] = [];
  private sequence = 0;
  private meetingStartTime: number;

  // Rastreamento de VAD e energia
  private voicedSamples = 0;
  private consecutiveSilenceSamples = 0;
  private segmentStartOffsetSamples = 0;
  private totalSamplesProcessed = 0;

  // Votação ponderada de speaker durante trechos de fala
  private speakerVoiceEnergy: Record<string, number> = {
    Eu: 0,
    Cliente: 0,
    Participante: 0,
  };

  constructor(meetingId: string, sampleRate = AudioPipelineConfig.SAMPLE_RATE, meetingStartTime = Date.now()) {
    this.meetingId = meetingId;
    this.sampleRate = sampleRate;
    this.meetingStartTime = meetingStartTime;
  }

  public reset(newStartTime = Date.now()): void {
    this.meetingStartTime = newStartTime;
    this.buffer = [];
    this.sequence = 0;
    this.voicedSamples = 0;
    this.consecutiveSilenceSamples = 0;
    this.segmentStartOffsetSamples = 0;
    this.totalSamplesProcessed = 0;
    this.resetSpeakerVotes();
  }

  private resetSpeakerVotes(): void {
    this.speakerVoiceEnergy = { Eu: 0, Cliente: 0, Participante: 0 };
  }

  /**
   * Alimenta um frame de áudio (16kHz Float32 mono) e retorna um ReadyAudioChunk se
   * um turno de fala completo e válido foi acumulado.
   */
  public pushFrame(frame: Float32Array, currentSpeakerTag: string = 'Cliente'): ReadyAudioChunk | null {
    if (!frame || frame.length === 0) return null;

    // 1. Calcula métricas de energia deste frame
    let frameSumSquares = 0;
    let framePeak = 0;
    for (let i = 0; i < frame.length; i++) {
      const val = frame[i];
      const absVal = Math.abs(val);
      if (absVal > framePeak) framePeak = absVal;
      frameSumSquares += val * val;
    }
    const frameRms = Math.sqrt(frameSumSquares / frame.length);
    const isVoiced = frameRms >= AudioPipelineConfig.VAD_ENERGY_THRESHOLD;

    // 2. Acumula amostras no buffer
    for (let i = 0; i < frame.length; i++) {
      this.buffer.push(frame[i]);
    }
    this.totalSamplesProcessed += frame.length;

    // 3. Atualiza métricas de fala e silêncio
    if (isVoiced) {
      this.voicedSamples += frame.length;
      this.consecutiveSilenceSamples = 0;

      // Votação de speaker ponderada pela energia durante fala ativa
      const normalizedSpeaker = currentSpeakerTag === 'Eu' || currentSpeakerTag === 'Gabriel' ? 'Eu' : 'Cliente';
      this.speakerVoiceEnergy[normalizedSpeaker] = (this.speakerVoiceEnergy[normalizedSpeaker] || 0) + frameRms * frame.length;
    } else {
      this.consecutiveSilenceSamples += frame.length;
    }

    // 4. Critérios de disparo de chunk
    const currentDurationS = this.buffer.length / this.sampleRate;
    const silenceDurationS = this.consecutiveSilenceSamples / this.sampleRate;

    const isEndOfTurn =
      currentDurationS >= AudioPipelineConfig.CHUNK_MIN_DURATION_S &&
      silenceDurationS >= AudioPipelineConfig.CHUNK_END_OF_TURN_SILENCE_S;

    const isMaxDurationReached = currentDurationS >= AudioPipelineConfig.CHUNK_MAX_DURATION_S;

    if (!isEndOfTurn && !isMaxDurationReached) {
      return null;
    }

    // 5. O chunk atingiu o critério de fechamento. Avaliar se contém voz real.
    return this.finalizeCurrentSegment(isMaxDurationReached);
  }

  /**
   * Finaliza o segmento atual, validando VAD e energia.
   */
  private finalizeCurrentSegment(splitByMaxDuration: boolean): ReadyAudioChunk | null {
    const totalSamples = this.buffer.length;
    if (totalSamples === 0) return null;

    const durationSeconds = Math.round((totalSamples / this.sampleRate) * 10) / 10;
    const speechRatio = this.voicedSamples / totalSamples;

    // Calcula RMS e Peak gerais do segmento
    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < totalSamples; i++) {
      const val = this.buffer[i];
      const absVal = Math.abs(val);
      if (absVal > peak) peak = absVal;
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / totalSamples);

    // =========================================================================
    // GUARDA DE SILÊNCIO / RUÍDO BRANCO (FASE 3):
    // Se não há proporção mínima de voz OU o RMS geral é insignificante, descarta!
    // =========================================================================
    if (speechRatio < AudioPipelineConfig.VAD_MIN_SPEECH_RATIO || rms < AudioPipelineConfig.MIN_CHUNK_RMS) {
      // Descarta o buffer silencioso sem enviar para o STT
      this.buffer = [];
      this.voicedSamples = 0;
      this.consecutiveSilenceSamples = 0;
      this.segmentStartOffsetSamples = this.totalSamplesProcessed;
      this.resetSpeakerVotes();
      return null;
    }

    // Determina o speaker vencedor com base na energia durante os momentos de voz ativa
    let winnerSpeaker: Speaker = 'Cliente';
    if (this.speakerVoiceEnergy['Eu'] > this.speakerVoiceEnergy['Cliente']) {
      winnerSpeaker = 'Eu';
    }

    this.sequence++;
    const chunkId = `chk_${this.meetingId}_${this.sequence}`;
    const chunkSamples = new Float32Array(this.buffer);

    // Calcula Hash SHA-256 do áudio para rastreabilidade
    const hash = crypto
      .createHash('sha256')
      .update(Buffer.from(chunkSamples.buffer, chunkSamples.byteOffset, chunkSamples.byteLength))
      .digest('hex')
      .slice(0, 12);

    const startSeconds = Math.round((this.segmentStartOffsetSamples / this.sampleRate) * 10) / 10;
    const endSeconds = Math.round(((this.segmentStartOffsetSamples + totalSamples) / this.sampleRate) * 10) / 10;

    // =========================================================================
    // TRATAMENTO DE OVERLAP (FASE 4):
    // Se o corte ocorreu por estourar CHUNK_MAX_DURATION_S no meio de uma fala contínua,
    // preserva os últimos CHUNK_MAX_SPLIT_OVERLAP_S no buffer para o próximo chunk.
    // Se foi fim de turno por silêncio, limpa o buffer completamente.
    // =========================================================================
    if (splitByMaxDuration) {
      const overlapSamplesCount = Math.floor(AudioPipelineConfig.CHUNK_MAX_SPLIT_OVERLAP_S * this.sampleRate);
      this.buffer = this.buffer.slice(this.buffer.length - overlapSamplesCount);
      this.segmentStartOffsetSamples = this.totalSamplesProcessed - overlapSamplesCount;
      this.voicedSamples = Math.floor(overlapSamplesCount * speechRatio);
    } else {
      this.buffer = [];
      this.segmentStartOffsetSamples = this.totalSamplesProcessed;
      this.voicedSamples = 0;
    }

    this.consecutiveSilenceSamples = 0;
    this.resetSpeakerVotes();

    return {
      chunkId,
      sequence: this.sequence,
      meetingId: this.meetingId,
      startSeconds,
      endSeconds,
      durationSeconds,
      samples: chunkSamples,
      sampleRate: this.sampleRate,
      speaker: winnerSpeaker,
      rms: Math.round(rms * 10000) / 10000,
      peak: Math.round(peak * 1000) / 1000,
      speechRatio: Math.round(speechRatio * 1000) / 1000,
      hash,
    };
  }

  /**
   * Força a liberação de qualquer áudio residual com voz pendente no buffer (ao encerrar reunião).
   */
  public flush(): ReadyAudioChunk | null {
    if (this.buffer.length < this.sampleRate * 0.8) {
      this.buffer = [];
      return null;
    }
    return this.finalizeCurrentSegment(false);
  }
}
