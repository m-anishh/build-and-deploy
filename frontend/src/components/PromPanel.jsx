import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../api.js';

const PALETTE = ['#F59E0B', '#EAB308', '#EF4444', '#3B82F6', '#A855F7', '#22C55E', '#0EA5E9', '#EC4899'];
const tip = { contentStyle: { background: '#ffffff', border: '1px solid #e3e8f1', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 14px #1e293b18' }, labelStyle: { color: '#475569' } };

// Series label from Prometheus metric labels (prefer namespace/pod).
function seriesName(m) {
  return m.namespace || m.pod || m.instance || m.persistentvolumeclaim || Object.values(m)[0] || 'value';
}

function transform(result) {
  const rows = new Map();
  const keys = [];
  result.forEach((s) => {
    const name = seriesName(s.metric);
    keys.push(name);
    s.values.forEach(([ts, v]) => {
      const t = new Date(ts * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
      if (!rows.has(t)) rows.set(t, { t });
      rows.get(t)[name] = Number(v);
    });
  });
  return { data: [...rows.values()], keys: [...new Set(keys)] };
}

export default function PromPanel({ title, query, unit = '', kind = 'area', minutes = 15 }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    const run = () => {
      api.promRange(query, minutes)
        .then((res) => {
          if (!alive) return;
          const result = res?.data?.result || [];
          if (!result.length) return setState({ status: 'empty' });
          setState({ status: 'ok', ...transform(result) });
        })
        .catch(() => alive && setState({ status: 'down' }));
    };
    run();
    const id = setInterval(run, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [query, minutes]);

  const Chart = kind === 'line' ? LineChart : AreaChart;

  return (
    <div className="panel">
      <div className="panel-head"><h3>{title}</h3><span className="panel-sub">{unit}</span></div>
      <div className="panel-body">
        {state.status === 'ok' ? (
          <ResponsiveContainer width="100%" height={200}>
            <Chart data={state.data} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#eef1f7" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#94a3b8' }} minTickGap={28} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {state.keys.map((k, i) =>
                kind === 'line' ? (
                  <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={2} />
                ) : (
                  <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.28} strokeWidth={1.5} />
                )
              )}
            </Chart>
          </ResponsiveContainer>
        ) : (
          <div className="prom-empty" title={query}>
            <div className="prom-empty-ico">{state.status === 'loading' ? '⋯' : '⌁'}</div>
            <div className="prom-empty-title">
              {state.status === 'down' ? 'No datasource' : state.status === 'empty' ? 'No data' : 'Loading…'}
            </div>
            <div className="prom-empty-sub">
              {state.status === 'down'
                ? 'Prometheus not connected'
                : state.status === 'empty'
                ? 'needs kube-state-metrics'
                : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
