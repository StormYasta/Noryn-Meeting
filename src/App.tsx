import React, { useState } from 'react';
import { SetupScreen } from './screens/SetupScreen';
import { ActiveMeetingScreen } from './screens/ActiveMeetingScreen';
import { ServerLobbyScreen } from './screens/ServerLobbyScreen';
import { RemoteMeetingScreen } from './screens/RemoteMeetingScreen';
import { useAudioCapture } from './hooks/useAudioCapture';
import { MeetingConfig } from './types/meeting';
import { MeetingServerClient, MeetingSessionResponse } from './services/meetingServerClient';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<'lobby' | 'setup' | 'local-active' | 'remote-active'>('lobby');
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig | null>(null);
  const [remoteClient, setRemoteClient] = useState<MeetingServerClient | null>(null);
  const [remoteSession, setRemoteSession] = useState<MeetingSessionResponse | null>(null);

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

  const handleRemoteSessionReady = async (client: MeetingServerClient, session: MeetingSessionResponse) => {
    setRemoteClient(client);
    setRemoteSession(session);

    if (session.role === 'viewer') {
      setMeetingConfig(null);
      setScreen('remote-active');
      return;
    }

    if (window.electronAPI) {
      await window.electronAPI.configureRemoteMeeting({
        serverUrl: localStorage.getItem('norynMeetingServerUrl') || 'http://127.0.0.1:8765',
        meetingId: session.meetingId,
        participantId: session.participant.id,
      });
    }
    setScreen('setup');
  };

  const handleUseLocalMode = () => {
    remoteClient?.disconnect();
    setRemoteClient(null);
    setRemoteSession(null);
    setScreen('setup');
  };

  const handleStartMeeting = async (config: MeetingConfig) => {
    setMeetingConfig(config);

    if (remoteSession?.role === 'owner' && remoteClient) {
      try {
        await startCapture(remoteSession.meetingId, config.selectedAudioDeviceId, config.captureSystemAudio);
        setScreen('remote-active');
      } catch (err) {
        console.error('Erro ao iniciar captura para sessão remota:', err);
      }
      return;
    }

    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.startMeeting(config);
        if (res.success) {
          await startCapture(res.meetingId, config.selectedAudioDeviceId, config.captureSystemAudio);
          setScreen('local-active');
        }
      } catch (err) {
        console.error('Erro ao iniciar reunião:', err);
      }
    } else {
      setScreen('local-active');
    }
  };

  const handleFinishReset = () => {
    stopCapture();
    remoteClient?.disconnect();
    if (window.electronAPI) void window.electronAPI.disconnectRemoteMeeting();
    setMeetingConfig(null);
    setRemoteClient(null);
    setRemoteSession(null);
    setScreen('lobby');
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {screen === 'lobby' && (
        <ServerLobbyScreen onSessionReady={(client, session) => void handleRemoteSessionReady(client, session)} onUseLocalMode={handleUseLocalMode} />
      )}

      {screen === 'setup' && (
        <>
          {remoteSession?.role === 'owner' && (
            <div className="fixed z-50 top-3 right-3 rounded-xl border border-indigo-500/50 bg-indigo-950/95 px-4 py-2 shadow-xl text-xs text-indigo-100">
              <span className="text-indigo-300 mr-2">Código para Usuário B:</span>
              <button onClick={() => void navigator.clipboard.writeText(remoteSession.pairingCode)} className="font-mono font-bold tracking-[0.25em] text-sm">{remoteSession.pairingCode}</button>
            </div>
          )}
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
        </>
      )}

      {screen === 'local-active' && meetingConfig && (
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

      {screen === 'remote-active' && remoteClient && remoteSession && (
        <RemoteMeetingScreen
          client={remoteClient}
          session={remoteSession}
          micVolumeLevel={remoteSession.role === 'owner' ? micVolumeLevel : 0}
          systemVolumeLevel={remoteSession.role === 'owner' ? systemVolumeLevel : 0}
          onStopAudioCapture={stopCapture}
          onExit={handleFinishReset}
        />
      )}
    </div>
  );
};

export default App;
