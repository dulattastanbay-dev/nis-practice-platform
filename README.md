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

## Deploy a live URL (Render, free)

GitHub stores the code but doesn't run the Node server (GitHub Pages is
static-only; this app needs its backend). To get a public URL, deploy to any
Node host. Easiest is [Render](https://render.com) — one click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dulattastanbay-dev/nis-practice-platform)

That button reads the included `render.yaml` blueprint and deploys
automatically. Or manually:

1. Sign in to Render with your GitHub account.
2. **New +  →  Blueprint**, pick `nis-practice-platform`, and Render reads
   `render.yaml` and deploys automatically.
3. In ~2 minutes you get a URL like `https://nis-practice-platform.onrender.com`.

Notes: requires Node ≥ 22.5 (pinned to 24 in the blueprint) for the built-in
`node:sqlite`. The free plan's disk is ephemeral, so accounts/progress reset on
each restart — fine for a demo; add a Render persistent disk to keep data.
Other Node hosts (Railway, Fly.io, a VPS) work the same way: `npm install`
then `npm start`, with `PORT` provided by the platform.

Open http://localhost:3000 and register an account (any email works — it is a
local demo database). Your progress, mistakes, marked questions, streak and
heatmap are all computed from your own activity.

## AI feedback (optional)

Marking uses the real model when an API key is present, and falls back to the
preset per-question mark and feedback when it isn't — the site works either way.

```
# Local
set ANTHROPIC_API_KEY=sk-ant-...      # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
npm start

# Render: Dashboard -> your service -> Environment -> add ANTHROPIC_API_KEY
```

Optional `ANTHROPIC_MODEL` (default `claude-sonnet-5`). When enabled, each
submitted answer is marked against its mark scheme and the explanation is stored
in the `ai_feedback` table. Never commit a key — it belongs in the environment.

## Importing past papers

PDFs are read once, at import; everything afterwards runs off the database.
See [docs/import-format.md](docs/import-format.md):

```
node server/import-paper.js --extract paper.pdf > draft.json
node server/import-paper.js draft.json
```

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
- First load needs internet: KaTeX (math rendering) and the Inter font load
  from CDNs. Offline, the app still works but math falls back to plain text and
  the font falls back to a system sans-serif.

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
