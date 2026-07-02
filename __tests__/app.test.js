const request = require('supertest');
const app = require('../app');

describe('App', () => {
  test('GET / should return 200', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
  });

  test('GET /api/hello should return greeting', async () => {
    const res = await request(app).get('/api/hello?name=Test');
    expect(res.statusCode).toBe(200);
  });
});
