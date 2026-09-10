import React from 'react';
import { CheckCircle2, HelpCircle, Layers } from 'lucide-react';
import { StructuredItem } from '../../types/meeting';

interface RequirementsPanelProps {
  requirements: StructuredItem[];
  technicalRequirements: StructuredItem[];
  integrations: StructuredItem[];
}

export const RequirementsPanel: React.FC<RequirementsPanelProps> = ({
  requirements,
  technicalRequirements,
  integrations,
}) => {
  const allItems = [...requirements, ...technicalRequirements, ...integrations];

  return (
    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 text-slate-300">
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Requisitos & Integrações</span>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
          {allItems.length}
        </span>
      </div>

      {allItems.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic py-2">
          Nenhum requisito ou integração mapeado até o momento.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {allItems.map((req, idx) => {
            const isConfirmed = req.status === 'confirmed';
            return (
              <div
                key={idx}
                className="flex items-start space-x-2 text-xs p-1.5 rounded bg-slate-850/70 border border-slate-800/80"
              >
                {isConfirmed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="text-slate-200 font-medium">{req.text}</span>
                  {req.sourceExcerpt && (
                    <span className="block text-[10px] text-slate-500 italic truncate">
                      "{req.sourceExcerpt}"
                    </span>
                  )}
                </div>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded uppercase font-mono ${
                    req.confidence === 'high'
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                      : 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                  }`}
                >
                  {req.confidence === 'high' ? 'fato' : 'hipótese'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
