import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { AlertBanner } from '../components/AlertBanner';
import { TranscriptionView } from '../components/TranscriptionView';
import { NextBestActionCard } from '../components/CopilotPanels/NextBestActionCard';
import { RequirementsPanel } from '../components/CopilotPanels/RequirementsPanel';
import { ObjectionsPanel } from '../components/CopilotPanels/ObjectionsPanel';
import { PendingQuestionsPanel } from '../components/CopilotPanels/PendingQuestionsPanel';
import { DecisionsPanel } from '../components/CopilotPanels/DecisionsPanel';
import { RisksOpportunitiesPanel } from '../components/CopilotPanels/RisksOpportunitiesPanel';
import { BottomControlBar } from '../components/BottomControlBar';
import { CopilotResponseModal } from '../components/CopilotResponseModal';
import { FinalReportModal } from '../components/FinalReportModal';
import { useMeetingState } from '../hooks/useMeetingState';
import { MeetingConfig, CopilotManualResponse, FinalReportData } from '../types/meeting';
import { AlertTriangle } from 'lucide-react';

interface ActiveMeetingScreenProps {
  config: MeetingConfig;
  onFinishMeetingReset: () => void;
  micVolumeLevel: number;
  systemVolumeLevel: number;
  captureSystemAudio: boolean;
  hasSystemAudioWarning: boolean;
  currentSpeaker: 'Cliente' | 'Eu';
  onSpeakerChange: (speaker: 'Cliente' | 'Eu') => void;
  onStopAudioCapture: () => void;
}

export const ActiveMeetingScreen: React.FC<ActiveMeetingScreenProps> = ({
  config,
  onFinishMeetingReset,
  micVolumeLevel,
  systemVolumeLevel,
  captureSystemAudio,
  hasSystemAudioWarning,
  currentSpeaker,
  onSpeakerChange,
  onStopAudioCapture,
}) => {
  const [copilotModalResponse, setCopilotModalResponse] = useState<CopilotManualResponse | null>(null);
  const [finalReportData, setFinalReportData] = useState<{ report: FinalReportData; dir: string } | null>(null);
  const [isLoadingCopilot, setIsLoadingCopilot] = useState(false);

  // Hotkey action handler
  const handleHotkey = useCallback((action: 'ask_now' | 'help_objection' | 'bookmark_moment') => {
    if (action === 'ask_now') {
      triggerWhatShouldIAsk();
    } else if (action === 'help_objection') {
      triggerHelpWithObjection();
    } else if (action === 'bookmark_moment') {
      triggerBookmarkMoment();
    }
  }, []);

  const {
    transcript,
    liveDelta,
    meetingState,
    serviceStatus,
    alerts,
    dismissAlert,
    isPaused,
    setIsPaused,
  } = useMeetingState(handleHotkey);

  // Window-level local key listeners as well
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Space
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        triggerWhatShouldIAsk();
      }
      // Ctrl + Shift + O
      if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault();
        triggerHelpWithObjection();
      }
      // Ctrl + Shift + M
      if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        triggerBookmarkMoment();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerWhatShouldIAsk = async () => {
    if (!window.electronAPI) return;
    setIsLoadingCopilot(true);
    try {
      const res = await window.electronAPI.whatShouldIAskNow();
      setCopilotModalResponse(res);
    } finally {
      setIsLoadingCopilot(false);
    }
  };

  const triggerHelpWithObjection = async () => {
    if (!window.electronAPI) return;
    setIsLoadingCopilot(true);
    try {
      const res = await window.electronAPI.helpWithObjection();
      setCopilotModalResponse(res);
    } finally {
      setIsLoadingCopilot(false);
    }
  };

  const triggerAskCopilot = async (query: string) => {
    if (!window.electronAPI) return;
    setIsLoadingCopilot(true);
    try {
      const res = await window.electronAPI.askCopilot(query);
      setCopilotModalResponse(res);
    } finally {
      setIsLoadingCopilot(false);
    }
  };

  const triggerBookmarkMoment = () => {
    if (!window.electronAPI) return;
    window.electronAPI.bookmarkCurrentMoment();
  };

  const triggerAnalyzeRecent = async () => {
    if (!window.electronAPI) return;
    setIsLoadingCopilot(true);
    try {
      await window.electronAPI.triggerAnalysis();
    } finally {
      setIsLoadingCopilot(false);
    }
  };

  const handlePauseToggle = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.pauseMeeting();
    setIsPaused(res.isPaused);
  };

  const handleFinishMeeting = async () => {
    onStopAudioCapture();
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.finishMeeting();
      if (res.success) {
        setFinalReportData({ report: res.report, dir: res.meetingDir });
      }
    } catch (e) {
      console.error('Erro ao finalizar reunião:', e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Top Header */}
      <Header
        meetingTitle={config.title}
        isRecording={true}
        isPaused={isPaused}
        serviceStatus={serviceStatus}
        micVolumeLevel={micVolumeLevel}
        systemVolumeLevel={systemVolumeLevel}
        captureSystemAudio={captureSystemAudio}
        onPauseToggle={handlePauseToggle}
        onFinishClick={handleFinishMeeting}
      />

      {/* Warning banner if system audio is enabled but no signal */}
      {captureSystemAudio && hasSystemAudioWarning && (
        <div className="bg-amber-950/80 border-b border-amber-600/50 px-4 py-1.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Atenção:</strong> Áudio do computador não detectado nos últimos segundos. Verifique se o Google Meet ou YouTube está reproduzindo som.
            </span>
          </div>
        </div>
      )}

      {/* Floating Commercial Alerts Banner */}
      <AlertBanner alerts={alerts} onDismiss={dismissAlert} />

      {/* Main Two-Column Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Real-time Transcription (45% width) */}
        <div className="w-[45%] h-full">
          <TranscriptionView
            transcript={transcript}
            liveDelta={liveDelta}
            currentSpeaker={currentSpeaker}
            onSpeakerChange={onSpeakerChange}
            micVolumeLevel={micVolumeLevel}
            systemVolumeLevel={systemVolumeLevel}
          />
        </div>

        {/* Right Column: Copilot Panels (55% width) */}
        <div className="w-[55%] h-full flex flex-col overflow-y-auto p-3.5 space-y-3 bg-slate-950/90 select-none">
          {/* Section 1: Next Best Action Prominent Card */}
          <NextBestActionCard action={meetingState.nextBestAction} />

          {/* Section 2: Objections & Suggested Responses */}
          <ObjectionsPanel objections={meetingState.objections} />

          {/* Section 3: Requirements & Discovery */}
          <RequirementsPanel
            requirements={meetingState.requirements}
            technicalRequirements={meetingState.technicalRequirements}
            integrations={meetingState.integrations}
          />

          {/* Section 4: Pending Discovery Questions */}
          <PendingQuestionsPanel pendingQuestions={meetingState.pendingQuestions} />

          {/* Section 5: Decisions & Commitments */}
          <DecisionsPanel decisions={meetingState.decisions} />

          {/* Section 6: Risks & Opportunities */}
          <RisksOpportunitiesPanel
            risks={meetingState.risks}
            opportunities={meetingState.opportunities}
          />
        </div>
      </div>

      {/* Bottom Bar: Manual Prompts & Quick Action Buttons */}
      <BottomControlBar
        onAskCopilot={triggerAskCopilot}
        onHelpWithObjection={triggerHelpWithObjection}
        onWhatShouldIAsk={triggerWhatShouldIAsk}
        onBookmarkMoment={triggerBookmarkMoment}
        onAnalyzeRecent={triggerAnalyzeRecent}
        onPauseToggle={handlePauseToggle}
        onFinishClick={handleFinishMeeting}
        isPaused={isPaused}
        isLoading={isLoadingCopilot}
      />

      {/* Popover / Modal for Copilot Response */}
      <CopilotResponseModal
        response={copilotModalResponse}
        onClose={() => setCopilotModalResponse(null)}
      />

      {/* Post-Meeting Final Report Modal */}
      <FinalReportModal
        report={finalReportData?.report || null}
        meetingDir={finalReportData?.dir || ''}
        onNewMeeting={onFinishMeetingReset}
      />
    </div>
  );
};
