import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Live alert rules evaluated against real telemetry + the ML anomaly verdict.
// Mirrors an Alertmanager-style view: firing alerts float to the top.
export default function AlertsView({ telemetry }) {
  const [ml, setMl] = useState(null);
  const t = telemetry?.totals;

  useEffect(() => {
    if (!t) return;
    api.mlPredict({
      rps: t.rps || 0, error_rate: (t.errorPct || 0) / 100,
      latency_ms: t.latency || 0, mem_mb: t.memMB || 0, cpu: t.cpu || 0,
    }).then(setMl).catch(() => setMl(null));
  }, [t?.total]);

  const rules = t ? [
    { name: 'HighErrorRate', desc: 'HTTP 4xx/5xx ratio', sev: 'critical', firing: t.errorPct > 5, value: `${t.errorPct.toFixed(1)}%`, thr: '> 5%' },
    { name: 'HighLatency', desc: 'avg response time', sev: 'warning', firing: t.latency > 500, value: `${t.latency.toFixed(0)}ms`, thr: '> 500ms' },
    { name: 'HighMemory', desc: 'resident memory', sev: 'warning', firing: t.memMB > 200, value: `${t.memMB.toFixed(0)}MB`, thr: '> 200MB' },
    { name: 'DatabaseConnectivity', desc: 'Postgres (RDS) connection', sev: telemetry?.tasksErr === 'error' ? 'critical' : 'warning', firing: telemetry?.tasksErr === 'error' || telemetry?.tasksErr === 'stateless', value: telemetry?.tasksErr || 'connected', thr: 'connected' },
    { name: 'TrafficAnomaly', desc: 'ML anomaly detector', sev: ml?.severity === 'critical' ? 'critical' : 'warning', firing: !!ml?.anomaly, value: ml ? `score ${ml.score}` : '—', thr: `< ${ml?.threshold ?? '?'}` },
  ] : [];

  const firing = rules.filter((r) => r.firing);
  const ok = rules.filter((r) => !r.firing);

  return (
    <>
      <div className="alert-summary">
        <span className="as-item crit">{firing.filter((r) => r.sev === 'critical').length} critical</span>
        <span className="as-item warn">{firing.filter((r) => r.sev === 'warning').length} warning</span>
        <span className="as-item ok">{ok.length} healthy</span>
      </div>

      {!t && <p className="muted center">Loading telemetry…</p>}

      {firing.length > 0 && <h3 className="alert-h">Firing</h3>}
      {firing.map((r) => <AlertCard key={r.name} r={r} />)}

      {ok.length > 0 && <h3 className="alert-h">OK</h3>}
      {ok.map((r) => <AlertCard key={r.name} r={r} />)}
    </>
  );
}

function AlertCard({ r }) {
  const color = !r.firing ? '#22C55E' : r.sev === 'critical' ? '#EC4899' : '#FF8A3D';
  return (
    <div className="alert-card" style={{ borderLeftColor: color }}>
      <div className="alert-dot" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      <div className="alert-main">
        <div className="alert-name">{r.name} <span className="alert-sev" style={{ color }}>{r.firing ? r.sev : 'ok'}</span></div>
        <div className="alert-desc">{r.desc}</div>
      </div>
      <div className="alert-val">
        <b>{r.value}</b>
        <span>{r.thr}</span>
      </div>
    </div>
  );
}
