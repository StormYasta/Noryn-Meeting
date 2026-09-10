export type Speaker = 'Eu' | 'Cliente' | 'Participante' | 'Gabriel';

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ItemStatus = 'open' | 'confirmed' | 'resolved';

export interface CommercialAlert {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface StructuredItem {
  id?: string;
  text: string;
  confidence: ConfidenceLevel;
  timestamp: string;
  status: ItemStatus;
  sourceExcerpt?: string;
  suggestedResponse?: string;
  continuityQuestion?: string;
  category?: string;
}

export interface MeetingState {
  requirements: StructuredItem[];
  objections: StructuredItem[];
  decisions: StructuredItem[];
  pendingQuestions: StructuredItem[];
  risks: StructuredItem[];
  opportunities: StructuredItem[];
  commitments: StructuredItem[];
  pricingSignals: StructuredItem[];
  technicalRequirements: StructuredItem[];
  integrations: StructuredItem[];
  nextBestAction: string;
  summarySoFar: string;
  lastUpdated?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: number; // seconds from meeting start
  formattedTime: string; // "MM:SS"
  isFinal: boolean;
  bookmarked?: boolean;
}

export type HardwareProfile = 'light' | 'balanced' | 'quality';

export interface HardwareInfo {
  gpuName: string;
  vramGB: number;
  cpuName: string;
  cores: number;
  ramGB: number;
  suggestedProfile: HardwareProfile;
  hasCuda: boolean;
}

export interface MeetingConfig {
  title: string;
  contextText: string;
  selectedAudioDeviceId: string;
  captureSystemAudio: boolean;
  saveAudio: boolean;
  hardwareProfile: HardwareProfile;
  sttModel: string;
  aiProvider: 'ollama' | 'rule-engine' | 'external';
  aiModel: string;
}

export interface MeetingMetadata {
  id: string;
  title: string;
  contextText: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  participants: string[];
  saveAudio: boolean;
  captureSystemAudio?: boolean;
  hardwareProfile: HardwareProfile;
  sttModel: string;
  aiProvider: string;
  aiModel: string;
  costEstimate: string; // "R$ 0,00 (Local)"
}

export interface ServiceStatus {
  microphoneActive: boolean;
  systemAudioActive: boolean;
  sttStatus: 'connected' | 'transcribing' | 'idle' | 'error';
  aiStatus: 'connected' | 'analyzing' | 'idle' | 'rule_fallback' | 'error';
  errorMessage?: string;
  sttModelName: string;
  aiModelName: string;
  deviceLabel: string; // e.g. "NVIDIA GeForce MX130" or "CPU (8 cores)"
  cost: string; // "R$ 0,00"
}

export interface CopilotManualResponse {
  type: 'general' | 'objection' | 'next_question' | 'gap_analysis';
  question: string;
  answer: string;
  objectionIdentified?: string;
  interpretation?: string;
  suggestedResponse?: string;
  continuityQuestion?: string;
  timestamp: string;
}

export interface FinalReportData {
  metadata: MeetingMetadata;
  executiveSummary: string;
  participants: string[];
  meetingObjective: string;
  clientNeeds: string[];
  functionalRequirements: string[];
  technicalRequirements: string[];
  integrations: string[];
  capacityMetrics: {
    users?: string;
    branches?: string;
    whatsappNumbers?: string;
  };
  objections: StructuredItem[];
  decisions: StructuredItem[];
  commitmentsByNoryn: string[];
  pendingQuestions: string[];
  risks: string[];
  opportunities: string[];
  priceImpactPoints: string[];
  timelineImpactPoints: string[];
  commercialModelRecommendation: string;
  nextSteps: string[];
  followUpDraft: string;
  transcriptMarkdown: string;
}
