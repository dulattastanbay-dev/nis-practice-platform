# NIS Practice Platform

A demo practice platform for NIS (Nazarbayev Intellectual Schools) students:
past-paper exam mode, question-bank practice with AI-style feedback, a mistake
notebook, marked questions, learning objectives, and real per-account progress
tracking. Interface in English, Kazakh and Russian.

## Run

```
npm install
npm start
```

Open http://localhost:3000 and register an account (any email works — it is a
local demo database). Your progress, mistakes, marked questions, streak and
heatmap are all computed from your own activity.

## What's real vs. demo

- **Real:** accounts (bcrypt-hashed passwords, session cookies), and every
  statistic on the dashboard — questions solved, accuracy, streak, calendar
  heatmap, recent activity — is computed from your actual attempts. Mistakes
  fill in automatically from questions you don't score full marks on; solving
  one on retry clears it.
- **Demo:** question content is a sample set, and the "AI" feedback is
  pre-written per question — any non-empty answer receives the question's
  expected mark. Grading is deterministic, not a real model.

## Development

- Data lives in `data.sqlite` (created automatically on first start via Node's
  built-in `node:sqlite`). Delete the file to reset all accounts and progress.
- Tests: `npm test` (Node's built-in test runner).
- No build step: the frontend in `public/` is plain HTML/CSS/JS served by the
  Express app in `server/`.

## Structure

```
server/
  index.js            Express app: static public/ + /api routes
  db.js               SQLite schema + seed-on-empty
  seed-data.js        sample questions
  auth.js             requireAuth middleware
  routes/             auth, content, exams, stats API modules
public/
  index.html          SPA shell + CDN links (KaTeX, Inter)
  css/styles.css       design system
  js/                 i18n, api, state, router, and one file per view
```
