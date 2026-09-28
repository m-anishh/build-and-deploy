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

// Root info endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: process.env.APP_NAME || 'devops-app',
    version: process.env.APP_VERSION || 'unknown',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

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

// Demo endpoints (kept for backward compatibility)
app.get('/api/hello', (req, res) => {
  const name = req.query.name || 'World';
  res.status(200).json({ message: `Hello, ${name}!`, timestamp: new Date().toISOString() });
});

// Real, database-backed resource
app.use('/api/tasks', tasksRouter);

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
