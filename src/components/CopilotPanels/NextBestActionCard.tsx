import React from 'react';
import { Compass, Sparkles } from 'lucide-react';

interface NextBestActionCardProps {
  action: string;
}

export const NextBestActionCard: React.FC<NextBestActionCardProps> = ({ action }) => {
  return (
    <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/70 via-slate-900 to-indigo-950/70 border border-sky-500/50 shadow-lg shadow-sky-950/20 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center space-x-1.5 text-sky-400">
          <Compass className="w-4 h-4 animate-spin-slow" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Próxima Melhor Ação</span>
        </div>
        <span className="flex items-center space-x-1 text-[10px] text-sky-300/80 bg-sky-900/40 px-1.5 py-0.5 rounded border border-sky-700/40">
          <Sparkles className="w-2.5 h-2.5" />
          <span>Foco Comercial</span>
        </span>
      </div>
      <p className="text-sm font-semibold text-slate-100 leading-snug">
        {action || 'Inicie a conversa explorando o volume de usuários e filiais do escritório.'}
      </p>
    </div>
  );
};
