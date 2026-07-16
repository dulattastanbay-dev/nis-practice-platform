const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const ai = require('../ai');

const router = express.Router();
const PUB = 'id, subject, year, component, number, marks, topic, text_latex, figure_svg,'
  + ' original_pdf_page, has_images, calculator_allowed';

// Parts/images are public; their mark schemes and expected marks never are.
const partsPublic = db.prepare(
  'SELECT id, letter, text_latex, marks FROM question_parts WHERE question_id=? ORDER BY display_order'
);
const imagesPublic = db.prepare(
  'SELECT id, svg, caption, original_pdf_page FROM images WHERE question_id=? ORDER BY display_order'
);
function decorate(q) {
  return { ...q, parts: partsPublic.all(q.id), images: imagesPublic.all(q.id) };
}
// Full part rows (with answers) for grading only.
const partsGrading = db.prepare('SELECT * FROM question_parts WHERE question_id=? ORDER BY display_order');

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
  res.json({ questions: db.prepare(sql).all(...args).map(decorate) });
});

router.get('/questions/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT ${PUB} FROM questions WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ question: decorate(row) });
});

router.get('/topics', requireAuth, (req, res) => {
  const { subject } = req.query;
  const rows = subject
    ? db.prepare('SELECT DISTINCT topic FROM questions WHERE subject=? ORDER BY topic').all(subject)
    : db.prepare('SELECT DISTINCT topic FROM questions ORDER BY topic').all();
  res.json({ topics: rows.map((r) => r.topic) });
});

const insFeedback = db.prepare(
  'INSERT INTO ai_feedback (attempt_id, explanation, estimated_mark, model) VALUES (?,?,?,?)'
);

// Mark one answerable unit. Uses the real model when a key is configured and
// falls back to the preset mark/feedback otherwise (spec: the site must keep
// working when AI is unavailable).
async function markUnit({ text, unit, questionText }) {
  const graded = await ai.markAnswer({
    questionText,
    markScheme: unit.mark_scheme,
    maxMarks: unit.marks,
    answer: text,
  });
  if (graded) return { awarded: graded.mark, feedback: graded.feedback, byAI: true };
  return {
    awarded: text.trim() ? unit.expected_mark : 0,
    feedback: unit.ai_feedback,
    byAI: false,
  };
}

router.post('/attempts', requireAuth, async (req, res, next) => {
  try {
    const { question_id, answer_text, answers, mode, duration_sec } = req.body || {};
    if (mode !== 'practice') return res.status(400).json({ error: 'bad_mode' }); // exam answers go via /exams/:id/submit
    const q = db.prepare('SELECT * FROM questions WHERE id=?').get(question_id);
    if (!q) return res.status(404).json({ error: 'not_found' });
    const uid = req.session.userId;
    const dur = Math.max(0, Number(duration_sec) || 0);
    const ins = db.prepare(`INSERT INTO attempts (user_id, question_id, part_id, answer_text, awarded_mark, mode, duration_sec)
                VALUES (?,?,?,?,?,'practice',?)`);

    function record(qid, partId, text, awarded, dSec, feedback, byAI) {
      const info = ins.run(uid, qid, partId, text, awarded, dSec);
      if (byAI) insFeedback.run(Number(info.lastInsertRowid), feedback, awarded, ai.MODEL);
    }

    // A question split into (a)(b)(c) is answered and marked one part at a time.
    const parts = partsGrading.all(q.id);
    if (parts.length) {
      const given = answers && typeof answers === 'object' ? answers : {};
      const per = Math.round(dur / parts.length);
      let awardedTotal = 0;
      const details = [];
      for (const p of parts) {
        const text = String(given[p.id] || '');
        const m = await markUnit({ text, unit: p, questionText: `${q.text_latex}\n(${p.letter}) ${p.text_latex}` });
        awardedTotal += m.awarded;
        record(q.id, p.id, text, m.awarded, per, m.feedback, m.byAI);
        details.push({
          part_id: p.id, letter: p.letter, marks: p.marks,
          awarded_mark: m.awarded, ai_feedback: m.feedback, mark_scheme: p.mark_scheme,
        });
      }
      return res.json({
        awarded_mark: awardedTotal,
        expected_mark: q.expected_mark,
        marks: q.marks,
        parts: details,
        ai_feedback: q.ai_feedback,
        mark_scheme: q.mark_scheme,
        ai_enabled: ai.isEnabled(),
      });
    }

    const text = String(answer_text || '');
    const m = await markUnit({ text, unit: q, questionText: q.text_latex });
    record(q.id, null, text, m.awarded, dur, m.feedback, m.byAI);
    return res.json({
      awarded_mark: m.awarded,
      expected_mark: q.expected_mark,
      marks: q.marks,
      parts: [],
      ai_feedback: m.feedback,
      mark_scheme: q.mark_scheme,
      ai_enabled: ai.isEnabled(),
    });
  } catch (err) {
    return next(err);
  }
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

// A question is a mistake when its latest marks (summed across its parts, if it has
// any) fall short of the question total. Scoring full marks later clears it.
router.get('/mistakes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.id AS question_id, q.subject, q.year, q.component, q.number, q.marks, q.topic,
           SUM(a.awarded_mark) AS awarded_mark, MAX(a.created_at) AS created_at
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ?
      AND a.id IN (
        SELECT MAX(id) FROM attempts WHERE user_id = ?
        GROUP BY question_id, IFNULL(part_id, 0)
      )
    GROUP BY q.id
    HAVING SUM(a.awarded_mark) < q.marks
    ORDER BY created_at DESC, q.id DESC
  `).all(req.session.userId, req.session.userId);
  res.json({ mistakes: rows });
});

module.exports = router;
