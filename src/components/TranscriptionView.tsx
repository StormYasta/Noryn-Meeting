import React, { useRef, useEffect, useState } from 'react';
import { MessageSquare, Bookmark, ArrowDown, User, UserCheck, Mic, Monitor } from 'lucide-react';
import { TranscriptSegment } from '../types/meeting';

interface TranscriptionViewProps {
  transcript: TranscriptSegment[];
  liveDelta: { text: string; speaker: string } | null;
  currentSpeaker: 'Cliente' | 'Eu';
  onSpeakerChange: (speaker: 'Cliente' | 'Eu') => void;
  micVolumeLevel: number;
  systemVolumeLevel: number;
}

export const TranscriptionView: React.FC<TranscriptionViewProps> = ({
  transcript,
  liveDelta,
  currentSpeaker,
  onSpeakerChange,
  micVolumeLevel,
  systemVolumeLevel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript, liveDelta, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-r border-slate-800">
      {/* Header bar of transcription column */}
      <div className="h-10 border-b border-slate-800 px-3 flex items-center justify-between bg-slate-900/80 select-none">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Transcrição</span>
          <span className="text-[11px] px-1.5 py-0.2 bg-slate-800 rounded text-slate-400 font-mono">
            {transcript.length}
          </span>
        </div>

        {/* Audio VU Meters & Speaker selector */}
        <div className="flex items-center space-x-2.5">
          {/* Dual VU Meter: Mic & System */}
          <div className="flex items-center space-x-2 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[10px]">
            {/* Mic Meter */}
            <div className="flex items-center space-x-1" title={`Microfone: ${micVolumeLevel}%`}>
              <Mic className="w-3 h-3 text-emerald-400" />
              <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, micVolumeLevel * 2)}%` }}
                />
              </div>
            </div>

            {/* System Audio Meter */}
            <div className="flex items-center space-x-1" title={`Áudio do Computador / Meet: ${systemVolumeLevel}%`}>
              <Monitor className="w-3 h-3 text-indigo-400" />
              <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, systemVolumeLevel * 2)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Speaker toggle */}
          <div className="flex rounded bg-slate-800 p-0.5 border border-slate-700 text-[11px]">
            <button
              onClick={() => onSpeakerChange('Eu')}
              className={`px-2 py-0.5 rounded transition-colors flex items-center space-x-1 ${
                currentSpeaker === 'Eu'
                  ? 'bg-sky-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Marcar falas para Gabriel / Vendedor"
            >
              <User className="w-3 h-3" />
              <span>Eu</span>
            </button>
            <button
              onClick={() => onSpeakerChange('Cliente')}
              className={`px-2 py-0.5 rounded transition-colors flex items-center space-x-1 ${
                currentSpeaker === 'Cliente'
                  ? 'bg-amber-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Marcar falas para o Cliente (Meet / YouTube)"
            >
              <UserCheck className="w-3 h-3" />
              <span>Cliente</span>
            </button>
          </div>

          {/* Auto scroll toggle button */}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (containerRef.current) {
                  containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }
              }}
              className="p-1 rounded bg-sky-950/80 border border-sky-600/50 text-sky-300 hover:bg-sky-900/50"
              title="Rolar para o fim"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Transcript Items Feed */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs leading-relaxed"
      >
        {transcript.length === 0 && !liveDelta && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30 text-sky-400" />
            <p className="text-xs font-medium">Aguardando áudio da reunião (Microfone ou Google Meet)...</p>
            <p className="text-[11px] mt-1 text-slate-600 max-w-xs">
              As falas captadas tanto pelo seu microfone quanto pelo som do computador (Google Meet, YouTube) serão transcritas pelo Whisper em tempo real.
            </p>
          </div>
        )}

        {transcript.map((item) => {
          const isMe = item.speaker === 'Eu' || item.speaker === 'Gabriel';

          return (
            <div
              key={item.id}
              className={`p-2.5 rounded-lg border transition-all ${
                item.bookmarked
                  ? 'bg-amber-950/30 border-amber-500/50 shadow-sm'
                  : isMe
                  ? 'bg-sky-950/20 border-sky-800/40 ml-2'
                  : 'bg-slate-850/60 border-slate-800/80 mr-2'
              }`}
            >
              <div className="flex items-center justify-between mb-1 text-[11px]">
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`font-semibold px-1.5 py-0.2 rounded text-[10px] uppercase ${
                      isMe
                        ? 'bg-sky-900/60 text-sky-300 border border-sky-700/50'
                        : 'bg-amber-900/50 text-amber-300 border border-amber-700/50'
                    }`}
                  >
                    {item.speaker}
                  </span>
                  <span className="font-mono text-slate-500 text-[10px]">{item.formattedTime}</span>
                </div>
                {item.bookmarked && (
                  <div className="flex items-center text-amber-400 text-[10px] space-x-0.5">
                    <Bookmark className="w-3 h-3 fill-amber-400" />
                    <span>Importante</span>
                  </div>
                )}
              </div>
              <div className="text-slate-200 select-text whitespace-pre-wrap">{item.text}</div>
            </div>
          );
        })}

        {/* Live Delta preview during speech */}
        {liveDelta && (
          <div className="p-2.5 rounded-lg border border-sky-500/50 bg-sky-950/30 animate-pulse">
            <div className="flex items-center space-x-1.5 mb-1 text-[11px]">
              <span className="font-semibold text-sky-400 uppercase text-[10px]">{liveDelta.speaker}</span>
              <span className="text-sky-400 text-[10px] font-mono">falando...</span>
            </div>
            <div className="text-sky-200 select-text whitespace-pre-wrap italic">{liveDelta.text}</div>
          </div>
        )}
      </div>
    </div>
  );
};
