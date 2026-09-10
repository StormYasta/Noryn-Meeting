import { app, net } from 'electron';
import path from 'path';
import { env, pipeline } from '@huggingface/transformers';
import { TranscriptSegment } from '../../src/types/meeting';
import { AudioPipelineConfig } from './audio-config';
import { AudioSegmenter, ReadyAudioChunk } from './audio-segmenter';
import { HallucinationGuard } from './hallucination-guard';
import { TextDeduplicator } from './text-deduplicator';
import { AudioDumper } from './audio-dumper';

export interface WhisperCallbacks {
  onDelta: (data: { text: string; isFinal: boolean; speaker: string }) => void;
  onCompleted: (segment: TranscriptSegment) => void;
  onError: (err: string) => void;
  onStatusChange: (status: 'idle' | 'transcribing' | 'connected' | 'error') => void;
}

type WhisperStatus = 'idle' | 'transcribing' | 'connected' | 'error';

export class LocalWhisperService {
  private modelName: string;
  private transcriber: any = null;
  private isInitializing = false;
  private isProcessing = false;
  private initializationFailed = false;
  private initializationError = '';
  private callbacks: WhisperCallbacks;
  private status: WhisperStatus = 'idle';
  private readonly cacheDir: string;

  // Segmentador com VAD e bufferização inteligente
  private segmenter: AudioSegmenter;
  private meetingStartTime = Date.now();
  private meetingId = 'local';
  private segmentCounter = 0;

  // Histórico recente para deduplicação entre chunks consecutivos
  private recentTexts: string[] = [];
  private lastCompletedText = '';

  constructor(modelName = 'Xenova/whisper-tiny', callbacks: WhisperCallbacks, meetingId = 'local') {
    this.modelName = modelName;
    this.callbacks = callbacks;
    this.meetingId = meetingId;
    this.segmenter = new AudioSegmenter(this.meetingId, AudioPipelineConfig.SAMPLE_RATE, this.meetingStartTime);

    // Fallback seguro caso app do Electron não esteja inicializado (ex: testes em Node)
    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : path.join(process.env.HOME || '', '.config'));
    const defaultUserData = path.join(appData, 'noryn-meeting-copilot');
    const baseCache = typeof app?.getPath === 'function' ? app.getPath('userData') : defaultUserData;
    this.cacheDir = path.join(baseCache, 'transformers-cache');

    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    env.useFSCache = true;
    env.cacheDir = this.cacheDir;
  }

  private setStatus(status: WhisperStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  public getStatus(): WhisperStatus {
    return this.status;
  }

  public getInitializationError(): string {
    return this.initializationError;
  }

  public getCacheDir(): string {
    return this.cacheDir;
  }

  public async initialize(): Promise<boolean> {
    if (this.transcriber) return true;
    if (this.isInitializing) return false;
    if (this.initializationFailed) return false;

    this.isInitializing = true;
    this.setStatus('transcribing');

    // Usar net.fetch do Electron durante o carregamento inicial de modelos se disponível
    const originalFetch = globalThis.fetch;
    if (typeof net?.fetch === 'function') {
      (globalThis as any).fetch = (input: any, init?: any) => net.fetch(input, init);
    }

    try {
      console.log(`[Whisper Local] Cache persistente: ${this.cacheDir}`);
      console.log(`[Whisper Local] Carregando ${this.modelName} com Transformers.js v3...`);

      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        this.modelName,
        {
          dtype: 'q8',
          progress_callback: (event: any) => {
            if (!event || !['initiate', 'download', 'done'].includes(event.status)) return;
            const file = event.file ? ` ${event.file}` : '';
            console.log(`[Whisper Local] ${event.status}${file}`);
          },
        } as any
      );

      this.isInitializing = false;
      this.initializationFailed = false;
      this.initializationError = '';
      this.setStatus('connected');
      console.log(`[Whisper Local] Modelo ${this.modelName} carregado com sucesso.`);
      return true;
    } catch (err: any) {
      this.isInitializing = false;
      this.initializationFailed = true;
      this.initializationError = err?.message || String(err);
      this.transcriber = null;
      this.setStatus('error');

      const causeCode = err?.cause?.code || '';
      const isNetworkFailure =
        causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
        this.initializationError.toLowerCase().includes('fetch failed') ||
        this.initializationError.toLowerCase().includes('network');
      const networkHint = isNetworkFailure
        ? ` Não foi possível baixar os arquivos do modelo. Cache local: ${this.cacheDir}.`
        : '';

      this.callbacks.onError(`Falha ao carregar Whisper local: ${this.initializationError}.${networkHint}`);
      console.error('[Whisper Local] Falha fatal de inicialização:', err);
      return false;
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  }

  public resetMeeting(startTime: number, meetingId: string = 'local') {
    this.meetingStartTime = startTime;
    this.meetingId = meetingId;
    this.segmentCounter = 0;
    this.recentTexts = [];
    this.lastCompletedText = '';
    this.segmenter = new AudioSegmenter(this.meetingId, AudioPipelineConfig.SAMPLE_RATE, this.meetingStartTime);
  }

  /**
   * Alimenta um frame de áudio (16kHz Float32 mono). O segmentador inteligente
   * só liberará um chunk se houver energia vocal real (proteção contra silêncio).
   */
  public async feedAudioChunk(samples: Float32Array, speakerTag: string = 'Cliente') {
    if (this.initializationFailed) return;

    if (!this.transcriber && !this.isInitializing) {
      void this.initialize();
    }

    const readyChunk = this.segmenter.pushFrame(samples, speakerTag);
    if (readyChunk && !this.isProcessing) {
      await this.processChunk(readyChunk);
    }
  }

  /**
   * Processa um chunk pronto de áudio validado pelo VAD com proteção contra alucinações e deduplicação.
   */
  private async processChunk(chunk: ReadyAudioChunk) {
    if (!this.transcriber) return;

    this.isProcessing = true;
    const startedAt = Date.now();

    // Log estruturado com ID único, métricas de energia e hash do áudio
    console.log(
      `[STT_CHUNK] meeting=${chunk.meetingId} chunk=${chunk.sequence} ` +
      `range=${chunk.startSeconds.toFixed(1)}s-${chunk.endSeconds.toFixed(1)}s ` +
      `dur=${chunk.durationSeconds.toFixed(1)}s bytes=${chunk.samples.byteLength} ` +
      `rms=${chunk.rms} peak=${chunk.peak} speechRatio=${(chunk.speechRatio * 100).toFixed(1)}% ` +
      `hash=${chunk.hash} spk=${chunk.speaker}`
    );

    // Dump de diagnóstico para dev (WAV)
    AudioDumper.dumpWavChunk(chunk.meetingId, chunk.sequence, chunk.samples, chunk.sampleRate, 'input');

    try {
      this.setStatus('transcribing');

      // Executa o Whisper com parâmetros defensivos
      const result = await this.transcriber(chunk.samples, {
        language: AudioPipelineConfig.STT_LANGUAGE,
        task: AudioPipelineConfig.STT_TASK,
        temperature: AudioPipelineConfig.STT_TEMPERATURE,
        repetition_penalty: AudioPipelineConfig.STT_REPETITION_PENALTY,
        no_repeat_ngram_size: AudioPipelineConfig.STT_NO_REPEAT_NGRAM_SIZE,
      });

      const latencyMs = Date.now() - startedAt;
      const rawText = (result?.text || '').trim();

      // 1. Barreira de Sanity Check e Detecção de Alucinação (HallucinationGuard)
      const validation = HallucinationGuard.validate(rawText, chunk.durationSeconds, chunk.speechRatio);

      if (!validation.isValid) {
        console.warn(
          `[STT_REJECTED] chunk=${chunk.sequence} reason="${validation.reason}" ` +
          `latency=${latencyMs}ms text="${rawText}"`
        );
        AudioDumper.dumpWavChunk(chunk.meetingId, chunk.sequence, chunk.samples, chunk.sampleRate, 'hallucination');
        this.setStatus('connected');
        return;
      }

      let cleanText = validation.sanitizedText;

      // 2. Deduplicação com chunks recentes (evita o mesmo texto repetido de novo)
      if (TextDeduplicator.isDuplicateOfRecent(cleanText, this.recentTexts)) {
        console.log(`[STT_DUPLICATE_DISCARDED] chunk=${chunk.sequence} text="${cleanText}"`);
        this.setStatus('connected');
        return;
      }

      // 3. Deduplicação de sobreposição de bordas (prefix/suffix overlap)
      if (this.lastCompletedText) {
        const dedupResult = TextDeduplicator.removeOverlap(this.lastCompletedText, cleanText);
        if (dedupResult.overlapWords > 0) {
          console.log(
            `[STT_OVERLAP_MERGE] chunk=${chunk.sequence} removedWords=${dedupResult.overlapWords} ` +
            `before="${cleanText}" after="${dedupResult.text}"`
          );
          cleanText = dedupResult.text.trim();
        }
      }

      // Se após a remoção de sobreposição o texto ficou vazio ou irrelevante, descarta
      if (!cleanText || cleanText.length < 2) {
        this.setStatus('connected');
        return;
      }

      // 4. Montagem do segmento final com timestamps precisos baseados no áudio
      this.segmentCounter++;
      const m = Math.floor(chunk.startSeconds / 60).toString().padStart(2, '0');
      const s = Math.floor(chunk.startSeconds % 60).toString().padStart(2, '0');

      const segment: TranscriptSegment = {
        id: `seg_${Date.now()}_${this.segmentCounter}`,
        speaker: chunk.speaker,
        text: cleanText,
        timestamp: Math.round(chunk.startSeconds),
        formattedTime: `${m}:${s}`,
        isFinal: true,
      };

      // Atualiza memória de deduplicação recente
      this.recentTexts.push(cleanText);
      if (this.recentTexts.length > 5) this.recentTexts.shift();
      this.lastCompletedText = cleanText;

      console.log(
        `[STT_RESULT] chunk=${chunk.sequence} latency=${latencyMs}ms status=valid ` +
        `words=${validation.metrics.wordCount} wps=${validation.metrics.wordsPerSecond} ` +
        `spk=${segment.speaker} text="${cleanText}"`
      );

      this.callbacks.onCompleted(segment);
      this.setStatus('connected');
    } catch (err: any) {
      console.warn(`[Whisper Local] Erro na transcrição do chunk ${chunk.sequence}:`, err);
      this.setStatus('connected');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Força a transcrição de qualquer áudio residual com voz pendente ao encerrar a reunião.
   */
  public async flushRemainingAudio(fallbackSpeaker: string = 'Cliente') {
    if (!this.transcriber) return;
    const residualChunk = this.segmenter.flush();
    if (residualChunk && !this.isProcessing) {
      if (!residualChunk.speaker) {
        residualChunk.speaker = (fallbackSpeaker as any) || 'Cliente';
      }
      await this.processChunk(residualChunk);
    }
  }
}
