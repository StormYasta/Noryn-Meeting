import React from 'react';
import { HelpCircle, ArrowRight } from 'lucide-react';
import { StructuredItem } from '../../types/meeting';

interface PendingQuestionsPanelProps {
  pendingQuestions: StructuredItem[];
}

export const PendingQuestionsPanel: React.FC<PendingQuestionsPanelProps> = ({ pendingQuestions }) => {
  return (
    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 text-sky-300">
          <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Lacunas a Descobrir</span>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
          {pendingQuestions.length}
        </span>
      </div>

      {pendingQuestions.length === 0 ? (
        <div className="text-[11px] text-emerald-400/90 italic py-2">
          ✓ Todas as principais perguntas de descoberta foram abordadas!
        </div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {pendingQuestions.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start space-x-2 text-xs p-1.5 rounded bg-slate-850/60 border border-slate-800/80 text-slate-300"
            >
              <ArrowRight className="w-3 h-3 text-sky-400 shrink-0 mt-0.5" />
              <span className="leading-tight">{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
