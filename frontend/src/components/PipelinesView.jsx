// CI/CD pipeline visualization — reflects .github/workflows/github-actions-ci-cd.yml
const STAGES = [
  { name: 'Test & Lint', tool: 'jest + eslint', trigger: 'push / PR' },
  { name: 'Security Scan', tool: 'Trivy + npm audit', trigger: 'push / PR' },
  { name: 'Build & Push', tool: 'docker buildx → GHCR', trigger: 'push' },
  { name: 'DB Migrate', tool: 'Job: scripts/migrate.js', trigger: 'main' },
  { name: 'Deploy', tool: 'OIDC → kubectl (EKS)', trigger: 'main' },
  { name: 'Rollback', tool: 'kubectl rollout undo', trigger: 'on failure' },
  { name: 'Notify', tool: 'Slack webhook', trigger: 'always' },
];

export default function PipelinesView() {
  return (
    <>
      <div className="view-note">Continuous delivery · GitHub Actions · OIDC to AWS (no static keys)</div>
      <div className="pipe">
        {STAGES.map((s, i) => (
          <div key={s.name} className="pipe-wrap">
            <div className="pipe-node">
              <div className="pipe-num">{i + 1}</div>
              <div className="pipe-name">{s.name}</div>
              <div className="pipe-tool">{s.tool}</div>
              <div className="pipe-trigger">{s.trigger}</div>
            </div>
            {i < STAGES.length - 1 && <div className="pipe-arrow">→</div>}
          </div>
        ))}
      </div>
      <a className="btn primary pipe-link" href="https://github.com/m-anishh/build-and-deploy/actions" target="_blank" rel="noreferrer">
        View runs on GitHub Actions ↗
      </a>
    </>
  );
}
