import { MeetingState, StructuredItem } from '../../src/types/meeting';

export interface CommercialAlert {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export class RuleEngine {
  // Monitored checklist of commercial discovery questions
  private static readonly CHECKLIST = [
    { key: 'users_count', q: 'Quantas pessoas utilizarão o sistema?', regex: /(quantos?\s+usu[áa]rios?|quantas?\s+pessoas|equipe\s+de\s+\d+|\d+\s+usu[áa]rios?|\d+\s+pessoas|somos\s+\d+)/i },
    { key: 'concurrent_users', q: 'Quantos usuários simultâneos?', regex: /(simult[âa]neos?|ao\s+mesmo\s+tempo|concomitantes?)/i },
    { key: 'branches', q: 'Quantas filiais?', regex: /(quantas?\s+filiais|unidades|matriz\s+e\s+filial|\d+\s+filiais|\d+\s+unidades|outra\s+cidade)/i },
    { key: 'whatsapp_numbers', q: 'Quantos números de WhatsApp?', regex: /(\d+\s+n[úu]meros?\s+de\s+whats?app|\d+\s+chips?|\d+\s+linhas?|m[úu]ltiplos?\s+n[úu]meros?)/i },
    { key: 'whatsapp_agents', q: 'Atendentes trabalham em múltiplos números?', regex: /(atendentes?|distribui[çc][ãa]o|atendimento\s+compartilhado)/i },
    { key: 'permissions', q: 'Existem departamentos e níveis de permissões?', regex: /(departamentos?|gestores?|n[íi]veis?\s+de\s+acesso|permiss[õo]es?|sigilo)/i },
    { key: 'migration', q: 'Precisam importar dados do sistema atual?', regex: /(migra[çc][ãa]o|importa[çc][ãa]o|sistema\s+antigo|banco\s+de\s+dados|planilhas?|hist[óo]rico)/i },
    { key: 'calendar', q: 'Google Calendar ou Microsoft Calendar?', regex: /(google\s+calendar|agenda|calend[áa]rio|outlook\s+calendar)/i },
    { key: 'email_integration', q: 'Integração de e-mail é apenas envio ou leitura?', regex: /(e-?mail|gmail|outlook|caixa\s+de\s+entrada|disparar\s+e-?mail)/i },
    { key: 'legal_inpi', q: 'Existe necessidade de integração com INPI ou jurídico?', regex: /(inpi|marcas?\s+e\s+patentes?|processos?\s+no\s+inpi|jur[íi]dico|publica[çc][ãa]o)/i },
    { key: 'documents', q: 'Precisam armazenar ou gerar procurações/documentos?', regex: /(documentos?|procura[çc][õo]es?|contratos?|pdf|modelos?)/i },
    { key: 'reports', q: 'Quais relatórios e dashboards a diretoria espera?', regex: /(relat[óo]rios?|dashboards?|m[ée]tricas?|gr[áa]ficos?|kpi)/i },
    { key: 'infrastructure', q: 'Quem será responsável pela infraestrutura e backups?', regex: /(infraestrutura|servidor|nuvem|cloud|backup|hospedagem|local)/i },
    { key: 'training_support', q: 'Precisam de treinamento para a equipe e qual o SLA?', regex: /(treinamento|capacita[çc][ãa]o|suporte|sla|tempo\s+de\s+resposta)/i },
    { key: 'deadline', q: 'Qual o prazo ou data desejada de início?', regex: /(prazo|quando\s+come[çc]a|data|cronograma|urg[êe]ncia)/i },
    { key: 'license_meaning', q: 'O que entendem por "comprar o sistema"? (Licença vs Código)', regex: /(comprar\s+o\s+sistema|sistema\s+ser\s+nosso|adquirir|ter\s+a\s+propriedade)/i },
    { key: 'source_code', q: 'Desejam acesso ao código-fonte ou cessão de propriedade?', regex: /(c[óo]digo-?fonte|acesso\s+ao\s+c[óo]digo|direitos|propriedade\s+intelectual)/i },
    { key: 'recurring_fee', q: 'Preferem modelo de mensalidade ou licença perpétua + manutenção?', regex: /(mensalidade|sem\s+mensalidade|pagamento\s+[úu]nico|licen[çc]a\s+perp[ée]tua)/i },
  ];

  public static analyzeText(
    newText: string,
    currentState: MeetingState,
    elapsedSeconds: number
  ): { newState: MeetingState; alerts: CommercialAlert[] } {
    const alerts: CommercialAlert[] = [];
    const lower = newText.toLowerCase();
    const formattedTimestamp = this.formatSeconds(elapsedSeconds);

    // Deep copy current state
    const state: MeetingState = {
      requirements: [...currentState.requirements],
      objections: [...currentState.objections],
      decisions: [...currentState.decisions],
      pendingQuestions: [...currentState.pendingQuestions],
      risks: [...currentState.risks],
      opportunities: [...currentState.opportunities],
      commitments: [...currentState.commitments],
      pricingSignals: [...currentState.pricingSignals],
      technicalRequirements: [...currentState.technicalRequirements],
      integrations: [...currentState.integrations],
      nextBestAction: currentState.nextBestAction || '',
      summarySoFar: currentState.summarySoFar || '',
    };

    // 1. Critical Commercial Triggers Detection
    if (/(comprar\s+o\s+sistema|o\s+sistema\s+ser\s+nosso|adquirir\s+o\s+software)/i.test(lower)) {
      alerts.push({
        title: 'PONTO COMERCIAL CRÍTICO: "Comprar o Sistema"',
        message: 'O cliente mencionou intenção de comprar o sistema. Esclareça imediatamente: "Vocês estão pensando em uma licença de uso perpétua ou na aquisição dos direitos e código-fonte?"',
        severity: 'critical',
      });
      this.addOrUpdateItem(state.objections, {
        text: 'Cliente expressou intenção de comprar o sistema / eliminar recorrência.',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'open',
        suggestedResponse: 'Esclarecer diferença entre licença de uso perpétua e compra do código/tecnologia core.',
        continuityQuestion: 'Quando vocês dizem comprar o sistema, vocês pensam em uma licença perpétua para uso interno ou na titularidade do código e tecnologia?',
      });
      state.nextBestAction = 'Pergunte se o cliente busca licença de uso perpétua ou compra do código-fonte.';
    }

    if (/(c[óo]digo-?fonte|propriedade\s+intelectual|direitos\s+autorais|exclusividade)/i.test(lower)) {
      alerts.push({
        title: 'ALERTA: Código-fonte / Propriedade Intelectual',
        message: 'A Noryn deve preservar o core tecnológico. CRM, WhatsApp e arquitetura não devem ser transferidos sem negociação de alto valor.',
        severity: 'critical',
      });
      this.addOrUpdateItem(state.risks, {
        text: 'Risco de expectativa de transferência de propriedade intelectual ou código-fonte.',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'open',
      });
    }

    if (/(sem\s+mensalidade|n[ãa]o\s+gostamos\s+de\s+mensalidade|n[ãa]o\s+queremos\s+pagar\s+mensal)/i.test(lower)) {
      this.addOrUpdateItem(state.objections, {
        text: 'Cliente rejeita modelo SaaS com mensalidade contínua pura.',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'open',
        suggestedResponse: 'Propor licença perpétua ou taxa de implantação mais contrato dedicado de manutenção e evolução.',
        continuityQuestion: 'A preocupação de vocês é com a recorrência de custo ou com a dependência da nossa infraestrutura de servidores?',
      });
      state.nextBestAction = 'Pergunte se a objeção à mensalidade é pelo custo fixo ou pela dependência do servidor.';
    }

    // 2. Requirements & Discovery extraction
    // WhatsApp numbers
    const waMatch = lower.match(/(\d+)\s*(n[úu]meros?|chips?|linhas?)\s*(de\s*whats?app)?/i);
    if (waMatch) {
      const count = waMatch[1];
      this.addOrUpdateItem(state.requirements, {
        text: `${count} números de WhatsApp conectados`,
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'confirmed',
        sourceExcerpt: waMatch[0],
      });
    }

    // Attendants / Users
    const userMatch = lower.match(/(\d+)\s*(usu[áa]rios?|pessoas?|atendentes?|colaboradores?)/i);
    if (userMatch) {
      const count = userMatch[1];
      this.addOrUpdateItem(state.requirements, {
        text: `Equipe estimada de ${count} usuários/atendentes`,
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'confirmed',
        sourceExcerpt: userMatch[0],
      });
    }

    // Branches / Filiais
    const branchMatch = lower.match(/(\d+)\s*(filiais|unidades|escrit[óo]rios?)/i);
    if (branchMatch) {
      const count = branchMatch[1];
      this.addOrUpdateItem(state.requirements, {
        text: `Estrutura com ${count} filiais/unidades`,
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'confirmed',
        sourceExcerpt: branchMatch[0],
      });
    } else if (/(matriz\s+e\s+filial|duas\s+filiais|mais\s+de\s+uma\s+filial)/i.test(lower)) {
      this.addOrUpdateItem(state.requirements, {
        text: 'Estrutura multi-filial com controle centralizado',
        confidence: 'medium',
        timestamp: formattedTimestamp,
        status: 'confirmed',
      });
    }

    // Google Calendar
    if (/(google\s+calendar|agenda\s+do\s+google)/i.test(lower)) {
      this.addOrUpdateItem(state.integrations, {
        text: 'Google Calendar (Sincronização de agendas)',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'confirmed',
      });
      this.addOrUpdateItem(state.decisions, {
        text: 'Integração com Google Calendar será necessária.',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'confirmed',
      });
    }

    // INPI / Jurídico
    if (/(inpi|marcas?\s+e\s+patentes?|revista\s+da\s+propriedade\s+industrial)/i.test(lower)) {
      this.addOrUpdateItem(state.technicalRequirements, {
        text: 'Acompanhamento de processos de marcas e patentes no INPI',
        confidence: 'medium',
        timestamp: formattedTimestamp,
        status: 'open',
      });
      this.addOrUpdateItem(state.opportunities, {
        text: 'Customização de módulo especializado para acompanhamento de despachos INPI.',
        confidence: 'medium',
        timestamp: formattedTimestamp,
        status: 'open',
      });
    }

    // E-mail scope
    if (/(e-?mail|outlook|gmail)/i.test(lower)) {
      this.addOrUpdateItem(state.risks, {
        text: 'Escopo da integração de e-mail (apenas envio vs caixa completa de entrada) ainda indefinido.',
        confidence: 'medium',
        timestamp: formattedTimestamp,
        status: 'open',
      });
    }

    // Decisions: No automated AI customer service
    if (/(n[ãa]o\s+queremos\s+ia\s+atendendo|sem\s+rob[ôo]|atendimento\s+humano)/i.test(lower)) {
      this.addOrUpdateItem(state.decisions, {
        text: 'Não haverá IA atendendo clientes finais diretamente no WhatsApp (foco em atendimento humano).',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'confirmed',
      });
    }

    // Data migration
    if (/(migra[çc][ãa]o|importar\s+dados|sistema\s+atual|planilha)/i.test(lower)) {
      this.addOrUpdateItem(state.opportunities, {
        text: 'Serviço de migração de dados históricos e higienização de base.',
        confidence: 'high',
        timestamp: formattedTimestamp,
        status: 'open',
      });
      this.addOrUpdateItem(state.pricingSignals, {
        text: 'Volume de registros a migrar impacta o valor de setup.',
        confidence: 'medium',
        timestamp: formattedTimestamp,
        status: 'open',
      });
    }

    // 3. Compute Pending Questions based on unanswered checklist items
    const answeredKeys = new Set<string>();
    for (const item of [...state.requirements, ...state.integrations, ...state.decisions, ...state.objections]) {
      const itText = item.text.toLowerCase();
      if (/usu[áa]rio|atendente|equipe/i.test(itText)) answeredKeys.add('users_count');
      if (/whats?app/i.test(itText)) answeredKeys.add('whatsapp_numbers');
      if (/filial|unidade/i.test(itText)) answeredKeys.add('branches');
      if (/calendar|agenda/i.test(itText)) answeredKeys.add('calendar');
      if (/migra[çc][ãa]o/i.test(itText)) answeredKeys.add('migration');
      if (/inpi/i.test(itText)) answeredKeys.add('legal_inpi');
      if (/mensalidade|perp[ée]tua/i.test(itText)) answeredKeys.add('recurring_fee');
    }

    const pendingItems: StructuredItem[] = [];
    for (const ch of this.CHECKLIST) {
      if (!answeredKeys.has(ch.key)) {
        pendingItems.push({
          text: ch.q,
          confidence: 'high',
          timestamp: formattedTimestamp,
          status: 'open',
          category: ch.key,
        });
      }
    }
    state.pendingQuestions = pendingItems.slice(0, 7); // Show top 7 most relevant unanswered questions

    // 4. Compute Next Best Action if not already set by critical trigger
    if (!state.nextBestAction || state.nextBestAction.length === 0) {
      const firstPending = state.pendingQuestions[0];
      if (firstPending) {
        state.nextBestAction = `Pergunte: "${firstPending.text}"`;
      } else {
        state.nextBestAction = 'Verifique se há dúvidas pendentes sobre o cronograma de implantação.';
      }
    }

    return { newState: state, alerts };
  }

  private static addOrUpdateItem(list: StructuredItem[], item: StructuredItem) {
    const existingIndex = list.findIndex(
      (x) => x.text.toLowerCase().trim() === item.text.toLowerCase().trim()
    );
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...item };
    } else {
      list.unshift(item);
    }
  }

  private static formatSeconds(sec: number): string {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
