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
  getHardwareInfo: () => Promise<HardwareInfo>;
  getOllamaModels: () => Promise<{ available: boolean; models: string[]; error?: string }>;

  configureRemoteMeeting: (config: {
    serverUrl: string;
    meetingId: string;
    participantId: string;
  }) => Promise<{ success: boolean }>;
  disconnectRemoteMeeting: () => Promise<{ success: boolean }>;

  startMeeting: (config: MeetingConfig) => Promise<{ success: boolean; meetingId: string }>;
  pauseMeeting: () => Promise<{ success: boolean; isPaused: boolean }>;
  resumeMeeting: () => Promise<{ success: boolean; isPaused: boolean }>;
  finishMeeting: () => Promise<{ success: boolean; report: FinalReportData; meetingDir: string }>;

  sendAudioChunk: (chunk: {
    meetingId: string;
    pcmBase64: string;
    sampleRate: number;
    speakerTag?: string;
  }) => Promise<{ received: boolean; remote?: boolean; sent?: boolean }>;

  askCopilot: (query: string) => Promise<CopilotManualResponse>;
  helpWithObjection: () => Promise<CopilotManualResponse>;
  whatShouldIAskNow: () => Promise<CopilotManualResponse>;
  triggerAnalysis: () => Promise<{ success: boolean }>;
  bookmarkCurrentMoment: (note?: string) => Promise<{ timestamp: number; formattedTime: string }>;

  openMeetingFolder: (meetingId: string) => Promise<{ success: boolean }>;
  listPastMeetings: () => Promise<MeetingMetadata[]>;

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
