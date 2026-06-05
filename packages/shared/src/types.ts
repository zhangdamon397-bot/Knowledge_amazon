export type UserRole = "admin" | "member" | "readonly";

export type SensitivityLevel = "public_internal" | "client_confidential" | "restricted";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "indexed"
  | "failed"
  | "needs_ocr"
  | "waiting_private_processing"
  | "soft_deleted"
  | "purged";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  type: string;
  visibility: string;
  sensitivity: SensitivityLevel;
  allowCloudProcessing: boolean;
  documentCount: number;
  indexedCount: number;
}

export interface DocumentRecord {
  id: string;
  knowledgeBaseId: string;
  title: string;
  originalFilename: string;
  fileType: string;
  tags: string[];
  sensitivity: SensitivityLevel;
  allowCloudProcessing: boolean;
  status: DocumentStatus;
  parseError?: string | null;
  createdAt: string;
}

export interface Citation {
  documentId: string | null;
  chunkId: string | null;
  relevanceScore: number;
  citedText: string;
  sourceLabel: string;
  documentTitle?: string;
}

export interface ChatAnswer {
  conversationId: string;
  messageId: string;
  answer: string;
  confidence: number;
  insufficientEvidence: boolean;
  citations: Citation[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  knowledgeBaseId: string | null;
  clientId: string | null;
  projectId: string | null;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence: number | null;
  insufficientEvidence: boolean;
  createdAt: string;
  citations: Citation[];
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ChatMessage[];
}
