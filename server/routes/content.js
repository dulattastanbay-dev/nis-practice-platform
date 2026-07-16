const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const PUB = 'id, subject, year, component, number, marks, topic, text_latex, figure_svg';

router.get('/questions', requireAuth, (req, res) => {
  const { subject, year, years, component, topic } = req.query;
  const where = [];
  const args = [];
  if (subject) { where.push('subject = ?'); args.push(subject); }
  // `years` (comma-separated) allows selecting several years at once; `year` kept for callers passing one.
  const yearList = String(years || '').split(',')
    .map((v) => v.trim()).filter(Boolean)
    .map(Number).filter(Number.isInteger);
  if (yearList.length) {
    where.push(`year IN (${yearList.map(() => '?').join(',')})`);
    args.push(...yearList);
  } else if (year) { where.push('year = ?'); args.push(Number(year)); }
  if (component) { where.push('component = ?'); args.push(Number(component)); }
  if (topic) { where.push('topic = ?'); args.push(topic); }
  const sql = `SELECT ${PUB} FROM questions`
    + (where.length ? ` WHERE ${where.join(' AND ')}` : '')
    + ' ORDER BY subject, year, component, number';
  res.json({ questions: db.prepare(sql).all(...args) });
});

router.get('/questions/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT ${PUB} FROM questions WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ question: row });
});

router.get('/topics', requireAuth, (req, res) => {
  const { subject } = req.query;
  const rows = subject
    ? db.prepare('SELECT DISTINCT topic FROM questions WHERE subject=? ORDER BY topic').all(subject)
    : db.prepare('SELECT DISTINCT topic FROM questions ORDER BY topic').all();
  res.json({ topics: rows.map((r) => r.topic) });
});

function confidence(expected, marks) {
  const ratio = marks ? expected / marks : 0;
  if (ratio >= 0.8) return 'high';
  if (ratio >= 0.5) return 'medium';
  return 'low';
}

router.post('/attempts', requireAuth, (req, res) => {
  const { question_id, answer_text, mode, duration_sec } = req.body || {};
  if (mode !== 'practice') return res.status(400).json({ error: 'bad_mode' }); // exam answers go via /exams/:id/submit
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(question_id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const text = String(answer_text || '');
  const awarded = text.trim() ? q.expected_mark : 0;
  db.prepare(`INSERT INTO attempts (user_id, question_id, answer_text, awarded_mark, mode, duration_sec)
              VALUES (?,?,?,?,'practice',?)`)
    .run(req.session.userId, q.id, text, awarded, Math.max(0, Number(duration_sec) || 0));
  res.json({
    awarded_mark: awarded,
    expected_mark: q.expected_mark,
    marks: q.marks,
    ai_feedback: q.ai_feedback,
    mark_scheme: q.mark_scheme,
    confidence: confidence(q.expected_mark, q.marks),
  });
});

router.get('/marked', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.id AS question_id, q.subject, q.year, q.component, q.number, q.marks, q.topic
    FROM marked m JOIN questions q ON q.id = m.question_id
    WHERE m.user_id = ? ORDER BY m.created_at DESC, q.id DESC
  `).all(req.session.userId);
  res.json({ marked: rows });
});

router.put('/marked/:questionId', requireAuth, (req, res) => {
  const q = db.prepare('SELECT id FROM questions WHERE id=?').get(req.params.questionId);
  if (!q) return res.status(404).json({ error: 'not_found' });
  db.prepare('INSERT OR IGNORE INTO marked (user_id, question_id) VALUES (?,?)')
    .run(req.session.userId, q.id);
  res.json({ ok: true });
});

router.delete('/marked/:questionId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM marked WHERE user_id=? AND question_id=?')
    .run(req.session.userId, req.params.questionId);
  res.json({ ok: true });
});

router.get('/mistakes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.id AS question_id, q.subject, q.year, q.component, q.number, q.marks, q.topic,
           a.awarded_mark, a.created_at
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ?
      AND a.id IN (SELECT MAX(id) FROM attempts WHERE user_id = ? GROUP BY question_id)
      AND a.awarded_mark < q.marks
    ORDER BY a.created_at DESC, a.id DESC
  `).all(req.session.userId, req.session.userId);
  res.json({ mistakes: rows });
});

module.exports = router;
