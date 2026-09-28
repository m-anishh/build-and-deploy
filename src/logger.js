const pino = require('pino');

// Structured JSON logging. In development, pretty-print if pino-pretty is available;
// in production, emit newline-delimited JSON that log collectors (Loki, CloudWatch,
// Fluent Bit) can parse directly.
const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.APP_NAME || 'devops-app',
    version: process.env.APP_VERSION || 'unknown',
    pod: process.env.POD_NAME,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev
    ? {
        transport: {
          target: 'pino/file', // stdout; avoids requiring pino-pretty as a hard dep
          options: { destination: 1 },
        },
      }
    : {}),
});

module.exports = logger;
