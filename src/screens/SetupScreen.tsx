import React, { useState, useEffect } from 'react';
import {
  Mic,
  Monitor,
  Cpu,
  ShieldAlert,
  Play,
  HardDrive,
  Brain,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Square,
  Users,
} from 'lucide-react';
import { MeetingConfig, HardwareInfo, HardwareProfile } from '../types/meeting';
import { AudioDevice } from '../hooks/useAudioCapture';

interface SetupScreenProps {
  devices: AudioDevice[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  captureSystemAudio: boolean;
  onToggleSystemAudio: (enabled: boolean) => void;
  micVolumeLevel: number;
  systemVolumeLevel: number;
  isTestingMic: boolean;
  isTestingSystem: boolean;
  onTestMicrophone: () => void;
  onTestSystemAudio: () => void;
  onStopTests: () => void;
  hasSystemAudioWarning: boolean;
  onStartMeeting: (config: MeetingConfig) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  captureSystemAudio,
  onToggleSystemAudio,
  micVolumeLevel,
  systemVolumeLevel,
  isTestingMic,
  isTestingSystem,
  onTestMicrophone,
  onTestSystemAudio,
  onStopTests,
  hasSystemAudioWarning,
  onStartMeeting,
}) => {
  const [title, setTitle] = useState('Reunião Comercial — Escritório de Marcas e Patentes');
  const [contextText, setContextText] = useState(
`Contexto da Reunião Noryn:
Estamos negociando uma versão personalizada do CRM Noryn para um escritório especializado em Marcas e Patentes.
Possibilidade de: assinatura SaaS, licença dedicada, licença perpétua ou discussão sobre tecnologia.
Recursos de interesse: CRM, Kanban, múltiplos números de WhatsApp, múltiplos atendentes, multi-filial, controle de permissões, Google Calendar, relatórios gerenciais e possível migração de histórico.
NÃO são foco deste cliente: catálogo de produtos, estoque, Webmotors, integrações automotivas/imobiliárias ou robô de IA respondendo clientes automaticamente no WhatsApp.
Pontos comerciais críticos: A Noryn preserva seu core tecnológico. Termos como "comprar o sistema", "código-fonte", "exclusividade", "sem mensalidade" devem ser tratados como alertas para esclarecer entre licença perpétua e aquisição de propriedade intelectual.`
  );

  const [saveAudio, setSaveAudio] = useState(false);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile>('balanced');
  const [aiProvider, setAiProvider] = useState<'ollama' | 'rule-engine'>('rule-engine');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedAiModel, setSelectedAiModel] = useState('Noryn Hybrid Rule Engine v1.0');
  const [sttModel, setSttModel] = useState('Whisper Tiny (Local)');

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getHardwareInfo().then((info) => {
        setHardwareInfo(info);
        if (info.suggestedProfile) {
          setHardwareProfile(info.suggestedProfile);
        }
      });

      window.electronAPI.getOllamaModels().then((res) => {
        if (res.available && res.models.length > 0) {
          setOllamaModels(res.models);
          setAiProvider('ollama');
          setSelectedAiModel(res.models[0]);
        }
      });
    }
  }, []);

  const handleStart = () => {
    onStopTests();
    onStartMeeting({
      title,
      contextText,
      selectedAudioDeviceId: selectedDeviceId,
      captureSystemAudio,
      saveAudio,
      hardwareProfile,
      sttModel,
      aiProvider,
      aiModel: selectedAiModel,
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
        {/* Brand & Badge */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">NORYN MEETING COPILOT</h1>
              <p className="text-xs text-slate-400">Copiloto comercial privado em tempo real (Local-First)</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-600/50 text-xs font-semibold text-emerald-300">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Custo: R$ 0,00</span>
            </div>
          </div>
        </div>

        {/* Meeting Mode / Google Meet Banner */}
        <div className="bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-600/40 rounded-xl p-3 flex items-start space-x-3 text-xs text-sky-200">
          <Users className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="block text-sky-300 font-semibold mb-0.5">Modo Reunião Online (Google Meet, Teams, YouTube)</strong>
            O mixer captura simultaneamente a sua voz pelo microfone e o áudio dos participantes reproduzido pelo computador, transcrevendo os dois lados da conversa sem eco e sem custos de API.
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4 text-xs">
          {/* Title */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Título da Reunião</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Context Textarea */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Contexto Comercial Inicial</label>
            <textarea
              rows={3}
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-sans text-xs focus:outline-none focus:border-sky-500 transition-colors leading-relaxed"
            />
          </div>

          {/* AUDIO SOURCES SECTION (DUAL SOURCE & VU METERS) */}
          <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Volume2 className="w-4 h-4 text-sky-400" />
                <span>Fontes de Áudio (Mixer Dual)</span>
              </span>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Pronto para Google Meet</span>
              </span>
            </div>

            {/* SOURCE 1: MICROPHONE */}
            <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sua Voz (Microfone Local)</span>
                </label>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-slate-400">Nível: {micVolumeLevel}%</span>
                  <button
                    type="button"
                    onClick={isTestingMic ? onStopTests : onTestMicrophone}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors flex items-center space-x-1 ${
                      isTestingMic
                        ? 'bg-rose-950/60 border-rose-500/60 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {isTestingMic ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5" />}
                    <span>{isTestingMic ? 'Parar Teste' : 'Testar Microfone'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center pt-1">
                <div className="col-span-2">
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => onSelectDevice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    {devices.length === 0 ? (
                      <option value="">Nenhum microfone detectado</option>
                    ) : (
                      devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Mic VU Meter bar */}
                <div className="h-3 bg-slate-950 border border-slate-700 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, micVolumeLevel * 2)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* SOURCE 2: SYSTEM AUDIO (GOOGLE MEET / YOUTUBE LOOPBACK) */}
            <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-300 flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureSystemAudio}
                    onChange={(e) => onToggleSystemAudio(e.target.checked)}
                    className="rounded border-slate-700 text-sky-500 focus:ring-0 mr-1"
                  />
                  <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Áudio do Computador (Google Meet / YouTube / Sistema)</span>
                </label>

                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] text-slate-400">Nível: {systemVolumeLevel}%</span>
                  <button
                    type="button"
                    onClick={isTestingSystem ? onStopTests : onTestSystemAudio}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors flex items-center space-x-1 ${
                      isTestingSystem
                        ? 'bg-rose-950/60 border-rose-500/60 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {isTestingSystem ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5" />}
                    <span>{isTestingSystem ? 'Parar Teste' : 'Testar Áudio do PC'}</span>
                  </button>
                </div>
              </div>

              {captureSystemAudio && (
                <div className="grid grid-cols-3 gap-2 items-center pt-1">
                  <div className="col-span-2 text-[11px] text-slate-400">
                    Captura o som dos alto-falantes/fones em loopback para transcrever as falas do cliente remoto.
                  </div>
                  {/* System Audio VU Meter bar */}
                  <div className="h-3 bg-slate-950 border border-slate-700 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-indigo-400 rounded-full transition-all duration-75"
                      style={{ width: `${Math.min(100, systemVolumeLevel * 2)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Warning if system audio has no signal */}
              {hasSystemAudioWarning && (
                <div className="flex items-start space-x-1.5 p-2 rounded bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] mt-1">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    ⚠ Nenhum áudio do computador detectado no momento. Abra um vídeo do YouTube ou teste uma chamada para verificar o sinal.
                  </span>
                </div>
              )}
            </div>

            {/* Audio Save Toggle */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAudio}
                  onChange={(e) => setSaveAudio(e.target.checked)}
                  className="rounded border-slate-700 text-sky-500 focus:ring-0"
                />
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>Salvar gravação bruta em disco (.wav)</span>
              </label>
              <span className="text-[10px] text-slate-500">Desmarcado por padrão (economiza disco)</span>
            </div>
          </div>

          {/* Hardware & Local AI Strategy */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <div className="flex items-center space-x-1.5">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold">Hardware:</span>
                <span className="font-mono text-indigo-300 text-[11px]">
                  {hardwareInfo ? `${hardwareInfo.gpuName} | ${hardwareInfo.ramGB}GB RAM` : 'Analisando...'}
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-500">Perfil: {hardwareProfile}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold mb-1">Whisper STT Local</span>
                <select
                  value={sttModel}
                  onChange={(e) => setSttModel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                >
                  <option value="Whisper Tiny (Local)">Whisper Tiny (Ultra-rápido / Recomendado)</option>
                  <option value="Whisper Base (Local)">Whisper Base (Maior precisão)</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-semibold mb-1">Motor de Análise Comercial</span>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                >
                  <option value="rule-engine">Motor Local de Regras Noryn (0% GPU / Instantâneo)</option>
                  {ollamaModels.length > 0 && <option value="ollama">Ollama Local ({selectedAiModel})</option>}
                </select>
              </div>
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="flex items-start space-x-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Certifique-se de possuir autorização adequada dos participantes antes de captar ou processar o conteúdo da reunião.
            </span>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-sky-950/50 transition-all active:scale-[0.99]"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>INICIAR REUNIÃO (MICROFONE + GOOGLE MEET)</span>
        </button>
      </div>
    </div>
  );
};
