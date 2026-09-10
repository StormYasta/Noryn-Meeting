import React, { useState } from 'react';
import { SetupScreen } from './screens/SetupScreen';
import { ActiveMeetingScreen } from './screens/ActiveMeetingScreen';
import { useAudioCapture } from './hooks/useAudioCapture';
import { MeetingConfig } from './types/meeting';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<'setup' | 'active'>('setup');
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig | null>(null);

  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    captureSystemAudio,
    setCaptureSystemAudio,
    micVolumeLevel,
    systemVolumeLevel,
    isTestingMic,
    isTestingSystem,
    startTestMicrophone,
    startTestSystemAudio,
    stopTests,
    hasSystemAudioWarning,
    currentSpeaker,
    setCurrentSpeaker,
    startCapture,
    stopCapture,
  } = useAudioCapture();

  const handleStartMeeting = async (config: MeetingConfig) => {
    setMeetingConfig(config);
    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.startMeeting(config);
        if (res.success) {
          await startCapture(res.meetingId, config.selectedAudioDeviceId, config.captureSystemAudio);
          setScreen('active');
        }
      } catch (err) {
        console.error('Erro ao iniciar reunião:', err);
      }
    } else {
      // Fallback for browser preview
      setScreen('active');
    }
  };

  const handleFinishReset = () => {
    stopCapture();
    setMeetingConfig(null);
    setScreen('setup');
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {screen === 'setup' && (
        <SetupScreen
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={setSelectedDeviceId}
          captureSystemAudio={captureSystemAudio}
          onToggleSystemAudio={setCaptureSystemAudio}
          micVolumeLevel={micVolumeLevel}
          systemVolumeLevel={systemVolumeLevel}
          isTestingMic={isTestingMic}
          isTestingSystem={isTestingSystem}
          onTestMicrophone={startTestMicrophone}
          onTestSystemAudio={startTestSystemAudio}
          onStopTests={stopTests}
          hasSystemAudioWarning={hasSystemAudioWarning}
          onStartMeeting={handleStartMeeting}
        />
      )}

      {screen === 'active' && meetingConfig && (
        <ActiveMeetingScreen
          config={meetingConfig}
          onFinishMeetingReset={handleFinishReset}
          micVolumeLevel={micVolumeLevel}
          systemVolumeLevel={systemVolumeLevel}
          captureSystemAudio={meetingConfig.captureSystemAudio}
          hasSystemAudioWarning={hasSystemAudioWarning}
          currentSpeaker={currentSpeaker}
          onSpeakerChange={setCurrentSpeaker}
          onStopAudioCapture={stopCapture}
        />
      )}
    </div>
  );
};

export default App;
