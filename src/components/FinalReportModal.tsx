import React, { useState } from 'react';
import {
  FileText,
  FolderOpen,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Users,
  ShieldAlert,
  TrendingUp,
  Mail,
  ListChecks,
} from 'lucide-react';
import { FinalReportData } from '../types/meeting';

interface FinalReportModalProps {
  report: FinalReportData | null;
  meetingDir: string;
  onNewMeeting: () => void;
}

export const FinalReportModal: React.FC<FinalReportModalProps> = ({
  report,
  meetingDir,
  onNewMeeting,
}) => {
  const [copiedFollowUp, setCopiedFollowUp] = useState(false);
  const [activeTab, setActiveTab] = useState<'report' | 'followup' | 'transcript'>('report');

  if (!report) return null;

  const handleOpenFolder = () => {
    if (window.electronAPI && report.metadata.id) {
      window.electronAPI.openMeetingFolder(report.metadata.id);
    }
  };

  const handleCopyFollowUp = () => {
    navigator.clipboard.writeText(report.followUpDraft);
    setCopiedFollowUp(true);
    setTimeout(() => setCopiedFollowUp(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div>
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Relatório Executivo Consolidado</span>
            </div>
            <h2 className="text-base font-bold text-white mt-0.5">{report.metadata.title}</h2>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenFolder}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors border border-slate-700"
              title={meetingDir}
            >
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <span>Abrir Pasta Local</span>
            </button>
            <button
              onClick={onNewMeeting}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Nova Reunião</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-800 flex space-x-4 bg-slate-950/40 text-xs select-none">
          <button
            onClick={() => setActiveTab('report')}
            className={`pb-2.5 font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
              activeTab === 'report'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Relatório Comercial (20 Seções)</span>
          </button>

          <button
            onClick={() => setActiveTab('followup')}
            className={`pb-2.5 font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
              activeTab === 'followup'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Rascunho de Follow-up</span>
          </button>

          <button
            onClick={() => setActiveTab('transcript')}
            className={`pb-2.5 font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
              activeTab === 'transcript'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Transcrição Completa</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-200 leading-relaxed font-sans">
          {activeTab === 'report' && (
            <>
              {/* 1. Resumo Executivo */}
              <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">1. Resumo Executivo</h3>
                <p className="text-sm text-slate-100 leading-normal">{report.executiveSummary}</p>
              </section>

              {/* 2 & 3. Participantes & Objetivo */}
              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center space-x-1.5">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    <span>2. Participantes</span>
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.participants.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">3. Objetivo</h3>
                  <p className="text-slate-300">{report.meetingObjective}</p>
                </section>
              </div>

              {/* 4. Necessidades do Cliente */}
              <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">4. Necessidades do Cliente</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {report.clientNeeds.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </section>

              {/* 5, 6 & 7. Requisitos Funcionais, Técnicos e Integrações */}
              <div className="grid grid-cols-3 gap-4">
                <section className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">5. Requisitos Funcionais</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.functionalRequirements.length > 0 ? (
                      report.functionalRequirements.map((r, i) => <li key={i}>{r}</li>)
                    ) : (
                      <li className="italic text-slate-500">Nenhum</li>
                    )}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">6. Requisitos Técnicos</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.technicalRequirements.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">7. Integrações</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.integrations.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* 8. Quantidade de Usuários / Filiais / Números */}
              <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                  8. Dimensionamento Operacional
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Usuários / Atendentes</span>
                    <span className="text-sm font-bold text-white">{report.capacityMetrics.users}</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Filiais</span>
                    <span className="text-sm font-bold text-white">{report.capacityMetrics.branches}</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] uppercase text-slate-400 block font-bold">Números de WhatsApp</span>
                    <span className="text-sm font-bold text-white">{report.capacityMetrics.whatsappNumbers}</span>
                  </div>
                </div>
              </section>

              {/* 9 & 10. Objeções & Decisões */}
              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">9. Objeções Identificadas</h3>
                  {report.objections.length > 0 ? (
                    <div className="space-y-2">
                      {report.objections.map((o, i) => (
                        <div key={i} className="p-2 rounded bg-amber-950/20 border border-amber-500/30">
                          <div className="font-semibold text-amber-200">⚠ {o.text}</div>
                          {o.suggestedResponse && (
                            <div className="text-[11px] text-slate-300 mt-1">
                              <strong>Resposta sugerida:</strong> {o.suggestedResponse}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="italic text-slate-500">Sem objeções críticas.</span>
                  )}
                </section>

                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">10. Decisões Tomadas</h3>
                  {report.decisions.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      {report.decisions.map((d, i) => (
                        <li key={i}>{d.text}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="italic text-slate-500">Nenhuma decisão final acordada.</span>
                  )}
                </section>
              </div>

              {/* 11 & 12. Promessas da Noryn & Pendências */}
              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">
                    11. Promessas Realizadas pela Noryn
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.commitmentsByNoryn.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                    12. Pendências e Lacunas a Descobrir
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.pendingQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* 13 & 14. Riscos & Oportunidades */}
              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-2 flex items-center space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>13. Riscos Identificados</span>
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-rose-200">
                    {report.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center space-x-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>14. Oportunidades de Upsell</span>
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-emerald-200">
                    {report.opportunities.map((op, i) => (
                      <li key={i}>{op}</li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* 15, 16 & 17. Impacto Preço, Prazo e Modelo Comercial */}
              <div className="grid grid-cols-3 gap-4">
                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">15. Impacto no Preço</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.priceImpactPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">16. Impacto no Prazo</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.timelineImpactPoints.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">17. Modelo Comercial</h3>
                  <p className="text-slate-200 font-medium">{report.commercialModelRecommendation}</p>
                </section>
              </div>

              {/* 18. Próximos Passos */}
              <section className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">18. Próximos Passos</h3>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 font-medium">
                  {report.nextSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {activeTab === 'followup' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Rascunho de follow-up pronto para envio por e-mail ou WhatsApp:</span>
                <button
                  onClick={handleCopyFollowUp}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  {copiedFollowUp ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFollowUp ? 'Copiado para Área de Transferência!' : 'Copiar Rascunho'}</span>
                </button>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {report.followUpDraft}
              </div>
            </div>
          )}

          {activeTab === 'transcript' && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 whitespace-pre-wrap leading-relaxed font-sans text-xs text-slate-200">
              {report.transcriptMarkdown}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
