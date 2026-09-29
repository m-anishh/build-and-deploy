import { useEffect, useState } from 'react';
import { api } from '../api.js';

const LEVELS = ['', 'info', 'warn', 'error', 'debug'];
const LVL_COLOR = { info: '#3B82F6', warn: '#FF8A3D', error: '#EC4899', debug: '#8fa0c0', fatal: '#EC4899' };

function line(l) {
  // Compose a readable message from a pino record.
  if (l.req) {
    const code = l.res?.statusCode;
    return `${l.req.method} ${l.req.url} → ${code ?? '?'} (${l.responseTime ?? '?'}ms)`;
  }
  return l.msg || JSON.stringify(l);
}

export default function LogsView() {
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [paused, setPaused] = useState(false);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (paused) return;
      api.logs(300, level)
        .then((r) => { if (alive) { setLogs(r.items || []); setDown(false); } })
        .catch(() => alive && setDown(true));
    };
    load();
    const id = setInterval(load, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [level, paused]);

  const filtered = logs.filter((l) => !q || line(l).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="logs-bar">
        <div className="filters">
          {LEVELS.map((lv) => (
            <button key={lv || 'all'} className={`chip ${level === lv ? 'on' : ''}`} onClick={() => setLevel(lv)}>
              {lv || 'all'}
            </button>
          ))}
        </div>
        <input className="in" placeholder="search logs…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`btn ${paused ? 'primary' : 'ghost'}`} onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
      </div>

      {down ? (
        <div className="banner err">Cannot reach /api/logs — is the backend running?</div>
      ) : (
        <div className="log-table">
          {filtered.length === 0 ? (
            <p className="muted center">No log entries.</p>
          ) : (
            filtered.map((l, i) => (
              <div key={i} className="log-row">
                <span className="log-time">{(l.time || '').split('T')[1]?.replace('Z', '') || ''}</span>
                <span className="log-level" style={{ color: LVL_COLOR[l.level] || '#8fa0c0', borderColor: (LVL_COLOR[l.level] || '#8fa0c0') + '55' }}>
                  {(l.level || 'info').toUpperCase()}
                </span>
                <span className="log-msg">{line(l)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
