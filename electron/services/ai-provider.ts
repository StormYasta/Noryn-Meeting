import http from 'http';
import {
  MeetingState,
  CopilotManualResponse,
  FinalReportData,
  MeetingMetadata,
  TranscriptSegment,
  StructuredItem,
} from '../../src/types/meeting';
import { RuleEngine } from './rule-engine';

export interface AnalystInput {
  meetingTitle: string;
  contextText: string;
  summarySoFar: string;
  currentState: MeetingState;
  recentTranscript: TranscriptSegment[];
  allTranscript: TranscriptSegment[];
  elapsedSeconds: number;
}

export interface AIProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getAvailableModels(): Promise<string[]>;
  analyzeIncremental(input: AnalystInput): Promise<MeetingState>;
  askCopilot(query: string, input: AnalystInput): Promise<CopilotManualResponse>;
  helpWithObjection(input: AnalystInput): Promise<CopilotManualResponse>;
  whatShouldIAskNow(input: AnalystInput): Promise<CopilotManualResponse>;
  generateFinalReport(input: AnalystInput, metadata: MeetingMetadata): Promise<FinalReportData>;
}

// -------------------------------------------------------------
// 1. Ollama Provider (Local LLM via HTTP JSON API)
// -------------------------------------------------------------
export class OllamaProvider implements AIProvider {
  public name = 'Ollama (Local LLM)';
  private baseUrl: string;
  public model: string;

  constructor(baseUrl = 'http://127.0.0.1:11434', model = 'qwen2.5:1.5b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const url = new URL('/api/tags', this.baseUrl);
      const res = await this.httpRequest(url.toString(), 'GET');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  public async getAvailableModels(): Promise<string[]> {
    try {
      const url = new URL('/api/tags', this.baseUrl);
      const res = await this.httpRequest(url.toString(), 'GET');
      if (res.status === 200) {
        const data = JSON.parse(res.body);
        if (data.models && Array.isArray(data.models)) {
          return data.models.map((m: { name: string }) => m.name);
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  public async analyzeIncremental(input: AnalystInput): Promise<MeetingState> {
    const recentText = input.recentTranscript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
    const prompt = `
Você é o copiloto comercial privado de uma reunião da Noryn CRM com um escritório de marcas e patentes.
Analise as falas recentes e atualize o estado da reunião. Seja estrito, nunca invente dados.
Se o cliente falou em "comprar o sistema", "código-fonte" ou "sem mensalidade", registre como alerta crítico e objeção.

ESTADO ATUAL:
${JSON.stringify(input.currentState, null, 2)}

TRANSCRIÇÃO DOS ÚLTIMOS MINUTOS:
${recentText}

Retorne estritamente um JSON no formato:
{
  "requirements": [{"text": "...", "confidence": "high|medium|low", "timestamp": "...", "status": "open|confirmed|resolved"}],
  "objections": [{"text": "...", "confidence": "...", "suggestedResponse": "...", "continuityQuestion": "..."}],
  "decisions": [{"text": "..."}],
  "risks": [{"text": "..."}],
  "opportunities": [{"text": "..."}],
  "nextBestAction": "Frase curta com a próxima pergunta essencial",
  "summarySoFar": "Resumo acumulado em 2 parágrafos"
}
`;

    try {
      const response = await this.generateOllama(prompt, true);
      const parsed = JSON.parse(response);
      return {
        ...input.currentState,
        requirements: parsed.requirements || input.currentState.requirements,
        objections: parsed.objections || input.currentState.objections,
        decisions: parsed.decisions || input.currentState.decisions,
        risks: parsed.risks || input.currentState.risks,
        opportunities: parsed.opportunities || input.currentState.opportunities,
        nextBestAction: parsed.nextBestAction || input.currentState.nextBestAction,
        summarySoFar: parsed.summarySoFar || input.currentState.summarySoFar,
      };
    } catch (e) {
      console.warn('Ollama analyze error, falling back to rule engine:', e);
      return RuleBasedProvider.analyzeIncremental(input);
    }
  }

  public async askCopilot(query: string, input: AnalystInput): Promise<CopilotManualResponse> {
    const recentText = input.recentTranscript.slice(-8).map((t) => `${t.speaker}: ${t.text}`).join('\n');
    const prompt = `
Você é o copiloto comercial da Noryn em uma reunião com um escritório de marcas e patentes.
O vendedor fez a seguinte consulta interna e privada:
"${query}"

ESTADO ATUAL DA REUNIÃO:
Requisitos: ${JSON.stringify(input.currentState.requirements)}
Objeções: ${JSON.stringify(input.currentState.objections)}
Decisões: ${JSON.stringify(input.currentState.decisions)}
Riscos: ${JSON.stringify(input.currentState.risks)}

FALAS RECENTES:
${recentText}

Responda de forma direta, executiva, comercial e sem enrolação em no máximo 3 frases curtas.
`;
    try {
      const answer = await this.generateOllama(prompt, false);
      return {
        type: 'general',
        question: query,
        answer: answer.trim(),
        timestamp: new Date().toLocaleTimeString(),
      };
    } catch {
      return RuleBasedProvider.askCopilot(query, input);
    }
  }

  public async helpWithObjection(input: AnalystInput): Promise<CopilotManualResponse> {
    const recentText = input.recentTranscript.slice(-6).map((t) => `${t.speaker}: ${t.text}`).join('\n');
    const prompt = `
O vendedor precisa de ajuda imediata com a última objeção levantada pelo cliente no trecho recente:
${recentText}

Contexto da Noryn: Não vendemos o core do CRM nem código sem preço altíssimo; preferimos licença ou SaaS com sustentação.
Retorne um JSON:
{
  "objectionIdentified": "Descrição curta da objeção",
  "interpretation": "O que o cliente realmente quer dizer",
  "suggestedResponse": "O que o vendedor deve responder agora",
  "continuityQuestion": "Pergunta para retomar o controle comercial"
}
`;
    try {
      const raw = await this.generateOllama(prompt, true);
      const parsed = JSON.parse(raw);
      return {
        type: 'objection',
        question: 'Me ajude com essa objeção',
        answer: parsed.suggestedResponse,
        objectionIdentified: parsed.objectionIdentified,
        interpretation: parsed.interpretation,
        suggestedResponse: parsed.suggestedResponse,
        continuityQuestion: parsed.continuityQuestion,
        timestamp: new Date().toLocaleTimeString(),
      };
    } catch {
      return RuleBasedProvider.helpWithObjection(input);
    }
  }

  public async whatShouldIAskNow(input: AnalystInput): Promise<CopilotManualResponse> {
    return RuleBasedProvider.whatShouldIAskNow(input);
  }

  public async generateFinalReport(input: AnalystInput, metadata: MeetingMetadata): Promise<FinalReportData> {
    return RuleBasedProvider.generateFinalReport(input, metadata);
  }

  private async generateOllama(prompt: string, json = false): Promise<string> {
    const body = JSON.stringify({
      model: this.model,
      prompt,
      stream: false,
      format: json ? 'json' : undefined,
      options: {
        temperature: 0.2,
      },
    });

    const res = await this.httpRequest(`${this.baseUrl}/api/generate`, 'POST', body);
    if (res.status !== 200) {
      throw new Error(`Ollama request failed with status ${res.status}`);
    }
    const data = JSON.parse(res.body);
    return data.response || '';
  }

  private httpRequest(targetUrl: string, method: string, postData?: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(targetUrl);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 11434,
          path: url.pathname + url.search,
          method,
          headers: postData
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
              }
            : undefined,
          timeout: 10000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode || 500, body: data }));
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      if (postData) req.write(postData);
      req.end();
    });
  }
}

// -------------------------------------------------------------
// 2. RuleBasedProvider (100% Local, Zero Custo, Zero Dependências)
// -------------------------------------------------------------
export class RuleBasedProvider implements AIProvider {
  public name = 'Motor Local Baseado em Regras (Zero Custo / 100% Offline)';

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async getAvailableModels(): Promise<string[]> {
    return ['Noryn Commercial Rule Engine v1.0 (Built-in)'];
  }

  public async analyzeIncremental(input: AnalystInput): Promise<MeetingState> {
    return RuleBasedProvider.analyzeIncremental(input);
  }

  public static analyzeIncremental(input: AnalystInput): MeetingState {
    const recentText = input.recentTranscript.map((t) => t.text).join(' ');
    const { newState } = RuleEngine.analyzeText(recentText, input.currentState, input.elapsedSeconds);
    return newState;
  }

  public async askCopilot(query: string, input: AnalystInput): Promise<CopilotManualResponse> {
    return RuleBasedProvider.askCopilot(query, input);
  }

  public static askCopilot(query: string, input: AnalystInput): CopilotManualResponse {
    const qLower = query.toLowerCase();
    let answer = '';

    if (qLower.includes('falta') || qLower.includes('descobrir') || qLower.includes('pergunt')) {
      const p = input.currentState.pendingQuestions.slice(0, 3).map((x) => `• ${x.text}`).join('\n');
      answer = `Principais lacunas a descobrir agora:\n${p || 'A maioria dos pontos comerciais já foi mapeada.'}`;
    } else if (qLower.includes('objeção') || qLower.includes('objeç')) {
      const obj = input.currentState.objections[0];
      if (obj) {
        answer = `Última objeção identificada: "${obj.text}".\nSugestão de resposta: ${obj.suggestedResponse || 'Investigue a raiz do receio antes de propor concessões.'}`;
      } else {
        answer = 'Nenhuma objeção crítica identificada até o momento na conversa.';
      }
    } else if (qLower.includes('comprar') || qLower.includes('código') || qLower.includes('licença')) {
      answer = 'Alerta Comercial: O cliente demonstrou interesse em possuir o sistema. Nunca conceda o código core da Noryn. Proponha licença perpétua de uso dedicada com contrato de manutenção.';
    } else if (qLower.includes('promet') || qLower.includes('compromisso')) {
      const dec = input.currentState.decisions.map((d) => `• ${d.text}`).join('\n');
      answer = `Compromissos e decisões registrados:\n${dec || 'Nenhuma promessa definitiva registrada ainda.'}`;
    } else if (qLower.includes('resum') || qLower.includes('minutos')) {
      const recent = input.recentTranscript.slice(-6).map((t) => `${t.speaker}: ${t.text}`).join(' | ');
      answer = `Resumo dos últimos momentos: ${recent.slice(0, 300)}...`;
    } else {
      answer = `Análise sobre "${query}": Com base em ${input.currentState.requirements.length} requisitos e ${input.currentState.objections.length} objeções, mantenha o foco em validar o volume de usuários e estrutura de WhatsApp.`;
    }

    return {
      type: 'general',
      question: query,
      answer,
      timestamp: new Date().toLocaleTimeString(),
    };
  }

  public async helpWithObjection(input: AnalystInput): Promise<CopilotManualResponse> {
    return RuleBasedProvider.helpWithObjection(input);
  }

  public static helpWithObjection(input: AnalystInput): CopilotManualResponse {
    const lastObj = input.currentState.objections[0];
    const recentText = input.recentTranscript.slice(-4).map((t) => t.text).join(' ').toLowerCase();

    let objectionIdentified = lastObj?.text || 'Preocupação com custos recorrentes ou dependência do sistema';
    let interpretation = 'O cliente busca previsibilidade financeira ou receia ficar preso a um serviço na nuvem.';
    let suggestedResponse = 'Podemos avaliar uma licença dedicada ou perpétua e separar claramente os custos de sustentação e infraestrutura.';
    let continuityQuestion = 'A preocupação de vocês é especificamente com o custo mensal recorrente ou com depender da nossa hospedagem?';

    if (recentText.includes('comprar') || recentText.includes('código')) {
      objectionIdentified = 'Desejo de compra de código ou do software próprio';
      interpretation = 'O cliente confunde contratar um CRM sob medida com adquirir os direitos de propriedade intelectual da tecnologia.';
      suggestedResponse = 'A tecnologia base é o core da Noryn. Oferecemos licença de uso exclusiva para sua operação com personalizações dedicadas às marcas e patentes.';
      continuityQuestion = 'Vocês têm interesse em ter a tecnologia para revender ou a necessidade é ter a garantia de uso perpétuo no escritório?';
    }

    return {
      type: 'objection',
      question: 'Me ajude com essa objeção',
      answer: suggestedResponse,
      objectionIdentified,
      interpretation,
      suggestedResponse,
      continuityQuestion,
      timestamp: new Date().toLocaleTimeString(),
    };
  }

  public async whatShouldIAskNow(input: AnalystInput): Promise<CopilotManualResponse> {
    return RuleBasedProvider.whatShouldIAskNow(input);
  }

  public static whatShouldIAskNow(input: AnalystInput): CopilotManualResponse {
    const next = input.currentState.pendingQuestions[0]?.text || 'Quantos usuários simultâneos utilizarão o CRM desde o primeiro dia?';
    return {
      type: 'next_question',
      question: 'O que devo perguntar agora?',
      answer: next,
      continuityQuestion: next,
      timestamp: new Date().toLocaleTimeString(),
    };
  }

  public async generateFinalReport(input: AnalystInput, metadata: MeetingMetadata): Promise<FinalReportData> {
    return RuleBasedProvider.generateFinalReport(input, metadata);
  }

  public static generateFinalReport(input: AnalystInput, metadata: MeetingMetadata): FinalReportData {
    const st = input.currentState;

    // Extract capacity
    const usersReq = st.requirements.find((r) => /usu[áa]rio|atendente|equipe/i.test(r.text))?.text || 'A confirmar (estimado 10-15)';
    const branchesReq = st.requirements.find((r) => /filial|unidade/i.test(r.text))?.text || 'Multi-filial';
    const waReq = st.requirements.find((r) => /whats?app|linha|chip/i.test(r.text))?.text || 'Múltiplos números';

    const transcriptMd = input.allTranscript
      .map((t) => `**[${t.formattedTime}] ${t.speaker}:** ${t.text}`)
      .join('\n\n');

    const followUp = `Prezados,

Agradecemos imensamente pela reunião de hoje para avaliação do CRM Noryn customizado para o seu escritório de Marcas e Patentes.

Resumo do que alinhamos:
1. Estrutura Operacional: ${branchesReq} e ${waReq}.
2. Requisitos Principais: Módulo para marcas/patentes, integração com WhatsApp para múltiplos atendentes e sincronização com Google Calendar.
3. Modelo Comercial: Estamos estruturando a proposta contemplando a melhor aderência entre licenciamento dedicado e previsibilidade de custos.

Próximos passos:
• Consolidação do escopo técnico para migração de histórico.
• Envio da proposta comercial detalhada em até 48 horas.

Permanecemos à disposição para qualquer esclarecimento.

Atenciosamente,
Equipe Comercial Noryn`;

    return {
      metadata,
      executiveSummary: `Reunião comercial estratégica realizada em ${metadata.startedAt}. O cliente, um escritório especializado em marcas e patentes, avaliou a implantação do CRM Noryn com arquitetura multi-atendimento e multi-filiais. Principais focos: gestão de atendentes em múltiplos números de WhatsApp, integração com Google Calendar e migração de dados.`,
      participants: metadata.participants || ['Vendedor Noryn', 'Diretoria / Gestão do Escritório'],
      meetingObjective: 'Avaliar a aderência do CRM Noryn para operação jurídica de marcas e patentes com customização dedicada.',
      clientNeeds: [
        'Centralização de atendimentos via múltiplos números de WhatsApp sem perda de histórico.',
        'Visão unificada por filiais e departamentos com controle de permissões.',
        'Sincronização com Google Calendar para reuniões e prazos.',
      ],
      functionalRequirements: st.requirements.map((r) => r.text),
      technicalRequirements: st.technicalRequirements.map((r) => r.text).concat([
        'Banco de dados isolado com rotinas automáticas de backup.',
        'Compatibilidade com navegação web e desktop.',
      ]),
      integrations: st.integrations.map((i) => i.text).concat(['WhatsApp API / Web', 'Google Calendar']),
      capacityMetrics: {
        users: usersReq,
        branches: branchesReq,
        whatsappNumbers: waReq,
      },
      objections: st.objections,
      decisions: st.decisions,
      commitmentsByNoryn: [
        'Apresentar proposta comercial detalhada com opções de modelo de contratação.',
        'Mapear escopo exato de migração do banco atual.',
      ],
      pendingQuestions: st.pendingQuestions.map((p) => p.text),
      risks: st.risks.map((r) => r.text).concat(['Escopo de e-mail e volume de anexos históricos a migrar']),
      opportunities: st.opportunities.map((o) => o.text).concat(['Treinamento presencial/online da equipe', 'SLA dedicado de suporte']),
      priceImpactPoints: [
        'Quantidade final de números de WhatsApp conectados simultaneamente.',
        'Necessidade de importação de banco de dados anterior.',
        'Modelo de licenciamento perpétuo versus SaaS.',
      ],
      timelineImpactPoints: [
        'Disponibilização da base de dados pelo cliente para higienização.',
        'Definição do escopo da integração de e-mail.',
      ],
      commercialModelRecommendation: 'Licença dedicada com valor de setup/implantação + Contrato de suporte e evolução mensal com SLA garantido.',
      nextSteps: [
        'Vendedor: Enviar e-mail de follow-up com o resumo dos requisitos alinhados.',
        'Cliente: Validar com os sócios o quantitativo definitivo de atendentes e números de WhatsApp.',
        'Noryn: Elaborar dimensionamento de infraestrutura e proposta comercial formal.',
      ],
      followUpDraft: followUp,
      transcriptMarkdown: transcriptMd || 'Nenhuma transcrição gravada nesta sessão.',
    };
  }
}
