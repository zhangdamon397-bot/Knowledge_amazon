import type {
  ChatAnswer,
  ConversationDetail,
  ConversationSummary,
  DocumentRecord,
  KnowledgeBase,
  User
} from "@knowledge-amazon/shared";

const API_BASE = "/api";

export interface DashboardSummary {
  knowledgeBaseCount: number;
  documentCount: number;
  indexedCount: number;
  failedCount: number;
}

export interface JobRecord {
  id: string;
  document_id: string;
  document_title: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export class ApiClient {
  constructor(private token: string | null) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  async dashboard(): Promise<DashboardSummary> {
    return this.request("/dashboard");
  }

  async knowledgeBases(): Promise<{ knowledgeBases: KnowledgeBase[] }> {
    return this.request("/knowledge-bases");
  }

  async documents(knowledgeBaseId: string): Promise<{ documents: DocumentRecord[] }> {
    return this.request(`/knowledge-bases/${knowledgeBaseId}/documents`);
  }

  async uploadDocument(form: FormData): Promise<{ documentId: string }> {
    return this.request("/documents/upload", {
      method: "POST",
      body: form,
      skipJsonHeader: true
    });
  }

  async softDelete(documentId: string): Promise<{ ok: boolean }> {
    return this.request(`/documents/${documentId}/soft-delete`, { method: "POST" });
  }

  async purge(documentId: string): Promise<{ ok: boolean }> {
    return this.request(`/documents/${documentId}/purge`, { method: "POST" });
  }

  async jobs(): Promise<{ jobs: JobRecord[] }> {
    return this.request("/jobs");
  }

  async retryJob(jobId: string): Promise<{ ok: boolean }> {
    return this.request(`/jobs/${jobId}/retry`, { method: "POST" });
  }

  async chat(
    question: string,
    knowledgeBaseId?: string,
    conversationId?: string
  ): Promise<ChatAnswer & { confidenceLabel: string }> {
    return this.request("/chat", {
      method: "POST",
      body: JSON.stringify({ question, knowledgeBaseId, conversationId })
    });
  }

  async conversations(): Promise<{ conversations: ConversationSummary[] }> {
    return this.request("/conversations");
  }

  async conversation(id: string): Promise<ConversationDetail> {
    return this.request(`/conversations/${id}`);
  }

  private async request<T>(path: string, init: RequestInit & { skipJsonHeader?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!init.skipJsonHeader) {
      headers.set("Content-Type", "application/json");
    }
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error ?? response.statusText);
    }

    return response.json() as Promise<T>;
  }
}
