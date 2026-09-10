import { AudioPipelineConfig } from './audio-config';

export interface ValidationResult {
  isValid: boolean;
  isSuspicious: boolean;
  reason?: string;
  sanitizedText: string;
  metrics: {
    wordCount: number;
    uniqueWordCount: number;
    lexicalDiversity: number;
    wordsPerSecond: number;
    charsPerSecond: number;
    repeatedNgrams?: string[];
  };
}

export class HallucinationGuard {
  // Bordões clássicos de silêncio e preenchimento automático do Whisper
  private static readonly KNOWN_SILENCE_HALLUCINATIONS: RegExp[] = [
    /^(?:é isso|e isso|é isso aí|e isso ai)[\.\!\?\, ]*$/i,
    /^(?:eu não sei|eu nao sei|não sei|nao sei)[\.\!\?\, ]*$/i,
    /^(?:obrigad[oa]|muito obrigad[oa]|valeu) por assistir(?: ao vídeo)?[\.\!\?\, ]*$/i,
    /^(?:tchau|tchau tchau|até a próxima|ate a proxima)[\.\!\?\, ]*$/i,
    /^(?:inscreva-se|deixe seu like|curta e compartilhe)[\.\!\?\, ]*$/i,
    /^(?:legendas?(?: pela comunidade)?|subtitles? by|transcrição por)[\.\!\?\, ]*$/i,
    /^(?:amém|amen|aleluia)[\.\!\?\, ]*$/i,
  ];

  /**
   * Executa a bateria de sanity checks no texto gerado pelo STT.
   * @param rawText Texto retornado pelo Whisper
   * @param durationSeconds Duração em segundos do chunk de áudio
   * @param speechRatio Proporção estimada de fala ativa no chunk (0.0 a 1.0)
   */
  public static validate(
    rawText: string,
    durationSeconds: number,
    speechRatio: number = 1.0
  ): ValidationResult {
    const text = (rawText || '').trim();

    // 1. Verificações básicas de tamanho mínimo
    if (!text || text.length < 2) {
      return {
        isValid: false,
        isSuspicious: true,
        reason: 'Texto vazio ou com menos de 2 caracteres',
        sanitizedText: '',
        metrics: this.computeMetrics(text, durationSeconds),
      };
    }

    // 2. Metadados e marcadores entre colchetes/parênteses (ex: [Música], (risos))
    if (/^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) {
      return {
        isValid: false,
        isSuspicious: true,
        reason: 'Marcador de som de fundo ou metadado do modelo (ex: [Música])',
        sanitizedText: '',
        metrics: this.computeMetrics(text, durationSeconds),
      };
    }

    const metrics = this.computeMetrics(text, durationSeconds);

    // 3. Bordões conhecidos de alucinação de silêncio
    for (const pattern of this.KNOWN_SILENCE_HALLUCINATIONS) {
      if (pattern.test(text)) {
        return {
          isValid: false,
          isSuspicious: true,
          reason: `Bordão típico de alucinação de silêncio: "${text}"`,
          sanitizedText: '',
          metrics,
        };
      }
    }

    // 4. Sanity Check de Taxa de Fala (wordsPerSecond e charsPerSecond)
    if (durationSeconds > 0.5) {
      if (metrics.wordsPerSecond > AudioPipelineConfig.MAX_WORDS_PER_SECOND) {
        return {
          isValid: false,
          isSuspicious: true,
          reason: `Taxa absurda de palavras por segundo (${metrics.wordsPerSecond.toFixed(1)} wps > ${AudioPipelineConfig.MAX_WORDS_PER_SECOND}) para chunk de ${durationSeconds.toFixed(1)}s`,
          sanitizedText: '',
          metrics,
        };
      }

      if (metrics.charsPerSecond > AudioPipelineConfig.MAX_CHARS_PER_SECOND) {
        return {
          isValid: false,
          isSuspicious: true,
          reason: `Taxa absurda de caracteres por segundo (${metrics.charsPerSecond.toFixed(1)} cps > ${AudioPipelineConfig.MAX_CHARS_PER_SECOND}) para chunk de ${durationSeconds.toFixed(1)}s`,
          sanitizedText: '',
          metrics,
        };
      }
    }

    // 5. Verificação de Repetição de N-Grams Consecutivos (1-gram até 6-gram)
    const repeatedNgram = this.findConsecutiveNgramRepeats(text, AudioPipelineConfig.MAX_CONSECUTIVE_NGRAM_REPEATS);
    if (repeatedNgram) {
      metrics.repeatedNgrams = [repeatedNgram];
      return {
        isValid: false,
        isSuspicious: true,
        reason: `Repetição cíclica detectada da sequência: "${repeatedNgram}"`,
        sanitizedText: '',
        metrics,
      };
    }

    // 6. Verificação de Diversidade Lexical (Type-Token Ratio)
    if (metrics.wordCount >= 8 && metrics.lexicalDiversity < AudioPipelineConfig.MIN_LEXICAL_DIVERSITY) {
      return {
        isValid: false,
        isSuspicious: true,
        reason: `Baixíssima diversidade lexical (${(metrics.lexicalDiversity * 100).toFixed(1)}% < ${(AudioPipelineConfig.MIN_LEXICAL_DIVERSITY * 100).toFixed(1)}%) para ${metrics.wordCount} palavras`,
        sanitizedText: '',
        metrics,
      };
    }

    // 7. Verificação de Dominância de Frase Única (ex: "é isso" ocupando > 50% das palavras do texto)
    if (this.hasDominantPhraseRepetition(text)) {
      return {
        isValid: false,
        isSuspicious: true,
        reason: 'Frase repetida domina a maior parte do segmento textual',
        sanitizedText: '',
        metrics,
      };
    }

    // Se passou em todos os filtros, o texto é legítimo
    return {
      isValid: true,
      isSuspicious: false,
      sanitizedText: text,
      metrics,
    };
  }

  /**
   * Calcula métricas estruturadas de palavras, diversidade e velocidade.
   */
  public static computeMetrics(text: string, durationSeconds: number) {
    const normalized = text.toLowerCase().replace(/[^\wÀ-ÿ\s]/g, ' ').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const uniqueWordCount = new Set(words).size;
    const lexicalDiversity = wordCount > 0 ? uniqueWordCount / wordCount : 1.0;

    const safeDuration = Math.max(0.1, durationSeconds);
    const wordsPerSecond = Math.round((wordCount / safeDuration) * 10) / 10;
    const charsPerSecond = Math.round((text.length / safeDuration) * 10) / 10;

    return {
      wordCount,
      uniqueWordCount,
      lexicalDiversity: Math.round(lexicalDiversity * 1000) / 1000,
      wordsPerSecond,
      charsPerSecond,
      repeatedNgrams: [] as string[],
    };
  }

  /**
   * Detecta se alguma sequência de 1 a 6 palavras se repete de forma contígua N ou mais vezes.
   * Cobre casos como:
   * "É isso. É isso. É isso."
   * "eu não sei eu não sei eu não sei"
   * "nós precisamos testar nós precisamos testar nós precisamos testar"
   */
  public static findConsecutiveNgramRepeats(text: string, maxRepeats: number): string | null {
    const normalized = text.toLowerCase().replace(/[^\wÀ-ÿ\s]/g, ' ').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const total = words.length;

    if (total < 3) return null;

    // Testa tamanhos de janela de 1 até min(6, total / 3)
    const maxWindow = Math.min(6, Math.floor(total / maxRepeats));

    for (let window = 1; window <= maxWindow; window++) {
      for (let start = 0; start <= total - window * maxRepeats; start++) {
        const pattern = words.slice(start, start + window).join(' ');
        let repeats = 1;
        let pos = start + window;

        while (pos + window <= total) {
          const nextSeq = words.slice(pos, pos + window).join(' ');
          if (nextSeq === pattern) {
            repeats++;
            pos += window;
            if (repeats >= maxRepeats) {
              return pattern;
            }
          } else {
            break;
          }
        }
      }
    }

    return null;
  }

  /**
   * Detecta se uma mesma frase ou expressão curta compõe mais de 55% de um texto de 6+ palavras.
   */
  private static hasDominantPhraseRepetition(text: string): boolean {
    const normalized = text.toLowerCase().replace(/[^\wÀ-ÿ\s]/g, ' ').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 6) return false;

    // Frequência de 2-grams e 3-grams
    for (const n of [2, 3]) {
      const counts = new Map<string, number>();
      for (let i = 0; i <= words.length - n; i++) {
        const gram = words.slice(i, i + n).join(' ');
        counts.set(gram, (counts.get(gram) || 0) + 1);
      }

      for (const [gram, count] of counts.entries()) {
        const wordsInGram = count * n;
        if (count >= 3 && wordsInGram / words.length > 0.55) {
          return true;
        }
      }
    }

    return false;
  }
}
