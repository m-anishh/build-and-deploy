import { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../api.js';

const SEV = { critical: '#E11D48', high: '#EA580C', medium: '#CA8A04' };
const VERDICT = { healthy: '#16A34A', warning: '#EA580C', critical: '#E11D48' };
const LVL = { fatal: '#E11D48', error: '#EF4444', warn: '#EA580C', info: '#3B82F6', debug: '#94A3B8' };

const SAMPLE = `2026-09-29T10:12:01Z INFO Started server on :8080
2026-09-29T10:12:44Z WARN high memory usage 82%
2026-09-29T10:13:02Z ERROR connection refused: db:5432
2026-09-29T10:13:03Z ERROR Liveness probe failed: HTTP 500
2026-09-29T10:13:20Z Back-off restarting failed container app
2026-09-29T10:13:41Z ERROR OOMKilled container exceeded memory limit`;

export default function LogAnalysisView() {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (input) => {
    const logs = input ?? text;
    if (!logs.trim()) return;
    setBusy(true); setErr('');
    try { setRes(await api.analyzeLogs(logs)); }
    catch (e) { setErr(e.message); setRes(null); }
    finally { setBusy(false); }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setText(String(r.result)); run(String(r.result)); };
    r.readAsText(f);
  };

  return (
    <>
      <div className="view-note">Import Kubernetes / container logs (paste or upload) — parsed and analyzed on the server.</div>

      <div className="la-input">
        <textarea
          className="la-textarea"
          placeholder="Paste `kubectl logs ...` output here (plain or JSON lines)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="la-actions">
          <button className="btn primary" onClick={() => run()} disabled={busy}>{busy ? 'Analyzing…' : 'Analyze'}</button>
          <label className="btn ghost la-upload">Upload .log<input type="file" accept=".log,.txt,.json,text/*" onChange={onFile} hidden /></label>
          <button className="btn ghost" onClick={() => { setText(SAMPLE); run(SAMPLE); }}>Try sample</button>
        </div>
        {err && <div className="banner err">{err}</div>}
      </div>

      {res && (
        <>
          <div className="la-verdict" style={{ borderColor: VERDICT[res.verdict], color: VERDICT[res.verdict] }}>
            <span className="la-dot" style={{ background: VERDICT[res.verdict], boxShadow: `0 0 14px ${VERDICT[res.verdict]}` }} />
            {res.verdict === 'healthy' ? 'No serious issues detected' : `${res.verdict.toUpperCase()} — issues detected`}
          </div>

          <div className="home-tiles">
            <Tile c="#3B82F6" v={res.total} l="Log lines" />
            <Tile c="#EF4444" v={res.errorCount} l="Errors" />
            <Tile c="#EA580C" v={`${res.errorRate}%`} l="Error rate" />
            <Tile c="#CA8A04" v={res.warnCount} l="Warnings" />
            <Tile c="#8B5CF6" v={res.detected.length} l="Issue types" />
            <Tile c="#22C55E" v={Object.values(res.byLevel).reduce((a, b) => a + b, 0)} l="Parsed" />
          </div>

          <div className="dashboard" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="panel">
              <div className="panel-head"><h3>Detected issues</h3></div>
              <div className="panel-body">
                {res.detected.length === 0 ? <p className="muted center">None 🎉</p> :
                  res.detected.map((d) => (
                    <div key={d.issue} className="la-issue">
                      <span className="la-issue-dot" style={{ background: SEV[d.sev] }} />
                      <span className="la-issue-name">{d.issue}</span>
                      <span className="la-issue-sev" style={{ color: SEV[d.sev] }}>{d.sev}</span>
                      <span className="la-issue-count">×{d.count}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Level breakdown</h3></div>
              <div className="panel-body">
                {Object.entries(res.byLevel).filter(([, v]) => v > 0).map(([lv, v]) => (
                  <div key={lv} className="la-bar-row">
                    <span className="la-bar-label">{lv}</span>
                    <div className="la-bar-track"><div className="la-bar-fill" style={{ width: `${(v / res.total) * 100}%`, background: LVL[lv] }} /></div>
                    <span className="la-bar-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {res.timeline.length > 1 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head"><h3>Errors over time</h3></div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={res.timeline} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#eef1f7" vertical={false} />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#94a3b8' }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e3e8f1', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="errors" stroke="#EF4444" fill="#EF444422" strokeWidth={2} />
                    <Area type="monotone" dataKey="total" stroke="#3B82F6" fill="#3B82F611" strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h3>Top repeated messages</h3></div>
            <div className="panel-body">
              {res.topMessages.map((m, i) => (
                <div key={i} className="la-msg">
                  <span className="la-msg-count" style={{ color: LVL[m.level] }}>×{m.count}</span>
                  <code className="la-msg-text">{m.sample}</code>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Tile({ c, v, l }) {
  return (
    <div className="home-tile">
      <span className="ht-bar" style={{ background: c }} />
      <div className="ht-value">{v}</div>
      <div className="ht-label">{l}</div>
    </div>
  );
}
