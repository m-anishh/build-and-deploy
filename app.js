const express = require('express');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Sample API endpoint
app.get('/api/hello', (req, res) => {
  const name = req.query.name || 'World';
  res.status(200).json({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  });
});

// Sample API endpoint with path parameter
app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  res.status(200).json({
    id: userId,
    name: `User ${userId}`,
    email: `user${userId}@example.com`,
  });
});

// Sample POST endpoint
app.post('/api/data', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.status(400).json({
      error: 'Data field is required',
    });
  }

  res.status(201).json({
    message: 'Data received',
    data,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;

// Only start server if this file is run directly (not imported by tests)
if (require.main === module) {
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
}

module.exports = app;
