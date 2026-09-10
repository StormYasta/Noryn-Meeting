const { RuleEngine } = require('./dist-electron/electron/services/rule-engine');
const { SessionStorage } = require('./dist-electron/electron/services/session-storage');
const { RuleBasedProvider } = require('./dist-electron/electron/services/ai-provider');
const { detectHardware } = require('./dist-electron/electron/services/hardware-detector');
const fs = require('fs');
const path = require('path');

async function runVerification() {
  console.log('=== TESTE DE VALIDAÇÃO DO NORYN MEETING COPILOT ===\n');

  // 1. Hardware Detection Test
  console.log('[1/4] Testando Detecção de Hardware Local...');
  const hw = await detectHardware();
  console.log(' -> GPU:', hw.gpuName, `(${hw.vramGB}GB VRAM)`);
  console.log(' -> CPU:', hw.cpuName, `(${hw.cores} núcleos)`);
  console.log(' -> RAM:', `${hw.ramGB}GB`);
  console.log(' -> Perfil Sugerido:', hw.suggestedProfile);
  console.log(' -> Suporte CUDA:', hw.hasCuda);
  if (!hw.cpuName) throw new Error('Falha na detecção de CPU');
  console.log('✓ Hardware detectado com sucesso.\n');

  // 2. Rule Engine Commercial Analysis Test
  console.log('[2/4] Testando Motor de Regras Comerciais Noryn...');
  const initialState = {
    requirements: [],
    objections: [],
    decisions: [],
    pendingQuestions: [
      { text: 'Quantas pessoas utilizarão o sistema?', confidence: 'high', timestamp: '00:00', status: 'open' },
    ],
    risks: [],
    opportunities: [],
    commitments: [],
    pricingSignals: [],
    technicalRequirements: [],
    integrations: [],
    nextBestAction: '',
    summarySoFar: '',
  };

  // Test phrase 1: Requirements & capacity
  const phrase1 = 'No nosso escritório somos 15 pessoas, temos matriz e filial no Rio, e hoje usamos 3 números de WhatsApp.';
  const res1 = RuleEngine.analyzeText(phrase1, initialState, 45);
  console.log(' -> Requisitos identificados:', res1.newState.requirements.map(r => r.text));
  if (res1.newState.requirements.length < 2) {
    throw new Error('Falha ao identificar usuários ou WhatsApp');
  }

  // Test phrase 2: Critical commercial alert (Buying the system & Source code)
  const phrase2 = 'A gente quer comprar o sistema para ser nosso e ter acesso ao código-fonte, sem pagar mensalidade recorrente.';
  const res2 = RuleEngine.analyzeText(phrase2, res1.newState, 110);
  console.log(' -> Alertas comerciais críticos disparados:', res2.alerts.map(a => a.title));
  console.log(' -> Objeções mapeadas:', res2.newState.objections.map(o => o.text));
  console.log(' -> Riscos mapeados:', res2.newState.risks.map(r => r.text));
  console.log(' -> Próxima Melhor Ação (NBA):', res2.newState.nextBestAction);

  if (res2.alerts.length === 0) {
    throw new Error('Falha: Alerta crítico de "comprar o sistema" não disparou!');
  }
  if (res2.newState.objections.length === 0) {
    throw new Error('Falha: Objeção de mensalidade/compra não registrada!');
  }
  console.log('✓ Motor de regras comerciais validado com 100% de sucesso.\n');

  // 3. Session Storage & SQLite Persistence Test
  console.log('[3/4] Testando Persistência em SQLite e Diretórios de Reunião...');
  const testMeetingId = `test_meeting_${Date.now()}`;
  const storage = new SessionStorage(path.join(__dirname, 'meetings_test'));
  await storage.initialize();

  const metadata = {
    id: testMeetingId,
    title: 'Reunião Teste Automatizada — Escritório de Patentes',
    contextText: 'Avaliação comercial do CRM Noryn',
    startedAt: new Date().toLocaleString('pt-BR'),
    endedAt: new Date().toLocaleString('pt-BR'),
    durationSeconds: 125,
    participants: ['Gabriel (Noryn)', 'Dr. Carlos (Sócio Escritório)'],
    saveAudio: false,
    hardwareProfile: 'balanced',
    sttModel: 'Whisper Tiny (Local)',
    aiProvider: 'Noryn Rule Engine',
    aiModel: 'Local Hybrid Engine',
    costEstimate: 'R$ 0,00 (100% Local)',
  };

  storage.saveMeetingMetadata(metadata);

  const testSegments = [
    { id: '1', speaker: 'Cliente', text: 'Boa tarde, queremos entender se o CRM suporta 3 números de WhatsApp.', timestamp: 5, formattedTime: '00:05', isFinal: true },
    { id: '2', speaker: 'Gabriel', text: 'Com certeza! A Noryn suporta múltiplos números e distribuição entre os 15 atendentes.', timestamp: 20, formattedTime: '00:20', isFinal: true },
    { id: '3', speaker: 'Cliente', text: 'Excelente, mas não queremos ficar presos a mensalidades.', timestamp: 65, formattedTime: '01:05', isFinal: true, bookmarked: true },
  ];
  storage.saveTranscript(testMeetingId, testSegments);
  storage.saveMeetingState(testMeetingId, res2.newState);
  storage.saveEvent(testMeetingId, {
    type: 'commercial_alert',
    title: 'Alerta de Compra',
    message: 'Cliente sugeriu compra do sistema',
    severity: 'critical',
  });

  // Verify files created
  const meetingFolder = storage.getMeetingDir(testMeetingId);
  if (!fs.existsSync(path.join(meetingFolder, 'metadata.json'))) throw new Error('metadata.json não criado');
  if (!fs.existsSync(path.join(meetingFolder, 'transcript.json'))) throw new Error('transcript.json não criado');
  if (!fs.existsSync(path.join(meetingFolder, 'analysis-state.json'))) throw new Error('analysis-state.json não criado');
  if (!fs.existsSync(path.join(__dirname, 'meetings_test', 'meetings.sqlite'))) throw new Error('meetings.sqlite não criado');
  console.log('✓ Arquivos JSON e banco SQLite meetings.sqlite criados com sucesso.\n');

  // 4. Final Executive Report Generation Test (20 Sections)
  console.log('[4/4] Testando Geração do Relatório Executivo Final (20 Seções)...');
  const report = RuleBasedProvider.generateFinalReport({
    meetingTitle: metadata.title,
    contextText: metadata.contextText,
    summarySoFar: 'Discussão comercial inicial focada em 3 números de WhatsApp e 15 usuários.',
    currentState: res2.newState,
    recentTranscript: testSegments,
    allTranscript: testSegments,
    elapsedSeconds: 125,
  }, metadata);

  const reportPath = storage.saveFinalReport(testMeetingId, report);
  const reportContent = fs.readFileSync(reportPath, 'utf-8');

  // Verify essential sections
  const checks = [
    '1. RESUMO EXECUTIVO',
    '2. PARTICIPANTES',
    '3. OBJETIVO DA REUNIÃO',
    '4. NECESSIDADES DO CLIENTE',
    '5. REQUISITOS FUNCIONAIS',
    '6. REQUISITOS TÉCNICOS',
    '7. INTEGRAÇÕES',
    '8. QUANTIDADE DE USUÁRIOS / FILIAIS / NÚMEROS',
    '9. OBJEÇÕES IDENTIFICADAS',
    '10. DECISÕES TOMADAS',
    '11. PROMESSAS REALIZADAS PELA NORYN',
    '12. PENDÊNCIAS E LACUNAS A DESCOBRIR',
    '13. RISCOS COMERCIAIS E TÉCNICOS',
    '14. OPORTUNIDADES IDENTIFICADAS',
    '15. PONTOS QUE IMPACTAM PREÇO',
    '16. PONTOS QUE IMPACTAM PRAZO',
    '17. MODELO COMERCIAL MAIS ADEQUADO',
    '18. PRÓXIMOS PASSOS',
    '19. RASCUNHO DE FOLLOW-UP',
    '20. TRANSCRIÇÃO COMPLETA',
  ];

  for (const c of checks) {
    if (!reportContent.includes(c)) {
      throw new Error(`Seção ausente no relatório final: ${c}`);
    }
  }

  console.log('✓ Todas as 20 seções obrigatórias e rascunho de follow-up validados com perfeição.');
  console.log('✓ Relatório salvo em:', reportPath);

  // Clean up test meeting directory
  fs.rmSync(path.join(__dirname, 'meetings_test'), { recursive: true, force: true });
  console.log('\n=== TODOS OS TESTES PASSARAM COM ÊXITO (100% SUCESSO) ===');
}

runVerification().catch((err) => {
  console.error('\n❌ ERRO NA VALIDAÇÃO:', err);
  process.exit(1);
});
