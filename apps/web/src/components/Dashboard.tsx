import { AlertTriangle, CheckCircle2, FileText, Library } from "lucide-react";
import type { DocumentRecord } from "@knowledge-amazon/shared";
import type { DashboardSummary, JobRecord } from "../api";

export function Dashboard({
  dashboard,
  documents,
  jobs
}: {
  dashboard: DashboardSummary | null;
  documents: DocumentRecord[];
  jobs: JobRecord[];
}) {
  const cards = [
    { label: "知识库", value: dashboard?.knowledgeBaseCount ?? "-", icon: <Library size={18} /> },
    { label: "文档", value: dashboard?.documentCount ?? "-", icon: <FileText size={18} /> },
    { label: "已索引", value: dashboard?.indexedCount ?? "-", icon: <CheckCircle2 size={18} /> },
    { label: "失败任务", value: dashboard?.failedCount ?? "-", icon: <AlertTriangle size={18} /> }
  ];

  return (
    <div className="dashboard-grid">
      <section className="hero-panel">
        <div>
          <h1>资料入库与问答工作台</h1>
          <p>跟踪文档解析、索引状态和引用质量，确保每个回答都能回到来源。</p>
        </div>
        <div className="confidence-card">
          <span>默认策略</span>
          <strong>客户敏感资料禁用云端</strong>
          <small>管理员显式开启后才允许处理</small>
        </div>
      </section>

      <section className="metric-row">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.icon}</span>
            <div>
              <strong>{card.value}</strong>
              <small>{card.label}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>最近文档</h2>
        </div>
        <div className="table">
          {documents.slice(0, 6).map((document) => (
            <div className="table-row" key={document.id}>
              <span>{document.title}</span>
              <StatusChip status={document.status} />
              <small>{document.sensitivity}</small>
            </div>
          ))}
          {documents.length === 0 && <div className="empty-state">还没有文档，先到知识库上传资料。</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>任务队列</h2>
        </div>
        <div className="table">
          {jobs.slice(0, 6).map((job) => (
            <div className="table-row" key={job.id}>
              <span>{job.document_title}</span>
              <StatusChip status={job.status} />
              <small>{job.retry_count} 次重试</small>
            </div>
          ))}
          {jobs.length === 0 && <div className="empty-state">暂无解析任务。</div>}
        </div>
      </section>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone = status.includes("failed") || status.includes("ocr") ? "danger" : status.includes("indexed") ? "ok" : "warn";
  return <span className={`status-chip status-${tone}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    indexed: "已索引",
    failed: "解析失败",
    needs_ocr: "需要 OCR",
    uploaded: "已上传",
    processing: "处理中",
    pending: "待处理",
    completed: "完成",
    soft_deleted: "已软删"
  };
  return labels[status] ?? status;
}
