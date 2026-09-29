const path = require('path');
const fs = require('fs');
const express = require('express');
const pinoHttp = require('pino-http');

const logger = require('./src/logger');
const db = require('./src/db');
const { metricsMiddleware, metricsHandler } = require('./src/metrics');
const tasksRouter = require('./src/routes/tasks');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Structured request logging + per-request metrics.
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' } }));
app.use(metricsMiddleware);

// Service info (consumed by the UI status dashboard)
function sendInfo(req, res) {
  res.status(200).json({
    status: 'healthy',
    service: process.env.APP_NAME || 'devops-app',
    version: process.env.APP_VERSION || 'unknown',
    env: process.env.NODE_ENV || 'development',
    pod: process.env.POD_NAME || require('os').hostname(),
    node: process.env.NODE_NAME || null,
    database: db.isConfigured ? 'configured' : 'stateless',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
app.get('/api/info', sendInfo);

// Liveness + startup probe: process is alive
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness probe: ready to receive traffic (checks DB connectivity when configured)
let isShuttingDown = false;
app.get('/ready', async (req, res) => {
  if (isShuttingDown) return res.status(503).json({ status: 'shutting down' });
  try {
    await db.ping();
    res.status(200).json({ status: 'ready', database: db.isConfigured ? 'connected' : 'stateless' });
  } catch (err) {
    logger.warn({ err }, 'Readiness check failed: database unreachable');
    res.status(503).json({ status: 'not ready', database: 'unreachable' });
  }
});

// Prometheus metrics
app.get('/metrics', metricsHandler);

// Recent application logs (in-memory ring buffer) for the Logs page.
app.get('/api/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const level = req.query.level || undefined;
  res.status(200).json({ items: logger.getRecentLogs(limit, level) });
});

// Analyze imported logs (paste / upload of `kubectl logs` output, JSON or plain).
const { analyze } = require('./src/loganalyzer');
app.post('/api/logs/analyze', express.json({ limit: '8mb' }), (req, res) => {
  const text = req.body && req.body.logs;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Provide log text in { logs: "..." }' });
  }
  res.status(200).json(analyze(text));
});

// Demo endpoints (kept for backward compatibility)
app.get('/api/hello', (req, res) => {
  const name = req.query.name || 'World';
  res.status(200).json({ message: `Hello, ${name}!`, timestamp: new Date().toISOString() });
});

// Authentication (signup / login / verify / me)
const { router: authRouter } = require('./src/auth');
app.use('/api/auth', authRouter);

// Real, database-backed resource
app.use('/api/tasks', tasksRouter);

// Proxy to the ML anomaly-detection service (services/ml). Keeps a single
// origin for the UI; in K8s set ML_SERVICE_URL to the ml service DNS name.
const ML_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
app.use('/api/ml', async (req, res) => {
  try {
    const r = await fetch(ML_URL + req.url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(5000),
    });
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (err) {
    logger.warn({ err: err.message }, 'ML service proxy failed');
    res.status(503).json({ error: 'ML service unavailable', message: err.message });
  }
});

// Proxy to Prometheus HTTP API (for the Kubernetes/infra dashboards).
// Set PROM_URL to the Prometheus service (e.g. http://prometheus.monitoring:9090).
const PROM_URL = (process.env.PROM_URL || 'http://localhost:9090').replace(/\/$/, '');
app.use('/api/prom', async (req, res) => {
  try {
    const r = await fetch(PROM_URL + '/api/v1' + req.url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (err) {
    res.status(503).json({ status: 'error', error: 'Prometheus unavailable', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Frontend (React SPA). Served only when a production build exists at
// frontend/dist — so API-only runs (tests, stateless mode, `npm run dev`
// with Vite handling the UI) keep working without a build.
// ---------------------------------------------------------------------------
const UI_DIR = process.env.FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist');
const UI_INDEX = path.join(UI_DIR, 'index.html');
const hasUI = fs.existsSync(UI_INDEX);

if (hasUI) {
  app.use(express.static(UI_DIR));
  // SPA fallback: any non-API GET returns index.html so client routing works.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(UI_INDEX);
  });
} else {
  // No UI built — root points callers at the JSON API.
  app.get('/', sendInfo);
}

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Error handler: Express needs all 4 args to treat this as an error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Distinguish "database down / not configured" from genuine server errors.
  if (err.code === 'DB_NOT_CONFIGURED' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    logger.error({ err }, 'Database unavailable while handling request');
    return res.status(503).json({ error: 'Service Unavailable', message: 'Database is unavailable' });
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || 'unknown',
        database: db.isConfigured ? 'configured' : 'stateless',
      },
      'Server started'
    );
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Graceful shutdown started');
    isShuttingDown = true; // readiness fails -> K8s stops sending traffic
    server.close(async () => {
      await db.close();
      logger.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after 30 seconds');
      process.exit(1);
    }, 30000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
