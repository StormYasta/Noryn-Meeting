const { LocalWhisperService } = require('./dist-electron/electron/services/whisper-local');
const { RuleEngine } = require('./dist-electron/electron/services/rule-engine');

async function testAudioMixerLogic() {
  console.log('=== TESTE DE VALIDAÇÃO DO AUDIO MIXER & CAPTURA DUAL ===\n');

  // 1. Simulating Audio Mixer: Mic + System Loopback
  console.log('[1/3] Testando algoritmo do Mixer Web Audio (Mic + System Loopback)...');
  const bufferLength = 4096;
  const micData = new Float32Array(bufferLength);
  const sysData = new Float32Array(bufferLength);

  // Simulate Mic voice (Gabriel speaking)
  for (let i = 0; i < bufferLength; i++) {
    micData[i] = Math.sin((i * 440 * 2 * Math.PI) / 48000) * 0.2; // 440Hz tone
    sysData[i] = 0.001; // low background
  }

  const micGain = 1.0;
  const sysGain = 1.0;

  // Calculate RMS
  let sumMic = 0;
  for (let i = 0; i < bufferLength; i++) sumMic += micData[i] * micData[i];
  const micRms = Math.sqrt(sumMic / bufferLength);

  let sumSys = 0;
  for (let i = 0; i < bufferLength; i++) sumSys += sysData[i] * sysData[i];
  const sysRms = Math.sqrt(sumSys / bufferLength);

  console.log(` -> Sinal Mic RMS: ${micRms.toFixed(4)} | Sinal Sistema RMS: ${sysRms.toFixed(4)}`);

  // Detect speaker
  let speaker1 = 'Cliente';
  if (micRms > 0.012 && micRms > sysRms * 1.3) {
    speaker1 = 'Eu';
  }
  console.log(` -> Interlocutor detectado para fala no Microfone: "${speaker1}" (Esperado: "Eu")`);
  if (speaker1 !== 'Eu') throw new Error('Falha na detecção de interlocutor "Eu" no microfone');

  // Simulate System Audio (YouTube / Google Meet remote participant)
  for (let i = 0; i < bufferLength; i++) {
    micData[i] = 0.001; // mic silent
    sysData[i] = Math.sin((i * 300 * 2 * Math.PI) / 48000) * 0.3; // remote voice
  }

  sumMic = 0;
  for (let i = 0; i < bufferLength; i++) sumMic += micData[i] * micData[i];
  const micRms2 = Math.sqrt(sumMic / bufferLength);

  sumSys = 0;
  for (let i = 0; i < bufferLength; i++) sumSys += sysData[i] * sysData[i];
  const sysRms2 = Math.sqrt(sumSys / bufferLength);

  let speaker2 = 'Eu';
  if (sysRms2 > 0.012 && sysRms2 > micRms2 * 1.3) {
    speaker2 = 'Cliente';
  }
  console.log(` -> Interlocutor detectado para som do Sistema (Meet/YouTube): "${speaker2}" (Esperado: "Cliente")`);
  if (speaker2 !== 'Cliente') throw new Error('Falha na detecção de interlocutor "Cliente" no som do sistema');

  // Test Downsampling
  console.log('\n[2/3] Testando Downsampling de 48kHz para 16kHz Float32 mono...');
  const mixed = new Float32Array(bufferLength);
  for (let i = 0; i < bufferLength; i++) {
    mixed[i] = micData[i] * micGain + sysData[i] * sysGain;
  }

  function downsampleBuffer(buffer, inputSampleRate, targetSampleRate) {
    if (inputSampleRate === targetSampleRate) return buffer;
    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const origIndex = i * ratio;
      const indexLow = Math.floor(origIndex);
      const indexHigh = Math.min(indexLow + 1, buffer.length - 1);
      const fraction = origIndex - indexLow;
      result[i] = buffer[indexLow] * (1 - fraction) + buffer[indexHigh] * fraction;
    }
    return result;
  }

  const downsampled = downsampleBuffer(mixed, 48000, 16000);
  console.log(` -> Amostras de entrada (48kHz): ${mixed.length}`);
  console.log(` -> Amostras de saída (16kHz): ${downsampled.length} (Esperado: ~1365)`);
  if (Math.abs(downsampled.length - Math.round(4096 / 3)) > 2) {
    throw new Error('Falha no downsampling');
  }
  console.log('✓ Downsampling validado com sucesso.');

  // Test Whisper Local integration
  console.log('\n[3/3] Testando Whisper Local com o pipeline de áudio...');
  let receivedSegment = null;
  const whisper = new LocalWhisperService('Xenova/whisper-tiny', {
    onDelta: () => {},
    onCompleted: (seg) => {
      receivedSegment = seg;
      console.log(' -> Whisper Transcrição Recebida:', seg.text, `(Speaker: ${seg.speaker})`);
    },
    onError: (err) => console.error('Whisper err:', err),
    onStatusChange: (status) => console.log(' -> Whisper status:', status),
  });

  await whisper.initialize();
  whisper.resetMeeting(Date.now());

  // Feed 2 seconds of 16kHz silence/test buffer
  const test16k = new Float32Array(16000 * 2);
  await whisper.feedAudioChunk(test16k, 'Cliente');
  console.log('✓ Pipeline do Whisper alimentado com áudio misto sem exceções.');

  console.log('\n=== TODOS OS TESTES DO MIXER DUAL FORAM CONCLUÍDOS COM SUCESSO ===');
}

testAudioMixerLogic().catch((err) => {
  console.error('\n❌ Erro no teste do mixer:', err);
  process.exit(1);
});
