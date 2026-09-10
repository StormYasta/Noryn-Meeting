import React from 'react';
import { CheckSquare } from 'lucide-react';
import { StructuredItem } from '../../types/meeting';

interface DecisionsPanelProps {
  decisions: StructuredItem[];
}

export const DecisionsPanel: React.FC<DecisionsPanelProps> = ({ decisions }) => {
  return (
    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 text-indigo-300">
          <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Decisões & Acordos</span>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
          {decisions.length}
        </span>
      </div>

      {decisions.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic py-1">
          Nenhuma decisão registrada ainda.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {decisions.map((dec, idx) => (
            <div
              key={idx}
              className="flex items-start space-x-2 text-xs p-1.5 rounded bg-indigo-950/20 border border-indigo-800/40 text-slate-200"
            >
              <span className="text-indigo-400 font-bold">•</span>
              <span className="leading-snug">{dec.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
