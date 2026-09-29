import { api } from '../api.js';

const fmtInt = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
function fmtUptime(s) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? h + 'h ' : ''}${m}m`;
}

export default function HomeView({ telemetry, setView }) {
  const t = telemetry?.totals;
  const info = telemetry?.info;

  const tiles = [
    { label: 'Total requests', value: fmtInt(t?.total), c: '#FF8A3D' },
    { label: 'Avg latency', value: t ? `${t.latency.toFixed(0)}ms` : '—', c: '#A855F7' },
    { label: 'Error rate', value: t ? `${t.errorPct.toFixed(1)}%` : '—', c: '#3B82F6' },
    { label: 'Uptime', value: fmtUptime(info?.uptime), c: '#22D3EE' },
    { label: 'Tasks', value: telemetry?.tasks?.total ?? '—', c: '#22C55E' },
    { label: 'Version', value: info?.version || '—', c: '#EC4899' },
  ];

  const quick = [
    { id: 'metrics', label: 'App Metrics', desc: 'live request/latency/status charts' },
    { id: 'kubernetes', label: 'Kubernetes', desc: 'namespace CPU/memory/storage' },
    { id: 'logs', label: 'Logs', desc: 'live structured log stream' },
    { id: 'alerts', label: 'Alerts', desc: 'firing rules over telemetry + ML' },
    { id: 'datasources', label: 'Data sources', desc: 'Postgres · Prometheus · ML status' },
    { id: 'pipelines', label: 'Pipelines', desc: 'CI/CD stages' },
  ];

  return (
    <>
      <div className="home-hero">
        <h2>Overview</h2>
        <p className="muted">Unified monitoring across services, infrastructure and delivery.</p>
      </div>

      <div className="home-tiles">
        {tiles.map((x) => (
          <div key={x.label} className="home-tile">
            <span className="ht-bar" style={{ background: x.c }} />
            <div className="ht-value">{x.value}</div>
            <div className="ht-label">{x.label}</div>
          </div>
        ))}
      </div>

      <h3 className="alert-h">Explore</h3>
      <div className="home-links">
        {quick.map((q) => (
          <button key={q.id} className="home-link" onClick={() => setView(q.id)}>
            <div className="hl-title">{q.label} →</div>
            <div className="hl-desc">{q.desc}</div>
          </button>
        ))}
      </div>
    </>
  );
}
