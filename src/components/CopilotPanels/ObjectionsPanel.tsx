import React from 'react';
import { AlertCircle, Lightbulb, MessageSquareQuote } from 'lucide-react';
import { StructuredItem } from '../../types/meeting';

interface ObjectionsPanelProps {
  objections: StructuredItem[];
}

export const ObjectionsPanel: React.FC<ObjectionsPanelProps> = ({ objections }) => {
  return (
    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 text-amber-300">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Objeções & Sugestões</span>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
          {objections.length}
        </span>
      </div>

      {objections.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic py-2">
          Nenhuma objeção comercial detectada até o momento.
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {objections.map((obj, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/40 space-y-1.5 text-xs"
            >
              <div className="flex items-start space-x-1.5 font-semibold text-amber-200">
                <span className="text-amber-400 font-bold">⚠</span>
                <span>{obj.text}</span>
              </div>

              {obj.suggestedResponse && (
                <div className="flex items-start space-x-1.5 text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300/90 block">Sugestão de Resposta:</span>
                    <span className="leading-snug">{obj.suggestedResponse}</span>
                  </div>
                </div>
              )}

              {obj.continuityQuestion && (
                <div className="flex items-start space-x-1.5 text-[11px] text-sky-200 bg-sky-950/40 p-2 rounded border border-sky-800/40">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-sky-300 block">Pergunta de Continuidade:</span>
                    <span className="italic leading-snug">"{obj.continuityQuestion}"</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
