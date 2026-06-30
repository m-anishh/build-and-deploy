const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Simple in-memory metrics
let requestCount = 0;
let startTime = Date.now();

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

app.get('/ready', (req, res) => {
  // Readiness probe - checks if app is ready to serve traffic
  res.status(200).json({
    ready: true,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.status(200).json({
    requests_total: requestCount,
    uptime_seconds: uptime,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// API endpoints
app.get('/api/info', (req, res) => {
  requestCount++;
  res.status(200).json({
    application: 'Production-Ready DevOps App',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    hostname: process.env.HOSTNAME || 'unknown',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/hello', (req, res) => {
  requestCount++;
  const name = req.query.name || 'World';
  res.status(200).json({
    message: `Hello, ${name}!`,
    request_number: requestCount
  });
});

// Root endpoint
app.get('/', (req, res) => {
  requestCount++;
  res.status(200).json({
    message: 'Welcome to Production-Ready DevOps Application',
    endpoints: {
      health: '/health',
      readiness: '/ready',
      metrics: '/metrics',
      info: '/api/info',
      hello: '/api/hello?name=YourName'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`App Version: ${process.env.APP_VERSION || 'unknown'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Graceful shutdown started');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after 30 seconds');
    process.exit(1);
  }, 30000);
});

module.exports = app;
