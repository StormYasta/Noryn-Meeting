import React from 'react';
import { X, Sparkles, AlertCircle, MessageSquareQuote, Check } from 'lucide-react';
import { CopilotManualResponse } from '../types/meeting';

interface CopilotResponseModalProps {
  response: CopilotManualResponse | null;
  onClose: () => void;
}

export const CopilotResponseModal: React.FC<CopilotResponseModalProps> = ({ response, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!response) return null;

  const isObjection = response.type === 'objection';

  const copyToClipboard = () => {
    const textToCopy = isObjection
      ? `RESPOSTA SUGERIDA:\n${response.suggestedResponse}\n\nPERGUNTA DE CONTINUIDADE:\n${response.continuityQuestion}`
      : response.answer;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-sky-500/50 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2 text-sky-400">
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {isObjection ? 'Análise de Objeção Comercial' : 'Resposta do Copiloto'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto text-xs leading-relaxed">
          {/* Question / Prompt Asked */}
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-slate-300">
            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Consulta Realizada</span>
            <span className="font-semibold text-slate-100">"{response.question}"</span>
          </div>

          {isObjection ? (
            <div className="space-y-2.5">
              {/* Objection Identified */}
              {response.objectionIdentified && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-200">
                  <div className="flex items-center space-x-1.5 text-amber-400 font-bold uppercase text-[10px] mb-0.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Objeção Identificada</span>
                  </div>
                  <div>{response.objectionIdentified}</div>
                </div>
              )}

              {/* Interpretation */}
              {response.interpretation && (
                <div className="p-2.5 rounded-lg bg-slate-850 border border-slate-800 text-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Interpretação Comercial</span>
                  <div>{response.interpretation}</div>
                </div>
              )}

              {/* Suggested Response */}
              {response.suggestedResponse && (
                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/50 text-emerald-100">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">Resposta Sugerida</span>
                  <div className="font-medium text-sm text-white leading-normal">{response.suggestedResponse}</div>
                </div>
              )}

              {/* Continuity Question */}
              {response.continuityQuestion && (
                <div className="p-2.5 rounded-lg bg-sky-950/40 border border-sky-500/40 text-sky-100">
                  <div className="flex items-center space-x-1 text-sky-300 font-bold uppercase text-[10px] mb-0.5">
                    <MessageSquareQuote className="w-3.5 h-3.5" />
                    <span>Pergunta de Continuidade</span>
                  </div>
                  <div className="italic text-sm font-medium">"{response.continuityQuestion}"</div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-slate-850 border border-slate-800 text-slate-100 whitespace-pre-wrap leading-normal font-sans text-sm">
              {response.answer}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono">Gerado localmente às {response.timestamp}</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
              <span>{copied ? 'Copiado!' : 'Copiar Resposta'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
