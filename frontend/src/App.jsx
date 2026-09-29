import { useState } from 'react';
import Layout from './components/Layout.jsx';
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

export default function App() {
  const [view, setView] = useState('home');
  const [, setDbDown] = useState(false);
  const telemetry = useTelemetry(3000);

  return (
    <Layout view={view} setView={setView} env={telemetry?.info?.env || 'production'}>
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
