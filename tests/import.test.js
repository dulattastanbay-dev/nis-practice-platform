const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nis-import-'));
  process.env.NIS_DB_PATH = path.join(dir, 'test.sqlite');
  const serverDir = path.join(__dirname, '..', 'server') + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }
  return { db: require('../server/db.js'), importer: require('../server/import-paper.js') };
}

const paper = {
  subject: 'Mathematics',
  year: 2023,
  component: 1,
  original_pdf_name: 'math_2023_c1.pdf',
  questions: [
    {
      number: 1, marks: 5, expected_mark: 4, topic: 'Integration',
      text: 'Imported question text', original_pdf_page: 2,
      mark_scheme: 'M1 A1', ai_feedback: 'Nice work', objectives: ['11.1.1'],
      images: [{ svg: '<svg/>', caption: 'fig', page: 2 }],
      parts: [
        { letter: 'a', text: 'part a', marks: 2, expected_mark: 2, mark_scheme: 'M1', ai_feedback: 'ok' },
        { letter: 'b', text: 'part b', marks: 3, expected_mark: 2, mark_scheme: 'A1', ai_feedback: 'hmm' },
      ],
    },
  ],
};

test('validate rejects papers whose part marks do not sum to the question', () => {
  const { importer } = freshDb();
  const bad = JSON.parse(JSON.stringify(paper));
  bad.questions[0].parts[0].marks = 99;
  const errors = importer.validate(bad);
  assert.ok(errors.some((e) => e.includes('must sum to question marks')));
  // a valid paper produces no errors
  assert.deepStrictEqual(importer.validate(paper), []);
});

test('a question with parts may have an empty stem, but a bare one may not', () => {
  const { importer } = freshDb();
  const withParts = JSON.parse(JSON.stringify(paper));
  withParts.questions[0].text = ''; // starts straight at (a)
  assert.deepStrictEqual(importer.validate(withParts), [],
    'empty stem is valid when parts carry the wording');

  const noParts = JSON.parse(JSON.stringify(paper));
  noParts.questions[0].text = '';
  noParts.questions[0].parts = [];
  noParts.questions[0].expected_mark = 4;
  assert.ok(importer.validate(noParts).some((e) => e.includes('text is required')),
    'a question with no parts still needs text');
});

test('validate catches missing fields and impossible expected marks', () => {
  const { importer } = freshDb();
  assert.ok(importer.validate({}).length > 0);
  const bad = JSON.parse(JSON.stringify(paper));
  bad.questions[0].expected_mark = 99;
  bad.questions[0].parts = [];
  assert.ok(importer.validate(bad).some((e) => e.includes('cannot exceed marks')));
});

test('import creates the question with its parts, image, page and objective', () => {
  const { db, importer } = freshDb();
  importer.importPaper(paper);

  const q = db.prepare('SELECT * FROM questions WHERE subject=? AND year=2023 AND component=1 AND number=1')
    .get('Mathematics');
  assert.ok(q, 'question imported');
  assert.strictEqual(q.text_latex, 'Imported question text'); // wording preserved verbatim
  assert.strictEqual(q.marks, 5);
  assert.strictEqual(q.original_pdf_page, 2);
  assert.strictEqual(q.has_images, 1);

  const parts = db.prepare('SELECT * FROM question_parts WHERE question_id=? ORDER BY display_order').all(q.id);
  assert.deepStrictEqual(parts.map((p) => p.letter), ['a', 'b']);
  assert.strictEqual(parts.reduce((s, p) => s + p.marks, 0), q.marks);

  const imgs = db.prepare('SELECT * FROM images WHERE question_id=?').all(q.id);
  assert.strictEqual(imgs.length, 1);
  assert.strictEqual(imgs[0].original_pdf_page, 2);

  const los = db.prepare(`
    SELECT lo.code FROM question_objectives qo
    JOIN learning_objectives lo ON lo.id = qo.objective_id
    WHERE qo.question_id = ?`).all(q.id);
  assert.deepStrictEqual(los.map((l) => l.code), ['11.1.1']);
});

test('import is idempotent — re-running adds nothing', () => {
  const { db, importer } = freshDb();
  importer.importPaper(paper);
  const before = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  const partsBefore = db.prepare('SELECT COUNT(*) AS n FROM question_parts').get().n;
  importer.importPaper(paper);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM questions').get().n, before);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM question_parts').get().n, partsBefore);
});
