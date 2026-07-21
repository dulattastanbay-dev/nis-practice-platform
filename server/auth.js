const db = require('./db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Editing the question bank is restricted to admins; students get 403.
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const row = db.prepare('SELECT is_admin FROM users WHERE id=?').get(req.session.userId);
  if (!row || !row.is_admin) return res.status(403).json({ error: 'forbidden' });
  next();
}

module.exports = { requireAuth, requireAdmin };
