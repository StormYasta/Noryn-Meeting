import { contextBridge, ipcRenderer } from 'electron';
import {
  MeetingConfig,
  TranscriptSegment,
  MeetingState,
  ServiceStatus,
  CommercialAlert,
} from '../src/types/meeting';

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareInfo: () => ipcRenderer.invoke('hardware:get-info'),
  getOllamaModels: () => ipcRenderer.invoke('ollama:get-models'),

  configureRemoteMeeting: (config: { serverUrl: string; meetingId: string; participantId: string }) =>
    ipcRenderer.invoke('meeting-server:configure', config),
  disconnectRemoteMeeting: () => ipcRenderer.invoke('meeting-server:disconnect'),

  startMeeting: (config: MeetingConfig) => ipcRenderer.invoke('meeting:start', config),
  pauseMeeting: () => ipcRenderer.invoke('meeting:pause'),
  resumeMeeting: () => ipcRenderer.invoke('meeting:resume'),
  finishMeeting: () => ipcRenderer.invoke('meeting:finish'),

  sendAudioChunk: (chunk: { meetingId: string; pcmBase64: string; sampleRate: number; speakerTag?: string }) =>
    ipcRenderer.invoke('meeting:send-audio', chunk),

  askCopilot: (query: string) => ipcRenderer.invoke('copilot:ask', query),
  helpWithObjection: () => ipcRenderer.invoke('copilot:help-objection'),
  whatShouldIAskNow: () => ipcRenderer.invoke('copilot:what-should-i-ask'),
  triggerAnalysis: () => ipcRenderer.invoke('copilot:trigger-analysis'),
  bookmarkCurrentMoment: (note?: string) => ipcRenderer.invoke('copilot:bookmark-moment', note),

  openMeetingFolder: (meetingId: string) => ipcRenderer.invoke('meeting:open-folder', meetingId),
  listPastMeetings: () => ipcRenderer.invoke('meeting:list-past'),

  onTranscriptDelta: (callback: (data: { text: string; isFinal: boolean; speaker: string }) => void) => {
    const handler = (_: unknown, data: { text: string; isFinal: boolean; speaker: string }) => callback(data);
    ipcRenderer.on('transcript:delta', handler);
    return () => ipcRenderer.removeListener('transcript:delta', handler);
  },

  onTranscriptCompleted: (callback: (segment: TranscriptSegment) => void) => {
    const handler = (_: unknown, segment: TranscriptSegment) => callback(segment);
    ipcRenderer.on('transcript:completed', handler);
    return () => ipcRenderer.removeListener('transcript:completed', handler);
  },

  onMeetingStateUpdated: (callback: (state: MeetingState) => void) => {
    const handler = (_: unknown, state: MeetingState) => callback(state);
    ipcRenderer.on('meeting:state-updated', handler);
    return () => ipcRenderer.removeListener('meeting:state-updated', handler);
  },

  onServiceStatusChanged: (callback: (status: ServiceStatus) => void) => {
    const handler = (_: unknown, status: ServiceStatus) => callback(status);
    ipcRenderer.on('service:status-changed', handler);
    return () => ipcRenderer.removeListener('service:status-changed', handler);
  },

  onCopilotAlert: (callback: (alert: CommercialAlert) => void) => {
    const handler = (_: unknown, alert: CommercialAlert) => callback(alert);
    ipcRenderer.on('copilot:alert', handler);
    return () => ipcRenderer.removeListener('copilot:alert', handler);
  },

  onHotkeyTriggered: (callback: (action: 'ask_now' | 'help_objection' | 'bookmark_moment') => void) => {
    const handler = (_: unknown, action: 'ask_now' | 'help_objection' | 'bookmark_moment') => callback(action);
    ipcRenderer.on('hotkey:triggered', handler);
    return () => ipcRenderer.removeListener('hotkey:triggered', handler);
  },
});
