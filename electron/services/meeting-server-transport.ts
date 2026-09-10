import WebSocket from 'ws';

export interface RemoteMeetingTransportConfig {
  serverUrl: string;
  meetingId: string;
  participantId: string;
}

export type RemoteServerEventHandler = (event: unknown) => void;

export class RemoteMeetingTransport {
  private socket: WebSocket | null = null;
  private config: RemoteMeetingTransportConfig | null = null;
  private sequence = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalClose = false;
  private pendingAudio: Buffer[] = [];
  private readonly maxPendingFrames = 360;

  constructor(private readonly onEvent?: RemoteServerEventHandler) {}

  configure(config: RemoteMeetingTransportConfig): void {
    this.disconnect();
    this.config = config;
    this.intentionalClose = false;
    this.open();
  }

  isConfiguredFor(meetingId: string): boolean {
    return this.config?.meetingId === meetingId;
  }

  sendFloat32(float32: Float32Array, speakerTag = 'Participante'): boolean {
    if (!this.config) return false;
    const pcm16 = Buffer.allocUnsafe(float32.length * 2);
    for (let i = 0; i < float32.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, float32[i]));
      const sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      pcm16.writeInt16LE(Math.round(sample), i * 2);
    }

    const frame = Buffer.allocUnsafe(pcm16.length + 6);
    frame[0] = 1;
    frame[1] = speakerTag === 'Eu' ? 1 : 2;
    this.sequence = (this.sequence + 1) >>> 0;
    frame.writeUInt32LE(this.sequence, 2);
    pcm16.copy(frame, 6);

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingAudio.push(frame);
      if (this.pendingAudio.length > this.maxPendingFrames) this.pendingAudio.shift();
      return false;
    }
    this.socket.send(frame);
    return true;
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.pendingAudio = [];
    this.reconnectAttempt = 0;
  }

  private open(): void {
    if (!this.config) return;
    const wsBase = this.config.serverUrl.replace(/\/$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const url = `${wsBase}/ws/${encodeURIComponent(this.config.meetingId)}/${encodeURIComponent(this.config.participantId)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.on('open', () => {
      this.reconnectAttempt = 0;
      this.onEvent?.({ type: 'transport_status', connected: true });
      for (const frame of this.pendingAudio) socket.send(frame);
      this.pendingAudio = [];
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        this.onEvent?.(JSON.parse(data.toString()));
      } catch {
        this.onEvent?.({ type: 'transport_error', message: 'Invalid server event' });
      }
    });

    socket.on('error', (error) => {
      this.onEvent?.({ type: 'transport_error', message: error.message });
    });

    socket.on('close', () => {
      this.onEvent?.({ type: 'transport_status', connected: false });
      if (!this.intentionalClose) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(8000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }
}
