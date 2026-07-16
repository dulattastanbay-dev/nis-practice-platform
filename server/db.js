const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const seed = require('./seed-data');

const DB_PATH = process.env.NIS_DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  year INTEGER NOT NULL,
  component INTEGER NOT NULL,
  number INTEGER NOT NULL,
  marks INTEGER NOT NULL,
  topic TEXT NOT NULL,
  text_latex TEXT NOT NULL,
  figure_svg TEXT,
  mark_scheme TEXT NOT NULL,
  ai_feedback TEXT NOT NULL,
  expected_mark INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  year INTEGER NOT NULL,
  component INTEGER NOT NULL,
  total INTEGER NOT NULL,
  score INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  draft_answers TEXT,
  draft_idx INTEGER,
  draft_remaining_sec INTEGER
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  exam_id INTEGER REFERENCES exams(id),
  answer_text TEXT NOT NULL,
  awarded_mark INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('practice','exam')),
  duration_sec INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id),
  explanation TEXT NOT NULL,
  estimated_mark INTEGER NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  part_id INTEGER REFERENCES question_parts(id),
  svg TEXT NOT NULL,
  caption TEXT,
  original_pdf_page INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS question_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  letter TEXT NOT NULL,
  text_latex TEXT NOT NULL,
  marks INTEGER NOT NULL,
  expected_mark INTEGER NOT NULL,
  mark_scheme TEXT NOT NULL,
  ai_feedback TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  UNIQUE (question_id, letter)
);
CREATE TABLE IF NOT EXISTS learning_objectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (subject, code)
);
CREATE TABLE IF NOT EXISTS question_objectives (
  question_id INTEGER NOT NULL REFERENCES questions(id),
  objective_id INTEGER NOT NULL REFERENCES learning_objectives(id),
  PRIMARY KEY (question_id, objective_id)
);
CREATE TABLE IF NOT EXISTS marked (
  user_id INTEGER NOT NULL REFERENCES users(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, question_id)
);
`);

// Lightweight migrations so databases created before these columns keep working.
function addColumns(table, cols) {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [col, type] of cols) {
    if (!have.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}
addColumns('exams', [['draft_answers', 'TEXT'], ['draft_idx', 'INTEGER'], ['draft_remaining_sec', 'INTEGER']]);
addColumns('attempts', [['part_id', 'INTEGER REFERENCES question_parts(id)']]);
addColumns('questions', [
  ['original_pdf_page', 'INTEGER'],
  ['has_images', 'INTEGER NOT NULL DEFAULT 0'],
  ['calculator_allowed', 'INTEGER NOT NULL DEFAULT 1'],
]);

const count = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
if (count === 0) {
  const ins = db.prepare(`
    INSERT INTO questions
      (subject, year, component, number, marks, topic, text_latex, figure_svg, mark_scheme, ai_feedback, expected_mark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const s of seed.questions) {
    ins.run(s.subject, s.year, s.component, s.number, s.marks, s.topic,
      s.text, s.figure, s.scheme, s.feedback, s.expected);
  }
}

const findQuestion = db.prepare(
  'SELECT id FROM questions WHERE subject=? AND year=? AND component=? AND number=?'
);

// Seed question parts ((a), (b), (c) ...).
if (db.prepare('SELECT COUNT(*) AS n FROM question_parts').get().n === 0) {
  const insPart = db.prepare(`
    INSERT INTO question_parts
      (question_id, letter, text_latex, marks, expected_mark, mark_scheme, ai_feedback, display_order)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  for (const p of seed.parts) {
    const q = findQuestion.get(p.subject, p.year, p.component, p.number);
    if (!q) continue;
    p.items.forEach((it, i) => {
      insPart.run(q.id, it.letter, it.text, it.marks, it.expected, it.scheme, it.feedback, i);
    });
  }
}

// Seed figures into the images table and flag their questions.
if (db.prepare('SELECT COUNT(*) AS n FROM images').get().n === 0) {
  const insImg = db.prepare(
    'INSERT INTO images (question_id, svg, caption, original_pdf_page, display_order) VALUES (?,?,?,?,?)'
  );
  const flag = db.prepare('UPDATE questions SET has_images=1, original_pdf_page=COALESCE(original_pdf_page, ?) WHERE id=?');
  seed.images.forEach((im, i) => {
    const q = findQuestion.get(im.subject, im.year, im.component, im.number);
    if (!q) return;
    insImg.run(q.id, im.svg, im.caption || null, im.page || null, i);
    flag.run(im.page || null, q.id);
  });
}

// Seed learning objectives and link each question to every objective covering its
// topic (a question may carry several objectives).
if (db.prepare('SELECT COUNT(*) AS n FROM learning_objectives').get().n === 0) {
  const insLo = db.prepare('INSERT INTO learning_objectives (subject, code, description) VALUES (?,?,?)');
  const link = db.prepare('INSERT OR IGNORE INTO question_objectives (question_id, objective_id) VALUES (?,?)');
  const qsBySubject = db.prepare('SELECT id, topic FROM questions WHERE subject=?');
  for (const lo of seed.objectives) {
    const id = Number(insLo.run(lo.subject, lo.code, lo.description).lastInsertRowid);
    for (const q of qsBySubject.all(lo.subject)) {
      if (lo.topics.includes(q.topic)) link.run(q.id, id);
    }
  }
}

module.exports = db;
