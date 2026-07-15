const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
const PUB = 'id, subject, year, component, number, marks, topic, text_latex, figure_svg';

function examResults(examId, uid) {
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(examId, uid);
  if (!exam) return null;
  const results = db.prepare(`
    SELECT q.id AS question_id, q.number, q.marks, q.topic, q.text_latex, q.figure_svg,
           q.mark_scheme, q.ai_feedback, a.answer_text, a.awarded_mark
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.exam_id = ? AND a.user_id = ?
    ORDER BY q.number
  `).all(examId, uid);
  const pct = exam.total ? Math.round((100 * (exam.score || 0)) / exam.total) : 0;
  return { exam: { ...exam, pct }, results };
}

router.post('/exams', requireAuth, (req, res) => {
  const { subject, year, component } = req.body || {};
  const y = Number(year);
  const c = Number(component);
  if (!SUBJECTS.includes(subject)) return res.status(400).json({ error: 'bad_subject' });
  if (!Number.isInteger(y) || y < 2021 || y > 2025) return res.status(400).json({ error: 'bad_year' });
  if (![1, 2, 3].includes(c)) return res.status(400).json({ error: 'bad_component' });

  let questions = db.prepare(
    `SELECT ${PUB} FROM questions WHERE subject=? AND year=? AND component=? ORDER BY number`
  ).all(subject, y, c);
  if (questions.length === 0) {
    questions = db.prepare(`SELECT ${PUB} FROM questions WHERE subject=? ORDER BY number LIMIT 12`).all(subject);
  }
  const total = questions.reduce((s, q) => s + q.marks, 0);
  const uid = req.session.userId;
  db.prepare('DELETE FROM exams WHERE user_id=? AND submitted_at IS NULL').run(uid);
  const info = db.prepare(
    'INSERT INTO exams (user_id, subject, year, component, total) VALUES (?,?,?,?,?)'
  ).run(uid, subject, y, c, total);
  const markedIds = db.prepare('SELECT question_id FROM marked WHERE user_id=?').all(uid)
    .map((r) => r.question_id);
  res.json({
    exam: { id: Number(info.lastInsertRowid), subject, year: y, component: c, total, duration_min: 90 },
    questions,
    marked_ids: markedIds,
  });
});

router.post('/exams/:id/submit', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(req.params.id, uid);
  if (!exam) return res.status(404).json({ error: 'not_found' });
  if (exam.submitted_at) return res.status(409).json({ error: 'already_submitted' });
  const answers = (req.body && req.body.answers) || [];
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'no_answers' });
  }
  const getQ = db.prepare('SELECT id, expected_mark FROM questions WHERE id=?');
  const graded = [];
  for (const a of answers) {
    const q = getQ.get(a.question_id);
    if (!q) return res.status(400).json({ error: 'bad_question' });
    const text = String(a.answer_text || '');
    graded.push({ qid: q.id, text, awarded: text.trim() ? q.expected_mark : 0 });
  }
  const durationSec = Math.max(0, Number(req.body.duration_sec) || 0);
  const per = Math.round(durationSec / graded.length);
  const ins = db.prepare(`
    INSERT INTO attempts (user_id, question_id, exam_id, answer_text, awarded_mark, mode, duration_sec)
    VALUES (?,?,?,?,?,'exam',?)
  `);
  let score = 0;
  for (const g of graded) {
    score += g.awarded;
    ins.run(uid, g.qid, exam.id, g.text, g.awarded, per);
  }
  db.prepare(`UPDATE exams SET score=?, submitted_at=datetime('now') WHERE id=?`).run(score, exam.id);
  res.json(examResults(exam.id, uid));
});

router.get('/exams/:id', requireAuth, (req, res) => {
  const payload = examResults(req.params.id, req.session.userId);
  if (!payload) return res.status(404).json({ error: 'not_found' });
  res.json(payload);
});

module.exports = router;
