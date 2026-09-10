import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Monitor, Cpu, Brain, DollarSign } from 'lucide-react';
import { ServiceStatus } from '../types/meeting';

interface HeaderProps {
  meetingTitle: string;
  isRecording: boolean;
  isPaused: boolean;
  serviceStatus: ServiceStatus;
  micVolumeLevel: number;
  systemVolumeLevel: number;
  captureSystemAudio: boolean;
  onPauseToggle: () => void;
  onFinishClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  meetingTitle,
  isRecording,
  isPaused,
  serviceStatus,
  micVolumeLevel,
  systemVolumeLevel,
  captureSystemAudio,
  onPauseToggle,
  onFinishClick,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let timer: any = null;
    if (isRecording && !isPaused) {
      timer = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording, isPaused]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isMicReceiving = micVolumeLevel > 3;
  const isSystemReceiving = systemVolumeLevel > 3;

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/95 px-4 flex items-center justify-between select-none shadow-sm z-20">
      {/* Brand & Meeting Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-sky-950/70 border border-sky-600/40 px-2.5 py-1 rounded-md">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-xs font-bold tracking-wider text-sky-300 uppercase">Noryn Copilot</span>
        </div>
        <h1 className="text-sm font-semibold text-slate-200 truncate max-w-[220px]" title={meetingTitle}>
          {meetingTitle}
        </h1>
      </div>

      {/* Recording Status & Meeting Timer */}
      <div className="flex items-center space-x-2">
        {isRecording ? (
          <div
            className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${
              isPaused
                ? 'bg-amber-950/40 border-amber-600/50 text-amber-300'
                : 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'
              }`}
            />
            <span>{isPaused ? 'PAUSADO' : 'OUVINDO'}</span>
            <span className="font-mono font-bold text-slate-100 ml-1">{formatTimer(elapsed)}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span>AGUARDANDO</span>
          </div>
        )}
      </div>

      {/* Real-time Diagnostic Indicators: MIC, SYSTEM AUDIO, WHISPER, LOCAL AI */}
      <div className="flex items-center space-x-2 text-xs">
        {/* 1. MICROFONE Indicator + VU meter */}
        <div
          className={`flex items-center space-x-1.5 px-2 py-1 rounded border transition-colors ${
            isMicReceiving
              ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200'
              : 'bg-slate-800/80 border-slate-700 text-slate-300'
          }`}
          title={`Microfone: ${isMicReceiving ? 'Recebendo voz' : 'Aguardando fala'}`}
        >
          <Mic className={`w-3.5 h-3.5 ${isMicReceiving ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span className="font-semibold text-[11px]">MIC</span>
          <div className="w-8 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-75"
              style={{ width: `${Math.min(100, micVolumeLevel * 2)}%` }}
            />
          </div>
          <span className={`w-1.5 h-1.5 rounded-full ${isMicReceiving ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
        </div>

        {/* 2. SYSTEM AUDIO Indicator + VU meter */}
        {captureSystemAudio && (
          <div
            className={`flex items-center space-x-1.5 px-2 py-1 rounded border transition-colors ${
              isSystemReceiving
                ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}
            title={`Áudio do Computador / Google Meet: ${isSystemReceiving ? 'Recebendo som' : 'Aguardando áudio'}`}
          >
            <Monitor className={`w-3.5 h-3.5 ${isSystemReceiving ? 'text-indigo-400' : 'text-slate-400'}`} />
            <span className="font-semibold text-[11px]">SISTEMA</span>
            <div className="w-8 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 transition-all duration-75"
                style={{ width: `${Math.min(100, systemVolumeLevel * 2)}%` }}
              />
            </div>
            <span className={`w-1.5 h-1.5 rounded-full ${isSystemReceiving ? 'bg-indigo-400 animate-pulse' : 'bg-slate-500'}`} />
          </div>
        )}

        {/* 3. Local WHISPER Indicator */}
        <div
          className="flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-xs text-slate-300"
          title={`STT: ${serviceStatus.sttModelName}`}
        >
          <span className="font-mono text-[11px] text-slate-200">WHISPER</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        {/* 4. Local AI Indicator */}
        <div
          className="flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-xs text-slate-300"
          title={`IA: ${serviceStatus.aiModelName}`}
        >
          <Brain className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-mono text-[11px] text-slate-200">IA LOCAL</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>

        {/* Hardware badge */}
        <div
          className="hidden 2xl:flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-xs text-slate-300"
          title={serviceStatus.deviceLabel}
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-200 font-mono text-[11px] truncate max-w-[90px]">
            {serviceStatus.deviceLabel.split(' ')[0]}
          </span>
        </div>

        {/* Zero Cost Badge */}
        <div
          className="flex items-center space-x-1 px-2 py-1 rounded bg-emerald-950/70 border border-emerald-600/50 text-[11px] font-medium text-emerald-300"
          title="Execução 100% local com custo de API = R$ 0,00"
        >
          <DollarSign className="w-3 h-3 text-emerald-400" />
          <span>R$ 0,00</span>
        </div>

        {/* Quick Pause / Finish Controls */}
        {isRecording && (
          <div className="flex items-center space-x-1 ml-1">
            <button
              onClick={onPauseToggle}
              className={`p-1.5 rounded border text-xs transition-colors ${
                isPaused
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-300 hover:bg-amber-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title={isPaused ? 'Retomar captura' : 'Pausar captura'}
            >
              {isPaused ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onFinishClick}
              className="px-2.5 py-1 rounded bg-rose-600/20 border border-rose-500/50 text-rose-300 text-xs font-semibold hover:bg-rose-600/30 transition-colors"
            >
              Finalizar
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
