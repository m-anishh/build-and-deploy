// Log analysis engine. Accepts raw log text (e.g. `kubectl logs` output, plain
// or JSON lines) and returns a structured analysis: level breakdown, error
// timeline, top repeated messages, and detected Kubernetes/runtime issues.

const LEVEL_RE = /\b(FATAL|ERROR|ERR|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i;
const TS_RE =
  /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)|(\d{2}:\d{2}:\d{2})/;

// Known failure signatures → human-readable issue + severity.
const PATTERNS = [
  { re: /OOMKilled|out of memory|cannot allocate memory/i, issue: 'Out of memory (OOMKilled)', sev: 'critical' },
  { re: /CrashLoopBackOff|Back-?off restarting failed container/i, issue: 'Container crash loop', sev: 'critical' },
  { re: /ImagePullBackOff|ErrImagePull|manifest unknown/i, issue: 'Image pull failure', sev: 'critical' },
  { re: /FailedScheduling|Insufficient (cpu|memory)|node\(s\) had/i, issue: 'Scheduling failure (insufficient resources)', sev: 'high' },
  { re: /Liveness probe failed|Readiness probe failed/i, issue: 'Health probe failing', sev: 'high' },
  { re: /connection refused|ECONNREFUSED/i, issue: 'Connection refused', sev: 'high' },
  { re: /timeout|ETIMEDOUT|context deadline exceeded/i, issue: 'Timeouts', sev: 'medium' },
  { re: /panic:|goroutine \d+ \[|stack trace/i, issue: 'Panic / stack trace', sev: 'critical' },
  { re: /(Unhandled|Uncaught).*(Exception|Rejection)|Traceback \(most recent/i, issue: 'Unhandled exception', sev: 'high' },
  { re: /\b5\d{2}\b.*(error|Internal Server)/i, issue: 'HTTP 5xx errors', sev: 'high' },
  { re: /permission denied|forbidden|401|403/i, issue: 'Permission / auth errors', sev: 'medium' },
  { re: /disk (full|pressure)|no space left/i, issue: 'Disk pressure', sev: 'high' },
];

function detectLevel(line) {
  // JSON logs first
  if (line.trimStart().startsWith('{')) {
    try {
      const o = JSON.parse(line);
      const lvl = (o.level || o.severity || o.lvl || '').toString().toUpperCase();
      if (lvl) return normLevel(lvl);
    } catch { /* fall through */ }
  }
  const m = line.match(LEVEL_RE);
  return m ? normLevel(m[1].toUpperCase()) : 'info';
}

function normLevel(l) {
  if (l.startsWith('FATAL')) return 'fatal';
  if (l.startsWith('ERR')) return 'error';
  if (l.startsWith('WARN')) return 'warn';
  if (l.startsWith('DEBUG')) return 'debug';
  if (l.startsWith('TRACE')) return 'debug';
  return 'info';
}

// Normalize a message so near-identical lines group together.
function fingerprint(line) {
  return line
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, '<ts>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, '<uuid>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function analyze(text) {
  const lines = String(text || '').split('\n').filter((l) => l.trim());
  const byLevel = { fatal: 0, error: 0, warn: 0, info: 0, debug: 0 };
  const groups = new Map();
  const issues = new Map();
  const timeline = new Map(); // minute bucket -> {errors,total}
  let firstTs = null, lastTs = null;

  for (const line of lines) {
    const level = detectLevel(line);
    byLevel[level] = (byLevel[level] || 0) + 1;
    const isErr = level === 'error' || level === 'fatal';

    // group repeated messages
    const fp = fingerprint(line);
    if (!groups.has(fp)) groups.set(fp, { sample: line.slice(0, 200), count: 0, level });
    groups.get(fp).count++;

    // pattern detection
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        if (!issues.has(p.issue)) issues.set(p.issue, { issue: p.issue, sev: p.sev, count: 0 });
        issues.get(p.issue).count++;
      }
    }

    // timeline
    const tsm = line.match(TS_RE);
    if (tsm) {
      const ts = tsm[0];
      if (!firstTs) firstTs = ts;
      lastTs = ts;
      const bucket = ts.slice(0, 16); // to the minute
      if (!timeline.has(bucket)) timeline.set(bucket, { t: bucket, errors: 0, total: 0 });
      const b = timeline.get(bucket);
      b.total++;
      if (isErr) b.errors++;
    }
  }

  const total = lines.length;
  const errorCount = byLevel.error + byLevel.fatal;
  const topMessages = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const detected = [...issues.values()].sort((a, b) => b.count - a.count);
  const sevRank = { critical: 3, high: 2, medium: 1 };
  const worst = detected.reduce((m, d) => Math.max(m, sevRank[d.sev] || 0), 0);
  const verdict = worst >= 3 ? 'critical' : worst === 2 ? 'warning' : errorCount > 0 ? 'warning' : 'healthy';

  return {
    total,
    byLevel,
    errorCount,
    errorRate: total ? +((errorCount / total) * 100).toFixed(1) : 0,
    warnCount: byLevel.warn,
    firstTs,
    lastTs,
    topMessages,
    detected,
    timeline: [...timeline.values()],
    verdict,
  };
}

module.exports = { analyze };
