import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";

async function main() {
  const token = await login();
  const kb = await firstKnowledgeBase(token);
  const fixture = await createFixture();
  const documentId = await uploadFixture(token, kb.id, fixture);

  runWorkerOnce();

  const grounded = await ask(token, "广告预算应该怎么控制？", kb.id);
  assert(!grounded.insufficientEvidence, "Expected grounded question to have evidence");
  assert(grounded.citations.length > 0, "Expected grounded answer to include citations");

  const outside = await ask(token, "请回答一个资料里没有的火星基地预算问题。", kb.id);
  assert(outside.insufficientEvidence, "Expected outside question to return insufficient evidence");

  await request(`/documents/${documentId}/soft-delete`, token, { method: "POST" });
  const afterDelete = await ask(token, "广告预算应该怎么控制？", kb.id);
  assert(afterDelete.insufficientEvidence, "Expected soft-deleted document to be excluded from retrieval");

  console.log("RAG verification passed");
}

async function login() {
  const result = await request("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({
      email: "admin@local.test",
      password: "admin123456"
    })
  });
  return result.token;
}

async function firstKnowledgeBase(token) {
  const result = await request("/knowledge-bases", token);
  assert(result.knowledgeBases.length > 0, "Expected at least one knowledge base");
  return result.knowledgeBases[0];
}

async function createFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "knowledge-amazon-"));
  const file = path.join(dir, "广告培训资料.md");
  await writeFile(
    file,
    [
      "# 广告培训资料",
      "",
      "广告预算应该按照核心关键词、转化率和acos分层控制。",
      "低转化词需要降低出价，高转化词可以保留预算并持续观察。",
      "每周复盘广告花费、订单数、点击率和转化率。"
    ].join("\n"),
    "utf8"
  );
  return file;
}

async function uploadFixture(token, knowledgeBaseId, filePath) {
  const form = new FormData();
  const file = new Blob([await import("node:fs/promises").then((fs) => fs.readFile(filePath))], {
    type: "text/markdown"
  });
  form.set("file", file, path.basename(filePath));
  form.set("knowledgeBaseId", knowledgeBaseId);
  form.set("title", "广告培训资料");
  form.set("sensitivity", "public_internal");
  form.set("allowCloudProcessing", "true");

  const result = await request("/documents/upload", token, {
    method: "POST",
    body: form,
    skipJsonHeader: true
  });
  return result.documentId;
}

function runWorkerOnce() {
  const result = spawnSync("npm", ["--workspace", "apps/api", "run", "worker", "--", "--once"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true
  });
  assert(result.status === 0, "Expected worker --once to complete successfully");
}

async function ask(token, question, knowledgeBaseId) {
  return request("/chat", token, {
    method: "POST",
    body: JSON.stringify({
      question,
      knowledgeBaseId
    })
  });
}

async function request(pathname, token, init = {}) {
  const headers = new Headers(init.headers);
  if (!init.skipJsonHeader) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${pathname} failed: ${response.status} ${body}`);
  }

  return response.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
