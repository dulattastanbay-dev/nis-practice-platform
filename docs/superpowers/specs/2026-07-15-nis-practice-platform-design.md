# NIS Practice Platform — Design Spec

**Date:** 2026-07-15
**Status:** Approved by user
**Type:** Demo/prototype with real accounts and real progress tracking

## 1. Purpose

A web platform for NIS (Nazarbayev Intellectual Schools) students to practice past exam
papers, modeled on the two approved mockup images. It is a demo-quality product: real
user accounts and real progress data, but sample question content and pre-written
("fake") AI feedback.

## 2. Goals / Non-goals

### Goals
- Clickable, polished UI matching the approved mockups (green NIS style).
- Real registration/login with hashed passwords and session cookies.
- Per-user persisted data: attempts, exam results, mistakes, marked questions,
  language preference.
- Dashboard statistics (questions solved, accuracy, streak, calendar heatmap,
  recent activity) computed from the user's actual attempts.
- Trilingual UI: English (default), Kazakh, Russian — instant switcher, persisted
  to the account.
- Runs locally with `npm start`, zero external services.

### Non-goals
- Real AI grading (feedback is pre-written per question; any non-empty answer
  receives the question's preset expected mark).
- Production hardening: no email verification, rate limiting, HTTPS config,
  password reset.
- Real NIS question banks — content is a realistic sample set.
- Mobile-first design (desktop layout per mockups; reasonable degradation only).

## 3. Stack

- **Backend:** Node.js (v24 available), Express, express-session, bcryptjs
  (pure JS, no native build), SQLite via Node's built-in `node:sqlite`.
- **Database:** SQLite single file `data.sqlite`, created and seeded automatically
  on first start.
- **Frontend:** plain HTML/CSS/JS single-page app, hash routing
  (`#/dashboard`, `#/exam`, ...), no build step, ordinary script tags.
- **Math rendering:** KaTeX via CDN.
- **Icons/charts:** inline SVG + CSS only (heatmap, progress bars, score rings).
- **Font:** Inter via Google Fonts CDN, system fallback.

## 4. Repository layout

```
package.json          # npm start → node server/index.js
server/
  index.js            # Express app: static /public + /api routes
  db.js               # SQLite open, schema creation, seed on empty DB
  seed-data.js        # sample questions & content
  auth.js             # register/login/logout, session middleware
  routes/             # API route modules
public/
  index.html
  css/styles.css
  js/i18n.js          # all EN/KZ/RU strings
  js/api.js           # fetch helpers
  js/state.js         # client session state
  js/app.js           # router + sidebar shell
  js/views/*.js       # one file per screen
docs/superpowers/specs/  # this spec
data.sqlite           # generated at runtime (gitignored)
```

## 5. Database schema

- **users** `(id, email UNIQUE, password_hash, name, language, created_at)`
- **questions** `(id, subject, year, component, number, marks, topic,
  text_latex, figure_svg NULLABLE, mark_scheme, ai_feedback, expected_mark)`
- **attempts** `(id, user_id, question_id, exam_id NULLABLE, answer_text,
  awarded_mark, mode 'practice'|'exam', duration_sec, created_at)`
- **exams** `(id, user_id, subject, year, component, started_at,
  submitted_at NULLABLE, score NULLABLE, total)`
- **marked** `(user_id, question_id, created_at, PRIMARY KEY(user_id, question_id))`

Derived (no tables):
- **Mistakes** = questions whose *latest* attempt by the user scored below full
  marks. A later full-mark attempt removes the mistake.
- **Streak / heatmap / accuracy / solved count / time today** = aggregates over
  `attempts` (and `exams`) by date.

## 6. API

All under `/api`, JSON, session-cookie auth (except register/login).

- `POST /api/register` `{email, password, name}` → creates user, logs in.
- `POST /api/login` `{email, password}` → session cookie. Wrong password → 401.
- `POST /api/logout`
- `GET /api/me` → profile + language.
- `PATCH /api/me` → update language (and name).
- `GET /api/questions?subject&year&component&topic` → question list (no answers).
- `POST /api/attempts` `{question_id, answer_text, mode, duration_sec, exam_id?}`
  → grades (see §8), stores attempt, returns `{awarded_mark, expected_mark,
  ai_feedback, mark_scheme}`.
- `POST /api/exams` `{subject, year, component}` → creates exam, returns its
  question list + duration.
- `POST /api/exams/:id/submit` → grades all answers, stores score, returns results.
- `GET /api/exams/:id` → results detail (overview table + per-question review).
- `GET /api/marked` / `PUT /api/marked/:questionId` / `DELETE /api/marked/:questionId`
- `GET /api/mistakes` → derived mistake list.
- `GET /api/stats` → dashboard payload: streak, time today, solved, accuracy,
  heatmap (last ~15 weeks), recent activity, continue-where-you-left-off.

## 7. Screens (10)

Sidebar (persistent shell): Dashboard, Past Papers, Question Bank, Learning
Objectives, Mistake Notebook, Marked Questions, Progress, About Us, Logout.
Header area holds the EN/KZ/RU language switcher.

Note: per the mockups, "Learning Objectives" and "Progress" are separate
sidebar entries but one combined page — both route to the same
Learning Objectives Progress screen (`#/objectives`).

1. **Login / Register** — email + password (+ name on register). Real validation
   against DB. Language switcher available pre-login.
2. **Dashboard** — "Hello, {name}" greeting; stat cards: streak 🔥, time today,
   questions solved, accuracy — all computed; Today's Goal progress bar
   (goal fixed at 20 questions/day); "Continue where you left off" card (last
   unfinished exam or last practiced filter); Recent Activity (last submitted
   exams/practice); calendar heatmap of attempts; Quick Actions links.
3. **Past Papers — selection** — pick Subject (Chemistry, Mathematics, Physics,
   Biology) → Year (2021–2025) → Component (1–3) → Start Exam. Info note that
   exam mode simulates the real environment.
4. **Exam screen** — blue header with subject/component, live countdown
   (e.g. 01:30:00), % time-left bar, "Question N of 12" navigation, KaTeX
   question text, optional SVG figure, answer textarea, Prev/Next, ⭐ Save
   Question, Submit Exam, End Exam (abandons without grading, confirm dialog).
   Answers auto-kept in memory; submitted all at once.
5. **Results** — green banner "Your Estimated Score (by AI) 48/60 80%" with
   trophy; tabs Overview (table: question, your answer link, expected mark,
   status icon) and Questions Review (full per-question breakdown with
   feedback + mark scheme).
6. **Question Bank (practice)** — filter selects: Subject, Year, Paper/Component,
   Topic + Start/Random; question card with marks and ⭐ Save; simple editor
   toolbar (B/I/U/Σ/∞/fx — decorative inserts); Submit → AI Feedback panel:
   canned feedback text, expected-mark ring (e.g. 2/3), confidence bar;
   Show Mark Scheme toggle; Next Question.
7. **Learning Objectives / Progress** — per-subject list of objectives with
   progress bars (percentages derived from attempts on questions tagged by
   topic; subject dropdown).
8. **Mistake Notebook** — derived mistake list with subject filter and count;
   each row: question, subject/year/component, "Wrong answer" tag, Retry button
   → opens that question in practice mode; "Practice Only Mistakes" starts a
   practice run over all current mistakes.
9. **Marked Questions** — all ⭐ questions; count; click → opens in practice mode
   with the same AI-feedback flow; unstar removes.
10. **About Us** — NIS logo, mission blurb, three feature cards (High Standards,
    Innovative Learning, Global Mindset), contacts (website, email, telegram).

## 8. Fake grading logic

Each question stores `expected_mark` (≤ marks) and `ai_feedback` text at seed
time. On submission: empty/whitespace answer → 0; otherwise → `expected_mark`.
The results banner sums awarded marks. This is deterministic and demo-friendly;
the UI presents it as "Estimated by AI".

## 9. Sample content (seed)

- **Mathematics 2025 Component 2:** full 12-question exam with real LaTeX
  (integration, curve sketching with SVG figure, trigonometry, etc.),
  60 total marks — mirrors the mockups (Question 6 "y = 2cos x + sec x" etc.).
- **Chemistry, Physics, Biology:** ~4 questions each with topics.
- Every subject × year × component combination resolves to a question set
  (reusing pools) so all paths are clickable.
- Topics per subject to power the Topic filter and Learning Objectives
  (e.g. Chemistry: Atomic structure, Electrolysis, Organic Chemistry, Chemical
  bonding, Stoichiometry — with the mockups' percentages as fallback zeros
  until the user has attempts).

## 10. i18n

`js/i18n.js` holds a dictionary: `{en: {...}, kk: {...}, ru: {...}}` covering
every UI string. Question content itself is English-only (sample data).
Switcher in the header; choice saved to the account (`users.language`) and
applied on login; stored in localStorage pre-login.

## 11. Visual style

Match mockups: NIS green primary (#3d8b40 family), light-gray app background,
white rounded-2xl cards with subtle borders/shadows, green active sidebar item,
gold ⭐ accents, red mistake accents, blue exam-mode header, green CTA buttons.
NIS-style leaf logo recreated as inline SVG (stylized, not the official asset).

## 12. Error handling

- API: consistent `{error: "message"}` JSON with proper status codes; frontend
  shows inline form errors (login/register) and toast-style messages elsewhere.
- Unauthenticated API access → 401 → frontend redirects to login.
- Session persists across server restarts is NOT required (memory store
  acceptable); DB data always persists.

## 13. Testing / verification

- Backend: exercise auth + core endpoints (register, login, attempt, exam
  submit, stats) with a small test script or curl checks.
- Frontend: manual click-through of all 10 screens in the browser; verify
  against mockups with screenshots; verify language switcher on every screen;
  verify stats change after submitting attempts; verify mistake add/remove
  cycle and marked add/remove cycle.
