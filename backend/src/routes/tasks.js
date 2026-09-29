const express = require('express');
const db = require('../db');

const router = express.Router();

// Wrap async handlers so rejected promises reach Express's error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_STATUS = ['pending', 'in_progress', 'done'];

function validateTask(body, { partial = false } = {}) {
  const errors = [];
  const { title, description, status } = body || {};

  if (!partial || title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      errors.push('title is required and must be a non-empty string');
    } else if (title.length > 255) {
      errors.push('title must be 255 characters or fewer');
    }
  }
  if (description !== undefined && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    errors.push(`status must be one of: ${VALID_STATUS.join(', ')}`);
  }
  return errors;
}

// GET /api/tasks?status=&limit=&offset=  -> list with simple pagination
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const status = req.query.status;

    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }
    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT id, title, description, status, created_at, updated_at
       FROM tasks ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.status(200).json({ items: rows, limit, offset, count: rows.length });
  })
);

// GET /api/tasks/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, title, description, status, created_at, updated_at
       FROM tasks WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(200).json(rows[0]);
  })
);

// POST /api/tasks
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const errors = validateTask(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const { title, description = null, status = 'pending' } = req.body;
    const { rows } = await db.query(
      `INSERT INTO tasks (title, description, status)
       VALUES ($1, $2, $3)
       RETURNING id, title, description, status, created_at, updated_at`,
      [title.trim(), description, status]
    );
    res.status(201).json(rows[0]);
  })
);

// PUT /api/tasks/:id  -> partial update
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const errors = validateTask(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const fields = [];
    const params = [];
    for (const key of ['title', 'description', 'status']) {
      if (req.body[key] !== undefined) {
        params.push(key === 'title' ? req.body[key].trim() : req.body[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, title, description, status, created_at, updated_at`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(200).json(rows[0]);
  })
);

// DELETE /api/tasks/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  })
);

module.exports = router;
