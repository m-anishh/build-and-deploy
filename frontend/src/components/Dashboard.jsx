import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useTelemetry } from '../hooks/useTelemetry.js';
import AiHealthPanel from './AiHealthPanel.jsx';

const C = {
  orange: '#F59E0B', purple: '#A855F7', blue: '#3B82F6',
  pink: '#EF4444', cyan: '#0EA5E9', green: '#22C55E', grid: '#eef1f7',
};
const axis = { stroke: '#94a3b8', fontSize: 11 };
const tip = { contentStyle: { background: '#ffffff', border: '1px solid #e3e8f1', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 14px #1e293b18' }, labelStyle: { color: '#475569' } };

function Panel({ title, sub, children, span }) {
  return (
    <div className="panel" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <div className="panel-head">
        <h3>{title}</h3>{sub && <span className="panel-sub">{sub}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function fmtUptime(s) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return [h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
}

export default function Dashboard() {
  const d = useTelemetry(3000);

  if (!d) return <p className="muted center">Connecting to telemetry…</p>;

  const t = d.totals || {};
  const statusData = Object.entries(d.byStatus || {}).map(([code, v]) => ({ code, v }));
  const taskData = d.tasks
    ? [
        { name: 'pending', value: d.tasks.by.pending || 0, c: C.orange },
        { name: 'in progress', value: d.tasks.by.in_progress || 0, c: C.blue },
        { name: 'done', value: d.tasks.by.done || 0, c: C.green },
      ].filter((x) => x.value > 0)
    : [];

  return (
    <div className="dashboard">
      {/* KPI + live traffic + status codes */}
      <Panel title="Key metrics" sub="live">
        <div className="kpis">
          <Kpi color={C.orange} value={fmtInt(t.total)} label="Total requests" />
          <Kpi color={C.purple} value={`${(t.latency || 0).toFixed(1)} ms`} label="Avg response time" />
          <Kpi color={C.blue} value={`${(t.errorPct || 0).toFixed(1)}%`} label="Error rate" />
          <Kpi color={C.cyan} value={fmtUptime(d.info?.uptime)} label="Uptime" />
        </div>
      </Panel>

      <Panel title="Request rate" sub="req/s (live)">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d.series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gRps" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.5} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gEps" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.pink} stopOpacity={0.5} />
                <stop offset="100%" stopColor={C.pink} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="t" {...axis} tick={{ fontSize: 9, fill: '#5b6b8c' }} minTickGap={24} />
            <YAxis {...axis} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="rps" name="req/s" stroke={C.blue} fill="url(#gRps)" strokeWidth={2} />
            <Area type="monotone" dataKey="eps" name="err/s" stroke={C.pink} fill="url(#gEps)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Requests by status" sub="count">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={statusData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" {...axis} />
            <YAxis type="category" dataKey="code" {...axis} width={44} />
            <Tooltip {...tip} cursor={{ fill: '#ffffff08' }} />
            <Bar dataKey="v" name="requests" radius={[0, 4, 4, 0]}>
              {statusData.map((e, i) => (
                <Cell key={i} fill={/^2/.test(e.code) ? C.green : /^4/.test(e.code) ? C.orange : /^5/.test(e.code) ? C.pink : C.blue} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* errors by route + task donut + latency/mem */}
      <Panel title="Traffic by route" sub="status class">
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={d.routeRows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" {...axis} />
            <YAxis type="category" dataKey="route" {...axis} width={80} tick={{ fontSize: 10, fill: '#8fa0c0' }} />
            <Tooltip {...tip} cursor={{ fill: '#ffffff08' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="s2xx" stackId="a" name="2xx" fill={C.green} />
            <Bar dataKey="s4xx" stackId="a" name="4xx" fill={C.orange} />
            <Bar dataKey="s5xx" stackId="a" name="5xx" fill={C.pink} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Task status" sub={d.tasks ? `${d.tasks.total} total` : (d.tasksErr === 'stateless' ? 'no DB' : '')}>
        {taskData.length ? (
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={taskData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3}>
                {taskData.map((e, i) => <Cell key={i} fill={e.c} />)}
              </Pie>
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <text x="50%" y="47%" textAnchor="middle" fill="#1e293b" fontSize="24" fontWeight="700">{d.tasks.total}</text>
              <text x="50%" y="58%" textAnchor="middle" fill="#64748b" fontSize="11">tasks</text>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted center">{d.tasksErr === 'stateless' ? 'Database not connected' : 'No tasks yet'}</p>
        )}
      </Panel>

      <Panel title="Latency & memory" sub="ms · MB">
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={d.series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#5b6b8c' }} minTickGap={24} />
            <YAxis {...axis} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="latency" name="avg ms" stroke={C.purple} dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="mem" name="mem MB" stroke={C.cyan} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <AiHealthPanel totals={t} series={d.series} />
    </div>
  );
}

function Kpi({ color, value, label }) {
  return (
    <div className="kpi">
      <span className="kpi-bar" style={{ background: color }} />
      <div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
}

function fmtInt(n) {
  if (n == null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}
