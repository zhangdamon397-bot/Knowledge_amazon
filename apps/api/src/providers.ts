import { createHash } from "node:crypto";
import { LOW_CONFIDENCE_THRESHOLD } from "@knowledge-amazon/shared";
import { loadConfig } from "./config.js";

export interface EmbeddingProvider {
  name: string;
  model: string;
  isCloud: boolean;
  embed(text: string): Promise<number[]>;
}

export interface RetrievedContext {
  content: string;
  sourceLabel: string;
  documentTitle: string;
  relevanceScore: number;
}

export interface ChatProvider {
  name: string;
  model: string;
  isCloud: boolean;
  answer(question: string, contexts: RetrievedContext[], insufficientEvidence: boolean): Promise<string>;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly model = "local-hash-64";
  readonly isCloud = false;

  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(64).fill(0);
    const tokens = tokenizeForEmbedding(text);

    for (const token of tokens) {
      const hash = createHash("sha256").update(token).digest();
      const index = hash[0] % vector.length;
      const direction = hash[1] % 2 === 0 ? 1 : -1;
      vector[index] += direction;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(6)));
  }
}

export class LocalChatProvider implements ChatProvider {
  readonly name = "local";
  readonly model = "local-extractive";
  readonly isCloud = false;

  async answer(question: string, contexts: RetrievedContext[], insufficientEvidence: boolean): Promise<string> {
    if (insufficientEvidence || contexts.length === 0) {
      return "当前知识库没有足够资料回答这个问题。请补充资料、缩小检索范围，或换一种问法。";
    }

    const best = contexts[0];
    const confidenceNote =
      best.relevanceScore < LOW_CONFIDENCE_THRESHOLD ? "（置信度偏低，建议核对引用来源。）" : "";

    return [
      `根据《${best.documentTitle}》${best.sourceLabel}，可以回答：`,
      trimAnswer(best.content),
      confidenceNote
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly isCloud = true;
  readonly model = loadConfig().openaiEmbeddingModel;

  async embed(text: string): Promise<number[]> {
    const config = loadConfig();
    if (!config.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI embeddings");
    }

    const response = await fetch(`${config.openaiBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiEmbeddingModel,
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding request failed: ${response.status}`);
    }

    const payload = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return payload.data[0].embedding.slice(0, 64);
  }
}

export class OpenAiChatProvider implements ChatProvider {
  readonly name = "openai";
  readonly isCloud = true;
  readonly model = loadConfig().openaiChatModel;

  async answer(question: string, contexts: RetrievedContext[], insufficientEvidence: boolean): Promise<string> {
    if (insufficientEvidence) {
      return "当前知识库没有足够资料回答这个问题。请补充资料、缩小检索范围，或换一种问法。";
    }

    const config = loadConfig();
    if (!config.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI chat");
    }

    const contextText = contexts
      .map((context, index) => `[${index + 1}] ${context.documentTitle} ${context.sourceLabel}\n${context.content}`)
      .join("\n\n");

    const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiChatModel,
        messages: [
          {
            role: "system",
            content: "你是企业知识库助手。只能基于提供的资料回答；资料不足时直接说明资料不足。回答要简洁，并提醒用户核对引用。"
          },
          {
            role: "user",
            content: `问题：${question}\n\n资料：\n${contextText}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat request failed: ${response.status}`);
    }

    const payload = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return payload.choices[0]?.message.content ?? "当前知识库没有足够资料回答这个问题。";
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  return loadConfig().embeddingProvider === "openai" ? new OpenAiEmbeddingProvider() : new LocalEmbeddingProvider();
}

export function createChatProvider(): ChatProvider {
  return loadConfig().chatProvider === "openai" ? new OpenAiChatProvider() : new LocalChatProvider();
}

export function toSqlVector(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(6))).join(",")}]`;
}

function trimAnswer(content: string): string {
  return content.length > 500 ? `${content.slice(0, 500)}...` : content;
}

function tokenizeForEmbedding(text: string): string[] {
  const normalized = text.toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9]+/g) ?? [];
  const cjkChars = normalized.match(/[\p{Script=Han}]/gu) ?? [];
  const cjkBigrams: string[] = [];

  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    cjkBigrams.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }

  return [...latinTokens, ...cjkChars, ...cjkBigrams];
}
