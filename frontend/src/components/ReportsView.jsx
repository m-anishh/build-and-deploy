// Generates a live health report from real telemetry and lets you export it.
export default function ReportsView({ telemetry }) {
  const t = telemetry?.totals;
  const info = telemetry?.info;

  const report = {
    generated_at: new Date().toISOString(),
    service: info?.service,
    version: info?.version,
    environment: info?.env,
    uptime_seconds: info?.uptime,
    database: info?.database,
    totals: t && {
      total_requests: t.total,
      error_rate_pct: +(t.errorPct || 0).toFixed(2),
      avg_latency_ms: +(t.latency || 0).toFixed(1),
      memory_mb: +(t.memMB || 0).toFixed(1),
      requests_per_sec: +(t.rps || 0).toFixed(2),
    },
    tasks: telemetry?.tasks && { total: telemetry.tasks.total, by_status: telemetry.tasks.by },
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manishops-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="view-note">System health report · live telemetry</div>
      <div className="report-actions">
        <button className="btn primary" onClick={download}>⬇ Export JSON</button>
      </div>
      <pre className="report-pre">{JSON.stringify(report, null, 2)}</pre>
    </>
  );
}
