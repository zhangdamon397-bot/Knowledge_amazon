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

  it("scores related Chinese knowledge text higher than unrelated text", async () => {
    const provider = new LocalEmbeddingProvider();
    const query = await provider.embed("广告预算应该怎么控制？");
    const related = await provider.embed("广告预算应该按照核心关键词、转化率和acos分层控制。");
    const unrelated = await provider.embed("火星基地能源补给计划。");

    expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated));
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

  it("summarizes multiple retrieved contexts instead of only echoing the top chunk", async () => {
    const provider = new LocalChatProvider();
    const answer = await provider.answer(
      "介绍下瀚海广盈的合作方式",
      [
        {
          documentTitle: "瀚海广盈合作手册v5.pptx",
          sourceLabel: "slide 5",
          content: "合作方式：线上对接、季度汇报、东莞本地随时面谈，运营透明。",
          relevanceScore: 0.52
        },
        {
          documentTitle: "瀚海广盈合作手册v5.pptx",
          sourceLabel: "slide 8",
          content: "服务费只覆盖基础运营成本，合作风险共担，盈亏共享。",
          relevanceScore: 0.49
        }
      ],
      false
    );

    expect(answer).toContain("检索到的 2 条资料");
    expect(answer).toContain("slide 5");
    expect(answer).toContain("slide 8");
    expect(answer).toContain("合作风险共担");
  });
});

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
