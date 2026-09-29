// Hub linking the available dashboards.
const CARDS = [
  { id: 'metrics', title: 'App Metrics', desc: 'Live request rate, latency, status codes, memory — from the app /metrics.', tag: 'live' },
  { id: 'kubernetes', title: 'Kubernetes / Namespaces', desc: 'CPU & memory per namespace, from limits/requests, storage, restarts.', tag: 'PromQL' },
  { id: 'demo', title: 'Prometheus (infra)', desc: 'Node CPU/mem/disk/network, targets, load — against a Prometheus datasource.', tag: 'PromQL' },
];

export default function DashboardsHub({ setView }) {
  return (
    <div className="hub-grid">
      {CARDS.map((c) => (
        <button key={c.id} className="hub-card" onClick={() => setView(c.id)}>
          <div className="hub-tag">{c.tag}</div>
          <div className="hub-title">{c.title}</div>
          <div className="hub-desc">{c.desc}</div>
          <div className="hub-open">Open →</div>
        </button>
      ))}
    </div>
  );
}
