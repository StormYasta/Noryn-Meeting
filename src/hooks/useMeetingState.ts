import { useState, useEffect, useCallback } from 'react';
import {
  TranscriptSegment,
  MeetingState,
  ServiceStatus,
  CommercialAlert,
} from '../types/meeting';

export function useMeetingState(onHotkeyAction?: (action: 'ask_now' | 'help_objection' | 'bookmark_moment') => void) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [liveDelta, setLiveDelta] = useState<{ text: string; speaker: string } | null>(null);
  const [meetingState, setMeetingState] = useState<MeetingState>({
    requirements: [],
    objections: [],
    decisions: [],
    pendingQuestions: [],
    risks: [],
    opportunities: [],
    commitments: [],
    pricingSignals: [],
    technicalRequirements: [],
    integrations: [],
    nextBestAction: 'Inicie a conversa identificando os principais objetivos do escritório.',
    summarySoFar: '',
  });

  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    microphoneActive: false,
    systemAudioActive: false,
    sttStatus: 'idle',
    aiStatus: 'idle',
    sttModelName: 'Whisper Tiny (Local)',
    aiModelName: 'Motor Local Híbrido',
    deviceLabel: 'Detectando...',
    cost: 'R$ 0,00',
  });

  const [alerts, setAlerts] = useState<CommercialAlert[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Listen to transcript deltas
    const unsubDelta = window.electronAPI.onTranscriptDelta((data) => {
      setLiveDelta({ text: data.text, speaker: data.speaker });
    });

    // Listen to completed transcript segments
    const unsubCompleted = window.electronAPI.onTranscriptCompleted((segment) => {
      setLiveDelta(null);
      setTranscript((prev) => [...prev, segment]);
    });

    // Listen to updated meeting state
    const unsubState = window.electronAPI.onMeetingStateUpdated((newState) => {
      setMeetingState(newState);
    });

    // Listen to service status
    const unsubStatus = window.electronAPI.onServiceStatusChanged((newStatus) => {
      setServiceStatus(newStatus);
    });

    // Listen to commercial alerts
    const unsubAlert = window.electronAPI.onCopilotAlert((alert) => {
      setAlerts((prev) => [alert, ...prev.slice(0, 4)]);
    });

    // Listen to hotkeys
    const unsubHotkey = window.electronAPI.onHotkeyTriggered((action) => {
      if (onHotkeyAction) onHotkeyAction(action);
    });

    return () => {
      unsubDelta();
      unsubCompleted();
      unsubState();
      unsubStatus();
      unsubAlert();
      unsubHotkey();
    };
  }, [onHotkeyAction]);

  const dismissAlert = useCallback((index: number) => {
    setAlerts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const resetState = useCallback(() => {
    setTranscript([]);
    setLiveDelta(null);
    setAlerts([]);
    setIsPaused(false);
  }, []);

  return {
    transcript,
    liveDelta,
    meetingState,
    serviceStatus,
    alerts,
    dismissAlert,
    isPaused,
    setIsPaused,
    resetState,
  };
}
