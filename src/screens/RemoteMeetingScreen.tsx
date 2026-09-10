import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Brain, Copy, Link2, LogOut, Radio, Server, Users, Wifi, WifiOff } from 'lucide-react';
import { TranscriptionView } from '../components/TranscriptionView';
import { NextBestActionCard } from '../components/CopilotPanels/NextBestActionCard';
import { RequirementsPanel } from '../components/CopilotPanels/RequirementsPanel';
import { ObjectionsPanel } from '../components/CopilotPanels/ObjectionsPanel';
import { PendingQuestionsPanel } from '../components/CopilotPanels/PendingQuestionsPanel';
import { DecisionsPanel } from '../components/CopilotPanels/DecisionsPanel';
import { RisksOpportunitiesPanel } from '../components/CopilotPanels/RisksOpportunitiesPanel';
import { CopilotResponseModal } from '../components/CopilotResponseModal';
import type { CopilotManualResponse } from '../types/meeting';
import { MeetingServerClient, MeetingServerMetrics, MeetingServerState, MeetingSessionResponse } from '../services/meetingServerClient';

interface RemoteMeetingScreenProps {
  client: MeetingServerClient;
  session: MeetingSessionResponse;
  micVolumeLevel: number;
  systemVolumeLevel: number;
  onStopAudioCapture: () => void;
  onExit: () => void;
}

const emptyMetrics: MeetingServerMetrics = {
  audioFramesReceived: 0,
  audioFramesDropped: 0,
  audioQueueFrames: 0,
  sttLatencyMs: 0,
  analysisLatencyMs: 0,
};

export const RemoteMeetingScreen: React.FC<RemoteMeetingScreenProps> = ({
  client,
  session,
  micVolumeLevel,
  systemVolumeLevel,
  onStopAudioCapture,
  onExit,
}) => {
  const [serverState, setServerState] = useState<MeetingServerState>(session.state);
  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<MeetingServerMetrics>(session.state.metrics || emptyMetrics);
  const [query, setQuery] = useState('');
  const [assistantResponse, setAssistantResponse] = useState<CopilotManualResponse | null>(null);
  const [serverError, setServerError] = useState('');
  const [report, setReport] = useState('');
  const [currentSpeaker, setCurrentSpeaker] = useState<'Cliente' | 'Eu'>('Cliente');
  const isOwner = session.role === 'owner';

  useEffect(() => {
    const unsubscribe = client.onEvent((event) => {
      if (event.type === 'connection_status') setConnected(event.connected);
      if (event.type === 'session_state') {
        setServerState(event.state);
        setMetrics(event.state.metrics || emptyMetrics);
      }
      if (event.type === 'presence') {
        setServerState((prev) => ({ ...prev, owner: event.owner, viewer: event.viewer }));
      }
      if (event.type === 'participant_joined') {
        setServerState((prev) => ({ ...prev, viewer: event.participant }));
      }
      if (event.type === 'transcript') {
        setServerState((prev) => {
          if (prev.transcript.some((item) => item.id === event.segment.id)) return prev;
          return { ...prev, transcript: [...prev.transcript, event.segment] };
        });
      }
      if (event.type === 'insights_updated') {
        setServerState((prev) => ({ ...prev, insights: event.insights }));
      }
      if (event.type === 'assistant_response') setAssistantResponse(event.response);
      if (event.type === 'audio_status') setMetrics(event.metrics);
      if (event.type === 'meeting_finished') {
        setServerState(event.state);
        setReport(event.report);
        onStopAudioCapture();
      }
      if (event.type === 'error') setServerError(`${event.code}${event.message ? `: ${event.message}` : ''}`);
    });

    void client.connect(session.meetingId, session.participant.id).catch((err: unknown) => {
      setServerError(err instanceof Error ? err.message : 'Falha ao conectar ao servidor');
    });
    return () => unsubscribe();
  }, [client, onStopAudioCapture, session.meetingId, session.participant.id]);

  const presenceText = useMemo(() => {
    const owner = serverState.owner?.connected ? 'A online' : 'A offline';
    const viewer = serverState.viewer ? (serverState.viewer.connected ? 'B online' : 'B pareado') : 'aguardando B';
    return `${owner} · ${viewer}`;
  }, [serverState.owner, serverState.viewer]);

  const ask = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    try {
      client.requestAssistant('general', { query: trimmed });
      setQuery('');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Copilot indisponível');
    }
  };

  const finishOrLeave = () => {
    if (isOwner) {
      onStopAudioCapture();
      try {
        client.finishMeeting();
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Não foi possível finalizar');
      }
      return;
    }
    client.disconnect();
    onExit();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      <header className="h-14 border-b border-slate-800 bg-slate-900/95 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-sky-950/70 border border-sky-600/40 text-sky-300"><Brain className="w-4 h-4" /><span className="text-xs font-bold">NORYN SERVER</span></div>
          <span className="text-sm font-semibold truncate">{serverState.title}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${connected ? 'border-emerald-600/50 bg-emerald-950/40 text-emerald-300' : 'border-rose-600/50 bg-rose-950/40 text-rose-300'}`}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{connected ? 'Servidor conectado' : 'Reconectando'}
          </div>
          <div className="px-2 py-1 rounded border border-slate-700 bg-slate-800 flex items-center gap-1"><Users className="w-3 h-3" />{presenceText}</div>
          <button title="Copiar código" onClick={() => void navigator.clipboard.writeText(serverState.pairingCode)} className="px-2 py-1 rounded border border-indigo-700 bg-indigo-950/40 text-indigo-300 flex items-center gap-1"><Link2 className="w-3 h-3" /><span className="font-mono tracking-wider">{serverState.pairingCode}</span><Copy className="w-3 h-3" /></button>
          <div className="px-2 py-1 rounded border border-slate-700 bg-slate-800 flex gap-1 items-center"><Activity className="w-3 h-3" />STT {Math.round(metrics.sttLatencyMs)}ms · fila {metrics.audioQueueFrames}</div>
          <div className="px-2 py-1 rounded border border-slate-700 bg-slate-800 flex gap-1 items-center"><Radio className="w-3 h-3" />{isOwner ? 'A: áudio ativo' : 'B: somente recebe'}</div>
          <button onClick={finishOrLeave} className={`px-3 py-1 rounded border font-semibold flex gap-1 items-center ${isOwner ? 'border-rose-600/50 bg-rose-950/40 text-rose-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}><LogOut className="w-3 h-3" />{isOwner ? 'Finalizar' : 'Sair'}</button>
        </div>
      </header>

      {serverError && <div className="px-4 py-1.5 bg-rose-950/70 border-b border-rose-700/50 text-xs text-rose-200 flex justify-between"><span>{serverError}</span><button onClick={() => setServerError('')}>fechar</button></div>}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[45%] h-full">
          <TranscriptionView transcript={serverState.transcript} liveDelta={null} currentSpeaker={currentSpeaker} onSpeakerChange={setCurrentSpeaker} micVolumeLevel={isOwner ? micVolumeLevel : 0} systemVolumeLevel={isOwner ? systemVolumeLevel : 0} />
        </div>
        <div className="w-[55%] h-full flex flex-col overflow-y-auto p-3.5 space-y-3 bg-slate-950/90">
          <NextBestActionCard action={serverState.insights.nextBestAction} />
          <ObjectionsPanel objections={serverState.insights.objections} />
          <RequirementsPanel requirements={serverState.insights.requirements} technicalRequirements={serverState.insights.technicalRequirements} integrations={serverState.insights.integrations} />
          <PendingQuestionsPanel pendingQuestions={serverState.insights.pendingQuestions} />
          <DecisionsPanel decisions={serverState.insights.decisions} />
          <RisksOpportunitiesPanel risks={serverState.insights.risks} opportunities={serverState.insights.opportunities} />
        </div>
      </div>

      <div className="h-14 border-t border-slate-800 bg-slate-900 px-3 flex items-center gap-2">
        <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-400 pr-2"><Server className="w-3.5 h-3.5" />Whisper/LLM no servidor</div>
        <button onClick={() => client.requestAssistant('next_question')} className="px-2.5 py-1.5 rounded border border-sky-700/50 bg-sky-950/30 text-sky-300 text-xs">O que perguntar agora?</button>
        <button onClick={() => client.requestAssistant('help_objection')} className="px-2.5 py-1.5 rounded border border-amber-700/50 bg-amber-950/30 text-amber-300 text-xs">Me ajude com a objeção</button>
        <button onClick={() => client.triggerAnalysis()} className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 text-xs">Analisar agora</button>
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs" placeholder="Pergunte ao copiloto compartilhado..." />
        <button onClick={ask} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold">Enviar</button>
      </div>

      <CopilotResponseModal response={assistantResponse} onClose={() => setAssistantResponse(null)} />

      {report && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between"><strong>Relatório final compartilhado</strong><button onClick={onExit} className="px-3 py-1 rounded bg-sky-600 text-xs">Nova reunião</button></div>
            <pre className="p-5 overflow-auto whitespace-pre-wrap text-xs select-text">{report}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
