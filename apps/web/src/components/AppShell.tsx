import type { ReactNode } from "react";
import { BookOpen, Bot, ClipboardList, Database, LogOut, Search, Settings, UserCircle } from "lucide-react";
import type { User } from "@knowledge-amazon/shared";

export type ViewKey = "dashboard" | "knowledge" | "chat" | "jobs" | "settings";

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: "dashboard", label: "工作台", icon: <Database size={18} /> },
  { key: "knowledge", label: "知识库", icon: <BookOpen size={18} /> },
  { key: "chat", label: "智能问答", icon: <Bot size={18} /> },
  { key: "jobs", label: "任务队列", icon: <ClipboardList size={18} /> },
  { key: "settings", label: "设置", icon: <Settings size={18} /> }
];

export function AppShell({
  user,
  view,
  onViewChange,
  onLogout,
  children
}: {
  user: User;
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">K</div>
          <div>
            <strong>企业知识库</strong>
            <span>Amazon Ops</span>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={view === item.key ? "nav-item nav-item-active" : "nav-item"}
              onClick={() => onViewChange(item.key)}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="searchbox">
            <Search size={17} />
            <input placeholder="搜索资料、问题、客户或项目" />
          </div>
          <div className="user-chip">
            <UserCircle size={18} />
            <span>{user.name}</span>
            <button type="button" title="退出登录" onClick={onLogout}>
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
