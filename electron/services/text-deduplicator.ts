import { AudioPipelineConfig } from './audio-config';

export class TextDeduplicator {
  /**
   * Normaliza texto para comparação (minúsculas, remove pontuação redundante).
   */
  public static normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^\wÀ-ÿ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verifica se o segmento atual é uma duplicação quase perfeita de um segmento recente.
   */
  public static isDuplicateOfRecent(newText: string, recentTexts: string[]): boolean {
    const normNew = this.normalize(newText);
    if (!normNew || normNew.length < 3) return true;

    for (const old of recentTexts) {
      const normOld = this.normalize(old);
      if (!normOld) continue;

      // Correspondência exata
      if (normNew === normOld) return true;

      // Similaridade para frases longas
      if (normNew.length >= 15 && normOld.length >= 15) {
        const similarity = this.calculateSimilarity(normNew, normOld);
        if (similarity >= AudioPipelineConfig.DEDUP_SIMILARITY_THRESHOLD) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Remove a sobreposição entre o final do texto anterior e o início do novo texto.
   * Exemplo:
   *  prev: "nós precisamos integrar isso com o calendário"
   *  curr: "com o calendário e depois verificar os usuários"
   *  retorno: "e depois verificar os usuários"
   */
  public static removeOverlap(prevText: string, currText: string): { text: string; overlapWords: number } {
    if (!prevText || !currText) return { text: currText, overlapWords: 0 };

    const normPrev = this.normalize(prevText);
    const normCurr = this.normalize(currText);

    const prevWords = normPrev.split(' ').filter(Boolean);
    const currWords = normCurr.split(' ').filter(Boolean);

    if (prevWords.length === 0 || currWords.length === 0) {
      return { text: currText, overlapWords: 0 };
    }

    // Procura a maior sobreposição de palavras (do maior tamanho para o menor)
    const maxCheck = Math.min(prevWords.length, currWords.length, 12);
    let bestOverlap = 0;

    for (let k = maxCheck; k >= 1; k--) {
      const prevSuffix = prevWords.slice(prevWords.length - k).join(' ');
      const currPrefix = currWords.slice(0, k).join(' ');

      if (prevSuffix === currPrefix) {
        // Exige pelo menos 2 palavras ou 1 palavra longa (>= 7 chars) para evitar falsos positivos
        if (k >= 2 || (k === 1 && prevSuffix.length >= 7)) {
          bestOverlap = k;
          break;
        }
      }
    }

    if (bestOverlap === 0) {
      return { text: currText, overlapWords: 0 };
    }

    // Se toda a nova fala era apenas a sobreposição, retorna string vazia
    if (bestOverlap >= currWords.length) {
      return { text: '', overlapWords: bestOverlap };
    }

    // Reconstruir o texto original sem as primeiras `bestOverlap` palavras
    // Localiza a posição no texto original correspondente ao fim do prefixo sobreposto
    const originalTokens = currText.trim().split(/\s+/);
    if (bestOverlap < originalTokens.length) {
      const remaining = originalTokens.slice(bestOverlap).join(' ');
      return { text: remaining, overlapWords: bestOverlap };
    }

    return { text: '', overlapWords: bestOverlap };
  }

  /**
   * Calcula similaridade de Jaccard / Levenshtein aproximada entre duas strings normalizadas.
   */
  public static calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    if (union === 0) return 1.0;

    const jaccard = intersection / union;

    // Também combina com comprimento relativo para penalizar tamanhos muito divergentes
    const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return jaccard * 0.7 + lenRatio * 0.3;
  }
}
