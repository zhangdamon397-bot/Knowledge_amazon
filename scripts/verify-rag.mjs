import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/knowledge_amazon";
const { Client } = pg;

async function main() {
  const token = await login("admin@local.test");
  await assertRoleLogin("member@local.test", "member");
  const readonlyToken = await assertRoleLogin("readonly@local.test", "readonly");
  const kb = await firstKnowledgeBase(token);
  const fixture = await createFixtures();

  await expectForbiddenUpload(readonlyToken, kb.id, fixture.markdown);

  const markdownDocumentId = await uploadFixture(token, kb.id, fixture.markdown, "广告培训 Markdown 资料");
  runWorkerOnce();
  await waitForDocument(token, markdownDocumentId, "indexed");

  const pdfDocumentId = await uploadFixture(token, kb.id, fixture.pdf, "广告预算 PDF 资料");
  runWorkerOnce();
  await waitForDocument(token, pdfDocumentId, "indexed");

  const pptxDocumentId = await uploadFixture(token, kb.id, fixture.pptx, "广告预算 PPT 资料");
  runWorkerOnce();
  await waitForDocument(token, pptxDocumentId, "indexed");

  const blankPdfDocumentId = await uploadFixture(token, kb.id, fixture.blankPdf, "扫描件空白 PDF 资料");
  runWorkerOnce();
  await waitForDocument(token, blankPdfDocumentId, "needs_ocr");

  const pdfAnswer = await ask(token, "What is the PDFRULE1688 budget threshold?", kb.id);
  assertGroundedCitation(pdfAnswer, pdfDocumentId, "PDF-specific question should cite the PDF document");
  assert(pdfAnswer.answer.includes("PDFRULE1688"), "Expected PDF answer to include the PDF-specific marker");

  const pptxAnswer = await ask(token, "What should PPTBLUELOWERBID terms do?", kb.id);
  assertGroundedCitation(pptxAnswer, pptxDocumentId, "PPTX-specific question should cite the PPTX document");
  assert(pptxAnswer.answer.includes("PPTBLUELOWERBID"), "Expected PPTX answer to include the PPTX-specific marker");

  const outside = await ask(token, "量子葡萄怎样发酵成隐形玻璃？", kb.id);
  assert(outside.insufficientEvidence, "Expected outside question to return insufficient evidence");
  assert(
    outside.confidenceLabel === "insufficient",
    "Expected outside answer to expose an insufficient confidence reminder"
  );

  const conversationsBeforeRestart = await request("/conversations", token);
  assert(conversationsBeforeRestart.conversations.length > 0, "Expected conversations to be persisted");
  await assertPersistedRecordsVisible(token, pdfDocumentId);

  const purgeTarget = await getDocumentStorageState(pptxDocumentId);
  await request(`/documents/${pptxDocumentId}/purge`, token, { method: "POST" });
  await assertPurged(pptxDocumentId, purgeTarget.storage_path);

  await request(`/documents/${pdfDocumentId}/soft-delete`, token, { method: "POST" });
  const afterDelete = await ask(token, "What is the PDFRULE1688 budget threshold?", kb.id);
  assert(afterDelete.insufficientEvidence, "Expected soft-deleted document to be excluded from retrieval");

  console.log("RAG verification passed");
}

async function login(email) {
  const result = await request("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "admin123456"
    })
  });
  return result.token;
}

async function assertRoleLogin(email, role) {
  const result = await request("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "admin123456"
    })
  });
  assert(result.user.role === role, `Expected ${email} to login as ${role}`);
  return result.token;
}

async function firstKnowledgeBase(token) {
  const result = await request("/knowledge-bases", token);
  assert(result.knowledgeBases.length > 0, "Expected at least one knowledge base");
  return result.knowledgeBases[0];
}

async function createFixtures() {
  const dir = await mkdtemp(path.join(tmpdir(), "knowledge-amazon-"));
  const markdown = path.join(dir, "广告培训资料.md");
  await writeFile(
    markdown,
    [
      "# 广告培训资料",
      "",
      "Markdown 培训资料说明：广告预算应该按照核心关键词、转化率和 acos 分层控制。",
      "Markdown 培训资料说明：低转化词需要降低出价，高转化词可以保留预算并持续观察。",
      "每周复盘广告花费、订单数、点击率和转化率。"
    ].join("\n"),
    "utf8"
  );

  const pdf = path.join(dir, "广告预算PDF资料.pdf");
  await writePdf(
    pdf,
    "PDF budget material\nPDFRULE1688 PDFRULE1688 budget threshold is 1688 yuan and broad ads must pause."
  );

  const pptx = path.join(dir, "广告预算PPT资料.pptx");
  await writePptx(pptx);

  const blankPdf = path.join(dir, "扫描件空白资料.pdf");
  await writePdf(blankPdf, "");

  return {
    markdown,
    pdf,
    pptx,
    blankPdf
  };
}

async function uploadFixture(token, knowledgeBaseId, filePath, title) {
  const form = new FormData();
  const file = new Blob([await import("node:fs/promises").then((fs) => fs.readFile(filePath))], {
    type: mimeTypeFor(filePath)
  });
  form.set("file", file, path.basename(filePath));
  form.set("knowledgeBaseId", knowledgeBaseId);
  form.set("title", title);
  form.set("sensitivity", "public_internal");
  form.set("allowCloudProcessing", "true");

  const result = await request("/documents/upload", token, {
    method: "POST",
    body: form,
    skipJsonHeader: true
  });
  return result.documentId;
}

async function expectForbiddenUpload(token, knowledgeBaseId, filePath) {
  const form = new FormData();
  const file = new Blob([await import("node:fs/promises").then((fs) => fs.readFile(filePath))], {
    type: mimeTypeFor(filePath)
  });
  form.set("file", file, path.basename(filePath));
  form.set("knowledgeBaseId", knowledgeBaseId);
  form.set("title", "readonly should fail");
  form.set("sensitivity", "public_internal");
  form.set("allowCloudProcessing", "true");

  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  assert(response.status === 403, "Expected readonly upload to be rejected");
}

async function waitForDocument(token, documentId, expectedStatus) {
  for (let index = 0; index < 20; index += 1) {
    const result = await request(`/documents/${documentId}`, token);
    if (result.document.status === expectedStatus) {
      return result.document;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const result = await request(`/documents/${documentId}`, token);
  throw new Error(`Expected document ${documentId} to reach ${expectedStatus}, got ${result.document.status}`);
}

function runWorkerOnce() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm --workspace apps/api run worker -- --once"]
      : ["--workspace", "apps/api", "run", "worker", "--", "--once"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit"
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

function assertGroundedCitation(answer, expectedDocumentId, message) {
  assert(!answer.insufficientEvidence, message);
  assert(answer.confidenceLabel === "high" || answer.confidenceLabel === "low", "Expected a grounded confidence label");
  assert(answer.citations.length > 0, "Expected grounded answer to include citations");
  assert(answer.citations.some((citation) => citation.documentId === expectedDocumentId), message);
  assert(
    answer.citations.some((citation) => citation.sourceLabel && citation.chunkId),
    "Expected citations to expose source labels and chunk ids"
  );
}

async function assertPersistedRecordsVisible(token, documentId) {
  const document = await request(`/documents/${documentId}`, token);
  assert(document.document.status === "indexed", "Expected indexed document to remain available");
  const conversations = await request("/conversations", token);
  assert(conversations.conversations.length > 0, "Expected conversations to remain available");
}

async function getDocumentStorageState(documentId) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT d.storage_path,
              count(DISTINCT c.id) AS chunk_count,
              count(DISTINCT e.id) AS embedding_count
       FROM documents d
       LEFT JOIN document_chunks c ON c.document_id = d.id
       LEFT JOIN embeddings e ON e.chunk_id = c.id
       WHERE d.id = $1
       GROUP BY d.storage_path`,
      [documentId]
    );
    assert(result.rows.length === 1, "Expected purge target document to exist");
    assert(Number(result.rows[0].chunk_count) > 0, "Expected purge target to have chunks before purge");
    assert(Number(result.rows[0].embedding_count) > 0, "Expected purge target to have embeddings before purge");
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function assertPurged(documentId, storagePath) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT d.status,
              count(DISTINCT c.id) AS chunk_count,
              count(DISTINCT e.id) AS embedding_count
       FROM documents d
       LEFT JOIN document_chunks c ON c.document_id = d.id
       LEFT JOIN embeddings e ON e.chunk_id = c.id
       WHERE d.id = $1
       GROUP BY d.status`,
      [documentId]
    );
    assert(result.rows.length === 1, "Expected purged document record to remain as history marker");
    assert(result.rows[0].status === "purged", "Expected purge to mark document as purged");
    assert(Number(result.rows[0].chunk_count) === 0, "Expected purge to remove chunks");
    assert(Number(result.rows[0].embedding_count) === 0, "Expected purge to remove embeddings");
  } finally {
    await client.end();
  }

  let exists = true;
  try {
    await access(storagePath);
  } catch {
    exists = false;
  }
  assert(!exists, "Expected purge to remove the original file from local storage");
}

async function request(pathname, token, init = {}) {
  const headers = new Headers(init.headers);
  if (!init.skipJsonHeader && init.body) {
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

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") {
    return "application/pdf";
  }
  if (extension === ".pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "text/markdown";
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writePdf(filePath, text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);
    if (text) {
      doc.fontSize(14).text(text);
    }
    doc.end();
  });
}

async function writePptx(filePath) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText("广告预算 PPT 资料", { x: 0.6, y: 0.5, w: 8, h: 0.5, fontSize: 24, bold: true });
  slide.addText("PPTBLUELOWERBID PPTBLUELOWERBID terms should lower bids. High converting terms keep budget.", {
    x: 0.8,
    y: 1.4,
    w: 9,
    h: 1,
    fontSize: 16
  });
  await pptx.writeFile({ fileName: filePath });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
