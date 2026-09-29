const { Pool } = require('pg');
const logger = require('./logger');

// The app supports two ways of configuring Postgres:
//   1. A single DATABASE_URL connection string, or
//   2. Discrete DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD vars
//      (friendlier with Kubernetes ConfigMaps + Secrets).
//
// When neither is set the app still boots in a "stateless" mode so that
// health checks and non-DB endpoints keep working (and so unit tests can run
// without a database). DB-backed routes return 503 in that mode.
const isConfigured = Boolean(process.env.DATABASE_URL || process.env.DB_HOST);

let pool = null;

function buildConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: sslOption(),
    };
  }
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'appdb',
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASSWORD,
    ssl: sslOption(),
  };
}

function sslOption() {
  // RDS requires TLS in production. Set DB_SSL=false to disable for local dev.
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
    return { rejectUnauthorized: false };
  }
  return false;
}

function getPool() {
  if (!isConfigured) return null;
  if (!pool) {
    pool = new Pool({
      ...buildConfig(),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle Postgres client');
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) {
    const err = new Error('Database is not configured');
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  const start = Date.now();
  const res = await p.query(text, params);
  logger.debug({ durationMs: Date.now() - start, rows: res.rowCount }, 'db query');
  return res;
}

// Lightweight connectivity check used by the readiness probe.
async function ping() {
  if (!isConfigured) return true; // stateless mode is considered ready
  await query('SELECT 1');
  return true;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { isConfigured, getPool, query, ping, close };
