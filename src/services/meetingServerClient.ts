export type MeetingRole = 'owner' | 'viewer'

export interface ServerParticipant {
  id: string
  name: string
  role: MeetingRole
}

export interface CreateMeetingResponse {
  meetingId: string
  pairingCode: string
  participant: ServerParticipant
  role: MeetingRole
}

export interface JoinMeetingResponse extends CreateMeetingResponse {
  state: unknown
}

export type MeetingServerEvent =
  | { type: 'session_state'; state: unknown; role: MeetingRole }
  | { type: 'participant_joined'; participant: ServerParticipant }
  | { type: 'transcript'; segment: unknown }
  | { type: 'assistant_event'; requestedBy: string; request: unknown }
  | { type: 'meeting_finished'; state: unknown }
  | { type: 'audio_ack'; bytes: number }
  | { type: 'error'; code: string }

export class MeetingServerClient {
  private readonly baseHttpUrl: string
  private readonly baseWsUrl: string
  private socket: WebSocket | null = null
  private role: MeetingRole | null = null
  private eventListeners = new Set<(event: MeetingServerEvent) => void>()

  constructor(baseUrl = 'http://127.0.0.1:8765') {
    this.baseHttpUrl = baseUrl.replace(/\/$/, '')
    this.baseWsUrl = this.baseHttpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  }

  async health(): Promise<unknown> {
    const response = await fetch(`${this.baseHttpUrl}/health`)
    if (!response.ok) throw new Error(`Meeting server unavailable: HTTP ${response.status}`)
    return response.json()
  }

  async createMeeting(title: string, ownerName: string): Promise<CreateMeetingResponse> {
    const response = await fetch(`${this.baseHttpUrl}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, owner_name: ownerName }),
    })
    if (!response.ok) throw new Error(await this.readError(response))
    const result = (await response.json()) as CreateMeetingResponse
    this.role = result.role
    return result
  }

  async joinMeeting(pairingCode: string, participantName: string): Promise<JoinMeetingResponse> {
    const response = await fetch(`${this.baseHttpUrl}/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: pairingCode, participant_name: participantName }),
    })
    if (!response.ok) throw new Error(await this.readError(response))
    const result = (await response.json()) as JoinMeetingResponse
    this.role = result.role
    return result
  }

  connect(meetingId: string, participantId: string): void {
    this.disconnect()
    const socket = new WebSocket(`${this.baseWsUrl}/ws/${encodeURIComponent(meetingId)}/${encodeURIComponent(participantId)}`)
    socket.binaryType = 'arraybuffer'
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return
      const event = JSON.parse(message.data) as MeetingServerEvent
      this.eventListeners.forEach((listener) => listener(event))
    }
    this.socket = socket
  }

  onEvent(listener: (event: MeetingServerEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  sendAudio(pcm: ArrayBuffer): void {
    if (this.role !== 'owner') {
      throw new Error('Only User A (owner) may send audio to the shared meeting session')
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Meeting WebSocket is not connected')
    }
    this.socket.send(pcm)
  }

  requestAssistant(action: string, payload?: unknown): void {
    this.sendJson({ type: 'assistant_request', action, payload })
  }

  markMoment(payload?: unknown): void {
    this.sendJson({ type: 'mark_moment', payload })
  }

  finishMeeting(): void {
    if (this.role !== 'owner') throw new Error('Only User A (owner) may finish the meeting')
    this.sendJson({ type: 'finish_meeting' })
  }

  disconnect(): void {
    this.socket?.close()
    this.socket = null
  }

  getRole(): MeetingRole | null {
    return this.role
  }

  private sendJson(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Meeting WebSocket is not connected')
    }
    this.socket.send(JSON.stringify(payload))
  }

  private async readError(response: Response): Promise<string> {
    try {
      const body = await response.json()
      return body.detail || `HTTP ${response.status}`
    } catch {
      return `HTTP ${response.status}`
    }
  }
}
