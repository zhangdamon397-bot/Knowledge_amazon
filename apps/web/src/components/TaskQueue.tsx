import { RotateCw } from "lucide-react";
import type { ApiClient, JobRecord } from "../api";
import { StatusChip } from "./Dashboard";

export function TaskQueue({
  api,
  jobs,
  onRefresh
}: {
  api: ApiClient;
  jobs: JobRecord[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>任务队列</h2>
        <button type="button" onClick={onRefresh}>
          <RotateCw size={15} />
        </button>
      </div>
      <div className="document-table">
        <div className="document-head">
          <span>文档</span>
          <span>状态</span>
          <span>错误</span>
          <span>操作</span>
        </div>
        {jobs.map((job) => (
          <div className="document-row" key={job.id}>
            <strong>{job.document_title}</strong>
            <StatusChip status={job.status} />
            <small>{job.error_message ?? `${job.retry_count} 次重试`}</small>
            <button type="button" onClick={() => api.retryJob(job.id).then(onRefresh)} disabled={job.status !== "failed"}>
              重试
            </button>
          </div>
        ))}
        {jobs.length === 0 && <div className="empty-state">没有待处理任务。</div>}
      </div>
    </section>
  );
}
