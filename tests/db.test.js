const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nis-db-test-'));
  process.env.NIS_DB_PATH = path.join(dir, 'test.sqlite');
  const serverDir = path.join(__dirname, '..', 'server') + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }
  return require('../server/db.js');
}

test('schema is created and questions are seeded', () => {
  const db = freshDb();
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map((r) => r.name);
  for (const t of ['users', 'questions', 'exams', 'attempts', 'marked']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  assert.ok(n >= 24, `expected >= 24 seeded questions, got ${n}`);
});

test('Mathematics 2025 component 2 is a full 60-mark exam scoring 48', () => {
  const db = freshDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS n, SUM(marks) AS total, SUM(expected_mark) AS expected
     FROM questions WHERE subject='Mathematics' AND year=2025 AND component=2`
  ).get();
  assert.strictEqual(row.n, 12);
  assert.strictEqual(row.total, 60);
  assert.strictEqual(row.expected, 48);
});

test('every subject has questions and topics', () => {
  const db = freshDb();
  for (const s of ['Mathematics', 'Chemistry', 'Physics', 'Biology']) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE subject=?').get(s).n;
    assert.ok(n >= 4, `${s} has ${n} questions`);
    const topics = db.prepare(
      'SELECT COUNT(DISTINCT topic) AS n FROM questions WHERE subject=?'
    ).get(s).n;
    assert.ok(topics >= 4, `${s} has ${topics} topics`);
  }
});

test('seeding is idempotent (re-require does not duplicate)', () => {
  const db = freshDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  const serverDir = path.join(__dirname, '..', 'server') + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }
  const db2 = require('../server/db.js');
  const after = db2.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  assert.strictEqual(before, after);
});
