import { Send } from "lucide-react";
import { useState } from "react";
import type { ChatAnswer, KnowledgeBase } from "@knowledge-amazon/shared";
import type { ApiClient } from "../api";

export function ChatView({
  api,
  knowledgeBases,
  selectedKbId
}: {
  api: ApiClient;
  knowledgeBases: KnowledgeBase[];
  selectedKbId: string;
}) {
  const [question, setQuestion] = useState("这份培训资料里，广告预算应该怎么控制？");
  const [scope, setScope] = useState(selectedKbId);
  const [answer, setAnswer] = useState<(ChatAnswer & { confidenceLabel: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!question.trim()) {
      return;
    }
    setBusy(true);
    try {
      setAnswer(await api.chat(question, scope || undefined));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-layout">
      <section className="panel chat-panel">
        <div className="panel-header">
          <h2>智能问答</h2>
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="">全部内部资料</option>
            {knowledgeBases.map((kb) => (
              <option value={kb.id} key={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
        </div>
        <div className="chat-thread">
          <div className="message message-user">{question}</div>
          {answer && (
            <div className={answer.insufficientEvidence ? "message message-warning" : "message message-ai"}>
              <strong>{answer.insufficientEvidence ? "资料不足" : "知识库回答"}</strong>
              <p>{answer.answer}</p>
              <span className={`confidence confidence-${answer.confidenceLabel}`}>
                置信度 {(answer.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
        <div className="composer">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} />
          <button type="button" onClick={ask} disabled={busy}>
            <Send size={16} />
            提问
          </button>
        </div>
      </section>

      <aside className="panel citations-panel">
        <div className="panel-header">
          <h2>引用来源</h2>
        </div>
        {answer?.citations.length ? (
          answer.citations.map((citation) => (
            <article className="citation-card" key={`${citation.documentId}-${citation.chunkId}`}>
              <strong>{citation.documentTitle ?? "来源文档"}</strong>
              <span>{citation.sourceLabel}</span>
              <p>{citation.citedText}</p>
            </article>
          ))
        ) : (
          <div className="empty-state">回答后会显示 PDF/PPT 引用片段。</div>
        )}
      </aside>
    </div>
  );
}
