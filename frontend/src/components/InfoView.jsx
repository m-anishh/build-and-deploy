// Clean informational page for capabilities not yet wired to a data source.
// Presents what the section will show + how to enable it (roadmap, not broken).
const PAGES = {
  traces: {
    title: 'Traces', icon: '⋔',
    desc: 'Distributed tracing across the API, database and ML service.',
    enable: 'Instrument with OpenTelemetry SDK → export to Tempo/Jaeger; add an OTel collector.',
    items: ['Request spans (API → DB → ML)', 'Latency waterfall', 'Error traces', 'Service dependency map'],
  },
  rum: {
    title: 'Real User Monitoring', icon: '◉',
    desc: 'Front-end performance and user experience from the browser.',
    enable: 'Add a RUM script to the dashboard → collect Core Web Vitals + JS errors.',
    items: ['Page load / LCP / CLS', 'JS error rate', 'Sessions & geo', 'Slow resources'],
  },
  streams: {
    title: 'Streams', icon: '≋',
    desc: 'Ingested data streams (logs, metrics, traces) and their schemas.',
    enable: 'Back with a stream store (Kafka / OpenObserve) → list streams + retention.',
    items: ['Stream list & size', 'Ingestion rate', 'Schema / fields', 'Retention'],
  },
  actions: {
    title: 'Actions', icon: '⚙',
    desc: 'Automated remediation and scheduled jobs.',
    enable: 'Wire to CronJobs / webhooks → run actions on alert (scale, restart, notify).',
    items: ['Auto-scale on load', 'Restart on crashloop', 'Scheduled reports', 'On-alert webhooks'],
  },
  iam: {
    title: 'IAM', icon: '⚿',
    desc: 'Access control — Kubernetes RBAC + AWS IAM/OIDC.',
    enable: 'Reflects k8s-rbac.yaml (ServiceAccount/Role) + the GitHub OIDC deploy role.',
    items: ['ServiceAccount: devops-app', 'Role: pods/configmaps/secrets (read)', 'GitHub OIDC deploy role', 'EKS access entry (namespaced)'],
  },
};

export default function InfoView({ id }) {
  const p = PAGES[id] || { title: id, icon: '◇', desc: '', enable: '', items: [] };
  return (
    <div className="info-view">
      <div className="info-head">
        <span className="info-ico">{p.icon}</span>
        <div>
          <h2>{p.title}</h2>
          <p className="muted">{p.desc}</p>
        </div>
      </div>
      <div className="info-grid">
        {p.items.map((it) => (
          <div key={it} className="info-item">{it}</div>
        ))}
      </div>
      {p.enable && <div className="view-note">Enable: {p.enable}</div>}
    </div>
  );
}
