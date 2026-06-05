export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  uploadDir: string;
  port: number;
  embeddingProvider: "local" | "openai";
  chatProvider: "local" | "openai";
  openaiApiKey?: string;
  openaiBaseUrl: string;
  openaiEmbeddingModel: string;
  openaiChatModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/knowledge_amazon",
    jwtSecret: env.JWT_SECRET ?? "change-me-in-local-dev",
    uploadDir: env.UPLOAD_DIR ?? "./uploads",
    port: Number(env.PORT ?? 4000),
    embeddingProvider: env.EMBEDDING_PROVIDER === "openai" ? "openai" : "local",
    chatProvider: env.CHAT_PROVIDER === "openai" ? "openai" : "local",
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    openaiBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiEmbeddingModel: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    openaiChatModel: env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini"
  };
}
