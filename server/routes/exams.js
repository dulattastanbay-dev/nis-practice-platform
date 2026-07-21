const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
const PUB = 'id, subject, year, component, number, marks, topic, text_latex, figure_svg,'
  + ' original_pdf_page, has_images, calculator_allowed, needs_review';

const partsPublic = db.prepare(
  'SELECT id, letter, text_latex, marks FROM question_parts WHERE question_id=? ORDER BY display_order'
);
const imagesPublic = db.prepare(
  'SELECT id, svg, src, caption, original_pdf_page, crop_top, crop_bottom FROM images WHERE question_id=? ORDER BY display_order'
);
const partsGrading = db.prepare('SELECT * FROM question_parts WHERE question_id=? ORDER BY display_order');
function decorate(q) {
  return { ...q, parts: partsPublic.all(q.id), images: imagesPublic.all(q.id) };
}

// The set of questions that make up an exam, derived the same way POST /exams
// builds it: exact subject+year+component paper, else the subject's first 12.
// Grading iterates over THIS set (not the client's answer list) so a repeated
// or foreign question_id can never inflate the score past exam.total.
function examGradingSet(exam) {
  let rows = db.prepare(
    'SELECT id, marks, expected_mark FROM questions WHERE subject=? AND year=? AND component=? ORDER BY number'
  ).all(exam.subject, exam.year, exam.component);
  if (rows.length === 0) {
    rows = db.prepare('SELECT id, marks, expected_mark FROM questions WHERE subject=? ORDER BY number LIMIT 12')
      .all(exam.subject);
  }
  return rows;
}

function examResults(examId, uid) {
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(examId, uid);
  if (!exam) return null;
  // One row per question; a question with parts merges its parts' answers/marks.
  const rows = db.prepare(`
    SELECT q.id AS question_id, q.number, q.marks, q.topic, q.text_latex, q.figure_svg,
           q.mark_scheme, q.ai_feedback,
           a.part_id, a.answer_text, a.awarded_mark,
           p.letter, p.marks AS part_marks, p.mark_scheme AS part_scheme,
           p.ai_feedback AS part_feedback, p.display_order
    FROM attempts a
    JOIN questions q ON q.id = a.question_id
    LEFT JOIN question_parts p ON p.id = a.part_id
    WHERE a.exam_id = ? AND a.user_id = ?
    ORDER BY q.number, p.display_order
  `).all(examId, uid);

  const byQuestion = new Map();
  for (const r of rows) {
    let entry = byQuestion.get(r.question_id);
    if (!entry) {
      entry = {
        question_id: r.question_id, number: r.number, marks: r.marks, topic: r.topic,
        text_latex: r.text_latex, figure_svg: r.figure_svg,
        mark_scheme: r.mark_scheme, ai_feedback: r.ai_feedback,
        images: imagesPublic.all(r.question_id),
        answer_text: '', awarded_mark: 0, parts: [],
      };
      byQuestion.set(r.question_id, entry);
    }
    entry.awarded_mark += r.awarded_mark;
    if (r.part_id) {
      entry.parts.push({
        part_id: r.part_id, letter: r.letter, marks: r.part_marks,
        answer_text: r.answer_text, awarded_mark: r.awarded_mark,
        mark_scheme: r.part_scheme, ai_feedback: r.part_feedback,
      });
      // Overview shows a readable roll-up of the part answers.
      if (r.answer_text.trim()) {
        entry.answer_text += `${entry.answer_text ? '  ' : ''}(${r.letter}) ${r.answer_text}`;
      }
    } else {
      entry.answer_text = r.answer_text;
    }
  }
  const results = [...byQuestion.values()];
  const pct = exam.total ? Math.round((100 * (exam.score || 0)) / exam.total) : 0;
  return { exam: { ...exam, pct }, results };
}

router.post('/exams', requireAuth, (req, res) => {
  const { subject, year, component } = req.body || {};
  const y = Number(year);
  const c = Number(component);
  if (!SUBJECTS.includes(subject)) return res.status(400).json({ error: 'bad_subject' });
  if (!Number.isInteger(y) || y < 2015 || y > 2030) return res.status(400).json({ error: 'bad_year' });
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
    questions: questions.map(decorate),
    marked_ids: markedIds,
  });
});

// The user's in-progress (unsubmitted) exam, with any saved draft answers, so a
// closed browser can resume exactly where it stopped.
router.get('/exams/current', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const exam = db.prepare(
    'SELECT * FROM exams WHERE user_id=? AND submitted_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1'
  ).get(uid);
  if (!exam) return res.status(404).json({ error: 'no_exam_in_progress' });
  const questions = db.prepare(
    `SELECT ${PUB} FROM questions WHERE subject=? AND year=? AND component=? ORDER BY number`
  ).all(exam.subject, exam.year, exam.component);
  const list = questions.length
    ? questions
    : db.prepare(`SELECT ${PUB} FROM questions WHERE subject=? ORDER BY number LIMIT 12`).all(exam.subject);
  let answers = {};
  try { answers = exam.draft_answers ? JSON.parse(exam.draft_answers) : {}; } catch { answers = {}; }
  const markedIds = db.prepare('SELECT question_id FROM marked WHERE user_id=?').all(uid)
    .map((r) => r.question_id);
  res.json({
    exam: {
      id: exam.id, subject: exam.subject, year: exam.year, component: exam.component,
      total: exam.total, duration_min: 90,
      draft_idx: exam.draft_idx || 0,
      draft_remaining_sec: exam.draft_remaining_sec,
    },
    questions: list.map(decorate),
    marked_ids: markedIds,
    answers,
  });
});

// Autosaved draft of an in-progress exam.
router.post('/exams/:id/draft', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const exam = db.prepare('SELECT id, submitted_at FROM exams WHERE id=? AND user_id=?').get(req.params.id, uid);
  if (!exam) return res.status(404).json({ error: 'not_found' });
  if (exam.submitted_at) return res.status(409).json({ error: 'already_submitted' });
  const { answers, idx, remaining_sec } = req.body || {};
  db.prepare('UPDATE exams SET draft_answers=?, draft_idx=?, draft_remaining_sec=? WHERE id=?')
    .run(
      JSON.stringify(answers && typeof answers === 'object' ? answers : {}),
      Math.max(0, Number(idx) || 0),
      remaining_sec == null ? null : Math.max(0, Number(remaining_sec) || 0),
      exam.id
    );
  res.json({ ok: true });
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
  // Map the client's answers by question id, and by part id where given.
  // (Last write wins on duplicates.)
  const answerFor = new Map();
  const partAnswerFor = new Map();
  for (const a of answers) {
    if (a.part_id != null) partAnswerFor.set(Number(a.part_id), String(a.answer_text || ''));
    else answerFor.set(Number(a.question_id), String(a.answer_text || ''));
  }
  // Grade over the exam's own question set: one attempt per question, or one per
  // part for questions that have parts.
  const graded = [];
  for (const q of examGradingSet(exam)) {
    const parts = partsGrading.all(q.id);
    if (parts.length) {
      for (const p of parts) {
        const text = partAnswerFor.get(p.id) || '';
        graded.push({ qid: q.id, partId: p.id, text, awarded: text.trim() ? p.expected_mark : 0 });
      }
    } else {
      const text = answerFor.get(q.id) || '';
      graded.push({ qid: q.id, partId: null, text, awarded: text.trim() ? q.expected_mark : 0 });
    }
  }
  const durationSec = Math.max(0, Number(req.body.duration_sec) || 0);
  // Split the exam duration across attempts so the stored parts sum to exactly the
  // submitted total (rounding each share would drift).
  const per = Math.floor(durationSec / graded.length);
  let extra = durationSec - per * graded.length;
  const ins = db.prepare(`
    INSERT INTO attempts (user_id, question_id, part_id, exam_id, answer_text, awarded_mark, mode, duration_sec)
    VALUES (?,?,?,?,?,?,'exam',?)
  `);
  let score = 0;
  for (const g of graded) {
    score += g.awarded;
    const share = per + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    ins.run(uid, g.qid, g.partId, exam.id, g.text, g.awarded, share);
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
