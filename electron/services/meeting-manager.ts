import { BrowserWindow, shell } from 'electron';
import {
  MeetingConfig,
  MeetingMetadata,
  MeetingState,
  TranscriptSegment,
  ServiceStatus,
  CopilotManualResponse,
  FinalReportData,
} from '../../src/types/meeting';
import { LocalWhisperService } from './whisper-local';
import { AIProvider, OllamaProvider, RuleBasedProvider, AnalystInput } from './ai-provider';
import { SessionStorage } from './session-storage';
import { RuleEngine } from './rule-engine';
import { detectHardware } from './hardware-detector';

export class MeetingManager {
  private win: BrowserWindow;
  private storage: SessionStorage;
  private whisper: LocalWhisperService | null = null;
  private aiProvider: AIProvider;
  
  // Active session state
  private activeMeetingId: string | null = null;
  private metadata: MeetingMetadata | null = null;
  private meetingState: MeetingState;
  private transcript: TranscriptSegment[] = [];
  private rawPcmRecordings: number[] = [];
  
  // Timer & Periodic loop
  private startTime = 0;
  private isPaused = false;
  private analysisTimer: NodeJS.Timeout | null = null;
  private lastAnalyzedSegmentIndex = 0;
  private hardwareLabel = 'Detectando...';

  constructor(win: BrowserWindow, storage: SessionStorage) {
    this.win = win;
    this.storage = storage;
    this.aiProvider = new RuleBasedProvider(); // default local rule provider
    this.meetingState = this.getInitialState();
  }

  public async initialize(): Promise<void> {
    await this.storage.initialize();
    
    // Hardware detection
    const hw = await detectHardware();
    this.hardwareLabel = hw.hasCuda ? `${hw.gpuName} (${hw.vramGB}GB VRAM)` : `${hw.cpuName} (${hw.cores} cores)`;

    // Check if Ollama is available
    const ollama = new OllamaProvider();
    if (await ollama.isAvailable()) {
      this.aiProvider = ollama;
    }

    this.sendServiceStatus();
  }

  public async startMeeting(config: MeetingConfig): Promise<{ success: boolean; meetingId: string }> {
    const meetingId = `meeting_${Date.now()}`;
    this.activeMeetingId = meetingId;
    this.startTime = Date.now();
    this.isPaused = false;
    this.transcript = [];
    this.rawPcmRecordings = [];
    this.lastAnalyzedSegmentIndex = 0;
    this.meetingState = this.getInitialState();

    // Select AI Provider based on config
    if (config.aiProvider === 'ollama') {
      const ollama = new OllamaProvider('http://127.0.0.1:11434', config.aiModel || 'qwen2.5:1.5b');
      this.aiProvider = (await ollama.isAvailable()) ? ollama : new RuleBasedProvider();
    } else {
      this.aiProvider = new RuleBasedProvider();
    }

    this.metadata = {
      id: meetingId,
      title: config.title || 'Reunião Comercial — Escritório de Marcas e Patentes',
      contextText: config.contextText || '',
      startedAt: new Date().toLocaleString('pt-BR'),
      durationSeconds: 0,
      participants: ['Vendedor Noryn', 'Cliente (Escritório de Marcas e Patentes)'],
      saveAudio: config.saveAudio || false,
      captureSystemAudio: config.captureSystemAudio ?? true,
      hardwareProfile: config.hardwareProfile || 'balanced',
      sttModel: config.sttModel || 'Whisper Tiny (Local)',
      aiProvider: this.aiProvider.name,
      aiModel: config.aiModel || 'Local Hybrid Engine',
      costEstimate: 'R$ 0,00 (100% Local)',
    };

    // Save initial metadata
    this.storage.saveMeetingMetadata(this.metadata);

    // Initialize Whisper STT
    this.whisper = new LocalWhisperService('Xenova/whisper-tiny', {
      onDelta: (data) => {
        this.win.webContents.send('transcript:delta', data);
      },
      onCompleted: (segment) => {
        this.handleNewSegment(segment);
      },
      onError: (err) => {
        this.win.webContents.send('copilot:alert', {
          title: 'Aviso de Transcrição',
          message: err,
          severity: 'warning',
        });
      },
      onStatusChange: () => {
        // Do not infer STT health from "meeting active". The actual Whisper
        // service status is the source of truth (loading/connected/error).
        this.sendServiceStatus();
      },
    });

    await this.whisper.initialize();
    this.whisper.resetMeeting(this.startTime);

    // Start periodic incremental analysis (every 35s)
    this.startPeriodicAnalysis();

    this.sendServiceStatus();
    this.win.webContents.send('meeting:state-updated', this.meetingState);

    return { success: true, meetingId };
  }

  public handleAudioChunk(pcmFloat32: Float32Array, speakerTag: string = 'Cliente'): void {
    if (!this.activeMeetingId || this.isPaused || !this.whisper) return;

    if (this.metadata?.saveAudio) {
      for (let i = 0; i < pcmFloat32.length; i++) {
        this.rawPcmRecordings.push(pcmFloat32[i]);
      }
    }

    this.whisper.feedAudioChunk(pcmFloat32, speakerTag);
  }

  private handleNewSegment(segment: TranscriptSegment): void {
    this.transcript.push(segment);
    this.win.webContents.send('transcript:completed', segment);

    // 1. Instant Rule-based pass: detect critical triggers & discovery items immediately
    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const { newState, alerts } = RuleEngine.analyzeText(segment.text, this.meetingState, elapsedSec);
    this.meetingState = newState;

    for (const alert of alerts) {
      this.win.webContents.send('copilot:alert', alert);
      if (this.activeMeetingId) {
        this.storage.saveEvent(this.activeMeetingId, {
          type: 'commercial_alert',
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
        });
      }
    }

    // Persist transcript & updated state
    if (this.activeMeetingId) {
      this.storage.saveTranscript(this.activeMeetingId, this.transcript);
      this.storage.saveMeetingState(this.activeMeetingId, this.meetingState);
    }

    this.win.webContents.send('meeting:state-updated', this.meetingState);
  }

  private startPeriodicAnalysis(): void {
    if (this.analysisTimer) clearInterval(this.analysisTimer);

    this.analysisTimer = setInterval(async () => {
      if (!this.activeMeetingId || this.isPaused) return;

      // Only analyze if there is new transcript content
      if (this.transcript.length > this.lastAnalyzedSegmentIndex) {
        await this.runIncrementalAnalysis();
      }
    }, 35000); // 35 seconds
  }

  public async runIncrementalAnalysis(): Promise<{ success: boolean }> {
    if (!this.activeMeetingId) return { success: false };

    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const recent = this.transcript.slice(-10);
    this.lastAnalyzedSegmentIndex = this.transcript.length;

    const input: AnalystInput = {
      meetingTitle: this.metadata?.title || '',
      contextText: this.metadata?.contextText || '',
      summarySoFar: this.meetingState.summarySoFar,
      currentState: this.meetingState,
      recentTranscript: recent,
      allTranscript: this.transcript,
      elapsedSeconds: elapsedSec,
    };

    try {
      const updatedState = await this.aiProvider.analyzeIncremental(input);
      this.meetingState = updatedState;
      this.storage.saveMeetingState(this.activeMeetingId, this.meetingState);
      this.win.webContents.send('meeting:state-updated', this.meetingState);
      return { success: true };
    } catch (e) {
      console.warn('[MeetingManager] Falha no analista LLM, mantendo estado das regras:', e);
      return { success: false };
    }
  }

  public async askCopilot(query: string): Promise<CopilotManualResponse> {
    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const input: AnalystInput = {
      meetingTitle: this.metadata?.title || '',
      contextText: this.metadata?.contextText || '',
      summarySoFar: this.meetingState.summarySoFar,
      currentState: this.meetingState,
      recentTranscript: this.transcript.slice(-8),
      allTranscript: this.transcript,
      elapsedSeconds: elapsedSec,
    };

    return await this.aiProvider.askCopilot(query, input);
  }

  public async helpWithObjection(): Promise<CopilotManualResponse> {
    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const input: AnalystInput = {
      meetingTitle: this.metadata?.title || '',
      contextText: this.metadata?.contextText || '',
      summarySoFar: this.meetingState.summarySoFar,
      currentState: this.meetingState,
      recentTranscript: this.transcript.slice(-6),
      allTranscript: this.transcript,
      elapsedSeconds: elapsedSec,
    };

    return await this.aiProvider.helpWithObjection(input);
  }

  public async whatShouldIAskNow(): Promise<CopilotManualResponse> {
    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const input: AnalystInput = {
      meetingTitle: this.metadata?.title || '',
      contextText: this.metadata?.contextText || '',
      summarySoFar: this.meetingState.summarySoFar,
      currentState: this.meetingState,
      recentTranscript: this.transcript.slice(-6),
      allTranscript: this.transcript,
      elapsedSeconds: elapsedSec,
    };

    return await this.aiProvider.whatShouldIAskNow(input);
  }

  public bookmarkCurrentMoment(note?: string): { timestamp: number; formattedTime: string } {
    const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
    const m = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const s = Math.floor(elapsedSec % 60).toString().padStart(2, '0');
    const formatted = `${m}:${s}`;

    if (this.transcript.length > 0) {
      this.transcript[this.transcript.length - 1].bookmarked = true;
      if (this.activeMeetingId) {
        this.storage.saveTranscript(this.activeMeetingId, this.transcript);
      }
    }

    if (this.activeMeetingId) {
      this.storage.saveEvent(this.activeMeetingId, {
        type: 'bookmark',
        title: 'Momento Marcado',
        message: note || `Momento importante marcado em ${formatted}`,
        severity: 'info',
      });
    }

    return { timestamp: elapsedSec, formattedTime: formatted };
  }

  public pauseMeeting(): { success: boolean; isPaused: boolean } {
    this.isPaused = !this.isPaused;
    return { success: true, isPaused: this.isPaused };
  }

  public async finishMeeting(): Promise<{ success: boolean; report: FinalReportData; meetingDir: string }> {
    if (!this.activeMeetingId || !this.metadata) {
      throw new Error('Nenhuma reunião ativa.');
    }

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    if (this.whisper) {
      await this.whisper.flushRemainingAudio('Cliente');
    }

    const durationSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    this.metadata.endedAt = new Date().toLocaleString('pt-BR');
    this.metadata.durationSeconds = durationSeconds;

    // Save audio WAV if requested
    if (this.metadata.saveAudio && this.rawPcmRecordings.length > 0) {
      this.storage.saveAudioWav(this.activeMeetingId, new Float32Array(this.rawPcmRecordings));
    }

    // Generate Final Report
    const input: AnalystInput = {
      meetingTitle: this.metadata.title,
      contextText: this.metadata.contextText,
      summarySoFar: this.meetingState.summarySoFar,
      currentState: this.meetingState,
      recentTranscript: this.transcript.slice(-10),
      allTranscript: this.transcript,
      elapsedSeconds: durationSeconds,
    };

    const report = await this.aiProvider.generateFinalReport(input, this.metadata);

    // Save all artifacts
    this.storage.saveMeetingMetadata(this.metadata);
    this.storage.saveTranscript(this.activeMeetingId, this.transcript);
    this.storage.saveMeetingState(this.activeMeetingId, this.meetingState);
    this.storage.saveFinalReport(this.activeMeetingId, report);

    const meetingDir = this.storage.getMeetingDir(this.activeMeetingId);

    // Reset active
    this.activeMeetingId = null;

    return {
      success: true,
      report,
      meetingDir,
    };
  }

  public openMeetingFolder(meetingId: string): void {
    const dir = this.storage.getMeetingDir(meetingId);
    shell.openPath(dir);
  }

  public listPastMeetings(): MeetingMetadata[] {
    return this.storage.listMeetings();
  }

  public sendServiceStatus(): void {
    const whisperStatus = this.whisper?.getStatus() ?? 'idle';
    const whisperError = this.whisper?.getInitializationError() || undefined;
    const status: ServiceStatus = {
      microphoneActive: !this.isPaused && !!this.activeMeetingId,
      systemAudioActive: !this.isPaused && !!this.activeMeetingId && (this.metadata?.captureSystemAudio ?? true),
      sttStatus: this.activeMeetingId ? whisperStatus : 'idle',
      aiStatus: this.activeMeetingId ? 'connected' : 'idle',
      errorMessage: whisperStatus === 'error' ? whisperError : undefined,
      sttModelName: this.metadata?.sttModel || 'Whisper Tiny (Local)',
      aiModelName: this.aiProvider.name,
      deviceLabel: this.hardwareLabel,
      cost: 'R$ 0,00',
    };
    this.win.webContents.send('service:status-changed', status);
  }

  private getInitialState(): MeetingState {
    return {
      requirements: [],
      objections: [],
      decisions: [],
      pendingQuestions: [
        { text: 'Quantas pessoas utilizarão o sistema?', confidence: 'high', timestamp: '00:00', status: 'open' },
        { text: 'Quantos usuários simultâneos?', confidence: 'high', timestamp: '00:00', status: 'open' },
        { text: 'Quantas filiais?', confidence: 'high', timestamp: '00:00', status: 'open' },
        { text: 'Quantos números de WhatsApp?', confidence: 'high', timestamp: '00:00', status: 'open' },
        { text: 'Precisam importar dados do sistema atual?', confidence: 'high', timestamp: '00:00', status: 'open' },
        { text: 'Google Calendar ou Microsoft Calendar?', confidence: 'high', timestamp: '00:00', status: 'open' },
        { text: 'Existe necessidade de integração com INPI ou jurídico?', confidence: 'high', timestamp: '00:00', status: 'open' },
      ],
      risks: [],
      opportunities: [],
      commitments: [],
      pricingSignals: [],
      technicalRequirements: [],
      integrations: [],
      nextBestAction: 'Descubra a quantidade de usuários e números de WhatsApp que a operação precisará.',
      summarySoFar: '',
    };
  }
}
