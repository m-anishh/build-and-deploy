#!/usr/bin/env node
// Minimal, dependency-free migration runner.
//
// It applies every *.sql file in ../migrations in filename order exactly once,
// tracking applied files in a schema_migrations table. Safe to run repeatedly
// (idempotent) — used both locally and as a Kubernetes Job before rollout.

const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const logger = require('../src/logger');

// SQL lives in the top-level database/ directory (override with MIGRATIONS_DIR).
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, '..', '..', 'database', 'migrations');

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedMigrations() {
  const { rows } = await db.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  if (!db.isConfigured) {
    logger.error('No database configured (set DATABASE_URL or DB_HOST). Aborting migrations.');
    process.exit(1);
  }

  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      logger.info({ file }, 'migration already applied, skipping');
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const pool = db.getPool();
    const clientConn = await pool.connect();
    try {
      await clientConn.query('BEGIN');
      await clientConn.query(sql);
      await clientConn.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await clientConn.query('COMMIT');
      logger.info({ file }, 'migration applied');
      applied++;
    } catch (err) {
      await clientConn.query('ROLLBACK');
      logger.error({ file, err }, 'migration failed, rolled back');
      throw err;
    } finally {
      clientConn.release();
    }
  }

  logger.info({ applied, total: files.length }, 'migrations complete');
  await db.close();
}

run().catch((err) => {
  logger.error({ err }, 'migration runner crashed');
  process.exit(1);
});
