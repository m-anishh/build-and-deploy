const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const logger = require('./logger');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_TTL = process.env.JWT_TTL || '7d';
const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
// Return the verify link in the API response when no real mailer is configured
// (demo/dev). With SMTP/SES wired up you'd email it instead and drop this.
const EXPOSE_VERIFY_LINK = process.env.SMTP_HOST ? false : true;

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailOk = (e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, is_verified: u.is_verified });

// --- signup -------------------------------------------------------------
router.post(
  '/signup',
  asyncH(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!emailOk(email)) return res.status(400).json({ error: 'Valid email required' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const exists = await db.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rowCount) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await db.query(
      `INSERT INTO users (email, name, password_hash, verify_token)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [email, name || null, hash, token]
    );

    const verifyUrl = `${BASE_URL}/api/auth/verify?token=${token}`;
    // TODO: when SMTP configured, email verifyUrl here.
    logger.info({ email }, 'user signed up (verification pending)');

    res.status(201).json({
      message: 'Account created. Verify your email to sign in.',
      ...(EXPOSE_VERIFY_LINK ? { verifyUrl } : {}),
      user: publicUser(rows[0]),
    });
  })
);

// --- verify (link click) ------------------------------------------------
router.get(
  '/verify',
  asyncH(async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token');
    const { rowCount } = await db.query(
      `UPDATE users SET is_verified = TRUE, verify_token = NULL WHERE verify_token = $1`,
      [token]
    );
    // Bounce back to the app either way.
    res.redirect(rowCount ? '/?verified=1' : '/?verified=0');
  })
);

// --- login --------------------------------------------------------------
router.post(
  '/login',
  asyncH(async (req, res) => {
    const { email, password } = req.body || {};
    if (!emailOk(email) || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_verified) return res.status(403).json({ error: 'Please verify your email first', code: 'UNVERIFIED' });

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.status(200).json({ token, user: publicUser(user) });
  })
);

// --- auth middleware + me ----------------------------------------------
function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.get(
  '/me',
  authMiddleware,
  asyncH(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.auth.sub]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ user: publicUser(rows[0]) });
  })
);

module.exports = { router, authMiddleware };
