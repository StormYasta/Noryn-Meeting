import { app, net } from 'electron';
import path from 'path';
import { env, pipeline } from '@huggingface/transformers';
import { TranscriptSegment } from '../../src/types/meeting';

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

    // Keep downloaded model assets outside node_modules so a clean npm install does
    // not delete them. Electron is already ready when MeetingManager creates this
    // service, so app.getPath('userData') is safe here.
    this.cacheDir = path.join(app.getPath('userData'), 'transformers-cache');

    // Transformers.js uses Node/undici fetch by default in the main process. On
    // Windows that can fail behind system/PAC/authenticated proxies even when
    // Chromium itself has internet access. Electron net.fetch uses Chromium's
    // native network stack and system proxy configuration.
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    env.useFSCache = true;
    env.cacheDir = this.cacheDir;
    env.fetch = ((input: any, init?: any) => net.fetch(input, init)) as any;
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

    // A fatal model/runtime failure used to make every incoming audio chunk retry
    // initialization and flood the UI with duplicate alerts. Keep the service in
    // a stable error state until the app/service is recreated.
    if (this.initializationFailed) {
      return false;
    }

    this.isInitializing = true;
    this.setStatus('transcribing');

    try {
      console.log(`[Whisper Local] Cache persistente: ${this.cacheDir}`);
      console.log(`[Whisper Local] Carregando ${this.modelName} com Transformers.js v3 via Electron net.fetch...`);
      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        this.modelName,
        {
          // q8 keeps the legacy fallback practical on lower-end notebooks.
          dtype: 'q8',
        } as any,
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
      this.audioBuffer = [];
      this.setStatus('error');

      const causeCode = err?.cause?.code || '';
      const networkHint = causeCode === 'UND_ERR_CONNECT_TIMEOUT' || this.initializationError.toLowerCase().includes('fetch failed')
        ? ` Não foi possível baixar os arquivos do modelo. Verifique o acesso à Hugging Face neste computador. Cache local: ${this.cacheDir}.`
        : '';

      this.callbacks.onError(`Falha ao carregar Whisper local: ${this.initializationError}.${networkHint}`);
      console.error('[Whisper Local] Falha fatal de inicialização:', err);
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
    if (this.initializationFailed) return;

    if (!this.transcriber && !this.isInitializing) {
      // Do not await here; audio capture must never block on a model download.
      void this.initialize();
    }

    // Until the model is actually ready, do not accumulate unbounded audio.
    if (!this.transcriber) return;

    // Append samples to buffer
    for (let i = 0; i < samples.length; i++) {
      this.audioBuffer.push(samples[i]);
    }

    // Calculate RMS energy of current chunk
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0;
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

    if ((isTurnEnd || isBufferFull) && !this.isProcessing) {
      await this.processCurrentBuffer(speakerTag);
    }
  }

  private async processCurrentBuffer(speakerTag: string) {
    if (!this.transcriber || this.audioBuffer.length < this.SAMPLE_RATE * 0.8) {
      return;
    }

    this.isProcessing = true;
    const audioData = new Float32Array(this.audioBuffer);
    this.audioBuffer = [];
    this.silenceFrames = 0;

    try {
      this.setStatus('transcribing');
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
      this.setStatus('connected');
    } catch (err: any) {
      console.warn('[Whisper Local] Erro na transcrição do buffer:', err);
      // An inference failure is recoverable; keep the already-loaded model alive.
      this.setStatus('connected');
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
