import React from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { CommercialAlert } from '../types/meeting';

interface AlertBannerProps {
  alerts: CommercialAlert[];
  onDismiss: (index: number) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onDismiss }) => {
  if (alerts.length === 0) return null;

  return (
    <div className="absolute top-14 left-0 right-0 z-30 px-4 py-2 pointer-events-none flex flex-col space-y-2">
      {alerts.map((alert, idx) => {
        const isCritical = alert.severity === 'critical';
        const isWarning = alert.severity === 'warning';

        return (
          <div
            key={idx}
            className={`pointer-events-auto flex items-start justify-between p-3 rounded-lg border shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-top-2 duration-200 ${
              isCritical
                ? 'bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/50'
                : isWarning
                ? 'bg-amber-950/90 border-amber-500/80 text-amber-100 shadow-amber-950/50'
                : 'bg-sky-950/90 border-sky-500/80 text-sky-100 shadow-sky-950/50'
            }`}
          >
            <div className="flex items-start space-x-2.5">
              {isCritical && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
              {isWarning && <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
              {!isCritical && !isWarning && <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">{alert.title}</div>
                <div className="text-xs text-slate-200 mt-0.5 leading-relaxed">{alert.message}</div>
              </div>
            </div>
            <button
              onClick={() => onDismiss(idx)}
              className="ml-3 text-slate-400 hover:text-slate-100 p-1 rounded transition-colors"
              title="Dispensar alerta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
