import {
  Home, ScrollText, BarChart3, Waypoints, MonitorSmartphone, Workflow,
  LayoutDashboard, Layers, FileBarChart, BellRing, Zap, Database, KeyRound,
  CheckSquare, Sparkles, FileSearch,
} from 'lucide-react';

const NAV = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'logs', label: 'Logs', Icon: ScrollText },
  { id: 'metrics', label: 'Metrics', Icon: BarChart3 },
  { id: 'traces', label: 'Traces', Icon: Waypoints },
  { id: 'rum', label: 'RUM', Icon: MonitorSmartphone },
  { id: 'pipelines', label: 'Pipelines', Icon: Workflow },
  { id: 'dashboards', label: 'Dashboards', Icon: LayoutDashboard },
  { id: 'streams', label: 'Streams', Icon: Layers },
  { id: 'reports', label: 'Reports', Icon: FileBarChart },
  { id: 'alerts', label: 'Alerts', Icon: BellRing },
  { id: 'actions', label: 'Actions', Icon: Zap },
  { id: 'datasources', label: 'Data sources', Icon: Database },
  { id: 'iam', label: 'IAM', Icon: KeyRound },
];

const APP_NAV = [
  { id: 'loganalysis', label: 'Log Analysis', Icon: FileSearch },
  { id: 'tasks', label: 'Tasks', Icon: CheckSquare },
  { id: 'ai', label: 'AI', Icon: Sparkles },
];

export default function Layout({ view, setView, user, onLogout, children }) {
  const label = [...NAV, ...APP_NAV].find((n) => n.id === view)?.label;
  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-brand" aria-label="manishOps">◆</div>
        <nav className="rail-nav">
          {NAV.map((n) => <RailBtn key={n.id} n={n} view={view} setView={setView} />)}
          <div className="rail-sep" />
          {APP_NAV.map((n) => <RailBtn key={n.id} n={n} view={view} setView={setView} />)}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">
            <span className="crumb-cluster">Manish</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-view">{label}</span>
          </div>
          <div className="topbar-right">
            <span className="pill-time">Past 15m</span>
            <a className="ghlink" href="https://github.com/m-anishh/build-and-deploy" target="_blank" rel="noreferrer">source ↗</a>
            {user && (
              <div className="user-menu">
                <span className="user-avatar" title={user.email}>{(user.name || user.email || '?')[0].toUpperCase()}</span>
                <button className="btn ghost user-logout" onClick={onLogout}>Sign out</button>
              </div>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function RailBtn({ n, view, setView }) {
  const { Icon } = n;
  return (
    <button className={`rail-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)} aria-label={n.label}>
      <span className="rail-ico"><Icon size={22} strokeWidth={1.8} /></span>
      <span className="rail-label">{n.label}</span>
    </button>
  );
}
