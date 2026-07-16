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
const examCols = db.prepare('PRAGMA table_info(exams)').all().map((c) => c.name);
for (const [col, type] of [['draft_answers', 'TEXT'], ['draft_idx', 'INTEGER'], ['draft_remaining_sec', 'INTEGER']]) {
  if (!examCols.includes(col)) db.exec(`ALTER TABLE exams ADD COLUMN ${col} ${type}`);
}

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
