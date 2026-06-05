import { RefreshCw, ShieldAlert, Trash2, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import type { DocumentRecord, KnowledgeBase, SensitivityLevel } from "@knowledge-amazon/shared";
import type { ApiClient } from "../api";
import { StatusChip } from "./Dashboard";

export function KnowledgeBaseView({
  api,
  knowledgeBases,
  selectedKbId,
  documents,
  onSelectKb,
  onRefresh
}: {
  api: ApiClient;
  knowledgeBases: KnowledgeBase[];
  selectedKbId: string;
  documents: DocumentRecord[];
  onSelectKb: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>("public_internal");
  const [allowCloud, setAllowCloud] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file || !selectedKbId) {
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("knowledgeBaseId", selectedKbId);
    form.set("title", file.name);
    form.set("sensitivity", sensitivity);
    form.set("allowCloudProcessing", String(allowCloud));
    setBusy(true);
    try {
      await api.uploadDocument(form);
      setFile(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-column">
      <section className="panel kb-list">
        <div className="panel-header">
          <h2>知识库</h2>
          <button type="button" onClick={onRefresh}>
            <RefreshCw size={15} />
          </button>
        </div>
        {knowledgeBases.map((kb) => (
          <button
            type="button"
            key={kb.id}
            className={kb.id === selectedKbId ? "kb-item kb-item-active" : "kb-item"}
            onClick={() => onSelectKb(kb.id)}
          >
            <strong>{kb.name}</strong>
            <span>{kb.documentCount} 份文档 · {kb.indexedCount} 已索引</span>
            <small>{kb.sensitivity}</small>
          </button>
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>文档资料</h2>
        </div>
        <div className="upload-strip">
          <label className="file-picker">
            <Upload size={16} />
            <input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} />
            {file ? file.name : "选择 PDF / PPTX / Word / Markdown"}
          </label>
          <select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as SensitivityLevel)}>
            <option value="public_internal">普通内部</option>
            <option value="client_confidential">客户敏感</option>
            <option value="restricted">高敏资料</option>
          </select>
          <label className="inline-check">
            <input type="checkbox" checked={allowCloud} onChange={(event) => setAllowCloud(event.target.checked)} />
            允许云端处理
          </label>
          <button type="button" disabled={!file || busy} onClick={upload}>
            上传并索引
          </button>
        </div>

        <div className="document-table">
          <div className="document-head">
            <span>文档</span>
            <span>状态</span>
            <span>敏感等级</span>
            <span>操作</span>
          </div>
          {documents.map((document) => (
            <div className="document-row" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <small>{document.originalFilename}</small>
                {document.parseError && <em>{document.parseError}</em>}
              </div>
              <StatusChip status={document.status} />
              <span className={document.sensitivity === "client_confidential" ? "sensitive" : ""}>
                {document.sensitivity === "client_confidential" && <ShieldAlert size={14} />}
                {document.sensitivity}
              </span>
              <div className="row-actions">
                <button type="button" onClick={() => api.softDelete(document.id).then(onRefresh)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {documents.length === 0 && <div className="empty-state">当前知识库还没有文档。</div>}
        </div>
      </section>
    </div>
  );
}
