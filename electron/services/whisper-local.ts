import { pipeline } from '@xenova/transformers';
import { TranscriptSegment } from '../../src/types/meeting';

export interface WhisperCallbacks {
  onDelta: (data: { text: string; isFinal: boolean; speaker: string }) => void;
  onCompleted: (segment: TranscriptSegment) => void;
  onError: (err: string) => void;
  onStatusChange: (status: 'idle' | 'transcribing' | 'connected' | 'error') => void;
}

export class LocalWhisperService {
  private modelName: string;
  private transcriber: any = null;
  private isInitializing = false;
  private isProcessing = false;
  private callbacks: WhisperCallbacks;
  
  // Audio accumulator: 16kHz Float32Array
  private audioBuffer: number[] = [];
  private readonly SAMPLE_RATE = 16000;
  private readonly MIN_AUDIO_LENGTH = 16000 * 1.5; // at least 1.5 seconds of audio
  private readonly MAX_AUDIO_LENGTH = 16000 * 5.0; // max 5 seconds before forcing transcription
  private silenceFrames = 0;
  private meetingStartTime = Date.now();
  private segmentCounter = 0;

  constructor(modelName = 'Xenova/whisper-tiny', callbacks: WhisperCallbacks) {
    this.modelName = modelName;
    this.callbacks = callbacks;
  }

  public async initialize(): Promise<boolean> {
    if (this.transcriber) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    this.callbacks.onStatusChange('transcribing');

    try {
      this.transcriber = await pipeline('automatic-speech-recognition', this.modelName);
      this.isInitializing = false;
      this.callbacks.onStatusChange('connected');
      console.log(`[Whisper Local] Modelo ${this.modelName} carregado com sucesso.`);
      return true;
    } catch (err: any) {
      this.isInitializing = false;
      this.callbacks.onStatusChange('error');
      this.callbacks.onError(`Falha ao carregar Whisper local: ${err.message || String(err)}`);
      return false;
    }
  }

  public resetMeeting(startTime: number) {
    this.meetingStartTime = startTime;
    this.audioBuffer = [];
    this.silenceFrames = 0;
    this.segmentCounter = 0;
  }

  public async feedAudioChunk(samples: Float32Array, speakerTag: string = 'Cliente') {
    if (!this.transcriber && !this.isInitializing) {
      this.initialize();
    }

    // Append samples to buffer
    for (let i = 0; i < samples.length; i++) {
      this.audioBuffer.push(samples[i]);
    }

    // Calculate RMS energy of current chunk
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    const isVoice = rms > 0.015; // Noise gate threshold

    if (!isVoice) {
      this.silenceFrames++;
    } else {
      this.silenceFrames = 0;
    }

    // If we have collected enough audio and silence is detected (turn completed)
    // OR if we hit maximum buffer length, trigger transcription
    const hasEnoughAudio = this.audioBuffer.length >= this.MIN_AUDIO_LENGTH;
    const isTurnEnd = this.silenceFrames >= 4 && hasEnoughAudio;
    const isBufferFull = this.audioBuffer.length >= this.MAX_AUDIO_LENGTH;

    if ((isTurnEnd || isBufferFull) && !this.isProcessing && this.transcriber) {
      await this.processCurrentBuffer(speakerTag);
    }
  }

  private async processCurrentBuffer(speakerTag: string) {
    if (this.audioBuffer.length < this.SAMPLE_RATE * 0.8) {
      return;
    }

    this.isProcessing = true;
    const audioData = new Float32Array(this.audioBuffer);
    this.audioBuffer = [];
    this.silenceFrames = 0;

    try {
      this.callbacks.onStatusChange('transcribing');
      const result = await this.transcriber(audioData, {
        language: 'portuguese',
        task: 'transcribe',
      });

      const rawText = (result?.text || '').trim();
      
      // Filter common Whisper hallucination on background noise/music
      const isHallucination = /^\[.*\]$/.test(rawText) || /^\(.*\)$/.test(rawText) || rawText.length < 2;

      if (rawText && !isHallucination) {
        this.segmentCounter++;
        const elapsedSec = Math.floor((Date.now() - this.meetingStartTime) / 1000);
        const m = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
        const s = Math.floor(elapsedSec % 60).toString().padStart(2, '0');

        const segment: TranscriptSegment = {
          id: `seg_${Date.now()}_${this.segmentCounter}`,
          speaker: (speakerTag as any) || 'Cliente',
          text: rawText,
          timestamp: elapsedSec,
          formattedTime: `${m}:${s}`,
          isFinal: true,
        };

        this.callbacks.onCompleted(segment);
      }
      this.callbacks.onStatusChange('connected');
    } catch (err: any) {
      console.warn('[Whisper Local] Erro na transcrição do buffer:', err);
      this.callbacks.onStatusChange('connected');
    } finally {
      this.isProcessing = false;
    }
  }

  public async flushRemainingAudio(speakerTag: string) {
    if (this.audioBuffer.length > this.SAMPLE_RATE * 0.5 && this.transcriber) {
      await this.processCurrentBuffer(speakerTag);
    }
  }
}
