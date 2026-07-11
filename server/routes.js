import { Router } from 'express';
import {
  authMiddleware,
  registerUser,
  loginUser,
  recoverPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  publicUser,
} from './auth.js';
import { getDb } from './db.js';

export function createRoutes(io) {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    try {
      const db = getDb();
      const { user, recoveryPhrase, publicId } = await registerUser(db, req.body);
      const token = signToken(user);
      setAuthCookie(res, token);
      res.status(201).json({
        user: publicUser(user),
        publicId,
        recoveryPhrase,
        message: 'Save your public ID and recovery phrase. They cannot be shown again.',
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Register failed' });
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const db = getDb();
      const user = await loginUser(db, req.body);
      const token = signToken(user);
      setAuthCookie(res, token);
      res.json({ user: publicUser(user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Login failed' });
    }
  });

  router.post('/auth/recover', async (req, res) => {
    try {
      const db = getDb();
      const user = await recoverPassword(db, req.body);
      const token = signToken(user);
      setAuthCookie(res, token);
      res.json({ user: publicUser(user), message: 'Password updated' });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Recover failed' });
    }
  });

  router.post('/auth/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  router.get('/auth/me', authMiddleware, (req, res) => {
    const db = getDb();
    const row = db.get(
      'SELECT id, username, public_id, display_name, created_at FROM users WHERE id = ?',
      [req.user.uid]
    );
    if (!row) return res.status(401).json({ error: 'User not found' });
    res.json({ user: publicUser(row) });
  });

  // Lookup someone by public ID (does not reveal username until contact accepted — only display + ID)
  router.get('/users/by-id/:publicId', authMiddleware, (req, res) => {
    const db = getDb();
    const pid = String(req.params.publicId || '')
      .trim()
      .toUpperCase();
    const row = db.get(
      'SELECT id, public_id, display_name FROM users WHERE public_id = ?',
      [pid]
    );
    if (!row) return res.status(404).json({ error: 'No user with that ID' });
    if (row.id === req.user.uid) {
      return res.status(400).json({ error: 'That is your own ID' });
    }
    res.json({
      publicId: row.public_id,
      displayName: row.display_name,
    });
  });

  router.post('/contacts/request', authMiddleware, (req, res) => {
    const db = getDb();
    const pid = String(req.body.publicId || '')
      .trim()
      .toUpperCase();
    if (!pid) return res.status(400).json({ error: 'publicId required' });

    const target = db.get('SELECT id, public_id, display_name FROM users WHERE public_id = ?', [pid]);
    if (!target) return res.status(404).json({ error: 'No user with that ID' });
    if (target.id === req.user.uid) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    const [a, b] = orderPair(req.user.uid, target.id);
    const already = db.get('SELECT id FROM contacts WHERE user_a = ? AND user_b = ?', [a, b]);
    if (already) return res.status(409).json({ error: 'Already contacts' });

    const existing = db.get(
      `SELECT id, status, from_user_id FROM contact_requests
       WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)`,
      [req.user.uid, target.id, target.id, req.user.uid]
    );
    if (existing) {
      if (existing.status === 'pending') {
        return res.status(409).json({
          error:
            existing.from_user_id === req.user.uid
              ? 'Request already pending'
              : 'They already sent you a request — check Incoming',
        });
      }
      if (existing.status === 'accepted') {
        return res.status(409).json({ error: 'Already contacts' });
      }
    }

    db.run(
      `INSERT INTO contact_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'pending')`,
      [req.user.uid, target.id]
    );
    const reqRow = db.get(
      `SELECT id, status, created_at FROM contact_requests
       WHERE from_user_id = ? AND to_user_id = ? ORDER BY id DESC LIMIT 1`,
      [req.user.uid, target.id]
    );

    io.to(`user:${target.id}`).emit('contact:request', {
      id: reqRow.id,
      fromPublicId: db.get('SELECT public_id FROM users WHERE id = ?', [req.user.uid]).public_id,
      fromDisplayName: db.get('SELECT display_name FROM users WHERE id = ?', [req.user.uid]).display_name,
      status: 'pending',
      createdAt: reqRow.created_at,
    });

    res.status(201).json({
      ok: true,
      request: {
        id: reqRow.id,
        toPublicId: target.public_id,
        toDisplayName: target.display_name,
        status: 'pending',
      },
    });
  });

  router.get('/contacts/requests', authMiddleware, (req, res) => {
    const db = getDb();
    const incoming = db.all(
      `SELECT r.id, r.status, r.created_at,
              u.public_id AS from_public_id, u.display_name AS from_display_name
       FROM contact_requests r
       JOIN users u ON u.id = r.from_user_id
       WHERE r.to_user_id = ? AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [req.user.uid]
    );
    const outgoing = db.all(
      `SELECT r.id, r.status, r.created_at,
              u.public_id AS to_public_id, u.display_name AS to_display_name
       FROM contact_requests r
       JOIN users u ON u.id = r.to_user_id
       WHERE r.from_user_id = ? AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [req.user.uid]
    );
    res.json({
      incoming: incoming.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        fromPublicId: r.from_public_id,
        fromDisplayName: r.from_display_name,
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        toPublicId: r.to_public_id,
        toDisplayName: r.to_display_name,
      })),
    });
  });

  router.post('/contacts/requests/:id/respond', authMiddleware, (req, res) => {
    const db = getDb();
    const action = String(req.body.action || '').toLowerCase();
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }
    const id = Number(req.params.id);
    const row = db.get('SELECT * FROM contact_requests WHERE id = ?', [id]);
    if (!row || row.to_user_id !== req.user.uid) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (row.status !== 'pending') {
      return res.status(409).json({ error: 'Request already handled' });
    }

    if (action === 'reject') {
      db.run(`UPDATE contact_requests SET status = 'rejected' WHERE id = ?`, [id]);
      io.to(`user:${row.from_user_id}`).emit('contact:response', {
        id,
        status: 'rejected',
      });
      return res.json({ ok: true, status: 'rejected' });
    }

    db.run(`UPDATE contact_requests SET status = 'accepted' WHERE id = ?`, [id]);
    const [a, b] = orderPair(row.from_user_id, row.to_user_id);
    const exists = db.get('SELECT id FROM contacts WHERE user_a = ? AND user_b = ?', [a, b]);
    if (!exists) {
      db.run(`INSERT INTO contacts (user_a, user_b) VALUES (?, ?)`, [a, b]);
    }

    const other = db.get(
      'SELECT id, public_id, display_name, username FROM users WHERE id = ?',
      [row.from_user_id]
    );
    const me = db.get(
      'SELECT id, public_id, display_name, username FROM users WHERE id = ?',
      [req.user.uid]
    );

    io.to(`user:${row.from_user_id}`).emit('contact:response', {
      id,
      status: 'accepted',
      contact: {
        userId: me.id,
        publicId: me.public_id,
        displayName: me.display_name,
        username: me.username,
      },
    });
    io.to(`user:${req.user.uid}`).emit('contact:new', {
      userId: other.id,
      publicId: other.public_id,
      displayName: other.display_name,
      username: other.username,
    });

    res.json({
      ok: true,
      status: 'accepted',
      contact: {
        userId: other.id,
        publicId: other.public_id,
        displayName: other.display_name,
        username: other.username,
      },
    });
  });

  router.get('/contacts', authMiddleware, (req, res) => {
    const db = getDb();
    const uid = req.user.uid;
    const rows = db.all(
      `SELECT c.id AS contact_row_id, c.created_at,
              CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END AS other_id
       FROM contacts c
       WHERE c.user_a = ? OR c.user_b = ?
       ORDER BY c.created_at DESC`,
      [uid, uid, uid]
    );

    const contacts = rows.map((r) => {
      const u = db.get(
        'SELECT id, username, public_id, display_name FROM users WHERE id = ?',
        [r.other_id]
      );
      const last = db.get(
        `SELECT body, created_at, sender_id FROM messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY id DESC LIMIT 1`,
        [uid, r.other_id, r.other_id, uid]
      );
      return {
        userId: u.id,
        username: u.username,
        publicId: u.public_id,
        displayName: u.display_name,
        since: r.created_at,
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.created_at,
              fromMe: last.sender_id === uid,
            }
          : null,
      };
    });

    res.json({ contacts });
  });

  router.get('/messages/:otherUserId', authMiddleware, (req, res) => {
    const db = getDb();
    const uid = req.user.uid;
    const otherId = Number(req.params.otherUserId);
    if (!areContacts(db, uid, otherId)) {
      return res.status(403).json({ error: 'Not contacts — accept a request first' });
    }
    const rows = db.all(
      `SELECT id, sender_id, receiver_id, body, created_at FROM messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC
       LIMIT 500`,
      [uid, otherId, otherId, uid]
    );
    res.json({
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        fromMe: m.sender_id === uid,
        senderId: m.sender_id,
      })),
    });
  });

  router.post('/messages', authMiddleware, (req, res) => {
    const db = getDb();
    const uid = req.user.uid;
    const otherId = Number(req.body.toUserId);
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });
    if (!areContacts(db, uid, otherId)) {
      return res.status(403).json({ error: 'Not contacts — accept a request first' });
    }

    db.run(
      `INSERT INTO messages (sender_id, receiver_id, body) VALUES (?, ?, ?)`,
      [uid, otherId, body]
    );
    const msg = db.get(
      `SELECT id, sender_id, receiver_id, body, created_at FROM messages
       WHERE sender_id = ? AND receiver_id = ? ORDER BY id DESC LIMIT 1`,
      [uid, otherId]
    );

    const payload = {
      id: msg.id,
      body: msg.body,
      createdAt: msg.created_at,
      senderId: msg.sender_id,
      receiverId: msg.receiver_id,
    };

    io.to(`user:${otherId}`).emit('message:new', { ...payload, fromMe: false });
    io.to(`user:${uid}`).emit('message:new', { ...payload, fromMe: true });

    res.status(201).json({
      message: {
        id: msg.id,
        body: msg.body,
        createdAt: msg.created_at,
        fromMe: true,
        senderId: msg.sender_id,
      },
    });
  });

  return router;
}

function orderPair(x, y) {
  return x < y ? [x, y] : [y, x];
}

function areContacts(db, a, b) {
  const [x, y] = orderPair(a, b);
  return !!db.get('SELECT id FROM contacts WHERE user_a = ? AND user_b = ?', [x, y]);
}
