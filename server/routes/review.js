const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

// Admin-only: these endpoints expose and edit mark schemes, so they must never
// be reachable by students.
router.use('/review', requireAdmin);

const partsOf = db.prepare(
  'SELECT id, letter, text_latex, marks, expected_mark, mark_scheme FROM question_parts WHERE question_id=? ORDER BY display_order'
);
const imagesOf = db.prepare(
  'SELECT id, svg, src, caption, original_pdf_page, crop_top, crop_bottom FROM images WHERE question_id=? ORDER BY display_order'
);

// The queue of questions still awaiting a human check.
router.get('/review/queue', (req, res) => {
  const { subject, year, component, all } = req.query;
  const where = [];
  const args = [];
  if (!all) where.push('needs_review = 1');
  if (subject) { where.push('subject = ?'); args.push(subject); }
  if (year) { where.push('year = ?'); args.push(Number(year)); }
  if (component) { where.push('component = ?'); args.push(Number(component)); }
  const sql = `SELECT id, subject, year, component, number, marks, needs_review
    FROM questions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY subject, year DESC, component, number`;
  const rows = db.prepare(sql).all(...args);
  const pending = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE needs_review=1').get().n;
  const total = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  res.json({ questions: rows, pending, total });
});

// One question with everything an editor needs, including the mark scheme.
router.get('/review/:id', (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  res.json({ question: { ...q, parts: partsOf.all(q.id), images: imagesOf.all(q.id) } });
});

/**
 * Save an edited question.
 * Keeps the invariants the importer enforces: marks stay positive, expected
 * marks never exceed them, and a question's parts must still sum to its total.
 */
router.patch('/review/:id', (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};

  const text = body.text_latex === undefined ? q.text_latex : String(body.text_latex);
  const markScheme = body.mark_scheme === undefined ? q.mark_scheme : String(body.mark_scheme);
  const marks = body.marks === undefined ? q.marks : Number(body.marks);
  const expected = body.expected_mark === undefined ? q.expected_mark : Number(body.expected_mark);
  const parts = Array.isArray(body.parts) ? body.parts : null;

  const existingParts = partsOf.all(q.id);
  if (!Number.isInteger(marks) || marks <= 0) {
    return res.status(400).json({ error: 'bad_marks' });
  }
  if (!Number.isInteger(expected) || expected < 0 || expected > marks) {
    return res.status(400).json({ error: 'bad_expected_mark' });
  }
  // A question with no parts must still have wording.
  if (!parts && existingParts.length === 0 && !text.trim()) {
    return res.status(400).json({ error: 'text_required' });
  }

  if (parts) {
    for (const p of parts) {
      const known = existingParts.find((e) => e.id === Number(p.id));
      if (!known) return res.status(400).json({ error: 'unknown_part' });
      const pm = p.marks === undefined ? known.marks : Number(p.marks);
      const pe = p.expected_mark === undefined ? known.expected_mark : Number(p.expected_mark);
      if (!Number.isInteger(pm) || pm <= 0) return res.status(400).json({ error: 'bad_part_marks' });
      if (!Number.isInteger(pe) || pe < 0 || pe > pm) return res.status(400).json({ error: 'bad_part_expected' });
    }
    const sum = parts.reduce((s, p) => {
      const known = existingParts.find((e) => e.id === Number(p.id));
      return s + (p.marks === undefined ? known.marks : Number(p.marks));
    }, 0);
    if (sum !== marks) return res.status(400).json({ error: 'part_marks_mismatch' });
  }

  const update = db.prepare(`UPDATE questions
    SET text_latex=?, mark_scheme=?, marks=?, expected_mark=?, needs_review=? WHERE id=?`);
  const updPart = db.prepare(`UPDATE question_parts
    SET text_latex=?, marks=?, expected_mark=?, mark_scheme=? WHERE id=? AND question_id=?`);

  const reviewed = body.needs_review === undefined ? q.needs_review : (body.needs_review ? 1 : 0);
  update.run(text, markScheme, marks, expected, reviewed, q.id);
  if (parts) {
    for (const p of parts) {
      const known = existingParts.find((e) => e.id === Number(p.id));
      updPart.run(
        p.text_latex === undefined ? known.text_latex : String(p.text_latex),
        p.marks === undefined ? known.marks : Number(p.marks),
        p.expected_mark === undefined ? known.expected_mark : Number(p.expected_mark),
        p.mark_scheme === undefined ? known.mark_scheme : String(p.mark_scheme),
        known.id, q.id
      );
    }
  }

  const saved = db.prepare('SELECT * FROM questions WHERE id=?').get(q.id);
  res.json({ question: { ...saved, parts: partsOf.all(q.id), images: imagesOf.all(q.id) } });
});

module.exports = router;
