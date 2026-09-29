import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { parseProm, sumBy, pick, single } from '../lib/prom.js';

const MAX_POINTS = 30; // rolling window for time-series charts

// Polls /metrics, /api/info, /api/tasks and derives dashboard-ready data from
// the app's REAL telemetry. Request/error RATES are computed client-side by
// diffing Prometheus counters between polls.
export function useTelemetry(intervalMs = 3000) {
  const [data, setData] = useState(null);
  const prev = useRef(null); // { total, errors, t }
  const series = useRef([]); // [{ t, rps, eps, latency, mem }]

  useEffect(() => {
    if (!intervalMs) return undefined; // paused (e.g. logged out)
    let alive = true;

    const tick = async () => {
      try {
        const [metricsText, info, tasksRes] = await Promise.all([
          api.metrics(),
          api.info().catch(() => null),
          api.listTasks().catch((e) => ({ __err: e })),
        ]);
        if (!alive) return;

        const s = parseProm(metricsText);
        const now = Date.now();

        const byRoute = sumBy(s, 'http_requests_total', 'route');
        const byStatus = sumBy(s, 'http_requests_total', 'status_code');
        const total = sumBy(s, 'http_requests_total');

        // errors = 4xx + 5xx
        const errors = pick(s, 'http_requests_total', (l) => /^[45]/.test(l.status_code || ''))
          .reduce((a, x) => a + x.value, 0);

        // avg latency (ms) from histogram sum/count
        const durSum = sumBy(s, 'http_request_duration_seconds_sum');
        const durCount = sumBy(s, 'http_request_duration_seconds_count');
        const latency = durCount ? (durSum / durCount) * 1000 : 0;

        const memMB = single(s, 'process_resident_memory_bytes') / 1048576;
        const heapMB = single(s, 'nodejs_heap_size_used_bytes') / 1048576;
        const lagMs = single(s, 'nodejs_eventloop_lag_p90_seconds') * 1000;
        const cpu = single(s, 'process_cpu_seconds_total');

        // rates
        let rps = 0, eps = 0;
        if (prev.current) {
          const dt = (now - prev.current.t) / 1000;
          if (dt > 0) {
            rps = Math.max(0, (total - prev.current.total) / dt);
            eps = Math.max(0, (errors - prev.current.errors) / dt);
          }
        }
        prev.current = { total, errors, t: now };

        const label = new Date(now).toLocaleTimeString([], { hour12: false });
        series.current = [...series.current, { t: label, rps: +rps.toFixed(2), eps: +eps.toFixed(2), latency: +latency.toFixed(1), mem: +memMB.toFixed(1) }].slice(-MAX_POINTS);

        // route table with status-class breakdown for stacked chart
        const routeRows = Object.keys(byRoute).map((route) => {
          const rr = pick(s, 'http_requests_total', (l) => l.route === route);
          const c2 = rr.filter((x) => /^2/.test(x.labels.status_code)).reduce((a, x) => a + x.value, 0);
          const c3 = rr.filter((x) => /^3/.test(x.labels.status_code)).reduce((a, x) => a + x.value, 0);
          const c4 = rr.filter((x) => /^4/.test(x.labels.status_code)).reduce((a, x) => a + x.value, 0);
          const c5 = rr.filter((x) => /^5/.test(x.labels.status_code)).reduce((a, x) => a + x.value, 0);
          return { route: route.replace(/^\//, '') || '/', total: byRoute[route], s2xx: c2, s3xx: c3, s4xx: c4, s5xx: c5 };
        }).sort((a, b) => b.total - a.total);

        // tasks
        let tasks = null, tasksErr = null;
        if (tasksRes && tasksRes.__err) {
          tasksErr = tasksRes.__err.status === 503 ? 'stateless' : 'error';
        } else if (tasksRes) {
          const items = tasksRes.items || [];
          const by = { pending: 0, in_progress: 0, done: 0 };
          items.forEach((t) => { by[t.status] = (by[t.status] || 0) + 1; });
          tasks = { total: items.length, by, items };
        }

        setData({
          info,
          totals: { total, errors, errorPct: total ? (errors / total) * 100 : 0, latency, memMB, heapMB, lagMs, cpu, rps, eps },
          byStatus,
          routeRows,
          series: series.current,
          tasks,
          tasksErr,
          ok: true,
        });
      } catch (e) {
        if (alive) setData((d) => ({ ...(d || {}), ok: false }));
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  return data;
}
