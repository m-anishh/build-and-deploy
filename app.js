const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root info endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Liveness + startup probe: process is alive
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness probe: ready to receive traffic
let isShuttingDown = false;
app.get('/ready', (req, res) => {
  if (isShuttingDown) return res.status(503).json({ status: 'shutting down' });
  res.status(200).json({ status: 'ready' });
});

app.get('/api/hello', (req, res) => {
  const name = req.query.name || 'World';
  res.status(200).json({ message: `Hello, ${name}!`, timestamp: new Date().toISOString() });
});

app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  res.status(200).json({ id: userId, name: `User ${userId}`, email: `user${userId}@example.com` });
});

app.post('/api/data', (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Data field is required' });
  res.status(201).json({ message: 'Data received', data, timestamp: new Date().toISOString() });
});

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Error handler: Express needs all 4 args to treat this as an error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`App Version: ${process.env.APP_VERSION || 'unknown'}`);
  });

  process.on('SIGTERM', () => {
    console.log('[SIGTERM] Graceful shutdown started');
    isShuttingDown = true;            // readiness fails -> K8s stops sending traffic
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after 30 seconds');
      process.exit(1);
    }, 30000);
  });
}

module.exports = app;
