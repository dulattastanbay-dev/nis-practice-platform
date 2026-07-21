#!/usr/bin/env node
/**
 * Import a past paper into the database.
 *
 *   node server/import-paper.js <paper.json>
 *   node server/import-paper.js --extract <paper.pdf> [> draft.json]
 *
 * Why two steps?
 * --------------
 * Real past-paper PDFs have no machine-readable structure: question numbers,
 * marks, parts and mark schemes are laid out visually and differ per paper and
 * per subject. Guessing that layout blindly produces silently wrong content —
 * and the spec is explicit that the database must "never modify the original
 * wording". So importing is deliberately two steps:
 *
 *   1. --extract  reads the PDF (via poppler's pdftotext) and emits a JSON
 *      skeleton with the text of each page, so nothing is invented.
 *   2. The JSON is checked/completed by a human (or a smarter parser later),
 *      then imported. The import itself is exact and idempotent.
 *
 * JSON format (see docs/import-format.md):
 * {
 *   "subject": "Mathematics", "year": 2025, "component": 2,
 *   "duration_min": 90, "original_pdf_name": "math_2025_c2.pdf",
 *   "questions": [
 *     { "number": 1, "marks": 3, "topic": "Integration", "text": "...",
 *       "original_pdf_page": 2, "calculator_allowed": true,
 *       "mark_scheme": "...", "ai_feedback": "...", "expected_mark": 3,
 *       "objectives": ["11.1.1"],
 *       "images": [{ "svg": "<svg .../>", "caption": "...", "page": 2 }],
 *       "parts": [{ "letter": "a", "text": "...", "marks": 2,
 *                   "expected_mark": 2, "mark_scheme": "...", "ai_feedback": "..." }] }
 *   ]
 * }
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function extract(pdfPath) {
  let text;
  try {
    text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  } catch (err) {
    console.error('pdftotext is required for --extract (install poppler-utils).');
    process.exit(1);
  }
  const pages = text.split('\f').filter((p) => p.trim());
  const base = path.basename(pdfPath);
  return {
    subject: 'REPLACE_ME',
    year: 0,
    component: 0,
    duration_min: 90,
    original_pdf_name: base,
    _note: 'Auto-extracted skeleton. Fill in the fields, split pages into questions, then import.',
    questions: pages.map((body, i) => ({
      number: i + 1,
      original_pdf_page: i + 1,
      marks: 0,
      topic: 'REPLACE_ME',
      text: body.trim(),
      mark_scheme: '',
      ai_feedback: '',
      expected_mark: 0,
      objectives: [],
      images: [],
      parts: [],
    })),
  };
}

function validate(paper) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  req(paper && typeof paper === 'object', 'paper must be an object');
  req(typeof paper.subject === 'string' && paper.subject !== 'REPLACE_ME', 'subject is required');
  req(Number.isInteger(paper.year) && paper.year > 1990, 'year must be a real year');
  req(Number.isInteger(paper.component), 'component must be an integer');
  req(Array.isArray(paper.questions) && paper.questions.length > 0, 'questions must be a non-empty array');
  (paper.questions || []).forEach((q, i) => {
    const at = `questions[${i}]`;
    req(Number.isInteger(q.number), `${at}.number must be an integer`);
    const parts = q.parts || [];
    // A question that begins straight at (a) has no shared stem; its parts carry
    // the wording, so an empty text is valid only when parts exist.
    req(
      typeof q.text === 'string' && (q.text.trim() || parts.length > 0),
      `${at}.text is required (or the question must have parts)`
    );
    req(Number.isInteger(q.marks) && q.marks > 0, `${at}.marks must be > 0`);
    if (parts.length) {
      const sum = parts.reduce((s, p) => s + (Number(p.marks) || 0), 0);
      req(sum === q.marks, `${at}: part marks (${sum}) must sum to question marks (${q.marks})`);
      const expSum = parts.reduce((s, p) => s + (Number(p.expected_mark) || 0), 0);
      req(expSum === (Number(q.expected_mark) || 0),
        `${at}: part expected marks (${expSum}) must sum to question expected_mark (${q.expected_mark})`);
    }
    req((Number(q.expected_mark) || 0) <= q.marks, `${at}.expected_mark cannot exceed marks`);
  });
  return errors;
}

function importPaper(paper) {
  const db = require('./db');
  const errors = validate(paper);
  if (errors.length) {
    console.error('Import aborted — invalid paper:');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  const findQ = db.prepare(
    'SELECT id FROM questions WHERE subject=? AND year=? AND component=? AND number=?'
  );
  const insQ = db.prepare(`
    INSERT INTO questions
      (subject, year, component, number, marks, topic, text_latex, figure_svg, mark_scheme,
       ai_feedback, expected_mark, original_pdf_page, has_images, calculator_allowed, needs_review)
    VALUES (?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)
  `);
  const insPart = db.prepare(`
    INSERT INTO question_parts
      (question_id, letter, text_latex, marks, expected_mark, mark_scheme, ai_feedback, display_order)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const insImg = db.prepare(
    'INSERT INTO images (question_id, svg, src, caption, original_pdf_page, display_order) VALUES (?,?,?,?,?,?)'
  );
  // Page scans are copied into public/ so they can be served alongside the app.
  const IMG_DIR = path.join(__dirname, '..', 'public', 'img', 'papers');
  function storeImage(im) {
    if (!im.abs || !fs.existsSync(im.abs)) return null;
    const slug = `${paper.subject}_${paper.year}_C${paper.component}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const dir = path.join(IMG_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    const name = path.basename(im.abs);
    fs.copyFileSync(im.abs, path.join(dir, name));
    return `img/papers/${slug}/${name}`;
  }
  const findLo = db.prepare('SELECT id FROM learning_objectives WHERE subject=? AND code=?');
  const linkLo = db.prepare('INSERT OR IGNORE INTO question_objectives (question_id, objective_id) VALUES (?,?)');

  let added = 0;
  let skipped = 0;
  for (const q of paper.questions) {
    if (findQ.get(paper.subject, paper.year, paper.component, q.number)) {
      skipped += 1; // idempotent: never duplicate or rewrite existing wording
      continue;
    }
    const images = q.images || [];
    const info = insQ.run(
      paper.subject, paper.year, paper.component, q.number, q.marks, q.topic || '',
      q.text, q.mark_scheme || '', q.ai_feedback || '', Number(q.expected_mark) || 0,
      q.original_pdf_page || null, images.length ? 1 : 0,
      q.calculator_allowed === false ? 0 : 1,
      q.needs_review ? 1 : 0
    );
    const qid = Number(info.lastInsertRowid);
    (q.parts || []).forEach((p, i) => {
      insPart.run(qid, p.letter, p.text, p.marks, Number(p.expected_mark) || 0,
        p.mark_scheme || '', p.ai_feedback || '', i);
    });
    images.forEach((im, i) => {
      const src = im.src || storeImage(im);
      if (!im.svg && !src) return; // nothing renderable
      insImg.run(qid, im.svg || '', src, im.caption || null,
        im.page || q.original_pdf_page || null, i);
    });
    for (const code of q.objectives || []) {
      const lo = findLo.get(paper.subject, code);
      if (lo) linkLo.run(qid, lo.id);
      else console.warn(`  ! unknown objective ${code} for question ${q.number} (skipped)`);
    }
    added += 1;
  }
  console.log(`Imported ${added} question(s); skipped ${skipped} already present.`);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node server/import-paper.js <paper.json>');
    console.error('       node server/import-paper.js --extract <paper.pdf>');
    process.exit(1);
  }
  if (args[0] === '--extract') {
    if (!args[1]) { console.error('--extract needs a PDF path'); process.exit(1); }
    console.log(JSON.stringify(extract(args[1]), null, 2));
    return;
  }
  const file = args[0];
  if (!fs.existsSync(file)) { console.error(`No such file: ${file}`); process.exit(1); }
  importPaper(JSON.parse(fs.readFileSync(file, 'utf8')));
}

if (require.main === module) main();

module.exports = { validate, importPaper, extract };
