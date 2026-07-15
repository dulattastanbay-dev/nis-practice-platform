const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LANGS = ['en', 'kk', 'ru'];

function publicUser(id) {
  return db.prepare('SELECT id, email, name, language FROM users WHERE id=?').get(id);
}

router.post('/register', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'invalid_email' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'weak_password' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name_required' });
  const norm = String(email).toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(norm)) {
    return res.status(409).json({ error: 'email_taken' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?,?,?)')
    .run(norm, hash, String(name).trim());
  req.session.userId = Number(info.lastInsertRowid);
  res.json({ user: publicUser(req.session.userId) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  req.session.userId = row.id;
  res.json({ user: publicUser(row.id) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.session.userId) });
});

router.patch('/me', requireAuth, (req, res) => {
  const { language, name } = req.body || {};
  if (language !== undefined) {
    if (!LANGS.includes(language)) return res.status(400).json({ error: 'bad_language' });
    db.prepare('UPDATE users SET language=? WHERE id=?').run(language, req.session.userId);
  }
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'name_required' });
    db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).trim(), req.session.userId);
  }
  res.json({ user: publicUser(req.session.userId) });
});

module.exports = router;
