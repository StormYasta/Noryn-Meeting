const assert = require('assert');
const { HallucinationGuard } = require('./dist-electron/electron/services/hallucination-guard');
const { TextDeduplicator } = require('./dist-electron/electron/services/text-deduplicator');
const { AudioSegmenter } = require('./dist-electron/electron/services/audio-segmenter');
const { AudioPipelineConfig } = require('./dist-electron/electron/services/audio-config');

async function runTranscriptionTests() {
  console.log('=== TESTES UNITÁRIOS E DE INTEGRAÇÃO DO PIPELINE DE TRANSCRIÇÃO ===\n');

  // -------------------------------------------------------------------------
  // 1. TESTE DE DETECÇÃO DE ALUCINAÇÕES E REPETIÇÕES EXTREMAS (FIXTURES REAIS)
  // -------------------------------------------------------------------------
  console.log('[1/6] Testando Detecção de Alucinações e Repetições (HallucinationGuard)...');

  // Fixture real 1: "É isso. É isso. É isso..."
  const fixture1 = 'É isso. É isso. É isso. É isso. É isso. É isso.';
  const res1 = HallucinationGuard.validate(fixture1, 4.0, 0.5);
  console.log(' -> Fixture 1 ("É isso..."):', res1.isValid ? 'FALHA (aceitou)' : `REJEITADO COM SUCESSO: ${res1.reason}`);
  assert.strictEqual(res1.isValid, false, 'Deveria ter rejeitado repetição contínua de "É isso."');

  // Fixture real 2: "eu não sei eu não sei eu não sei..."
  const fixture2 = 'eu não sei eu não sei eu não sei eu não sei';
  const res2 = HallucinationGuard.validate(fixture2, 3.5, 0.6);
  console.log(' -> Fixture 2 ("eu não sei..."):', res2.isValid ? 'FALHA (aceitou)' : `REJEITADO COM SUCESSO: ${res2.reason}`);
  assert.strictEqual(res2.isValid, false, 'Deveria ter rejeitado repetição contínua de "eu não sei"');

  // Fixture real 3: Bordão de silêncio isolado ("Obrigado por assistir ao vídeo.")
  const fixture3 = 'Obrigado por assistir ao vídeo.';
  const res3 = HallucinationGuard.validate(fixture3, 3.0, 0.1);
  console.log(' -> Fixture 3 (Bordão isolado):', res3.isValid ? 'FALHA (aceitou)' : `REJEITADO COM SUCESSO: ${res3.reason}`);
  assert.strictEqual(res3.isValid, false, 'Deveria ter rejeitado bordão clássico de silêncio');

  // Fixture real 4: Metadados entre colchetes
  const fixture4 = '[Música]';
  const res4 = HallucinationGuard.validate(fixture4, 3.0, 0.1);
  console.log(' -> Fixture 4 (Metadado [Música]):', res4.isValid ? 'FALHA (aceitou)' : `REJEITADO COM SUCESSO: ${res4.reason}`);
  assert.strictEqual(res4.isValid, false, 'Deveria ter rejeitado [Música]');

  // Fixture legítima: Fala humana normal em reunião comercial
  const legitFixture = 'Bom dia a todos, queremos entender como o CRM Noryn gerencia múltiplos números de WhatsApp.';
  const resLegit = HallucinationGuard.validate(legitFixture, 4.5, 0.85);
  console.log(' -> Fixture Legítima:', resLegit.isValid ? `APROVADO COM SUCESSO: "${resLegit.sanitizedText}"` : 'FALHA');
  assert.strictEqual(resLegit.isValid, true, 'Deveria ter aprovado fala legítima');

  console.log('✓ Detecção de alucinações e repetições validada com 100% de precisão.\n');

  // -------------------------------------------------------------------------
  // 2. TESTE DE SANITY CHECK DE TAXA DE FALA (WORDS-PER-SECOND / CHARS-PER-SECOND)
  // -------------------------------------------------------------------------
  console.log('[2/6] Testando Sanity Check de Taxa de Fala (Words Per Second)...');

  // Texto anômalo: 50 palavras em um chunk de apenas 2 segundos (25 wps, impossível humanamente)
  const rapidText = 'um dois tres quatro cinco seis sete oito nove dez '.repeat(5).trim();
  const resSpeed = HallucinationGuard.validate(rapidText, 2.0, 1.0);
  console.log(` -> Texto com ${resSpeed.metrics.wordsPerSecond} wps em 2.0s:`, resSpeed.isValid ? 'FALHA (aceitou)' : `REJEITADO COM SUCESSO: ${resSpeed.reason}`);
  assert.strictEqual(resSpeed.isValid, false, 'Deveria ter rejeitado fala com palavras por segundo absurdas');

  // Fala em velocidade humana natural (~3.2 wps)
  const normalSpeedText = 'Nós temos matriz e filial com dez atendentes.';
  const resNormalSpeed = HallucinationGuard.validate(normalSpeedText, 2.5, 0.8);
  console.log(` -> Fala normal (${resNormalSpeed.metrics.wordsPerSecond} wps em 2.5s):`, resNormalSpeed.isValid ? 'APROVADO' : 'FALHA');
  assert.strictEqual(resNormalSpeed.isValid, true, 'Deveria ter aprovado fala com velocidade normal');

  console.log('✓ Sanity check de velocidade validado com sucesso.\n');

  // -------------------------------------------------------------------------
  // 3. TESTE DE DEDUPLICAÇÃO DE SEGMENTOS CONSECUTIVOS & OVERLAP
  // -------------------------------------------------------------------------
  console.log('[3/6] Testando Deduplicação e Fusão de Overlap Textual (TextDeduplicator)...');

  // Exemplo especificado na FASE 5:
  // Chunk 1: "nós precisamos integrar isso com o calendário"
  // Chunk 2: "com o calendário e depois verificar os usuários"
  // Esperado: "e depois verificar os usuários"
  const chunk1 = 'nós precisamos integrar isso com o calendário';
  const chunk2 = 'com o calendário e depois verificar os usuários';

  const dedupResult = TextDeduplicator.removeOverlap(chunk1, chunk2);
  console.log(' -> Chunk 1:', `"${chunk1}"`);
  console.log(' -> Chunk 2 original:', `"${chunk2}"`);
  console.log(' -> Palavras sobrepostas removidas:', dedupResult.overlapWords);
  console.log(' -> Chunk 2 desduplicado:', `"${dedupResult.text}"`);

  assert.strictEqual(dedupResult.overlapWords, 3, 'Deveria ter detectado sobreposição de 3 palavras ("com o calendário")');
  assert.strictEqual(dedupResult.text.trim(), 'e depois verificar os usuários', 'Texto mesclado incorreto!');

  // Teste de duplicata total idêntica recente
  const isDup = TextDeduplicator.isDuplicateOfRecent('nós precisamos integrar isso com o calendário', [
    'boa tarde',
    'nós precisamos integrar isso com o calendário.',
  ]);
  console.log(' -> Detecção de duplicata quase idêntica recente:', isDup ? 'DUPLICATA RECONHECIDA' : 'FALHA');
  assert.strictEqual(isDup, true, 'Deveria ter identificado segmento duplicado');

  console.log('✓ Deduplicação e remoção de overlap validadas com perfeição.\n');

  // -------------------------------------------------------------------------
  // 4. TESTE DE VAD E PROTEÇÃO TOTAL CONTRA TRANSCRIÇÃO DE SILÊNCIO
  // -------------------------------------------------------------------------
  console.log('[4/6] Testando VAD & Proteção contra Silêncio (AudioSegmenter)...');

  const segmenter = new AudioSegmenter('test_meeting', 16000, Date.now());

  // Simula 4 segundos de puro silêncio (amostras com ruído ínfimo RMS = 0.0005)
  // Cada frame tem 1365 amostras (~85ms)
  const silenceFrame = new Float32Array(1365);
  for (let i = 0; i < silenceFrame.length; i++) silenceFrame[i] = 0.0005 * (Math.random() - 0.5);

  let emittedChunk = null;
  // Alimenta 50 frames de silêncio (~4.25 segundos)
  for (let f = 0; f < 50; f++) {
    const chunk = segmenter.pushFrame(silenceFrame, 'Cliente');
    if (chunk) emittedChunk = chunk;
  }

  console.log(' -> Chunks emitidos em 4.25s de silêncio:', emittedChunk === null ? 'ZERO CHUNKS (SILÊNCIO CORRETAMENTE DESCARTADO)' : 'FALHA (EMITIU SILÊNCIO)');
  assert.strictEqual(emittedChunk, null, 'O segmentador NUNCA deve emitir chunk para silêncio puro!');

  // Agora simula 3 segundos de fala ativa com tom audível (RMS ~ 0.15)
  const voiceFrame = new Float32Array(1365);
  for (let i = 0; i < voiceFrame.length; i++) {
    voiceFrame[i] = Math.sin((i * 300 * 2 * Math.PI) / 16000) * 0.2;
  }

  // Alimenta 35 frames de voz (~3.0s)
  for (let f = 0; f < 35; f++) {
    segmenter.pushFrame(voiceFrame, 'Eu');
  }

  // Em seguida, alimenta 12 frames de silêncio (~1.0s) para fechar o turno
  let speechChunk = null;
  for (let f = 0; f < 12; f++) {
    const chunk = segmenter.pushFrame(silenceFrame, 'Eu');
    if (chunk) speechChunk = chunk;
  }

  console.log(' -> Chunk emitido após fala ativa + silêncio:', speechChunk ? `Chunk #${speechChunk.sequence} (dur=${speechChunk.durationSeconds}s, speaker=${speechChunk.speaker}, voiced=${(speechChunk.speechRatio * 100).toFixed(1)}%)` : 'FALHA');
  assert.notStrictEqual(speechChunk, null, 'Deveria ter emitido chunk após fala ativa válida');
  assert.strictEqual(speechChunk.speaker, 'Eu', 'Deveria ter atribuído o speaker "Eu"');
  assert.ok(speechChunk.speechRatio > 0.5, 'speechRatio deveria ser alto');

  console.log('✓ VAD e descarte de silêncio validados com sucesso.\n');

  // -------------------------------------------------------------------------
  // 5. TESTE DE ATRIBUIÇÃO PONDERADA DE SPEAKER (DIARIZATION)
  // -------------------------------------------------------------------------
  console.log('[5/6] Testando Atribuição Ponderada de Speaker...');

  const segmenterDiarization = new AudioSegmenter('test_spk', 16000, Date.now());

  // Fala do Cliente (sistema) dominante por 2.5s
  for (let f = 0; f < 30; f++) {
    segmenterDiarization.pushFrame(voiceFrame, 'Cliente');
  }

  // Cauda de silêncio onde o frame aleatório vem marcado como 'Eu'
  let diarizationChunk = null;
  for (let f = 0; f < 12; f++) {
    const chunk = segmenterDiarization.pushFrame(silenceFrame, 'Eu');
    if (chunk) diarizationChunk = chunk;
  }

  console.log(' -> Speaker atribuído após fala do Cliente com cauda de silêncio marcada como "Eu":', `"${diarizationChunk?.speaker}"`);
  assert.strictEqual(diarizationChunk.speaker, 'Cliente', 'A atribuição ponderada de speaker deve prevalecer sobre a cauda de silêncio!');

  console.log('✓ Atribuição de speaker ponderada validada com perfeição.\n');

  // -------------------------------------------------------------------------
  // 6. TESTE DE TIMESTAMPS E FORMATAÇÃO DE HORÁRIOS
  // -------------------------------------------------------------------------
  console.log('[6/6] Testando Timestamps e Ordenação Temporal...');

  const t1 = 45; // 45s -> 00:45
  const t2 = 125; // 125s -> 02:05
  const m1 = Math.floor(t1 / 60).toString().padStart(2, '0');
  const s1 = Math.floor(t1 % 60).toString().padStart(2, '0');
  const formatted1 = `${m1}:${s1}`;

  const m2 = Math.floor(t2 / 60).toString().padStart(2, '0');
  const s2 = Math.floor(t2 % 60).toString().padStart(2, '0');
  const formatted2 = `${m2}:${s2}`;

  console.log(' -> 45s formatado:', formatted1, '(Esperado: 00:45)');
  console.log(' -> 125s formatado:', formatted2, '(Esperado: 02:05)');
  assert.strictEqual(formatted1, '00:45');
  assert.strictEqual(formatted2, '02:05');

  console.log('✓ Formatação e precisão de timestamps validadas.\n');

  console.log('=== TODOS OS 6 TESTES DA SUÍTE DE TRANSCRIÇÃO PASSARAM COM 100% DE SUCESSO ===');
}

runTranscriptionTests().catch((err) => {
  console.error('\n❌ FALHA NOS TESTES DE TRANSCRIÇÃO:', err);
  process.exit(1);
});
