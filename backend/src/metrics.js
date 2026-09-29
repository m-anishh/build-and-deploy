const client = require('prom-client');

// A dedicated registry keeps our metrics isolated and testable.
const register = new client.Registry();

register.setDefaultLabels({
  app: process.env.APP_NAME || 'devops-app',
  version: process.env.APP_VERSION || 'unknown',
});

// Node.js process + GC + event-loop metrics out of the box.
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Express middleware that records duration + count for every request.
function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Use the matched route pattern (e.g. /api/tasks/:id) to keep label
    // cardinality bounded, falling back to the raw path for unmatched routes.
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}

// Handler for GET /metrics.
async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = { register, metricsMiddleware, metricsHandler };
