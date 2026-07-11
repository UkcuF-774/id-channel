import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generatePublicId, generateRecoveryPhrase, normalizePhrase } from './ids.js';

const JWT_SECRET = process.env.JWT_SECRET || 'id-channel-dev-secret-change-me';
const TOKEN_COOKIE = 'idc_token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export { TOKEN_COOKIE };

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, publicId: user.public_id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE);
}

export function authMiddleware(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

export function optionalAuth(req, _res, next) {
  const token = req.cookies?.[TOKEN_COOKIE];
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      /* ignore */
    }
  }
  next();
}

export async function registerUser(db, { username, password, displayName }) {
  const name = String(username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(name)) {
    throw Object.assign(new Error('Username must be 3–24 letters, numbers, or _'), { status: 400 });
  }
  if (!password || String(password).length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }

  const existing = db.get('SELECT id FROM users WHERE username = ?', [name]);
  if (existing) {
    throw Object.assign(new Error('Username already taken'), { status: 409 });
  }

  // Generate unique public ID before storing user details
  let publicId;
  for (let i = 0; i < 20; i++) {
    publicId = generatePublicId();
    const clash = db.get('SELECT id FROM users WHERE public_id = ?', [publicId]);
    if (!clash) break;
    publicId = null;
  }
  if (!publicId) {
    throw Object.assign(new Error('Could not allocate a public ID'), { status: 500 });
  }

  const recoveryPhrase = generateRecoveryPhrase();
  const passwordHash = await bcrypt.hash(String(password), 10);
  const recoveryHash = await bcrypt.hash(normalizePhrase(recoveryPhrase), 10);
  const display = (displayName && String(displayName).trim()) || name;

  db.run(
    `INSERT INTO users (username, public_id, password_hash, recovery_hash, display_name)
     VALUES (?, ?, ?, ?, ?)`,
    [name, publicId, passwordHash, recoveryHash, display]
  );

  const user = db.get('SELECT id, username, public_id, display_name, created_at FROM users WHERE username = ?', [
    name,
  ]);

  return { user, recoveryPhrase, publicId };
}

export async function loginUser(db, { username, password }) {
  const name = String(username || '').trim();
  const user = db.get('SELECT * FROM users WHERE username = ?', [name]);
  if (!user) {
    throw Object.assign(new Error('Invalid username or password'), { status: 401 });
  }
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) {
    throw Object.assign(new Error('Invalid username or password'), { status: 401 });
  }
  return {
    id: user.id,
    username: user.username,
    public_id: user.public_id,
    display_name: user.display_name,
    created_at: user.created_at,
  };
}

export async function recoverPassword(db, { username, recoveryPhrase, newPassword }) {
  const name = String(username || '').trim();
  if (!newPassword || String(newPassword).length < 6) {
    throw Object.assign(new Error('New password must be at least 6 characters'), { status: 400 });
  }
  const user = db.get('SELECT * FROM users WHERE username = ?', [name]);
  if (!user) {
    throw Object.assign(new Error('Account not found or phrase incorrect'), { status: 401 });
  }
  const ok = await bcrypt.compare(normalizePhrase(recoveryPhrase), user.recovery_hash);
  if (!ok) {
    throw Object.assign(new Error('Account not found or phrase incorrect'), { status: 401 });
  }
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
  return {
    id: user.id,
    username: user.username,
    public_id: user.public_id,
    display_name: user.display_name,
  };
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    publicId: row.public_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}
