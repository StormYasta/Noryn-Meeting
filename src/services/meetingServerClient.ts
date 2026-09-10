import type { CopilotManualResponse, MeetingState, TranscriptSegment } from '../types/meeting';

export type MeetingRole = 'owner' | 'viewer';

export interface ServerParticipant {
  id: string;
  name: string;
  role: MeetingRole;
  connected?: boolean;
}

export interface MeetingServerMetrics {
  audioFramesReceived: number;
  audioFramesDropped: number;
  audioQueueFrames: number;
  sttLatencyMs: number;
  analysisLatencyMs: number;
}

export interface MeetingServerState {
  meetingId: string;
  pairingCode: string;
  title: string;
  contextText?: string;
  owner: ServerParticipant;
  viewer: ServerParticipant | null;
  transcript: TranscriptSegment[];
  insights: MeetingState;
  createdAt: string;
  finishedAt?: string | null;
  metrics: MeetingServerMetrics;
}

export interface MeetingSessionResponse {
  meetingId: string;
  pairingCode: string;
  participant: ServerParticipant;
  role: MeetingRole;
  state: MeetingServerState;
}

export interface MeetingServerHealth {
  status: string;
  service: string;
  version: string;
  activeMeetings: number;
  whisper: { status: string; model: string; device: string; error?: string | null };
  llm: { status: string; model: string; baseUrl: string; error?: string | null };
}

export type MeetingServerEvent =
  | { type: 'session_state'; state: MeetingServerState; role: MeetingRole }
  | { type: 'participant_joined'; participant: ServerParticipant }
  | { type: 'presence'; owner: ServerParticipant; viewer: ServerParticipant | null }
  | { type: 'transcript'; segment: TranscriptSegment }
  | { type: 'insights_updated'; insights: MeetingState; source: 'rules' | 'ollama' }
  | { type: 'assistant_response'; requestedBy: string; response: CopilotManualResponse }
  | { type: 'meeting_finished'; state: MeetingServerState; report: string }
  | { type: 'audio_status'; metrics: MeetingServerMetrics }
  | { type: 'connection_status'; connected: boolean; message?: string }
  | { type: 'pong'; ts?: number }
  | { type: 'error'; code: string; message?: string };

type EventListener = (event: MeetingServerEvent) => void;

export class MeetingServerClient {
  private readonly baseHttpUrl: string;
  private readonly baseWsUrl: string;
  private socket: WebSocket | null = null;
  private role: MeetingRole | null = null;
  private eventListeners = new Set<EventListener>();
  private sequence = 0;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private meetingId: string | null = null;
  private participantId: string | null = null;
  private pendingAudio: ArrayBuffer[] = [];
  private readonly maxPendingAudioFrames = 360;

  constructor(baseUrl = 'http://127.0.0.1:8765') {
    this.baseHttpUrl = baseUrl.replace(/\/$/, '');
    this.baseWsUrl = this.baseHttpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }

  async health(): Promise<MeetingServerHealth> {
    const response = await fetch(`${this.baseHttpUrl}/health`);
    if (!response.ok) throw new Error(`Meeting server unavailable: HTTP ${response.status}`);
    return response.json() as Promise<MeetingServerHealth>;
  }

  async createMeeting(title: string, ownerName: string, contextText = ''): Promise<MeetingSessionResponse> {
    const response = await fetch(`${this.baseHttpUrl}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, owner_name: ownerName, context_text: contextText }),
    });
    if (!response.ok) throw new Error(await this.readError(response));
    const result = (await response.json()) as MeetingSessionResponse;
    this.role = result.role;
    this.meetingId = result.meetingId;
    this.participantId = result.participant.id;
    return result;
  }

  async joinMeeting(pairingCode: string, participantName: string): Promise<MeetingSessionResponse> {
    const response = await fetch(`${this.baseHttpUrl}/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: pairingCode, participant_name: participantName }),
    });
    if (!response.ok) throw new Error(await this.readError(response));
    const result = (await response.json()) as MeetingSessionResponse;
    this.role = result.role;
    this.meetingId = result.meetingId;
    this.participantId = result.participant.id;
    return result;
  }

  connect(meetingId = this.meetingId, participantId = this.participantId): Promise<void> {
    if (!meetingId || !participantId) {
      return Promise.reject(new Error('Meeting session is not initialized'));
    }
    this.meetingId = meetingId;
    this.participantId = participantId;
    this.intentionalClose = false;
    return this.openSocket();
  }

  private openSocket(): Promise<void> {
    if (!this.meetingId || !this.participantId) return Promise.reject(new Error('Missing session identity'));
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

    this.socket?.close();
    const socket = new WebSocket(
      `${this.baseWsUrl}/ws/${encodeURIComponent(this.meetingId)}/${encodeURIComponent(this.participantId)}`,
    );
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timeout connecting to Meeting Server')), 8000);
      socket.onopen = () => {
        window.clearTimeout(timeout);
        this.reconnectAttempt = 0;
        this.emit({ type: 'connection_status', connected: true });
        this.flushPendingAudio();
        resolve();
      };
      socket.onmessage = (message) => {
        if (typeof message.data !== 'string') return;
        try {
          this.emit(JSON.parse(message.data) as MeetingServerEvent);
        } catch {
          this.emit({ type: 'error', code: 'INVALID_SERVER_EVENT', message: 'Resposta inválida do servidor' });
        }
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        if (socket.readyState !== WebSocket.OPEN) reject(new Error('Falha ao conectar ao Meeting Server'));
      };
      socket.onclose = () => {
        this.emit({ type: 'connection_status', connected: false, message: 'Conexão com servidor interrompida' });
        if (!this.intentionalClose) this.scheduleReconnect();
      };
    });
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  sendAudio(pcm16: ArrayBuffer, speaker: 'Eu' | 'Participante' | 'Cliente' = 'Participante'): boolean {
    if (this.role !== 'owner') return false;
    const payload = this.frameAudio(pcm16, speaker);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingAudio.push(payload);
      if (this.pendingAudio.length > this.maxPendingAudioFrames) this.pendingAudio.shift();
      return false;
    }
    this.socket.send(payload);
    return true;
  }

  requestAssistant(action: string, payload?: unknown): void {
    this.sendJson({ type: 'assistant_request', action, payload });
  }

  triggerAnalysis(): void {
    this.sendJson({ type: 'trigger_analysis' });
  }

  markMoment(payload?: unknown): void {
    this.sendJson({ type: 'mark_moment', payload });
  }

  finishMeeting(): void {
    if (this.role !== 'owner') throw new Error('Only User A (owner) may finish the meeting');
    this.sendJson({ type: 'finish_meeting' });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  getRole(): MeetingRole | null {
    return this.role;
  }

  private frameAudio(pcm16: ArrayBuffer, speaker: 'Eu' | 'Participante' | 'Cliente'): ArrayBuffer {
    const source = new Uint8Array(pcm16);
    const framed = new Uint8Array(source.byteLength + 6);
    framed[0] = 1;
    framed[1] = speaker === 'Eu' ? 1 : 2;
    this.sequence = (this.sequence + 1) >>> 0;
    new DataView(framed.buffer).setUint32(2, this.sequence, true);
    framed.set(source, 6);
    return framed.buffer;
  }

  private flushPendingAudio(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    for (const frame of this.pendingAudio) this.socket.send(frame);
    this.pendingAudio = [];
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(8000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket().catch(() => undefined);
    }, delay);
  }

  private emit(event: MeetingServerEvent): void {
    this.eventListeners.forEach((listener) => listener(event));
  }

  private sendJson(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Meeting WebSocket is not connected');
    }
    this.socket.send(JSON.stringify(payload));
  }

  private async readError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: string };
      return body.detail || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}
