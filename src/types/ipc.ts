import {
  MeetingConfig,
  MeetingMetadata,
  MeetingState,
  TranscriptSegment,
  HardwareInfo,
  ServiceStatus,
  CopilotManualResponse,
  FinalReportData,
} from './meeting';

export interface ElectronAPI {
  // Hardware & Diagnostic
  getHardwareInfo: () => Promise<HardwareInfo>;
  getOllamaModels: () => Promise<{ available: boolean; models: string[]; error?: string }>;

  // Meeting Lifecycle
  startMeeting: (config: MeetingConfig) => Promise<{ success: boolean; meetingId: string }>;
  pauseMeeting: () => Promise<{ success: boolean; isPaused: boolean }>;
  resumeMeeting: () => Promise<{ success: boolean; isPaused: boolean }>;
  finishMeeting: () => Promise<{ success: boolean; report: FinalReportData; meetingDir: string }>;

  // Audio Pipeline
  sendAudioChunk: (chunk: {
    meetingId: string;
    pcmBase64: string;
    sampleRate: number;
    speakerTag?: string;
  }) => Promise<{ received: boolean }>;

  // Copilot Interactions
  askCopilot: (query: string) => Promise<CopilotManualResponse>;
  helpWithObjection: () => Promise<CopilotManualResponse>;
  whatShouldIAskNow: () => Promise<CopilotManualResponse>;
  triggerAnalysis: () => Promise<{ success: boolean }>;
  bookmarkCurrentMoment: (note?: string) => Promise<{ timestamp: number; formattedTime: string }>;

  // Local Storage & Explorer
  openMeetingFolder: (meetingId: string) => Promise<{ success: boolean }>;
  listPastMeetings: () => Promise<MeetingMetadata[]>;

  // Push event listeners from Main to Renderer
  onTranscriptDelta: (callback: (data: { text: string; isFinal: boolean; speaker: string }) => void) => () => void;
  onTranscriptCompleted: (callback: (segment: TranscriptSegment) => void) => () => void;
  onMeetingStateUpdated: (callback: (state: MeetingState) => void) => () => void;
  onServiceStatusChanged: (callback: (status: ServiceStatus) => void) => () => void;
  onCopilotAlert: (callback: (alert: { title: string; message: string; severity: 'info' | 'warning' | 'critical' }) => void) => () => void;
  onHotkeyTriggered: (callback: (action: 'ask_now' | 'help_objection' | 'bookmark_moment') => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
