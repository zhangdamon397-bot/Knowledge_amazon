import { MessageSquare, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, ConversationSummary, KnowledgeBase } from "@knowledge-amazon/shared";
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
  const [question, setQuestion] = useState("介绍下瀚海广盈的合作方式");
  const [scope, setScope] = useState(selectedKbId);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const latestAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === "assistant"), [messages]);

  async function refreshConversations() {
    const result = await api.conversations();
    setConversations(result.conversations);
  }

  async function openConversation(id: string) {
    const detail = await api.conversation(id);
    setActiveConversationId(id);
    setMessages(detail.messages);
    setScope(detail.conversation.knowledgeBaseId ?? "");
  }

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }

    setBusy(true);
    try {
      const result = await api.chat(trimmed, scope || undefined, activeConversationId ?? undefined);
      setActiveConversationId(result.conversationId);
      setQuestion("");
      await refreshConversations();
      await openConversation(result.conversationId);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshConversations().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setScope((current) => current || selectedKbId);
  }, [selectedKbId]);

  return (
    <div className="chat-layout">
      <aside className="panel conversation-panel">
        <div className="panel-header">
          <h2>历史会话</h2>
          <button
            type="button"
            onClick={() => {
              setActiveConversationId(null);
              setMessages([]);
              setQuestion("");
            }}
            title="新会话"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              className={
                conversation.id === activeConversationId
                  ? "conversation-item conversation-item-active"
                  : "conversation-item"
              }
              onClick={() => openConversation(conversation.id)}
            >
              <MessageSquare size={15} />
              <span>
                <strong>{conversation.title}</strong>
                <small>
                  {conversation.messageCount} 条消息 · {new Date(conversation.lastMessageAt).toLocaleString()}
                </small>
              </span>
            </button>
          ))}
          {conversations.length === 0 && <div className="empty-state">还没有历史会话。</div>}
        </div>
      </aside>

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
          {messages.map((message) => (
            <div
              className={
                message.role === "user"
                  ? "message message-user"
                  : message.insufficientEvidence
                    ? "message message-warning"
                    : "message message-ai"
              }
              key={message.id}
            >
              {message.role === "assistant" && (
                <strong>{message.insufficientEvidence ? "资料不足" : "知识库回答"}</strong>
              )}
              <p>{message.content}</p>
              {message.role === "assistant" && message.confidence !== null && (
                <span className={`confidence confidence-${confidenceLabel(message.confidence, message.insufficientEvidence)}`}>
                  置信度 {(message.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ))}
          {messages.length === 0 && <div className="empty-state">选择历史会话，或直接输入问题开始新会话。</div>}
        </div>
        <div className="composer">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void ask();
              }
            }}
          />
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
        {latestAssistant?.citations.length ? (
          latestAssistant.citations.map((citation) => (
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

function confidenceLabel(confidence: number, insufficientEvidence: boolean): "insufficient" | "low" | "high" {
  if (insufficientEvidence) {
    return "insufficient";
  }
  return confidence < 0.45 ? "low" : "high";
}
