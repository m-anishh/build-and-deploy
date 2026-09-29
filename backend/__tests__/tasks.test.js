// Unit tests for the /api/tasks CRUD routes.
// The database layer is mocked so tests run without a real Postgres instance.

jest.mock('../src/db', () => ({
  isConfigured: true,
  query: jest.fn(),
  ping: jest.fn().mockResolvedValue(true),
  close: jest.fn(),
  getPool: jest.fn(),
}));

const request = require('supertest');
const app = require('../app');
const db = require('../src/db');

const sampleTask = {
  id: 1,
  title: 'Write docs',
  description: 'Document the API',
  status: 'pending',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/tasks', () => {
  test('returns a paginated list', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleTask], rowCount: 1 });
    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });
});

describe('GET /api/tasks/:id', () => {
  test('returns a task when found', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleTask], rowCount: 1 });
    const res = await request(app).get('/api/tasks/1');
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Write docs');
  });

  test('returns 404 when not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/tasks/999');
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/tasks', () => {
  test('creates a task', async () => {
    db.query.mockResolvedValueOnce({ rows: [sampleTask], rowCount: 1 });
    const res = await request(app).post('/api/tasks').send({ title: 'Write docs' });
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(1);
  });

  test('rejects missing title with 400', async () => {
    const res = await request(app).post('/api/tasks').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('rejects invalid status with 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'x', status: 'bogus' });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/tasks/:id', () => {
  test('updates a task', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...sampleTask, status: 'done' }], rowCount: 1 });
    const res = await request(app).put('/api/tasks/1').send({ status: 'done' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('done');
  });

  test('returns 400 when no fields provided', async () => {
    const res = await request(app).put('/api/tasks/1').send({});
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/tasks/:id', () => {
  test('deletes a task', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app).delete('/api/tasks/1');
    expect(res.statusCode).toBe(204);
  });

  test('returns 404 when task missing', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).delete('/api/tasks/999');
    expect(res.statusCode).toBe(404);
  });
});

describe('error handling', () => {
  test('returns 503 when the database is unavailable', async () => {
    const err = new Error('down');
    err.code = 'ECONNREFUSED';
    db.query.mockRejectedValueOnce(err);
    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(503);
  });
});
