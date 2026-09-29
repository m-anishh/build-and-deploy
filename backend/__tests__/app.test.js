const request = require('supertest');
const app = require('../app');

describe('Core endpoints', () => {
  test('GET /api/info returns 200 with service info', async () => {
    const res = await request(app).get('/api/info');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('pod');
  });

  test('GET /health returns 200', async () => {
    expect((await request(app).get('/health')).statusCode).toBe(200);
  });

  test('GET /ready returns 200 (stateless when no DB configured)', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('process_cpu_seconds_total');
  });

  test('GET /api/hello greets by name', async () => {
    const res = await request(app).get('/api/hello?name=Test');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Hello, Test!');
  });

  test('unknown API route returns 404', async () => {
    expect((await request(app).get('/api/nope')).statusCode).toBe(404);
  });
});
