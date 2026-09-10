import React from 'react';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { StructuredItem } from '../../types/meeting';

interface RisksOpportunitiesPanelProps {
  risks: StructuredItem[];
  opportunities: StructuredItem[];
}

export const RisksOpportunitiesPanel: React.FC<RisksOpportunitiesPanelProps> = ({
  risks,
  opportunities,
}) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Risks */}
      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center justify-between mb-1.5 text-rose-300">
          <div className="flex items-center space-x-1">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Riscos</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">{risks.length}</span>
        </div>
        {risks.length === 0 ? (
          <div className="text-[10px] text-slate-500 italic">Sem riscos anotados.</div>
        ) : (
          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
            {risks.map((r, i) => (
              <div key={i} className="text-[11px] text-rose-200/90 leading-tight">
                • {r.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Opportunities */}
      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center justify-between mb-1.5 text-emerald-300">
          <div className="flex items-center space-x-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Oportunidades</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">{opportunities.length}</span>
        </div>
        {opportunities.length === 0 ? (
          <div className="text-[10px] text-slate-500 italic">Nenhum upsell mapeado.</div>
        ) : (
          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
            {opportunities.map((op, i) => (
              <div key={i} className="text-[11px] text-emerald-200/90 leading-tight">
                • {op.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
