import { useEffect, useState } from "react";
import type { DocumentRecord, KnowledgeBase } from "@knowledge-amazon/shared";
import { AppShell, type ViewKey } from "./components/AppShell";
import { ChatView } from "./components/ChatView";
import { Dashboard } from "./components/Dashboard";
import { KnowledgeBaseView } from "./components/KnowledgeBaseView";
import { Settings } from "./components/Settings";
import { TaskQueue } from "./components/TaskQueue";
import { useSession } from "./state";
import type { DashboardSummary, JobRecord } from "./api";

export function App() {
  const session = useSession();
  const [view, setView] = useState<ViewKey>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!session.isAuthenticated) {
      return;
    }

    const [dashboardResult, kbResult, jobsResult] = await Promise.all([
      session.api.dashboard(),
      session.api.knowledgeBases(),
      session.api.jobs()
    ]);
    setDashboard(dashboardResult);
    setKnowledgeBases(kbResult.knowledgeBases);
    setJobs(jobsResult.jobs);
    const nextKbId = selectedKbId || kbResult.knowledgeBases[0]?.id || "";
    setSelectedKbId(nextKbId);
    if (nextKbId) {
      setDocuments((await session.api.documents(nextKbId)).documents);
    }
  }

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "加载失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isAuthenticated]);

  if (!session.isAuthenticated) {
    return <LoginScreen onLogin={session.setToken} api={session.api} />;
  }

  return (
    <AppShell user={session.user!} view={view} onViewChange={setView} onLogout={() => session.setToken(null, null)}>
      {error && <div className="notice notice-error">{error}</div>}
      {view === "dashboard" && <Dashboard dashboard={dashboard} documents={documents} jobs={jobs} />}
      {view === "knowledge" && (
        <KnowledgeBaseView
          api={session.api}
          knowledgeBases={knowledgeBases}
          selectedKbId={selectedKbId}
          documents={documents}
          onSelectKb={async (id) => {
            setSelectedKbId(id);
            setDocuments((await session.api.documents(id)).documents);
          }}
          onRefresh={refresh}
        />
      )}
      {view === "chat" && <ChatView api={session.api} knowledgeBases={knowledgeBases} selectedKbId={selectedKbId} />}
      {view === "jobs" && <TaskQueue api={session.api} jobs={jobs} onRefresh={refresh} />}
      {view === "settings" && <Settings />}
    </AppShell>
  );
}

function LoginScreen({
  api,
  onLogin
}: {
  api: ReturnType<typeof useSession>["api"];
  onLogin: (token: string | null, user: ReturnType<typeof useSession>["user"]) => void;
}) {
  const [email, setEmail] = useState("admin@local.test");
  const [password, setPassword] = useState("admin123456");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">K</div>
        <h1>企业知识库</h1>
        <p>内部资料入库、智能问答、引用溯源。</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const result = await api.login(email, password);
              onLogin(result.token, result.user);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "登录失败");
            }
          }}
        >
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <div className="notice notice-error">{error}</div>}
          <button type="submit">登录工作台</button>
        </form>
      </section>
    </main>
  );
}
