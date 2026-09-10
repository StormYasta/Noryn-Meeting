import { contextBridge, ipcRenderer } from 'electron';
import {
  MeetingConfig,
  TranscriptSegment,
  MeetingState,
  ServiceStatus,
  CommercialAlert,
} from '../src/types/meeting';

contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware & Diagnostic
  getHardwareInfo: () => ipcRenderer.invoke('hardware:get-info'),
  getOllamaModels: () => ipcRenderer.invoke('ollama:get-models'),

  // Meeting Lifecycle
  startMeeting: (config: MeetingConfig) => ipcRenderer.invoke('meeting:start', config),
  pauseMeeting: () => ipcRenderer.invoke('meeting:pause'),
  resumeMeeting: () => ipcRenderer.invoke('meeting:resume'),
  finishMeeting: () => ipcRenderer.invoke('meeting:finish'),

  // Audio Pipeline
  sendAudioChunk: (chunk: { meetingId: string; pcmBase64: string; sampleRate: number; speakerTag?: string }) =>
    ipcRenderer.invoke('meeting:send-audio', chunk),

  // Copilot Interactions
  askCopilot: (query: string) => ipcRenderer.invoke('copilot:ask', query),
  helpWithObjection: () => ipcRenderer.invoke('copilot:help-objection'),
  whatShouldIAskNow: () => ipcRenderer.invoke('copilot:what-should-i-ask'),
  triggerAnalysis: () => ipcRenderer.invoke('copilot:trigger-analysis'),
  bookmarkCurrentMoment: (note?: string) => ipcRenderer.invoke('copilot:bookmark-moment', note),

  // Local Storage & Explorer
  openMeetingFolder: (meetingId: string) => ipcRenderer.invoke('meeting:open-folder', meetingId),
  listPastMeetings: () => ipcRenderer.invoke('meeting:list-past'),

  // Push event listeners from Main to Renderer
  onTranscriptDelta: (callback: (data: { text: string; isFinal: boolean; speaker: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('transcript:delta', handler);
    return () => ipcRenderer.removeListener('transcript:delta', handler);
  },

  onTranscriptCompleted: (callback: (segment: TranscriptSegment) => void) => {
    const handler = (_: any, segment: any) => callback(segment);
    ipcRenderer.on('transcript:completed', handler);
    return () => ipcRenderer.removeListener('transcript:completed', handler);
  },

  onMeetingStateUpdated: (callback: (state: MeetingState) => void) => {
    const handler = (_: any, state: any) => callback(state);
    ipcRenderer.on('meeting:state-updated', handler);
    return () => ipcRenderer.removeListener('meeting:state-updated', handler);
  },

  onServiceStatusChanged: (callback: (status: ServiceStatus) => void) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('service:status-changed', handler);
    return () => ipcRenderer.removeListener('service:status-changed', handler);
  },

  onCopilotAlert: (callback: (alert: CommercialAlert) => void) => {
    const handler = (_: any, alert: any) => callback(alert);
    ipcRenderer.on('copilot:alert', handler);
    return () => ipcRenderer.removeListener('copilot:alert', handler);
  },

  onHotkeyTriggered: (callback: (action: 'ask_now' | 'help_objection' | 'bookmark_moment') => void) => {
    const handler = (_: any, action: any) => callback(action);
    ipcRenderer.on('hotkey:triggered', handler);
    return () => ipcRenderer.removeListener('hotkey:triggered', handler);
  },
});
