import { useEffect, useState } from 'react';
import Layout from './components/Layout.jsx';
import AuthView from './components/AuthView.jsx';
import HomeView from './components/HomeView.jsx';
import Dashboard from './components/Dashboard.jsx';
import DashboardsHub from './components/DashboardsHub.jsx';
import KubernetesView from './components/KubernetesView.jsx';
import DemoView from './components/DemoView.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import AiHealthPanel from './components/AiHealthPanel.jsx';
import LogsView from './components/LogsView.jsx';
import LogAnalysisView from './components/LogAnalysisView.jsx';
import AlertsView from './components/AlertsView.jsx';
import DataSourcesView from './components/DataSourcesView.jsx';
import PipelinesView from './components/PipelinesView.jsx';
import ReportsView from './components/ReportsView.jsx';
import InfoView from './components/InfoView.jsx';
import { useTelemetry } from './hooks/useTelemetry.js';
import { api, token } from './api.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState('home');
  const [, setDbDown] = useState(false);
  const telemetry = useTelemetry(user ? 3000 : null);

  // Restore session on load.
  useEffect(() => {
    // OAuth callback hands the JWT back via ?token=…
    const q = new URLSearchParams(window.location.search);
    const urlToken = q.get('token');
    if (urlToken) { token.set(urlToken); window.history.replaceState({}, '', window.location.pathname); }
    if (!token.get()) { setChecking(false); return; }
    api.me().then((r) => setUser(r.user)).catch(() => token.clear()).finally(() => setChecking(false));
  }, []);

  const logout = () => { token.clear(); setUser(null); setView('home'); };

  if (checking) return <div className="boot">Loading…</div>;
  if (!user) return <AuthView onAuthed={setUser} />;

  return (
    <Layout view={view} setView={setView} user={user} onLogout={logout}>
      {view === 'home' && <HomeView telemetry={telemetry} setView={setView} />}
      {view === 'metrics' && <Dashboard />}
      {view === 'dashboards' && <DashboardsHub setView={setView} />}
      {view === 'kubernetes' && <KubernetesView />}
      {view === 'demo' && <DemoView />}
      {view === 'logs' && <LogsView />}
      {view === 'loganalysis' && <LogAnalysisView />}
      {view === 'alerts' && <AlertsView telemetry={telemetry} />}
      {view === 'reports' && <ReportsView telemetry={telemetry} />}
      {view === 'datasources' && <DataSourcesView />}
      {view === 'pipelines' && <PipelinesView />}
      {view === 'tasks' && <TaskBoard onDbState={setDbDown} />}
      {view === 'ai' && (
        <div className="dashboard">
          <AiHealthPanel totals={telemetry?.totals} series={telemetry?.series} />
        </div>
      )}
      {['traces', 'rum', 'streams', 'actions', 'iam'].includes(view) && <InfoView id={view} />}
    </Layout>
  );
}
