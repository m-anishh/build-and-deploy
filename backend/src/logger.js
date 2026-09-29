const pino = require('pino');

// Structured JSON logging with an in-memory ring buffer so the UI can show a
// live log stream (GET /api/logs) without a full log backend (Loki/CloudWatch).
// In production you'd ship stdout to a real aggregator; the buffer is a
// convenience for the dashboard.
const MAX = parseInt(process.env.LOG_BUFFER || '500', 10);
const buffer = [];

const bufferStream = {
  write(line) {
    try {
      const o = JSON.parse(line);
      buffer.push(o);
      if (buffer.length > MAX) buffer.shift();
    } catch {
      /* ignore non-JSON lines */
    }
  },
};

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: {
      service: process.env.APP_NAME || 'devops-app',
      version: process.env.APP_VERSION || 'unknown',
      pod: process.env.POD_NAME,
    },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([{ stream: process.stdout }, { stream: bufferStream }])
);

// Recent logs, newest first, optionally filtered by level.
logger.getRecentLogs = (limit = 100, level) => {
  let out = buffer;
  if (level) out = out.filter((l) => l.level === level);
  return out.slice(-limit).reverse();
};

module.exports = logger;
