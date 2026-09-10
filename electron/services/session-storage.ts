import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';
import {
  MeetingMetadata,
  MeetingState,
  TranscriptSegment,
  FinalReportData,
} from '../../src/types/meeting';

export class SessionStorage {
  private baseDir: string;
  private db: Database | null = null;
  private dbPath: string;

  constructor(baseDir = path.join(process.cwd(), 'meetings')) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    this.dbPath = path.join(this.baseDir, 'meetings.sqlite');
  }

  public async initialize(): Promise<void> {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    // Initialize tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT,
        context_text TEXT,
        started_at TEXT,
        ended_at TEXT,
        duration_seconds INTEGER,
        profile TEXT,
        stt_model TEXT,
        ai_model TEXT
      );

      CREATE TABLE IF NOT EXISTS transcript_segments (
        id TEXT PRIMARY KEY,
        meeting_id TEXT,
        speaker TEXT,
        text TEXT,
        timestamp INTEGER,
        formatted_time TEXT,
        bookmarked INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS meeting_state (
        meeting_id TEXT PRIMARY KEY,
        state_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS analysis_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id TEXT,
        event_type TEXT,
        title TEXT,
        message TEXT,
        severity TEXT,
        timestamp TEXT
      );
    `);
    this.saveSqlite();
  }

  private saveSqlite(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('[SessionStorage] Erro ao persistir SQLite:', err);
    }
  }

  public getMeetingDir(meetingId: string): string {
    const dir = path.join(this.baseDir, meetingId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public saveMeetingMetadata(metadata: MeetingMetadata): void {
    const dir = this.getMeetingDir(metadata.id);
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');

    if (this.db) {
      this.db.run(
        `INSERT OR REPLACE INTO meetings (id, title, context_text, started_at, ended_at, duration_seconds, profile, stt_model, ai_model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          metadata.id,
          metadata.title,
          metadata.contextText,
          metadata.startedAt,
          metadata.endedAt || '',
          metadata.durationSeconds,
          metadata.hardwareProfile,
          metadata.sttModel,
          metadata.aiModel,
        ]
      );
      this.saveSqlite();
    }
  }

  public saveTranscript(meetingId: string, segments: TranscriptSegment[]): void {
    const dir = this.getMeetingDir(meetingId);
    fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(segments, null, 2), 'utf-8');

    if (this.db) {
      for (const seg of segments) {
        this.db.run(
          `INSERT OR REPLACE INTO transcript_segments (id, meeting_id, speaker, text, timestamp, formatted_time, bookmarked)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            seg.id,
            meetingId,
            seg.speaker,
            seg.text,
            seg.timestamp,
            seg.formattedTime,
            seg.bookmarked ? 1 : 0,
          ]
        );
      }
      this.saveSqlite();
    }
  }

  public saveMeetingState(meetingId: string, state: MeetingState): void {
    const dir = this.getMeetingDir(meetingId);
    fs.writeFileSync(path.join(dir, 'analysis-state.json'), JSON.stringify(state, null, 2), 'utf-8');

    if (this.db) {
      this.db.run(
        `INSERT OR REPLACE INTO meeting_state (meeting_id, state_json, updated_at) VALUES (?, ?, ?)`,
        [meetingId, JSON.stringify(state), new Date().toISOString()]
      );
      this.saveSqlite();
    }
  }

  public saveEvent(meetingId: string, event: { type: string; title: string; message: string; severity: string }): void {
    const dir = this.getMeetingDir(meetingId);
    const eventsPath = path.join(dir, 'events.json');
    let events = [];
    if (fs.existsSync(eventsPath)) {
      try {
        events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
      } catch {
        events = [];
      }
    }
    const record = { ...event, timestamp: new Date().toISOString() };
    events.push(record);
    fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2), 'utf-8');

    if (this.db) {
      this.db.run(
        `INSERT INTO analysis_events (meeting_id, event_type, title, message, severity, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [meetingId, event.type, event.title, event.message, event.severity, record.timestamp]
      );
      this.saveSqlite();
    }
  }

  public saveFinalReport(meetingId: string, report: FinalReportData): string {
    const dir = this.getMeetingDir(meetingId);
    const md = this.buildMarkdownReport(report);
    const filePath = path.join(dir, 'final-report.md');
    fs.writeFileSync(filePath, md, 'utf-8');
    return filePath;
  }

  public saveAudioWav(meetingId: string, pcmSamples: Float32Array, sampleRate = 16000): void {
    const dir = this.getMeetingDir(meetingId);
    const wavPath = path.join(dir, 'audio.wav');
    const wavBuffer = this.encodeWav(pcmSamples, sampleRate);
    fs.writeFileSync(wavPath, wavBuffer);
  }

  public listMeetings(): MeetingMetadata[] {
    const list: MeetingMetadata[] = [];
    if (!fs.existsSync(this.baseDir)) return list;

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = path.join(this.baseDir, entry.name, 'metadata.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            list.push(meta);
          } catch {
            // Ignore parse failure
          }
        }
      }
    }
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  private buildMarkdownReport(r: FinalReportData): string {
    return `# RELATÓRIO EXECUTIVO — ${r.metadata.title}

Data: ${r.metadata.startedAt} | Duração: ${Math.floor(r.metadata.durationSeconds / 60)} min ${r.metadata.durationSeconds % 60} seg
Copiloto: Noryn Meeting Copilot (Local-First — Custo: ${r.metadata.costEstimate})

---

## 1. RESUMO EXECUTIVO
${r.executiveSummary}

## 2. PARTICIPANTES
${r.participants.map((p) => `- ${p}`).join('\n')}

## 3. OBJETIVO DA REUNIÃO
${r.meetingObjective}

## 4. NECESSIDADES DO CLIENTE
${r.clientNeeds.map((n) => `- ${n}`).join('\n')}

## 5. REQUISITOS FUNCIONAIS
${r.functionalRequirements.length > 0 ? r.functionalRequirements.map((req) => `- ${req}`).join('\n') : '- Nenhum requisito funcional específico capturado.'}

## 6. REQUISITOS TÉCNICOS
${r.technicalRequirements.length > 0 ? r.technicalRequirements.map((t) => `- ${t}`).join('\n') : '- Nenhuma exigência técnica adicional.'}

## 7. INTEGRAÇÕES
${r.integrations.length > 0 ? r.integrations.map((i) => `- ${i}`).join('\n') : '- Nenhuma integração externa identificada.'}

## 8. QUANTIDADE DE USUÁRIOS / FILIAIS / NÚMEROS
- **Usuários / Atendentes:** ${r.capacityMetrics.users || 'A definir'}
- **Filiais:** ${r.capacityMetrics.branches || 'A definir'}
- **Números de WhatsApp:** ${r.capacityMetrics.whatsappNumbers || 'A definir'}

## 9. OBJEÇÕES IDENTIFICADAS
${r.objections.length > 0 ? r.objections.map((o) => `### ⚠ ${o.text}\n- **Sugestão de Resposta:** ${o.suggestedResponse || 'Investigar raiz do receio.'}\n- **Pergunta de Continuidade:** ${o.continuityQuestion || 'Esclarecer alternativas contratuais.'}`).join('\n\n') : '- Nenhuma objeção registrada.'}

## 10. DECISÕES TOMADAS
${r.decisions.length > 0 ? r.decisions.map((d) => `- ✓ ${d.text}`).join('\n') : '- Nenhuma decisão final acordada.'}

## 11. PROMESSAS REALIZADAS PELA NORYN
${r.commitmentsByNoryn.map((c) => `- ${c}`).join('\n')}

## 12. PENDÊNCIAS E LACUNAS A DESCOBRIR
${r.pendingQuestions.length > 0 ? r.pendingQuestions.map((q) => `- ? ${q}`).join('\n') : '- Todos os tópicos comerciais essenciais foram respondidos.'}

## 13. RISCOS COMERCIAIS E TÉCNICOS
${r.risks.length > 0 ? r.risks.map((risk) => `- ⚠ ${risk}`).join('\n') : '- Sem riscos relevantes anotados.'}

## 14. OPORTUNIDADES IDENTIFICADAS
${r.opportunities.length > 0 ? r.opportunities.map((op) => `- ★ ${op}`).join('\n') : '- Nenhuma oportunidade de upsell mapeada.'}

## 15. PONTOS QUE IMPACTAM PREÇO
${r.priceImpactPoints.map((p) => `- ${p}`).join('\n')}

## 16. PONTOS QUE IMPACTAM PRAZO
${r.timelineImpactPoints.map((p) => `- ${p}`).join('\n')}

## 17. MODELO COMERCIAL MAIS ADEQUADO
${r.commercialModelRecommendation}

## 18. PRÓXIMOS PASSOS
${r.nextSteps.map((s) => `1. ${s}`).join('\n')}

## 19. RASCUNHO DE FOLLOW-UP
\`\`\`text
${r.followUpDraft}
\`\`\`

## 20. TRANSCRIÇÃO COMPLETA
${r.transcriptMarkdown}
`;
  }

  private encodeWav(samples: Float32Array, sampleRate: number): Buffer {
    const buffer = Buffer.alloc(44 + samples.length * 2);
    // RIFF identifier
    buffer.write('RIFF', 0);
    // file length minus 8
    buffer.writeUInt32LE(36 + samples.length * 2, 4);
    // RIFF type
    buffer.write('WAVE', 8);
    // format chunk identifier
    buffer.write('fmt ', 12);
    // format chunk length
    buffer.writeUInt32LE(16, 16);
    // sample format (raw PCM)
    buffer.writeUInt16LE(1, 20);
    // channel count (mono)
    buffer.writeUInt16LE(1, 22);
    // sample rate
    buffer.writeUInt32LE(sampleRate, 24);
    // byte rate (sample rate * block align)
    buffer.writeUInt32LE(sampleRate * 2, 28);
    // block align (channel count * bytes per sample)
    buffer.writeUInt16LE(2, 32);
    // bits per sample
    buffer.writeUInt16LE(16, 34);
    // data chunk identifier
    buffer.write('data', 36);
    // data chunk length
    buffer.writeUInt32LE(samples.length * 2, 40);

    // write the 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset);
      offset += 2;
    }
    return buffer;
  }
}
