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

// --- OAuth (Google + GitHub) ------------------------------------------
const OAUTH = {
  google: {
    id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  github: {
    id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
};
const providerEnabled = (p) => !!(OAUTH[p] && OAUTH[p].id && OAUTH[p].secret);
const redirectUri = (p) => `${BASE_URL}/api/auth/${p}/callback`;

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_TTL });
}

async function upsertOAuthUser({ email, name, provider, providerId, avatar }) {
  const { rows } = await db.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
  if (rows[0]) {
    await db.query(
      'UPDATE users SET is_verified=TRUE, provider=$2, provider_id=$3, avatar_url=$4, last_login_at=NOW() WHERE id=$1',
      [rows[0].id, provider, providerId, avatar]
    );
    return rows[0];
  }
  const ins = await db.query(
    `INSERT INTO users (email, name, is_verified, provider, provider_id, avatar_url)
     VALUES ($1,$2,TRUE,$3,$4,$5) RETURNING *`,
    [email, name, provider, providerId, avatar]
  );
  return ins.rows[0];
}

// Which providers are configured (frontend enables buttons accordingly).
router.get('/config', (req, res) => {
  res.json({ google: providerEnabled('google'), github: providerEnabled('github') });
});

// Start the OAuth flow.
router.get('/:provider(google|github)', (req, res) => {
  const p = req.params.provider;
  if (!providerEnabled(p)) return res.status(503).send(`${p} OAuth not configured`);
  const o = OAUTH[p];
  const params = new URLSearchParams({
    client_id: o.id, redirect_uri: redirectUri(p), scope: o.scope, response_type: 'code', state: p,
    ...(p === 'google' ? { access_type: 'online', prompt: 'select_account' } : {}),
  });
  res.redirect(`${o.authUrl}?${params}`);
});

// OAuth callback: exchange code, fetch profile, upsert user, hand back a JWT.
router.get(
  '/:provider(google|github)/callback',
  asyncH(async (req, res) => {
    const p = req.params.provider;
    if (!providerEnabled(p)) return res.status(503).send('not configured');
    const { code } = req.query;
    if (!code) return res.redirect('/?oauth=error');
    const o = OAUTH[p];
    try {
      const tokenRes = await fetch(o.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: o.id, client_secret: o.secret, code, redirect_uri: redirectUri(p),
          grant_type: 'authorization_code',
        }),
      });
      const tok = await tokenRes.json();
      const accessToken = tok.access_token;
      if (!accessToken) throw new Error('no access token');

      let profile;
      if (p === 'google') {
        const u = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })).json();
        profile = { email: u.email, name: u.name, providerId: u.sub, avatar: u.picture };
      } else {
        const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'manishOps' };
        const u = await (await fetch('https://api.github.com/user', { headers })).json();
        let email = u.email;
        if (!email) {
          const emails = await (await fetch('https://api.github.com/user/emails', { headers })).json();
          const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) || emails[0] : null;
          email = primary && primary.email;
        }
        profile = { email, name: u.name || u.login, providerId: String(u.id), avatar: u.avatar_url };
      }
      if (!profile.email) throw new Error('no email from provider');

      const user = await upsertOAuthUser({ ...profile, provider: p });
      res.redirect(`/?token=${signToken(user)}`);
    } catch (e) {
      logger.error({ err: e.message, provider: p }, 'oauth callback failed');
      res.redirect('/?oauth=error');
    }
  })
);

module.exports = { router, authMiddleware };
