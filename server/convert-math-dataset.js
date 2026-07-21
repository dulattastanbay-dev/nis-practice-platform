#!/usr/bin/env node
/**
 * Convert the extracted NIS Mathematics dataset (output/YYYY_MXX/data.json +
 * page images) into the import format used by server/import-paper.js.
 *
 *   node server/convert-math-dataset.js <dataset-dir> <out-dir>
 *
 * The dataset is auto-extracted from PDFs, so per its own README:
 *   - formulas in `text` can be garbled (symbol order lost in extraction)
 *   - the page IMAGE is authoritative; the text is a search/scan aid
 *   - many questions carry no `points`, but the paper prints marks as "[2]"
 *
 * So this converter:
 *   - keeps the original wording verbatim (only whitespace is normalised)
 *   - recovers marks from `points`, else from the last [N] marker in the text
 *   - always attaches the page image, which renders the question correctly
 *   - marks every question `needs_review` so garbled text can be fixed later
 */
const fs = require('node:fs');
const path = require('node:path');

// Collapse the ragged whitespace left by PDF column extraction.
function cleanText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Marks: prefer the explicit field, else the LAST [N] printed in the question.
function extractMarks(q) {
  const p = Number(q.points);
  if (Number.isInteger(p) && p > 0) return { marks: p, source: 'points' };
  const all = String(q.text || '').match(/\[(\d{1,2})\]/g) || [];
  if (all.length) {
    // Sub-parts each print their own [n]; the question total is their sum.
    const nums = all.map((m) => Number(m.replace(/[^\d]/g, ''))).filter((n) => n > 0 && n <= 20);
    if (nums.length) return { marks: nums.reduce((a, b) => a + b, 0), source: 'brackets' };
  }
  return { marks: 0, source: 'none' };
}

// "M01" -> component 1
function componentOf(month) {
  const m = String(month || '').match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}

function convertPaper(dir, outDir) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  const year = Number(data.year);
  const component = componentOf(data.month);
  const questions = [];
  let skipped = 0;

  for (const q of data.questions || []) {
    const { marks, source } = extractMarks(q);
    const text = cleanText(q.text);
    if (!text || marks <= 0) { skipped += 1; continue; }

    // Fallback marking: award roughly 70% so progress is meaningful before a
    // real model marks the answer. Whole marks only.
    const expected = Math.max(1, Math.round(marks * 0.7));

    const images = [];
    if (q.image) {
      const imgPath = path.join(dir, q.image);
      if (fs.existsSync(imgPath)) {
        images.push({
          file: q.image,
          abs: imgPath,
          caption: `Page ${q.page}`,
          page: Number(q.page) || null,
        });
      }
    }

    questions.push({
      number: Number(q.number),
      marks,
      expected_mark: Math.min(expected, marks),
      topic: 'Past paper',
      text,
      original_pdf_page: Number(q.page) || null,
      calculator_allowed: component !== 1,
      mark_scheme: cleanText(q.answer) || 'See the official marking scheme for this paper.',
      ai_feedback: 'Compare your working with the marking scheme for this question.',
      objectives: [],
      images,
      parts: [],
      marks_source: source,
      needs_review: true,
    });
  }

  const paper = {
    subject: 'Mathematics',
    year,
    component,
    duration_min: 90,
    original_pdf_name: data.source_pdf || `${data.year}_${data.month}.pdf`,
    questions,
  };
  const outFile = path.join(outDir, `math_${data.year}_${data.month}.json`);
  fs.writeFileSync(outFile, JSON.stringify(paper, null, 2));
  return { outFile, count: questions.length, skipped, year, component };
}

function main() {
  const [datasetDir, outDir] = process.argv.slice(2);
  if (!datasetDir || !outDir) {
    console.error('Usage: node server/convert-math-dataset.js <dataset-dir> <out-dir>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const dirs = fs.readdirSync(datasetDir)
    .filter((d) => /^\d{4}_M\d{2}$/.test(d))
    .filter((d) => fs.existsSync(path.join(datasetDir, d, 'data.json')))
    .sort();

  let total = 0;
  let totalSkipped = 0;
  for (const d of dirs) {
    const r = convertPaper(path.join(datasetDir, d), outDir);
    total += r.count;
    totalSkipped += r.skipped;
    console.log(`${d} -> ${path.basename(r.outFile)}  (${r.count} questions, ${r.skipped} skipped)`);
  }
  console.log(`\nConverted ${dirs.length} papers, ${total} questions (${totalSkipped} skipped for missing text/marks).`);
}

if (require.main === module) main();

module.exports = { cleanText, extractMarks, componentOf, convertPaper };
