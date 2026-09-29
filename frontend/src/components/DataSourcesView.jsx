import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Live connectivity status of every backend datasource this app talks to.
export default function DataSourcesView() {
  const [s, setS] = useState({});

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const next = {};
      try { const r = await api.ready(); next.pg = { ok: r.database === 'connected', detail: r.database }; }
      catch { next.pg = { ok: false, detail: 'unreachable' }; }
      try { const r = await api.promRange('up', 5); next.prom = { ok: (r?.data?.result?.length || 0) > 0, detail: `${r?.data?.result?.length || 0} series` }; }
      catch { next.prom = { ok: false, detail: 'not connected' }; }
      try { const r = await api.mlInfo(); next.ml = { ok: !!r.ready, detail: `model: ${r.source} (${r.n_samples})` }; }
      catch { next.ml = { ok: false, detail: 'offline' }; }
      if (alive) setS(next);
    };
    check();
    const id = setInterval(check, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const rows = [
    { key: 'pg', name: 'PostgreSQL (AWS RDS)', type: 'database', icon: '⛁' },
    { key: 'prom', name: 'Prometheus', type: 'metrics', icon: '◎' },
    { key: 'ml', name: 'ML anomaly service', type: 'inference', icon: '✦' },
  ];

  return (
    <div className="ds-grid">
      {rows.map((r) => {
        const st = s[r.key];
        const ok = st?.ok;
        const color = st == null ? '#5b6b8c' : ok ? '#22C55E' : '#EC4899';
        return (
          <div key={r.key} className="ds-card">
            <div className="ds-ico">{r.icon}</div>
            <div className="ds-main">
              <div className="ds-name">{r.name}</div>
              <div className="ds-type">{r.type}</div>
            </div>
            <div className="ds-status">
              <span className="ds-dot" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
              <div>
                <div style={{ color }}>{st == null ? 'checking…' : ok ? 'connected' : 'down'}</div>
                <div className="ds-detail">{st?.detail || ''}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
