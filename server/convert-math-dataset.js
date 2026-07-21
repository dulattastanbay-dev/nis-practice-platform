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
  // stripNoise first so repeated page headers/footers never survive into
  // question text or mark schemes.
  return stripNoise(s)
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

// Running heads/footers the PDF repeats on every page; they land mid-question
// when a question spans a page break.
// Tokens the PDF repeats in running heads/footers. They are removed from the
// line first; the line is then dropped only if nothing meaningful is left, so a
// footer sharing a line with real text can never delete that text.
const NOISE_TOKENS = [
  /AEO\s+NIS\s+\d{4}/ig,
  /NIS\s*\/\s*G\d+\s*\/\s*[A-Z]+\s*\/\s*\d+/ig,
  /\[?\s*Смотрите\s+далее\s*\]?/ig,
  /\bPTO\b/ig,
];
// The papers print a narrow right-hand margin column headed "Для экзаменатора"
// (for the examiner). PDF extraction interleaves it into the question text,
// often hyphenated across lines as "экзамена-" / "тора".
// NOTE: JavaScript's \b is defined over [A-Za-z0-9_], so it never matches a
// Cyrillic word boundary — /\bтора\b/ silently fails. Use explicit lookarounds.
const CYR = 'А-Яа-яЁёA-Za-z';
const TORA = new RegExp(`(?<![${CYR}])тора(?![${CYR}])`, 'gi');
const EXAMINER = new RegExp(`(?<![${CYR}])экзаменатора(?![${CYR}])`, 'gi');

function stripExaminerColumn(s) {
  const text = String(s || '');
  // Only touch text that actually shows the column, so the very common word
  // "Для" is never removed from ordinary sentences.
  if (!/экзамена\s*-/i.test(text) && !EXAMINER.test(text) && !TORA.test(text)) return text;
  EXAMINER.lastIndex = 0; TORA.lastIndex = 0; // reset the /g regexes after .test
  return text
    .replace(/экзамена\s*-\s*/gi, ' ')
    .replace(EXAMINER, ' ')
    .replace(TORA, ' ')
    // a lone "Для" left dangling at the end of a line is the column header
    .replace(/[ \t]+Для[ \t]*$/gim, '');
}

/**
 * In these papers the marks marker "[N]" is printed at the END of a question.
 * Anything after the last marker therefore belongs to the NEXT question, which
 * the page-based extractor swept up. Drop it, and drop the markers themselves —
 * they are metadata, not wording, and the marks are already stored separately.
 */
function trimAtMarks(s) {
  const text = String(s || '');
  const markers = [...text.matchAll(/\[\d{1,2}\]/g)];
  if (!markers.length) return text; // marks came from the points field; leave as is
  const last = markers[markers.length - 1];
  return text.slice(0, last.index + last[0].length).replace(/\[\d{1,2}\]/g, ' ');
}

function stripNoise(s) {
  return stripExaminerColumn(s)
    .split('\n')
    .map((line) => NOISE_TOKENS.reduce((acc, re) => acc.replace(re, ' '), line))
    // Drop lines that are now blank or just a page number.
    .filter((line) => line.trim() && !/^\s*\d{1,2}\s*$/.test(line))
    .join('\n');
}

// The papers mix Latin and Cyrillic letters for part labels — (а) U+430 and
// (с) U+441 look identical to (a)/(c) but are different characters.
const HOMOGLYPH = { 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x' };
function normLetter(ch) {
  return HOMOGLYPH[ch] || String(ch).toLowerCase();
}

const PART_RE = /^[ \t]*\(([a-zA-Zа-яА-Я])\)[ \t]*/gm;

/**
 * Split a question into (a)(b)(c) parts.
 * Returns { stem, parts } or null when the question should stay whole.
 * Only splits when the labels run a,b,c... in order AND each part carries its
 * own [N] marks — otherwise the marks would be guesswork.
 */
function splitParts(rawText, questionMarks) {
  const text = stripNoise(rawText);
  const hits = [...text.matchAll(PART_RE)];
  if (hits.length < 2) return null;

  // Labels must be sequential from 'a' (guards against stray "(i)" or refs).
  const letters = hits.map((h) => normLetter(h[1]));
  for (let i = 0; i < letters.length; i += 1) {
    if (letters[i] !== String.fromCharCode(97 + i)) return null;
  }

  const stem = cleanText(text.slice(0, hits[0].index));
  const parts = [];
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].index + hits[i][0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    let body = text.slice(start, end);

    // Each part prints its own marks; take the last [N] inside the part.
    const marksIn = [...body.matchAll(/\[(\d{1,2})\]/g)];
    if (!marksIn.length) return null;
    const marks = Number(marksIn[marksIn.length - 1][1]);
    if (!(marks > 0)) return null;
    // Same rule inside a part: cut at its own [N], then drop the marker.
    body = cleanText(trimAtMarks(body));
    if (!body) return null;
    parts.push({ letter: letters[i], text: body, marks });
  }

  // Part marks must reconstruct the question total exactly, or we don't trust it.
  const sum = parts.reduce((s, p) => s + p.marks, 0);
  if (sum !== questionMarks) return null;

  return { stem, parts };
}

function convertPaper(dir, outDir) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  const year = Number(data.year);
  const component = componentOf(data.month);
  const questions = [];
  let skipped = 0;

  for (const q of data.questions || []) {
    const { marks, source } = extractMarks(q);
    // Cut at the last [N] so the next question's text cannot bleed in.
    const text = cleanText(trimAtMarks(q.text));
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

    const scheme = cleanText(q.answer) || 'See the official marking scheme for this paper.';
    const fallbackFeedback = 'Compare your working with the marking scheme for this question.';

    // Split (a)(b)(c) into real parts when the marks reconstruct exactly.
    const split = splitParts(q.text, marks);
    let parts = [];
    let questionText = text;
    if (split) {
      // A question may begin straight at (a) — then there is no shared stem and
      // the parts carry everything. Must NOT fall back to the full text, or the
      // stem would repeat every part.
      questionText = split.stem;
      parts = split.parts.map((p) => ({
        letter: p.letter,
        text: p.text,
        marks: p.marks,
        // Same 70% fallback as whole questions, but per part so they still sum.
        expected_mark: Math.max(1, Math.round(p.marks * 0.7)),
        mark_scheme: scheme,
        ai_feedback: fallbackFeedback,
      }));
      // Question expected_mark must equal the sum of its parts'.
      const partExpected = parts.reduce((s, p) => s + p.expected_mark, 0);
      questions.push({
        number: Number(q.number),
        marks,
        expected_mark: partExpected,
        topic: 'Past paper',
        text: questionText,
        original_pdf_page: Number(q.page) || null,
        calculator_allowed: component !== 1,
        mark_scheme: scheme,
        ai_feedback: fallbackFeedback,
        objectives: [],
        images,
        parts,
        marks_source: source,
        needs_review: true,
      });
      continue;
    }

    questions.push({
      number: Number(q.number),
      marks,
      expected_mark: Math.min(expected, marks),
      topic: 'Past paper',
      text,
      original_pdf_page: Number(q.page) || null,
      calculator_allowed: component !== 1,
      mark_scheme: scheme,
      ai_feedback: fallbackFeedback,
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
  const splitCount = questions.filter((q) => q.parts.length).length;
  const partCount = questions.reduce((s, q) => s + q.parts.length, 0);
  return { outFile, count: questions.length, skipped, year, component, splitCount, partCount };
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
  let totalSplit = 0;
  let totalParts = 0;
  for (const d of dirs) {
    const r = convertPaper(path.join(datasetDir, d), outDir);
    total += r.count;
    totalSkipped += r.skipped;
    totalSplit += r.splitCount;
    totalParts += r.partCount;
    console.log(`${d} -> ${r.count} questions, ${r.splitCount} split into ${r.partCount} parts`
      + (r.skipped ? `, ${r.skipped} skipped` : ''));
  }
  console.log(`\nConverted ${dirs.length} papers, ${total} questions (${totalSkipped} skipped).`);
  console.log(`Split ${totalSplit} questions into ${totalParts} parts.`);
}

if (require.main === module) main();

module.exports = {
  cleanText, extractMarks, componentOf, convertPaper, splitParts, stripNoise,
  stripExaminerColumn, trimAtMarks,
};
