import { describe, expect, it } from "vitest";
import { INSUFFICIENT_EVIDENCE_THRESHOLD, LOW_CONFIDENCE_THRESHOLD } from "@knowledge-amazon/shared";
import { confidenceLabel } from "../src/rag.js";
import { LocalChatProvider, LocalEmbeddingProvider } from "../src/providers.js";

describe("rag confidence policy", () => {
  it("labels scores below retrieval threshold as insufficient", () => {
    expect(confidenceLabel(INSUFFICIENT_EVIDENCE_THRESHOLD - 0.01)).toBe("insufficient");
  });

  it("labels grounded but weak scores as low confidence", () => {
    const score = (INSUFFICIENT_EVIDENCE_THRESHOLD + LOW_CONFIDENCE_THRESHOLD) / 2;
    expect(confidenceLabel(score)).toBe("low");
  });

  it("labels strong scores as high confidence", () => {
    expect(confidenceLabel(LOW_CONFIDENCE_THRESHOLD + 0.1)).toBe("high");
  });
});

describe("local providers", () => {
  it("creates repeatable 64-dimensional local embeddings", async () => {
    const provider = new LocalEmbeddingProvider();
    const first = await provider.embed("亚马逊 广告 优化 知识库");
    const second = await provider.embed("亚马逊 广告 优化 知识库");

    expect(first).toHaveLength(64);
    expect(first).toEqual(second);
  });

  it("returns insufficient-evidence answer without contexts", async () => {
    const provider = new LocalChatProvider();
    const answer = await provider.answer("怎么优化广告？", [], true);

    expect(answer).toContain("没有足够资料");
  });

  it("returns a grounded extractive answer with citation context", async () => {
    const provider = new LocalChatProvider();
    const answer = await provider.answer(
      "广告预算怎么控制？",
      [
        {
          documentTitle: "广告培训",
          sourceLabel: "slide 2",
          content: "广告预算应先按核心关键词和转化率分层控制，低转化词需要降低出价。",
          relevanceScore: 0.8
        }
      ],
      false
    );

    expect(answer).toContain("广告培训");
    expect(answer).toContain("低转化词需要降低出价");
  });
});
