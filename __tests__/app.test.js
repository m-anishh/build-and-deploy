const request = require('supertest');
const app = require('../app');

describe('App', () => {
  test('GET / returns 200', async () => {
    expect((await request(app).get('/')).statusCode).toBe(200);
  });
  test('GET /health returns 200', async () => {
    expect((await request(app).get('/health')).statusCode).toBe(200);
  });
  test('GET /ready returns 200', async () => {
    expect((await request(app).get('/ready')).statusCode).toBe(200);
  });
  test('GET /api/hello greets by name', async () => {
    const res = await request(app).get('/api/hello?name=Test');
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Hello, Test!');
  });
  test('POST /api/data without data returns 400', async () => {
    expect((await request(app).post('/api/data').send({})).statusCode).toBe(400);
  });
  test('unknown route returns 404', async () => {
    expect((await request(app).get('/nope')).statusCode).toBe(404);
  });
});

