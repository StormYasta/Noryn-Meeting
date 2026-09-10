/**
 * Configurações e limiares centralizados para o pipeline de áudio, VAD, STT e validação.
 * Evita valores mágicos espalhados e permite ajuste fino por ambiente.
 */
export const AudioPipelineConfig = {
  // Parâmetros de amostragem
  SAMPLE_RATE: 16000,
  INPUT_SAMPLE_RATE: 48000,
  CHANNELS: 1, // Mono para STT

  // VAD e Detecção de Voz
  // RMS mínimo para um frame (85ms-200ms) ser considerado voz ativa
  VAD_ENERGY_THRESHOLD: 0.012,
  // Limiar adaptativo mínimo para proporção de voz no buffer (pelo menos 15% deve ter energia de voz)
  VAD_MIN_SPEECH_RATIO: 0.15,
  // Energia mínima absoluta (RMS geral do chunk) para evitar ruído branco/estático puro
  MIN_CHUNK_RMS: 0.004,

  // Chunking e Segmentação
  // Duração mínima do chunk antes de fechar por silêncio
  CHUNK_MIN_DURATION_S: 3.0,
  // Duração máxima permitida antes de forçar o corte do chunk
  CHUNK_MAX_DURATION_S: 18.0,
  // Duração de silêncio contínuo após fala para considerar fim de turno
  CHUNK_END_OF_TURN_SILENCE_S: 0.85,
  // Overlap suave ao cortar chunk longo (apenas quando estoura MAX_DURATION)
  CHUNK_MAX_SPLIT_OVERLAP_S: 0.8,

  // Hiperparâmetros do modelo STT (Whisper)
  STT_LANGUAGE: 'portuguese',
  STT_TASK: 'transcribe',
  STT_TEMPERATURE: 0.0,
  STT_REPETITION_PENALTY: 1.25,
  STT_NO_REPEAT_NGRAM_SIZE: 3,

  // Sanity Checks de Áudio x Texto (Hallucination Guard)
  // Taxa máxima de palavras por segundo (fala humana raramente passa de 5.5 wps em reuniões normais)
  MAX_WORDS_PER_SECOND: 7.0,
  // Taxa máxima de caracteres por segundo
  MAX_CHARS_PER_SECOND: 38.0,
  // Mínimo de diversidade lexical (palavras únicas / total) para frases com 8+ palavras
  MIN_LEXICAL_DIVERSITY: 0.35,
  // Máximo de repetições permitidas para qualquer n-gram (1 a 6 palavras)
  MAX_CONSECUTIVE_NGRAM_REPEATS: 3,

  // Deduplicação Textual
  // Similaridade de sequência para considerar chunk consecutivo duplicado
  DEDUP_SIMILARITY_THRESHOLD: 0.88,
  // Mínimo de caracteres para sobreposição de prefixo/sufixo
  DEDUP_MIN_OVERLAP_CHARS: 8,

  // Diagnóstico e Debug
  // Salvar WAVs recebidos pelo STT se true ou DEBUG_AUDIO_CHUNKS=1
  DEBUG_AUDIO_DUMP: process.env.DEBUG_AUDIO_CHUNKS === '1' || process.env.NODE_ENV === 'development',
  DEBUG_AUDIO_MAX_FILES: 100,
};
