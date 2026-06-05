# Knowledge Amazon

面向内部使用的企业级知识库，用于文档导入、RAG 智能问答、引用展示，以及按敏感等级控制 AI 处理策略。

## 本地启动

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run dev
```

API 地址：`http://localhost:4000`

Web 地址：`http://localhost:5173`

## 验证

运行端到端 RAG 检查前，需要先启动 PostgreSQL 和 API：

```powershell
npm run build
npm run lint
npm run test
npm run db:up
# 另开一个终端运行：npm --workspace apps/api run dev
npm run verify:rag
```

## 种子账号

- 管理员：`admin@local.test`
- 成员：`member@local.test`
- 只读用户：`readonly@local.test`
- 所有种子用户的密码：`admin123456`

## 手工验收检查

1. 上传一个真实 PDF，并确认状态达到 `indexed`。
2. 上传一个带可提取文本的真实 PPTX，并确认状态达到 `indexed`。
3. 针对已上传文件中的内容提问，并确认回答带有引用来源。
4. 针对文件外的问题提问，并确认系统返回资料不足。
5. 上传扫描 PDF，并确认系统标记为需要 OCR，或给出清晰失败原因。
6. 将文档标记为 `client_confidential`，确认除非显式启用，否则云端处理保持禁用。
7. 软删除文档，并确认该文档不再参与后续检索。
