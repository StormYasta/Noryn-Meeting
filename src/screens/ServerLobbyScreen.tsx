import React, { useMemo, useState } from 'react';
import { Brain, Link2, Server, UserPlus, Wifi, WifiOff } from 'lucide-react';
import { MeetingServerClient, MeetingServerHealth, MeetingSessionResponse } from '../services/meetingServerClient';

interface ServerLobbyScreenProps {
  onSessionReady: (client: MeetingServerClient, session: MeetingSessionResponse) => void;
  onUseLocalMode: () => void;
}

export const ServerLobbyScreen: React.FC<ServerLobbyScreenProps> = ({ onSessionReady, onUseLocalMode }) => {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('norynMeetingServerUrl') || 'http://127.0.0.1:8765');
  const [name, setName] = useState(localStorage.getItem('norynMeetingUserName') || '');
  const [title, setTitle] = useState('Reunião Comercial — Escritório de Marcas e Patentes');
  const [contextText, setContextText] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [health, setHealth] = useState<MeetingServerHealth | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const normalizedServerUrl = useMemo(() => serverUrl.trim().replace(/\/$/, ''), [serverUrl]);
  const client = () => new MeetingServerClient(normalizedServerUrl);

  const savePrefs = () => {
    localStorage.setItem('norynMeetingServerUrl', normalizedServerUrl);
    localStorage.setItem('norynMeetingUserName', name.trim());
  };

  const checkServer = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await client().health();
      setHealth(result);
      savePrefs();
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'Servidor indisponível');
    } finally {
      setBusy(false);
    }
  };

  const createSession = async () => {
    if (!name.trim()) return setError('Informe seu nome.');
    setBusy(true);
    setError('');
    const meetingClient = client();
    try {
      await meetingClient.health();
      const session = await meetingClient.createMeeting(title, name.trim(), contextText);
      savePrefs();
      onSessionReady(meetingClient, session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a sessão');
    } finally {
      setBusy(false);
    }
  };

  const joinSession = async () => {
    if (!name.trim()) return setError('Informe seu nome.');
    if (!pairingCode.trim()) return setError('Informe o código de pareamento.');
    setBusy(true);
    setError('');
    const meetingClient = client();
    try {
      await meetingClient.health();
      const session = await meetingClient.joinMeeting(pairingCode.trim(), name.trim());
      savePrefs();
      onSessionReady(meetingClient, session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar na sessão');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center">
              <Brain className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight">NORYN MEETING COPILOT</h1>
              <p className="text-xs text-slate-400">MVP servidor compartilhado · 1 fonte de áudio · 2 usuários</p>
            </div>
          </div>
          <button onClick={onUseLocalMode} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800">
            Usar modo local legado
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="http://127.0.0.1:8765" />
          <button onClick={() => void checkServer()} disabled={busy} className="px-4 py-2 rounded-lg border border-sky-700 bg-sky-950/40 text-sky-300 text-sm hover:bg-sky-900/40 disabled:opacity-50">
            Testar servidor
          </button>
        </div>

        {health && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-3 flex gap-2 items-center"><Wifi className="w-4 h-4 text-emerald-400" /> API {health.version}</div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">Whisper: <strong>{health.whisper.status}</strong> · {health.whisper.model}</div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">LLM: <strong>{health.llm.status}</strong> · {health.llm.model}</div>
          </div>
        )}

        {error && <div className="rounded-lg border border-rose-700/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200 flex gap-2"><WifiOff className="w-4 h-4 mt-0.5" />{error}</div>}

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Seu nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Gabriel / João" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-sky-700/40 bg-sky-950/20 p-4 space-y-3">
            <div className="flex gap-2 items-center text-sky-300 font-semibold"><Server className="w-4 h-4" /> Usuário A · criar sessão</div>
            <p className="text-xs text-slate-400">Este computador será a única fonte de microfone + áudio do Google Meet enviada ao servidor.</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs" placeholder="Título da reunião" />
            <textarea value={contextText} onChange={(e) => setContextText(e.target.value)} rows={3} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs" placeholder="Contexto comercial opcional" />
            <button onClick={() => void createSession()} disabled={busy} className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold text-sm disabled:opacity-50">Criar sessão compartilhada</button>
          </div>

          <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-4 space-y-3">
            <div className="flex gap-2 items-center text-indigo-300 font-semibold"><UserPlus className="w-4 h-4" /> Usuário B · parear</div>
            <p className="text-xs text-slate-400">Este computador não captura áudio. Ele recebe a mesma transcrição, estado e insights da sessão.</p>
            <input value={pairingCode} onChange={(e) => setPairingCode(e.target.value.toUpperCase())} maxLength={8} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-center font-mono tracking-[0.35em] text-lg uppercase" placeholder="ABC123" />
            <button onClick={() => void joinSession()} disabled={busy} className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"><Link2 className="w-4 h-4" />Entrar com código</button>
          </div>
        </div>
      </div>
    </div>
  );
};
