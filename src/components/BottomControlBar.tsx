import React, { useState } from 'react';
import { Send, MessageSquare, Lightbulb, Bookmark, Pause, Play, SquareCheck, RefreshCw } from 'lucide-react';

interface BottomControlBarProps {
  onAskCopilot: (query: string) => void;
  onHelpWithObjection: () => void;
  onWhatShouldIAsk: () => void;
  onBookmarkMoment: () => void;
  onAnalyzeRecent: () => void;
  onPauseToggle: () => void;
  onFinishClick: () => void;
  isPaused: boolean;
  isLoading: boolean;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  onAskCopilot,
  onHelpWithObjection,
  onWhatShouldIAsk,
  onBookmarkMoment,
  onAnalyzeRecent,
  onPauseToggle,
  onFinishClick,
  isPaused,
  isLoading,
}) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onAskCopilot(query.trim());
      setQuery('');
    }
  };

  return (
    <div className="border-t border-slate-800 bg-slate-900/95 p-3 select-none flex flex-col space-y-2">
      {/* Quick Action Buttons Row */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onWhatShouldIAsk}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Atalho: Ctrl + Espaço"
          >
            <Lightbulb className="w-3.5 h-3.5 text-sky-400" />
            <span>O que devo perguntar agora?</span>
            <span className="text-[10px] text-sky-400/70 ml-1 font-mono border border-sky-500/30 px-1 rounded">Ctrl+Space</span>
          </button>

          <button
            onClick={onHelpWithObjection}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Atalho: Ctrl + Shift + O"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Me ajude com essa objeção</span>
            <span className="text-[10px] text-amber-400/70 ml-1 font-mono border border-amber-500/30 px-1 rounded">Ctrl+Shift+O</span>
          </button>

          <button
            onClick={onAnalyzeRecent}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Analisar últimos minutos</span>
          </button>

          <button
            onClick={onBookmarkMoment}
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1 transition-colors"
            title="Atalho: Ctrl + Shift + M"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Marcar momento</span>
          </button>
        </div>

        {/* Meeting Control Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPauseToggle}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-colors ${
              isPaused
                ? 'bg-amber-600/20 border-amber-500/50 text-amber-300 hover:bg-amber-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Retomar' : 'Pausar'}</span>
          </button>

          <button
            onClick={onFinishClick}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm shadow-rose-950/50"
          >
            <SquareCheck className="w-3.5 h-3.5" />
            <span>Finalizar reunião</span>
          </button>
        </div>
      </div>

      {/* Manual Prompt Input Box */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pergunte ao copiloto... (ex: 'Quanto o escopo aumentou?', 'O que o cliente quer comprar?')"
          disabled={isLoading}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white text-xs font-semibold flex items-center space-x-1 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Consultar</span>
        </button>
      </form>
    </div>
  );
};
