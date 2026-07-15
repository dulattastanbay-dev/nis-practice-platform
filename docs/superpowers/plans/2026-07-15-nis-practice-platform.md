# NIS Practice Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web platform where NIS students register, practice past-paper questions and timed exams, and see real computed stats — with sample content and pre-written "AI" feedback.

**Architecture:** Express server (CommonJS) serving a plain HTML/CSS/JS hash-routed SPA from `public/` plus a JSON API under `/api`. SQLite via Node's built-in `node:sqlite` (single file `data.sqlite`, auto-created and seeded). Sessions via `express-session` cookies; passwords hashed with `bcryptjs`.

**Tech Stack:** Node 24, Express 4, express-session, bcryptjs, node:sqlite (built-in), KaTeX (CDN), Inter font (CDN). No build step, no frontend framework.

## Global Constraints

- Node ≥ 24; server code is CommonJS (`require`).
- npm dependencies EXACTLY: `express@^4`, `express-session@^1`, `bcryptjs@^2`. SQLite comes from built-in `node:sqlite` (`DatabaseSync`). An `ExperimentalWarning` for node:sqlite in console output is harmless — ignore it.
- Frontend: plain `<script>` tags (NO ES modules — must work over file:// in principle and simple static serving), hash routing (`#/dashboard`), KaTeX + Inter via CDN.
- Design tokens (CSS variables): `--green:#3d8b40; --green-dark:#2e6b31; --green-tint:#e9f4e9; --bg:#f4f6f4; --text:#1f2a1f; --muted:#6b7a6b; --border:#e3e8e3; --gold:#e6a817; --red:#d64545; --blue:#4a90d9;`
- Every UI string goes through `t(key)` from `public/js/i18n.js`; languages `en` (default), `kk`, `ru`.
- DB file: `data.sqlite` at repo root; env `NIS_DB_PATH` overrides (tests use temp files). Already gitignored.
- Server port 3000 (`PORT` env overrides).
- API errors: JSON `{ "error": "<code>" }` with proper HTTP status. Frontend maps auth codes to i18n keys `auth.err.<code>`.
- Backend tests: built-in `node --test` runner, files in `tests/`. Run with `npm test`.
- Commit at the end of every task. Subjects/years/components: Chemistry|Mathematics|Physics|Biology, 2021–2025, components 1–3.

## File map (who owns what)

| File | Responsibility |
|---|---|
| `package.json` | scripts + 3 deps |
| `server/index.js` | Express app assembly, static serving, exports `{ app }` |
| `server/db.js` | open DB, create schema, seed if empty, export db |
| `server/seed-data.js` | sample questions (24+) data only |
| `server/auth.js` | `requireAuth` middleware |
| `server/routes/auth.js` | register/login/logout/me |
| `server/routes/content.js` | questions, topics, attempts (grading), marked, mistakes |
| `server/routes/exams.js` | exam create/submit/get |
| `server/routes/stats.js` | dashboard stats + objectives |
| `tests/helpers.js` | fresh app on temp DB + cookie-jar fetch client |
| `tests/*.test.js` | one per backend task |
| `public/index.html` | shell page, CDN links, script tags |
| `public/css/styles.css` | entire design system |
| `public/js/i18n.js` | `I18N` dict (en/kk/ru) + `t()` |
| `public/js/api.js` | `api(method, path, body)` fetch wrapper |
| `public/js/state.js` | `App` global + `Views` registry + helpers (`esc`, `renderMath`) |
| `public/js/app.js` | router, shell (sidebar/topbar/lang switcher), auth screen |
| `public/js/views/dashboard.js` | dashboard view |
| `public/js/views/papers.js` | past-papers selection view |
| `public/js/views/exam.js` | exam-mode view (timer, nav, submit) |
| `public/js/views/results.js` | exam results view |
| `public/js/views/bank.js` | practice view (filters, feedback panel) |
| `public/js/views/objectives.js` | learning objectives view |
| `public/js/views/mistakes.js` | mistake notebook view |
| `public/js/views/marked.js` | marked questions view |
| `public/js/views/about.js` | about view |

---

### Task 1: Scaffold + Express server + health endpoint

**Files:**
- Create: `package.json`, `server/index.js`, `tests/helpers.js`, `tests/health.test.js`

**Interfaces:**
- Produces: `server/index.js` exports `{ app }` (Express app; listens only when run directly). `tests/helpers.js` exports `startServer()` → `Promise<{ server, api }>` where `api(method, url, body)` → `Promise<{ status, data }>` and keeps session cookies between calls.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "nis-practice-platform",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.21.2",
    "express-session": "^1.18.1"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes with no build/compile errors (all three deps are pure JS).

- [ ] **Step 3: Write the failing test**

`tests/helpers.js`:

```js
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Fresh app on a temp DB. Clears server module cache so each call re-opens the DB.
function freshApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nis-test-'));
  process.env.NIS_DB_PATH = path.join(dir, 'test.sqlite');
  const serverDir = path.join(__dirname, '..', 'server') + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }
  const { app } = require('../server/index.js');
  return app;
}

// Minimal fetch client with a session-cookie jar.
function client(baseUrl) {
  let cookie = '';
  return async function api(method, url, body) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}

async function startServer() {
  const app = freshApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const api = client(`http://127.0.0.1:${server.address().port}`);
  return { server, api };
}

module.exports = { startServer };
```

`tests/health.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

test('GET /api/health returns ok', async () => {
  const { server, api } = await startServer();
  try {
    const res = await api('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data, { ok: true });
  } finally {
    server.close();
  }
});

test('unknown /api route returns JSON 404', async () => {
  const { server, api } = await startServer();
  try {
    const res = await api('GET', '/api/nope');
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.data, { error: 'not_found' });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server/index.js'`

- [ ] **Step 5: Write `server/index.js`**

```js
const path = require('node:path');
const express = require('express');
const session = require('express-session');

const app = express();

app.use(express.json());
app.use(session({
  secret: 'nis-demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Routers are mounted here in later tasks:
// app.use('/api', require('./routes/auth'));
// app.use('/api', require('./routes/content'));
// app.use('/api', require('./routes/exams'));
// app.use('/api', require('./routes/stats'));

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`NIS Practice Platform running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests). MemoryStore warning from express-session is expected noise.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/ tests/
git commit -m "feat: scaffold Express server with health endpoint"
```

---

### Task 2: Database schema + seed data

**Files:**
- Create: `server/db.js`, `server/seed-data.js`, `tests/db.test.js`

**Interfaces:**
- Produces: `server/db.js` exports a `DatabaseSync` instance (`db.prepare(sql).get/all/run`, `db.exec`). Tables: `users(id,email,password_hash,name,language,created_at)`, `questions(id,subject,year,component,number,marks,topic,text_latex,figure_svg,mark_scheme,ai_feedback,expected_mark)`, `exams(id,user_id,subject,year,component,total,score,started_at,submitted_at)`, `attempts(id,user_id,question_id,exam_id,answer_text,awarded_mark,mode,duration_sec,created_at)`, `marked(user_id,question_id,created_at)`.
- Produces: `server/seed-data.js` exports `{ questions }` — array of `{subject,year,component,number,marks,topic,text,figure,scheme,feedback,expected}`. Mathematics 2025 component 2 = 12 questions, 60 total marks, 48 total expected marks (matches mockup 48/60 = 80%).

- [ ] **Step 1: Write the failing test**

`tests/db.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server/db.js'`

- [ ] **Step 3: Write `server/seed-data.js`**

Question text uses KaTeX `\( ... \)` delimiters (double-escaped in JS strings). `expected` is the mark the fake AI awards for any non-empty answer.

```js
// Sample content seeded into an empty database. English-only by design (spec §10).

const FIG_Q6 = [
  '<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" class="q-figure">',
  '<line x1="20" y1="120" x2="340" y2="120" stroke="#444" stroke-width="1.5"/>',
  '<line x1="30" y1="142" x2="30" y2="12" stroke="#444" stroke-width="1.5"/>',
  '<path d="M30 118 C 80 40, 150 30, 200 70 S 300 96, 340 58" fill="none" stroke="#2e6b31" stroke-width="2"/>',
  '<path d="M150 120 L150 42 C 168 38, 186 52, 200 70 L200 120 Z" fill="#9aa79a" opacity="0.45"/>',
  '<text x="143" y="136" font-size="12">π/6</text>',
  '<text x="194" y="136" font-size="12">π/3</text>',
  '<text x="16" y="136" font-size="12">O</text>',
  '<text x="330" y="112" font-size="12">x</text>',
  '<text x="38" y="24" font-size="12">y</text>',
  '</svg>',
].join('');

function q(subject, year, component, number, marks, topic, text, scheme, feedback, expected, figure) {
  return { subject, year, component, number, marks, topic, text, scheme, feedback, expected, figure: figure || null };
}

const questions = [
  // ---- Mathematics 2025 Component 2: full 12-question exam, 60 marks, expected sum 48 ----
  q('Mathematics', 2025, 2, 1, 3, 'Integration',
    'Find \\(\\int (x^{2} + 3x)\\,dx\\).',
    'M1 raise each power by one; A1 \\(\\frac{x^{3}}{3} + \\frac{3x^{2}}{2}\\); B1 constant of integration \\(+C\\).',
    'Good start! Remember that the integral of \\(x^{n}\\) is \\(\\frac{x^{n+1}}{n+1}\\). Also, do not forget the constant of integration.',
    3),
  q('Mathematics', 2025, 2, 2, 4, 'Differentiation',
    'Given \\(y = \\dfrac{x^{2}+1}{x-2}\\), find \\(\\dfrac{dy}{dx}\\) and determine the coordinates of the stationary points of the curve.',
    'M1 quotient rule; A1 \\(\\dfrac{x^{2}-4x-1}{(x-2)^{2}}\\); M1 set numerator to zero; A1 both stationary points.',
    'Your quotient rule setup is correct, but check the sign in the numerator — expand \\((x-2)(2x)\\) carefully before simplifying.',
    2),
  q('Mathematics', 2025, 2, 3, 2, 'Trigonometry',
    'Solve \\(2\\sin x - 1 = 0\\) for \\(0 \\le x \\le 2\\pi\\).',
    'B1 \\(x = \\frac{\\pi}{6}\\); B1 \\(x = \\frac{5\\pi}{6}\\).',
    'Correct method. Remember sine is positive in the first and second quadrants, so there are two solutions in the interval.',
    2),
  q('Mathematics', 2025, 2, 4, 5, 'Integration',
    'Use integration by parts to evaluate \\(\\int_{0}^{1} x e^{2x}\\,dx\\).',
    'M1 parts with \\(u = x\\); A1 \\(\\frac{x e^{2x}}{2} - \\int \\frac{e^{2x}}{2}\\,dx\\); A1 \\(\\frac{x e^{2x}}{2} - \\frac{e^{2x}}{4}\\); M1 apply limits; A1 \\(\\frac{e^{2}+1}{4}\\).',
    'Excellent work — the choice of \\(u\\) and \\(dv\\) is exactly right and the limits are applied correctly.',
    5),
  q('Mathematics', 2025, 2, 5, 3, 'Sequences and Series',
    'The third term of a geometric progression is 18 and the sixth term is 486. Find the first term and the common ratio.',
    'M1 divide terms to get \\(r^{3} = 27\\); A1 \\(r = 3\\); A1 \\(a = 2\\).',
    'You found the ratio equation but slipped when solving for \\(a\\) — substitute \\(r = 3\\) back into \\(ar^{2} = 18\\).',
    1),
  q('Mathematics', 2025, 2, 6, 5, 'Applications of Integration',
    'The diagram shows a sketch of the curve with equation \\(y = 2\\cos x + \\sec x\\). The shaded region, bounded by the curve, the \\(x\\)-axis, and the lines \\(x = \\frac{\\pi}{6}\\) and \\(x = \\frac{\\pi}{3}\\), is rotated about the \\(x\\)-axis. Find the exact volume of the solid generated.',
    'M1 \\(V = \\pi \\int y^{2}\\,dx\\); M1 expand \\((2\\cos x + \\sec x)^{2}\\); A1 \\(4\\cos^{2}x + 4 + \\sec^{2}x\\); M1 integrate each term; A1 exact volume.',
    'A strong attempt. When squaring \\(2\\cos x + \\sec x\\), remember the cross term \\(2 \\cdot 2\\cos x \\cdot \\sec x = 4\\), which integrates to \\(4x\\).',
    4, FIG_Q6),
  q('Mathematics', 2025, 2, 7, 6, 'Differentiation',
    'A closed cylindrical can has volume \\(250\\pi\\) cm\\(^{3}\\). Show that its surface area is \\(S = 2\\pi r^{2} + \\dfrac{500\\pi}{r}\\), and find the radius that minimises \\(S\\).',
    'B1 \\(h\\) in terms of \\(r\\); M1 substitute into \\(S\\); M1 \\(\\frac{dS}{dr} = 4\\pi r - \\frac{500\\pi}{r^{2}}\\); A1 set to zero; A1 \\(r = 5\\); B1 justify minimum.',
    'Nearly there — your derivative is right; justify the minimum with the second derivative test.',
    5),
  q('Mathematics', 2025, 2, 8, 4, 'Binomial Expansion',
    'Find the first four terms in the expansion of \\((1+2x)^{-3}\\) in ascending powers of \\(x\\), and state the range of values of \\(x\\) for which the expansion is valid.',
    'M1 binomial with \\(n = -3\\); A2 \\(1 - 6x + 24x^{2} - 80x^{3}\\); B1 valid for \\(|x| < \\frac{1}{2}\\).',
    'Great — all four terms and the validity condition are correct.',
    4),
  q('Mathematics', 2025, 2, 9, 5, 'Vectors',
    'The points \\(A(1, 2, 3)\\) and \\(B(4, 0, -1)\\) are given. Find \\(\\overrightarrow{AB}\\), \\(|\\overrightarrow{AB}|\\), and the unit vector in the direction of \\(\\overrightarrow{AB}\\).',
    'B1 \\(\\overrightarrow{AB} = (3, -2, -4)\\); M1 A1 \\(|\\overrightarrow{AB}| = \\sqrt{29}\\); M1 A1 unit vector.',
    'The vector and its magnitude are correct; the unit vector just needs each component divided by \\(\\sqrt{29}\\).',
    3),
  q('Mathematics', 2025, 2, 10, 7, 'Trigonometry',
    'Express \\(3\\sin\\theta + 4\\cos\\theta\\) in the form \\(R\\sin(\\theta + \\alpha)\\), where \\(R > 0\\) and \\(0 < \\alpha < 90^{\\circ}\\). Hence solve \\(3\\sin\\theta + 4\\cos\\theta = 2.5\\) for \\(0 \\le \\theta \\le 360^{\\circ}\\), and state the maximum value of the expression.',
    'B1 \\(R = 5\\); B1 \\(\\alpha = 53.1^{\\circ}\\); M1 \\(\\sin(\\theta + \\alpha) = 0.5\\); A2 both solutions; B1 maximum value 5; B1 method.',
    'Very good — \\(R\\) and \\(\\alpha\\) are right and one solution found; check the second solution using \\(180^{\\circ}\\) minus your principal value.',
    6),
  q('Mathematics', 2025, 2, 11, 6, 'Logarithms and Exponentials',
    'Solve the equation \\(3^{2x+1} = 5^{x+2}\\), giving your answer in exact logarithmic form and to 3 significant figures.',
    'M1 take logs of both sides; A1 \\((2x+1)\\ln 3 = (x+2)\\ln 5\\); M1 collect \\(x\\) terms; A1 exact form; A2 3 s.f. value.',
    'Correct log laws throughout — just double-check the 3 s.f. rounding at the end.',
    5),
  q('Mathematics', 2025, 2, 12, 10, 'Applications of Integration',
    'The curve \\(y = x^{2} - 4x + 5\\) and the line \\(y = 2x - 3\\) intersect at two points. (a) Find the coordinates of the points of intersection. (b) Find the exact area of the region enclosed between the curve and the line. (c) The region is rotated through \\(360^{\\circ}\\) about the \\(x\\)-axis. Write down, but do not evaluate, an integral expression for the volume generated.',
    '(a) M1 A1 \\(x = 2\\) and \\(x = 4\\); (b) M1 subtract functions; M1 integrate; A2 area \\(\\frac{4}{3}\\); (c) M1 A1 \\(\\pi\\int_{2}^{4}\\big((2x-3)^{2} - (x^{2}-4x+5)^{2}\\big)\\,dx\\); B2 presentation.',
    'A well-structured answer. Parts (a) and (b) are solid; in (c) make sure the outer function is the line, which lies above the curve on this interval.',
    8),

  // ---- Chemistry 2024 Component 1 (pool, 5 questions / 5 topics) ----
  q('Chemistry', 2024, 1, 1, 3, 'Atomic structure',
    'State the number of protons, neutrons and electrons in the ion \\(^{56}_{26}\\mathrm{Fe}^{3+}\\).',
    'B1 26 protons; B1 30 neutrons; B1 23 electrons.',
    'Careful with the electrons — a 3+ ion has lost three electrons relative to the atom.',
    2),
  q('Chemistry', 2024, 1, 2, 4, 'Electrolysis',
    'Molten lead(II) bromide is electrolysed using inert electrodes. Write the half-equations for the reactions at the cathode and the anode, and state one observation at each electrode.',
    'M1 A1 cathode \\(\\mathrm{Pb}^{2+} + 2e^{-} \\rightarrow \\mathrm{Pb}\\); M1 A1 anode \\(2\\mathrm{Br}^{-} \\rightarrow \\mathrm{Br}_{2} + 2e^{-}\\).',
    'Good half-equations. Remember oxidation happens at the anode — electrons appear on the right-hand side.',
    3),
  q('Chemistry', 2024, 1, 3, 4, 'Organic Chemistry',
    'Draw the displayed formula of but-2-ene and describe the test to distinguish it from butane, including the observation.',
    'B1 correct displayed formula; B1 bromine water; B1 alkene decolourises it; B1 butane gives no change.',
    'The bromine water test is right; make sure the double bond in your structure is between carbons 2 and 3.',
    3),
  q('Chemistry', 2024, 1, 4, 4, 'Chemical bonding',
    'Explain why sodium chloride has a high melting point and conducts electricity when molten but not when solid.',
    'B1 giant ionic lattice; B1 strong electrostatic forces; B1 ions free to move when molten; B1 ions fixed in solid.',
    'Clear explanation — link the conductivity to mobile ions, not electrons.',
    3),
  q('Chemistry', 2024, 1, 5, 5, 'Stoichiometry',
    'Calculate the mass of magnesium oxide formed when 6.0 g of magnesium burns completely in oxygen. \\((A_r:\\ \\mathrm{Mg} = 24,\\ \\mathrm{O} = 16)\\)',
    'M1 moles Mg = 0.25; M1 ratio 1:1; M1 A1 mass = 0.25 × 40; A1 10.0 g.',
    'Moles and ratio are correct — multiply by the molar mass of MgO (40), not of Mg.',
    4),

  // ---- Physics 2024 Component 1 (pool, 4 questions / 4 topics) ----
  q('Physics', 2024, 1, 1, 3, 'Kinematics',
    'A car accelerates uniformly from rest to \\(24\\ \\mathrm{m\\,s^{-1}}\\) in 8.0 s. Calculate the acceleration and the distance travelled.',
    'M1 A1 \\(a = 3.0\\ \\mathrm{m\\,s^{-2}}\\); M1 A1 \\(s = 96\\ \\mathrm{m}\\).',
    'Acceleration is right; for the distance use \\(s = \\frac{1}{2}(u+v)t\\).',
    2),
  q('Physics', 2024, 1, 2, 4, 'Electricity',
    'A 12 V battery drives a current of 0.50 A through a resistor for 2.0 minutes. Calculate the resistance and the energy transferred.',
    'M1 A1 \\(R = 24\\ \\Omega\\); M1 A1 \\(E = 720\\ \\mathrm{J}\\).',
    'R is correct. For the energy, remember to convert minutes to seconds before using \\(E = VIt\\).',
    3),
  q('Physics', 2024, 1, 3, 4, 'Waves',
    'A wave has frequency 250 Hz and wavelength 1.32 m. Calculate the wave speed, and state what happens to the wavelength if the frequency doubles while the speed stays constant.',
    'M1 A1 \\(v = 330\\ \\mathrm{m\\,s^{-1}}\\); B1 wavelength halves; B1 reasoning.',
    'Good — speed correct and the inverse relationship clearly stated.',
    4),
  q('Physics', 2024, 1, 4, 5, 'Forces and Motion',
    'A 2.0 kg block is pulled along a horizontal surface by a 12 N force against a friction force of 4.0 N. Calculate the acceleration of the block, and its speed after 3.0 s starting from rest.',
    'M1 resultant force 8.0 N; M1 A1 \\(a = 4.0\\ \\mathrm{m\\,s^{-2}}\\); M1 A1 \\(v = 12\\ \\mathrm{m\\,s^{-1}}\\).',
    'Resultant force handled well; remember to subtract friction before applying \\(F = ma\\).',
    4),

  // ---- Biology 2024 Component 1 (pool, 4 questions / 4 topics) ----
  q('Biology', 2024, 1, 1, 3, 'Cell Biology',
    'Describe two differences between plant and animal cells, and name the organelle responsible for photosynthesis.',
    'B1 B1 two differences; B1 chloroplast.',
    'Two clear differences given — also name the chloroplast explicitly for the final mark.',
    2),
  q('Biology', 2024, 1, 2, 4, 'Genetics',
    'In pea plants, tall (T) is dominant over short (t). Two heterozygous plants are crossed. Draw the Punnett square and state the expected phenotype ratio of the offspring.',
    'M1 correct gametes; A1 square; A1 3:1 tall to short; B1 genotype ratio 1:2:1.',
    'The Punnett square is correct — state the ratio as phenotypes (3 tall : 1 short).',
    3),
  q('Biology', 2024, 1, 3, 4, 'Ecology',
    'Explain what is meant by a food web, and describe what could happen to a population of secondary consumers if the producers were removed.',
    'B1 definition; M1 A1 knock-on effects through trophic levels; B1 population falls.',
    'Good chain of reasoning through the trophic levels.',
    4),
  q('Biology', 2024, 1, 4, 5, 'Human Physiology',
    'Describe the pathway of blood through the heart, starting from the vena cava, and explain the role of the valves.',
    'B2 correct pathway; B2 valves prevent backflow; B1 terminology.',
    'Pathway mostly right — remember blood passes through the lungs between the right and left sides of the heart.',
    3),
];

module.exports = { questions };
```

- [ ] **Step 4: Write `server/db.js`**

```js
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const seed = require('./seed-data');

const DB_PATH = process.env.NIS_DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
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
  submitted_at TEXT
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
CREATE TABLE IF NOT EXISTS marked (
  user_id INTEGER NOT NULL REFERENCES users(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, question_id)
);
`);

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

module.exports = db;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests including Task 1's).

- [ ] **Step 6: Commit**

```bash
git add server/db.js server/seed-data.js tests/db.test.js
git commit -m "feat: add SQLite schema and seed sample questions"
```

---

### Task 3: Authentication API

**Files:**
- Create: `server/auth.js`, `server/routes/auth.js`, `tests/auth.test.js`
- Modify: `server/index.js` (mount router)

**Interfaces:**
- Consumes: `db` from Task 2.
- Produces: `server/auth.js` exports `{ requireAuth }` middleware (401 `{error:'unauthorized'}` when no session). Routes: `POST /api/register {email,password,name}`, `POST /api/login {email,password}`, `POST /api/logout`, `GET /api/me`, `PATCH /api/me {language?, name?}` — all returning `{ user: {id,email,name,language} }` (logout returns `{ok:true}`). Error codes: `invalid_email`, `weak_password` (<6 chars), `name_required`, `email_taken` (409), `invalid_credentials` (401), `bad_language`.

- [ ] **Step 1: Write the failing test**

`tests/auth.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

const USER = { email: 'aya@example.com', password: 'secret123', name: 'Aya' };

test('register creates a session and /me works', async () => {
  const { server, api } = await startServer();
  try {
    const reg = await api('POST', '/api/register', USER);
    assert.strictEqual(reg.status, 200);
    assert.strictEqual(reg.data.user.email, 'aya@example.com');
    assert.strictEqual(reg.data.user.name, 'Aya');
    assert.strictEqual(reg.data.user.language, 'en');
    const me = await api('GET', '/api/me');
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.data.user.email, 'aya@example.com');
  } finally { server.close(); }
});

test('register validation and duplicates', async () => {
  const { server, api } = await startServer();
  try {
    assert.strictEqual((await api('POST', '/api/register', { ...USER, email: 'bad' })).status, 400);
    assert.strictEqual((await api('POST', '/api/register', { ...USER, password: '123' })).status, 400);
    assert.strictEqual((await api('POST', '/api/register', { ...USER, name: '  ' })).status, 400);
    assert.strictEqual((await api('POST', '/api/register', USER)).status, 200);
    const dup = await api('POST', '/api/register', USER);
    assert.strictEqual(dup.status, 409);
    assert.strictEqual(dup.data.error, 'email_taken');
  } finally { server.close(); }
});

test('login rejects wrong password, accepts right one, logout clears', async () => {
  const { server, api } = await startServer();
  try {
    await api('POST', '/api/register', USER);
    await api('POST', '/api/logout');
    assert.strictEqual((await api('GET', '/api/me')).status, 401);
    const bad = await api('POST', '/api/login', { email: USER.email, password: 'wrong1' });
    assert.strictEqual(bad.status, 401);
    assert.strictEqual(bad.data.error, 'invalid_credentials');
    const ok = await api('POST', '/api/login', { email: USER.email, password: USER.password });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await api('GET', '/api/me')).status, 200);
  } finally { server.close(); }
});

test('PATCH /api/me updates language', async () => {
  const { server, api } = await startServer();
  try {
    await api('POST', '/api/register', USER);
    assert.strictEqual((await api('PATCH', '/api/me', { language: 'xx' })).status, 400);
    const upd = await api('PATCH', '/api/me', { language: 'kk' });
    assert.strictEqual(upd.status, 200);
    assert.strictEqual(upd.data.user.language, 'kk');
    assert.strictEqual((await api('GET', '/api/me')).data.user.language, 'kk');
  } finally { server.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — register returns 404 (router not mounted yet).

- [ ] **Step 3: Write `server/auth.js`**

```js
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = { requireAuth };
```

- [ ] **Step 4: Write `server/routes/auth.js`**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LANGS = ['en', 'kk', 'ru'];

function publicUser(id) {
  return db.prepare('SELECT id, email, name, language FROM users WHERE id=?').get(id);
}

router.post('/register', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'invalid_email' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'weak_password' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name_required' });
  const norm = String(email).toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(norm)) {
    return res.status(409).json({ error: 'email_taken' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?,?,?)')
    .run(norm, hash, String(name).trim());
  req.session.userId = Number(info.lastInsertRowid);
  res.json({ user: publicUser(req.session.userId) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  req.session.userId = row.id;
  res.json({ user: publicUser(row.id) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.session.userId) });
});

router.patch('/me', requireAuth, (req, res) => {
  const { language, name } = req.body || {};
  if (language !== undefined) {
    if (!LANGS.includes(language)) return res.status(400).json({ error: 'bad_language' });
    db.prepare('UPDATE users SET language=? WHERE id=?').run(language, req.session.userId);
  }
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'name_required' });
    db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).trim(), req.session.userId);
  }
  res.json({ user: publicUser(req.session.userId) });
});

module.exports = router;
```

- [ ] **Step 5: Mount router in `server/index.js`**

Replace the comment block with:

```js
app.use('/api', require('./routes/auth'));
```

(keep the `not_found` catch-all AFTER all routers).

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
git add server/ tests/auth.test.js
git commit -m "feat: add register/login/session auth API"
```

---

### Task 4: Content API — questions, attempts (fake grading), marked, mistakes

**Files:**
- Create: `server/routes/content.js`, `tests/content.test.js`
- Modify: `server/index.js` (mount router)

**Interfaces:**
- Consumes: `db`, `requireAuth`.
- Produces (all require auth):
  - `GET /api/questions?subject&year&component&topic` → `{questions:[{id,subject,year,component,number,marks,topic,text_latex,figure_svg}]}` — NEVER includes mark_scheme/ai_feedback/expected_mark.
  - `GET /api/questions/:id` → `{question:{...same public fields}}`
  - `GET /api/topics?subject` → `{topics:[string]}`
  - `POST /api/attempts {question_id, answer_text, mode:'practice', duration_sec}` → `{awarded_mark, expected_mark, marks, ai_feedback, mark_scheme, confidence:'high'|'medium'|'low'}`. Grading: non-empty trimmed answer → `expected_mark`, else 0. Confidence: ratio expected/marks ≥0.8 high, ≥0.5 medium, else low.
  - `GET /api/marked` → `{marked:[{question_id,subject,year,component,number,marks,topic}]}`; `PUT /api/marked/:questionId` → `{ok:true}`; `DELETE /api/marked/:questionId` → `{ok:true}`.
  - `GET /api/mistakes` → `{mistakes:[{question_id,subject,year,component,number,marks,topic,awarded_mark,created_at}]}` — latest attempt per question scoring below full marks.

- [ ] **Step 1: Write the failing test**

`tests/content.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

async function login(api) {
  await api('POST', '/api/register', { email: 'a@b.co', password: 'secret123', name: 'Aya' });
}

test('questions require auth and hide answer fields', async () => {
  const { server, api } = await startServer();
  try {
    assert.strictEqual((await api('GET', '/api/questions')).status, 401);
    await login(api);
    const res = await api('GET', '/api/questions?subject=Mathematics&year=2025&component=2');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.questions.length, 12);
    const q1 = res.data.questions[0];
    assert.strictEqual(q1.number, 1);
    assert.ok(!('mark_scheme' in q1) && !('ai_feedback' in q1) && !('expected_mark' in q1));
    const one = await api('GET', `/api/questions/${q1.id}`);
    assert.strictEqual(one.status, 200);
    assert.strictEqual(one.data.question.id, q1.id);
  } finally { server.close(); }
});

test('topics endpoint lists distinct topics per subject', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const res = await api('GET', '/api/topics?subject=Chemistry');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.topics.length, 5);
    assert.ok(res.data.topics.includes('Electrolysis'));
  } finally { server.close(); }
});

test('practice attempt grades expected mark for non-empty, 0 for empty', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics&year=2025&component=2')).data.questions;
    const q1 = qs.find((q) => q.number === 1); // expected 3/3
    const good = await api('POST', '/api/attempts', {
      question_id: q1.id, answer_text: 'x^3/3 + 3x^2/2 + C', mode: 'practice', duration_sec: 42,
    });
    assert.strictEqual(good.status, 200);
    assert.strictEqual(good.data.awarded_mark, 3);
    assert.strictEqual(good.data.marks, 3);
    assert.ok(good.data.ai_feedback.length > 0);
    assert.ok(good.data.mark_scheme.length > 0);
    assert.strictEqual(good.data.confidence, 'high');
    const empty = await api('POST', '/api/attempts', {
      question_id: q1.id, answer_text: '   ', mode: 'practice', duration_sec: 5,
    });
    assert.strictEqual(empty.data.awarded_mark, 0);
    assert.strictEqual((await api('POST', '/api/attempts', { question_id: 999999, answer_text: 'x', mode: 'practice' })).status, 404);
    assert.strictEqual((await api('POST', '/api/attempts', { question_id: q1.id, answer_text: 'x', mode: 'exam' })).status, 400);
  } finally { server.close(); }
});

test('mistakes derive from latest attempt below full marks', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics&year=2025&component=2')).data.questions;
    const q2 = qs.find((q) => q.number === 2); // expected 2/4 -> mistake
    const q4 = qs.find((q) => q.number === 4); // expected 5/5 -> not a mistake
    await api('POST', '/api/attempts', { question_id: q2.id, answer_text: 'attempt', mode: 'practice' });
    await api('POST', '/api/attempts', { question_id: q4.id, answer_text: 'attempt', mode: 'practice' });
    const m = await api('GET', '/api/mistakes');
    assert.strictEqual(m.status, 200);
    const ids = m.data.mistakes.map((r) => r.question_id);
    assert.ok(ids.includes(q2.id));
    assert.ok(!ids.includes(q4.id));
    assert.strictEqual(m.data.mistakes.find((r) => r.question_id === q2.id).awarded_mark, 2);
  } finally { server.close(); }
});

test('marked add/list/remove cycle', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const qs = (await api('GET', '/api/questions?subject=Physics')).data.questions;
    const qid = qs[0].id;
    assert.strictEqual((await api('PUT', `/api/marked/${qid}`)).status, 200);
    assert.strictEqual((await api('PUT', `/api/marked/${qid}`)).status, 200); // idempotent
    let list = (await api('GET', '/api/marked')).data.marked;
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].question_id, qid);
    assert.strictEqual((await api('DELETE', `/api/marked/${qid}`)).status, 200);
    list = (await api('GET', '/api/marked')).data.marked;
    assert.strictEqual(list.length, 0);
    assert.strictEqual((await api('PUT', '/api/marked/999999')).status, 404);
  } finally { server.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — content endpoints return 404.

- [ ] **Step 3: Write `server/routes/content.js`**

```js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const PUB = 'id, subject, year, component, number, marks, topic, text_latex, figure_svg';

router.get('/questions', requireAuth, (req, res) => {
  const { subject, year, component, topic } = req.query;
  const where = [];
  const args = [];
  if (subject) { where.push('subject = ?'); args.push(subject); }
  if (year) { where.push('year = ?'); args.push(Number(year)); }
  if (component) { where.push('component = ?'); args.push(Number(component)); }
  if (topic) { where.push('topic = ?'); args.push(topic); }
  const sql = `SELECT ${PUB} FROM questions`
    + (where.length ? ` WHERE ${where.join(' AND ')}` : '')
    + ' ORDER BY subject, year, component, number';
  res.json({ questions: db.prepare(sql).all(...args) });
});

router.get('/questions/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT ${PUB} FROM questions WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ question: row });
});

router.get('/topics', requireAuth, (req, res) => {
  const { subject } = req.query;
  const rows = subject
    ? db.prepare('SELECT DISTINCT topic FROM questions WHERE subject=? ORDER BY topic').all(subject)
    : db.prepare('SELECT DISTINCT topic FROM questions ORDER BY topic').all();
  res.json({ topics: rows.map((r) => r.topic) });
});

function confidence(expected, marks) {
  const ratio = marks ? expected / marks : 0;
  if (ratio >= 0.8) return 'high';
  if (ratio >= 0.5) return 'medium';
  return 'low';
}

router.post('/attempts', requireAuth, (req, res) => {
  const { question_id, answer_text, mode, duration_sec } = req.body || {};
  if (mode !== 'practice') return res.status(400).json({ error: 'bad_mode' }); // exam answers go via /exams/:id/submit
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(question_id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const text = String(answer_text || '');
  const awarded = text.trim() ? q.expected_mark : 0;
  db.prepare(`INSERT INTO attempts (user_id, question_id, answer_text, awarded_mark, mode, duration_sec)
              VALUES (?,?,?,?,'practice',?)`)
    .run(req.session.userId, q.id, text, awarded, Math.max(0, Number(duration_sec) || 0));
  res.json({
    awarded_mark: awarded,
    expected_mark: q.expected_mark,
    marks: q.marks,
    ai_feedback: q.ai_feedback,
    mark_scheme: q.mark_scheme,
    confidence: confidence(q.expected_mark, q.marks),
  });
});

router.get('/marked', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.id AS question_id, q.subject, q.year, q.component, q.number, q.marks, q.topic
    FROM marked m JOIN questions q ON q.id = m.question_id
    WHERE m.user_id = ? ORDER BY m.created_at DESC, q.id DESC
  `).all(req.session.userId);
  res.json({ marked: rows });
});

router.put('/marked/:questionId', requireAuth, (req, res) => {
  const q = db.prepare('SELECT id FROM questions WHERE id=?').get(req.params.questionId);
  if (!q) return res.status(404).json({ error: 'not_found' });
  db.prepare('INSERT OR IGNORE INTO marked (user_id, question_id) VALUES (?,?)')
    .run(req.session.userId, q.id);
  res.json({ ok: true });
});

router.delete('/marked/:questionId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM marked WHERE user_id=? AND question_id=?')
    .run(req.session.userId, req.params.questionId);
  res.json({ ok: true });
});

router.get('/mistakes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.id AS question_id, q.subject, q.year, q.component, q.number, q.marks, q.topic,
           a.awarded_mark, a.created_at
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ?
      AND a.id IN (SELECT MAX(id) FROM attempts WHERE user_id = ? GROUP BY question_id)
      AND a.awarded_mark < q.marks
    ORDER BY a.created_at DESC, a.id DESC
  `).all(req.session.userId, req.session.userId);
  res.json({ mistakes: rows });
});

module.exports = router;
```

- [ ] **Step 4: Mount in `server/index.js`** (after the auth router):

```js
app.use('/api', require('./routes/content'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/ tests/content.test.js
git commit -m "feat: add questions, attempts, marked and mistakes API"
```

---

### Task 5: Exams API + stats/objectives API

**Files:**
- Create: `server/routes/exams.js`, `server/routes/stats.js`, `tests/exams-stats.test.js`
- Modify: `server/index.js` (mount both)

**Interfaces:**
- Consumes: `db`, `requireAuth`.
- Produces (all require auth):
  - `POST /api/exams {subject, year, component}` → `{exam:{id,subject,year,component,total,duration_min:90}, questions:[public fields], marked_ids:[int]}`. Picks exact subject+year+component set; if empty, falls back to first 12 questions of the subject. Creating a new exam deletes the user's previous unsubmitted exams.
  - `POST /api/exams/:id/submit {answers:[{question_id, answer_text}], duration_sec}` → results payload (below). 409 `already_submitted` on resubmit. Grading per answer: non-empty → question's expected_mark, else 0.
  - `GET /api/exams/:id` → `{exam:{id,subject,year,component,total,score,pct,submitted_at,...}, results:[{question_id,number,marks,topic,text_latex,figure_svg,mark_scheme,ai_feedback,answer_text,awarded_mark}]}` ordered by question number.
  - `GET /api/stats` → `{solved, accuracy, streak, time_today_sec, today_count, goal:20, heatmap:[{date,count}×105 oldest→newest], recent:[{id,subject,year,component,score,total,submitted_at}≤5], continue:{subject,year,component}|null}`.
  - `GET /api/objectives?subject=Mathematics` → `{objectives:[{topic, attempts, pct}]}` where pct = 100·Σawarded/Σpossible over the user's attempts on that subject's topics (0 if unattempted).

- [ ] **Step 1: Write the failing test**

`tests/exams-stats.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

async function login(api) {
  await api('POST', '/api/register', { email: 'a@b.co', password: 'secret123', name: 'Aya' });
}

test('exam create returns full paper or subject fallback', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const ex = await api('POST', '/api/exams', { subject: 'Mathematics', year: 2025, component: 2 });
    assert.strictEqual(ex.status, 200);
    assert.strictEqual(ex.data.questions.length, 12);
    assert.strictEqual(ex.data.exam.total, 60);
    assert.strictEqual(ex.data.exam.duration_min, 90);
    assert.ok(Array.isArray(ex.data.marked_ids));
    const fb = await api('POST', '/api/exams', { subject: 'Chemistry', year: 2023, component: 3 });
    assert.strictEqual(fb.data.questions.length, 5); // subject pool fallback
    assert.strictEqual((await api('POST', '/api/exams', { subject: 'Alchemy', year: 2025, component: 2 })).status, 400);
  } finally { server.close(); }
});

test('exam submit grades, stores results, blocks resubmit', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const ex = await api('POST', '/api/exams', { subject: 'Mathematics', year: 2025, component: 2 });
    const answers = ex.data.questions.map((q) => ({ question_id: q.id, answer_text: 'my answer' }));
    const sub = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers, duration_sec: 3600 });
    assert.strictEqual(sub.status, 200);
    assert.strictEqual(sub.data.exam.score, 48);
    assert.strictEqual(sub.data.exam.pct, 80);
    assert.strictEqual(sub.data.results.length, 12);
    assert.strictEqual(sub.data.results[0].number, 1);
    assert.ok(sub.data.results[0].ai_feedback.length > 0);
    const again = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers, duration_sec: 1 });
    assert.strictEqual(again.status, 409);
    const get = await api('GET', `/api/exams/${ex.data.exam.id}`);
    assert.strictEqual(get.data.exam.score, 48);
  } finally { server.close(); }
});

test('stats reflect attempts; continue points to unsubmitted exam', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    let stats = (await api('GET', '/api/stats')).data;
    assert.strictEqual(stats.solved, 0);
    assert.strictEqual(stats.streak, 0);
    assert.strictEqual(stats.heatmap.length, 105);
    assert.strictEqual(stats.continue, null);

    const ex = await api('POST', '/api/exams', { subject: 'Mathematics', year: 2025, component: 2 });
    const answers = ex.data.questions.map((q) => ({ question_id: q.id, answer_text: 'ans' }));
    await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers, duration_sec: 600 });

    stats = (await api('GET', '/api/stats')).data;
    assert.strictEqual(stats.solved, 12);
    assert.strictEqual(stats.accuracy, 80);
    assert.strictEqual(stats.streak, 1);
    assert.strictEqual(stats.today_count, 12);
    assert.strictEqual(stats.time_today_sec, 600);
    assert.strictEqual(stats.recent.length, 1);
    assert.strictEqual(stats.recent[0].score, 48);
    assert.strictEqual(stats.heatmap[104].count, 12);

    await api('POST', '/api/exams', { subject: 'Physics', year: 2024, component: 1 });
    stats = (await api('GET', '/api/stats')).data;
    assert.deepStrictEqual(stats.continue, { subject: 'Physics', year: 2024, component: 1 });
  } finally { server.close(); }
});

test('objectives compute per-topic percentages', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics&year=2025&component=2')).data.questions;
    const q1 = qs.find((q) => q.number === 1); // Integration 3/3
    const q4 = qs.find((q) => q.number === 4); // Integration 5/5
    const q5 = qs.find((q) => q.number === 5); // Sequences and Series 1/3
    for (const q of [q1, q4, q5]) {
      await api('POST', '/api/attempts', { question_id: q.id, answer_text: 'ans', mode: 'practice' });
    }
    const obj = (await api('GET', '/api/objectives?subject=Mathematics')).data.objectives;
    const integ = obj.find((o) => o.topic === 'Integration');
    assert.strictEqual(integ.pct, 100);
    assert.strictEqual(integ.attempts, 2);
    const seq = obj.find((o) => o.topic === 'Sequences and Series');
    assert.strictEqual(seq.pct, 33);
    const vec = obj.find((o) => o.topic === 'Vectors');
    assert.strictEqual(vec.pct, 0);
    assert.strictEqual(vec.attempts, 0);
  } finally { server.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — exam endpoints return 404.

- [ ] **Step 3: Write `server/routes/exams.js`**

```js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
const PUB = 'id, subject, year, component, number, marks, topic, text_latex, figure_svg';

function examResults(examId, uid) {
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(examId, uid);
  if (!exam) return null;
  const results = db.prepare(`
    SELECT q.id AS question_id, q.number, q.marks, q.topic, q.text_latex, q.figure_svg,
           q.mark_scheme, q.ai_feedback, a.answer_text, a.awarded_mark
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.exam_id = ? AND a.user_id = ?
    ORDER BY q.number
  `).all(examId, uid);
  const pct = exam.total ? Math.round((100 * (exam.score || 0)) / exam.total) : 0;
  return { exam: { ...exam, pct }, results };
}

router.post('/exams', requireAuth, (req, res) => {
  const { subject, year, component } = req.body || {};
  const y = Number(year);
  const c = Number(component);
  if (!SUBJECTS.includes(subject)) return res.status(400).json({ error: 'bad_subject' });
  if (!Number.isInteger(y) || y < 2021 || y > 2025) return res.status(400).json({ error: 'bad_year' });
  if (![1, 2, 3].includes(c)) return res.status(400).json({ error: 'bad_component' });

  let questions = db.prepare(
    `SELECT ${PUB} FROM questions WHERE subject=? AND year=? AND component=? ORDER BY number`
  ).all(subject, y, c);
  if (questions.length === 0) {
    questions = db.prepare(`SELECT ${PUB} FROM questions WHERE subject=? ORDER BY number LIMIT 12`).all(subject);
  }
  const total = questions.reduce((s, q) => s + q.marks, 0);
  const uid = req.session.userId;
  db.prepare('DELETE FROM exams WHERE user_id=? AND submitted_at IS NULL').run(uid);
  const info = db.prepare(
    'INSERT INTO exams (user_id, subject, year, component, total) VALUES (?,?,?,?,?)'
  ).run(uid, subject, y, c, total);
  const markedIds = db.prepare('SELECT question_id FROM marked WHERE user_id=?').all(uid)
    .map((r) => r.question_id);
  res.json({
    exam: { id: Number(info.lastInsertRowid), subject, year: y, component: c, total, duration_min: 90 },
    questions,
    marked_ids: markedIds,
  });
});

router.post('/exams/:id/submit', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND user_id=?').get(req.params.id, uid);
  if (!exam) return res.status(404).json({ error: 'not_found' });
  if (exam.submitted_at) return res.status(409).json({ error: 'already_submitted' });
  const answers = (req.body && req.body.answers) || [];
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'no_answers' });
  }
  const getQ = db.prepare('SELECT id, expected_mark FROM questions WHERE id=?');
  const graded = [];
  for (const a of answers) {
    const q = getQ.get(a.question_id);
    if (!q) return res.status(400).json({ error: 'bad_question' });
    const text = String(a.answer_text || '');
    graded.push({ qid: q.id, text, awarded: text.trim() ? q.expected_mark : 0 });
  }
  const durationSec = Math.max(0, Number(req.body.duration_sec) || 0);
  const per = Math.round(durationSec / graded.length);
  const ins = db.prepare(`
    INSERT INTO attempts (user_id, question_id, exam_id, answer_text, awarded_mark, mode, duration_sec)
    VALUES (?,?,?,?,?,'exam',?)
  `);
  let score = 0;
  for (const g of graded) {
    score += g.awarded;
    ins.run(uid, g.qid, exam.id, g.text, g.awarded, per);
  }
  db.prepare(`UPDATE exams SET score=?, submitted_at=datetime('now') WHERE id=?`).run(score, exam.id);
  res.json(examResults(exam.id, uid));
});

router.get('/exams/:id', requireAuth, (req, res) => {
  const payload = examResults(req.params.id, req.session.userId);
  if (!payload) return res.status(404).json({ error: 'not_found' });
  res.json(payload);
});

module.exports = router;
```

- [ ] **Step 4: Write `server/routes/stats.js`**

```js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function dayString(offsetDays) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
}

router.get('/stats', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const attempts = db.prepare(`
    SELECT a.awarded_mark, a.duration_sec, substr(a.created_at, 1, 10) AS day, q.marks
    FROM attempts a JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ?
  `).all(uid);

  const solved = attempts.length;
  let awarded = 0;
  let possible = 0;
  const byDay = {};
  const today = dayString(0);
  let timeTodaySec = 0;
  let todayCount = 0;
  for (const a of attempts) {
    awarded += a.awarded_mark;
    possible += a.marks;
    byDay[a.day] = (byDay[a.day] || 0) + 1;
    if (a.day === today) { timeTodaySec += a.duration_sec; todayCount += 1; }
  }
  const accuracy = possible ? Math.round((100 * awarded) / possible) : 0;

  let streak = 0;
  const start = byDay[today] ? 0 : 1; // an empty today does not break the streak
  while (byDay[dayString(start + streak)]) streak += 1;

  const heatmap = [];
  for (let off = 104; off >= 0; off -= 1) {
    const date = dayString(off);
    heatmap.push({ date, count: byDay[date] || 0 });
  }

  const recent = db.prepare(`
    SELECT id, subject, year, component, score, total, submitted_at
    FROM exams WHERE user_id=? AND submitted_at IS NOT NULL
    ORDER BY submitted_at DESC, id DESC LIMIT 5
  `).all(uid);

  const cont = db.prepare(`
    SELECT subject, year, component FROM exams
    WHERE user_id=? AND submitted_at IS NULL
    ORDER BY started_at DESC, id DESC LIMIT 1
  `).get(uid);

  res.json({
    solved,
    accuracy,
    streak,
    time_today_sec: timeTodaySec,
    today_count: todayCount,
    goal: 20,
    heatmap,
    recent,
    continue: cont || null,
  });
});

router.get('/objectives', requireAuth, (req, res) => {
  const subject = req.query.subject || 'Mathematics';
  const rows = db.prepare(`
    SELECT q.topic,
           COUNT(a.id) AS attempts,
           COALESCE(SUM(a.awarded_mark), 0) AS awarded,
           COALESCE(SUM(CASE WHEN a.id IS NULL THEN 0 ELSE q.marks END), 0) AS possible
    FROM questions q
    LEFT JOIN attempts a ON a.question_id = q.id AND a.user_id = ?
    WHERE q.subject = ?
    GROUP BY q.topic
    ORDER BY q.topic
  `).all(req.session.userId, subject);
  res.json({
    objectives: rows.map((r) => ({
      topic: r.topic,
      attempts: r.attempts,
      pct: r.possible ? Math.round((100 * r.awarded) / r.possible) : 0,
    })),
  });
});

module.exports = router;
```

- [ ] **Step 5: Mount in `server/index.js`** (after content router):

```js
app.use('/api', require('./routes/exams'));
app.use('/api', require('./routes/stats'));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all backend tests green.

- [ ] **Step 7: Commit**

```bash
git add server/ tests/exams-stats.test.js
git commit -m "feat: add exams, stats and objectives API"
```

---

### Task 6: Frontend foundation — shell, styles, i18n, router, auth screen

**Files:**
- Create: `public/index.html`, `public/css/styles.css`, `public/js/i18n.js`, `public/js/api.js`, `public/js/state.js`, `public/js/app.js`, `.claude/launch.json`

**Interfaces:**
- Consumes: auth API from Task 3.
- Produces (used by every view task):
  - Globals: `App {user, lang, cleanup}`, `Views` registry object, `t(key, vars?)`, `esc(s)`, `renderMath(el)`, `fmtDuration(sec)`, `relDay(isoString)`, `ringSVG(value, max, sizePx)`, `api(method, path, body?)` (throws `Error` with `.code`/`.status`; auto-logs-out on 401), `renderRoute()`.
  - Views are `Views.<name> = async function (rootEl, queryParams) {...}`; router calls them for `#/<name>?k=v`, then runs `renderMath(rootEl)`. Views needing teardown set `App.cleanup = fn`.
  - Sidebar routes: dashboard, papers, bank, objectives, mistakes, marked, progress (→ `#/objectives`), about.

There is no automated test for frontend tasks — each ends with a manual browser verification step against the running server.

- [ ] **Step 1: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NIS Practice Platform</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div id="app"></div>
  <script src="js/i18n.js"></script>
  <script src="js/api.js"></script>
  <script src="js/state.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

(View `<script>` tags are inserted before `js/app.js` by Tasks 7–9 as the files appear.)

- [ ] **Step 2: Write `public/js/i18n.js`** — the full trilingual dictionary

```js
const I18N = {
  en: {
    'app.school': 'Nazarbayev Intellectual Schools',
    'nav.dashboard': 'Dashboard', 'nav.papers': 'Past Papers', 'nav.bank': 'Question Bank',
    'nav.objectives': 'Learning Objectives', 'nav.mistakes': 'Mistake Notebook',
    'nav.marked': 'Marked Questions', 'nav.progress': 'Progress', 'nav.about': 'About Us',
    'nav.logout': 'Log out',
    'auth.welcome': 'Welcome to NIS Practice', 'auth.subtitle': 'Sign in to continue your preparation',
    'auth.email': 'Email', 'auth.password': 'Password', 'auth.name': 'Your name',
    'auth.login': 'Log in', 'auth.register': 'Create account',
    'auth.toRegister': 'No account? Register', 'auth.toLogin': 'Already have an account? Log in',
    'auth.err.invalid_email': 'Please enter a valid email.',
    'auth.err.weak_password': 'Password must be at least 6 characters.',
    'auth.err.name_required': 'Please enter your name.',
    'auth.err.email_taken': 'This email is already registered.',
    'auth.err.invalid_credentials': 'Wrong email or password.',
    'dash.hello': 'Hello, {name}', 'dash.ready': "Ready for today's practice?",
    'dash.streak': 'day streak', 'dash.today': 'Today', 'dash.solved': 'Questions solved',
    'dash.accuracy': 'Accuracy', 'dash.goal': "Today's Goal", 'dash.goalText': 'Solve 20 questions',
    'dash.continue': 'Continue where you left off', 'dash.continueBtn': 'Continue',
    'dash.recent': 'Recent Activity', 'dash.heatmap': 'Calendar Heatmap',
    'dash.less': 'Less', 'dash.more': 'More', 'dash.quick': 'Quick Actions',
    'dash.qa.practice': 'Continue Practice', 'dash.qa.papers': 'Past Papers',
    'dash.qa.bank': 'Question Bank', 'dash.qa.mistakes': 'Mistake Notebook',
    'dash.qa.marked': 'Marked Questions', 'dash.none': 'No activity yet',
    'time.today': 'Today', 'time.yesterday': 'Yesterday', 'time.daysAgo': '{n} days ago',
    'subj.Mathematics': 'Mathematics', 'subj.Chemistry': 'Chemistry',
    'subj.Physics': 'Physics', 'subj.Biology': 'Biology',
    'papers.title': 'Past Papers (Exam Mode)', 'papers.subtitle': 'Choose exam to start',
    'papers.subject': 'Subject', 'papers.year': 'Year', 'papers.paper': 'Paper',
    'papers.component': 'Component {n}', 'papers.start': 'Start Exam',
    'papers.note': 'Exam mode simulates the real exam environment. Your progress will be saved only after you submit the exam.',
    'exam.remaining': 'Remaining time', 'exam.timeLeft': '{pct}% of time left',
    'exam.qOf': 'Question {a} of {b}', 'exam.qTitle': 'Question {n} ({m} marks)',
    'exam.save': 'Save Question', 'exam.saved': 'Saved',
    'exam.placeholder': 'Write your answer here...',
    'exam.prev': 'Previous', 'exam.next': 'Next', 'exam.submit': 'Submit Exam', 'exam.end': 'End Exam',
    'exam.confirmEnd': 'End this exam without submitting? Your answers will be lost.',
    'exam.confirmSubmit': 'Submit the exam for marking?',
    'results.banner': 'Your Estimated Score (by AI)', 'results.overview': 'Overview',
    'results.review': 'Questions Review', 'results.q': 'Question',
    'results.yourAnswer': 'Your Answer', 'results.expected': 'Expected Mark (AI)',
    'results.status': 'Status', 'results.reviewAll': 'Review All Questions',
    'results.noAnswer': '(no answer)',
    'bank.title': 'Question Bank (Practice Mode)', 'bank.topic': 'Topic', 'bank.all': 'All',
    'bank.start': 'Start', 'bank.random': 'Random Question',
    'bank.save': 'Save', 'bank.saved': 'Saved', 'bank.submit': 'Submit',
    'bank.scheme': 'Show Mark Scheme', 'bank.schemeTitle': 'Mark Scheme',
    'bank.next': 'Next Question', 'bank.ai': 'AI Feedback',
    'bank.expected': 'Expected mark (by AI)', 'bank.confidence': 'Confidence: {level}',
    'bank.conf.high': 'High', 'bank.conf.medium': 'Medium', 'bank.conf.low': 'Low',
    'bank.empty': 'No questions match these filters.',
    'bank.done': 'You have reached the end of this set. 🎉',
    'obj.title': 'Learning Objectives Progress', 'obj.attempted': '{n} attempts',
    'mist.title': 'My Mistakes', 'mist.total': 'Total mistakes:', 'mist.wrong': 'Wrong answer',
    'mist.retry': 'Retry', 'mist.practice': 'Practice Only Mistakes',
    'mist.allSubjects': 'All Subjects', 'mist.empty': 'No mistakes — keep practicing! 🎉',
    'marked.title': 'Marked Questions', 'marked.total': 'Total marked:',
    'marked.open': 'Practice', 'marked.remove': 'Remove',
    'marked.empty': 'You have not marked any questions yet.',
    'about.tagline': 'Empowering students. Inspiring excellence.',
    'about.blurb': 'Nazarbayev Intellectual Schools (NIS) provide world-class education that empowers students to become critical thinkers, effective communicators, and lifelong learners.',
    'about.c1': 'High Standards', 'about.c2': 'Innovative Learning', 'about.c3': 'Global Mindset',
    'about.contact': 'Contact Us', 'about.website': 'Website', 'about.email': 'Email',
    'about.telegram': 'Telegram',
    'common.loading': 'Loading...', 'common.error': 'Something went wrong. Please try again.',
    'common.marks': '{m} marks', 'q.number': 'Question {n}',
  },
  kk: {
    'app.school': 'Назарбаев Зияткерлік мектептері',
    'nav.dashboard': 'Басты бет', 'nav.papers': 'Өткен емтихандар', 'nav.bank': 'Сұрақтар қоры',
    'nav.objectives': 'Оқу мақсаттары', 'nav.mistakes': 'Қателер дәптері',
    'nav.marked': 'Белгіленген сұрақтар', 'nav.progress': 'Прогресс', 'nav.about': 'Біз туралы',
    'nav.logout': 'Шығу',
    'auth.welcome': 'NIS Practice-ке қош келдіңіз', 'auth.subtitle': 'Дайындықты жалғастыру үшін кіріңіз',
    'auth.email': 'Электрондық пошта', 'auth.password': 'Құпиясөз', 'auth.name': 'Атыңыз',
    'auth.login': 'Кіру', 'auth.register': 'Тіркелу',
    'auth.toRegister': 'Аккаунт жоқ па? Тіркеліңіз', 'auth.toLogin': 'Аккаунт бар ма? Кіріңіз',
    'auth.err.invalid_email': 'Дұрыс электрондық пошта енгізіңіз.',
    'auth.err.weak_password': 'Құпиясөз кемінде 6 таңбадан тұруы керек.',
    'auth.err.name_required': 'Атыңызды енгізіңіз.',
    'auth.err.email_taken': 'Бұл пошта тіркелген.',
    'auth.err.invalid_credentials': 'Пошта немесе құпиясөз қате.',
    'dash.hello': 'Сәлем, {name}', 'dash.ready': 'Бүгінгі жаттығуға дайынсыз ба?',
    'dash.streak': 'күн қатарынан', 'dash.today': 'Бүгін', 'dash.solved': 'Шешілген сұрақтар',
    'dash.accuracy': 'Дәлдік', 'dash.goal': 'Бүгінгі мақсат', 'dash.goalText': '20 сұрақ шешу',
    'dash.continue': 'Тоқтаған жерден жалғастыру', 'dash.continueBtn': 'Жалғастыру',
    'dash.recent': 'Соңғы әрекеттер', 'dash.heatmap': 'Белсенділік күнтізбесі',
    'dash.less': 'Аз', 'dash.more': 'Көп', 'dash.quick': 'Жылдам әрекеттер',
    'dash.qa.practice': 'Жаттығуды жалғастыру', 'dash.qa.papers': 'Өткен емтихандар',
    'dash.qa.bank': 'Сұрақтар қоры', 'dash.qa.mistakes': 'Қателер дәптері',
    'dash.qa.marked': 'Белгіленген сұрақтар', 'dash.none': 'Әзірге белсенділік жоқ',
    'time.today': 'Бүгін', 'time.yesterday': 'Кеше', 'time.daysAgo': '{n} күн бұрын',
    'subj.Mathematics': 'Математика', 'subj.Chemistry': 'Химия',
    'subj.Physics': 'Физика', 'subj.Biology': 'Биология',
    'papers.title': 'Өткен емтихандар (Емтихан режимі)', 'papers.subtitle': 'Бастау үшін емтиханды таңдаңыз',
    'papers.subject': 'Пән', 'papers.year': 'Жыл', 'papers.paper': 'Нұсқа',
    'papers.component': '{n}-компонент', 'papers.start': 'Емтиханды бастау',
    'papers.note': 'Емтихан режимі нақты емтихан ортасын имитациялайды. Прогресс емтиханды тапсырғаннан кейін ғана сақталады.',
    'exam.remaining': 'Қалған уақыт', 'exam.timeLeft': 'Уақыттың {pct}% қалды',
    'exam.qOf': 'Сұрақ {a} / {b}', 'exam.qTitle': '{n}-сұрақ ({m} балл)',
    'exam.save': 'Сұрақты сақтау', 'exam.saved': 'Сақталды',
    'exam.placeholder': 'Жауабыңызды осында жазыңыз...',
    'exam.prev': 'Алдыңғы', 'exam.next': 'Келесі', 'exam.submit': 'Емтиханды тапсыру', 'exam.end': 'Аяқтау',
    'exam.confirmEnd': 'Емтиханды тапсырмай аяқтайсыз ба? Жауаптар сақталмайды.',
    'exam.confirmSubmit': 'Емтиханды тексеруге жібересіз бе?',
    'results.banner': 'Болжамды баға (AI бойынша)', 'results.overview': 'Шолу',
    'results.review': 'Сұрақтарды қарау', 'results.q': 'Сұрақ',
    'results.yourAnswer': 'Сіздің жауабыңыз', 'results.expected': 'Болжамды балл (AI)',
    'results.status': 'Күйі', 'results.reviewAll': 'Барлық сұрақтарды қарау',
    'results.noAnswer': '(жауап жоқ)',
    'bank.title': 'Сұрақтар қоры (Жаттығу режимі)', 'bank.topic': 'Тақырып', 'bank.all': 'Барлығы',
    'bank.start': 'Бастау', 'bank.random': 'Кездейсоқ сұрақ',
    'bank.save': 'Сақтау', 'bank.saved': 'Сақталды', 'bank.submit': 'Жіберу',
    'bank.scheme': 'Бағалау схемасын көрсету', 'bank.schemeTitle': 'Бағалау схемасы',
    'bank.next': 'Келесі сұрақ', 'bank.ai': 'AI кері байланысы',
    'bank.expected': 'Болжамды балл (AI)', 'bank.confidence': 'Сенімділік: {level}',
    'bank.conf.high': 'Жоғары', 'bank.conf.medium': 'Орташа', 'bank.conf.low': 'Төмен',
    'bank.empty': 'Бұл сүзгілерге сай сұрақ табылмады.',
    'bank.done': 'Осы жинақтың соңына жеттіңіз. 🎉',
    'obj.title': 'Оқу мақсаттарының прогресі', 'obj.attempted': '{n} әрекет',
    'mist.title': 'Менің қателерім', 'mist.total': 'Барлық қателер:', 'mist.wrong': 'Қате жауап',
    'mist.retry': 'Қайталау', 'mist.practice': 'Тек қателермен жаттығу',
    'mist.allSubjects': 'Барлық пәндер', 'mist.empty': 'Қате жоқ — жаттығуды жалғастырыңыз! 🎉',
    'marked.title': 'Белгіленген сұрақтар', 'marked.total': 'Барлығы белгіленген:',
    'marked.open': 'Жаттығу', 'marked.remove': 'Өшіру',
    'marked.empty': 'Әзірге белгіленген сұрақ жоқ.',
    'about.tagline': 'Оқушыларға қуат береміз. Шабыттандырамыз.',
    'about.blurb': 'Назарбаев Зияткерлік мектептері (NIS) оқушыларды сыни ойлайтын, тиімді қарым-қатынас жасайтын және өмір бойы білім алатын тұлға етіп тәрбиелейтін әлемдік деңгейдегі білім береді.',
    'about.c1': 'Жоғары стандарттар', 'about.c2': 'Инновациялық оқыту', 'about.c3': 'Жаһандық ойлау',
    'about.contact': 'Байланыс', 'about.website': 'Веб-сайт', 'about.email': 'Пошта',
    'about.telegram': 'Telegram',
    'common.loading': 'Жүктелуде...', 'common.error': 'Қате шықты. Қайталап көріңіз.',
    'common.marks': '{m} балл', 'q.number': '{n}-сұрақ',
  },
  ru: {
    'app.school': 'Назарбаев Интеллектуальные школы',
    'nav.dashboard': 'Главная', 'nav.papers': 'Экзамены прошлых лет', 'nav.bank': 'Банк вопросов',
    'nav.objectives': 'Цели обучения', 'nav.mistakes': 'Тетрадь ошибок',
    'nav.marked': 'Отмеченные вопросы', 'nav.progress': 'Прогресс', 'nav.about': 'О нас',
    'nav.logout': 'Выйти',
    'auth.welcome': 'Добро пожаловать в NIS Practice', 'auth.subtitle': 'Войдите, чтобы продолжить подготовку',
    'auth.email': 'Эл. почта', 'auth.password': 'Пароль', 'auth.name': 'Ваше имя',
    'auth.login': 'Войти', 'auth.register': 'Создать аккаунт',
    'auth.toRegister': 'Нет аккаунта? Зарегистрируйтесь', 'auth.toLogin': 'Уже есть аккаунт? Войдите',
    'auth.err.invalid_email': 'Введите корректный адрес почты.',
    'auth.err.weak_password': 'Пароль должен быть не короче 6 символов.',
    'auth.err.name_required': 'Введите имя.',
    'auth.err.email_taken': 'Эта почта уже зарегистрирована.',
    'auth.err.invalid_credentials': 'Неверная почта или пароль.',
    'dash.hello': 'Привет, {name}', 'dash.ready': 'Готовы к сегодняшней практике?',
    'dash.streak': 'дней подряд', 'dash.today': 'Сегодня', 'dash.solved': 'Решено вопросов',
    'dash.accuracy': 'Точность', 'dash.goal': 'Цель на сегодня', 'dash.goalText': 'Решить 20 вопросов',
    'dash.continue': 'Продолжить с места остановки', 'dash.continueBtn': 'Продолжить',
    'dash.recent': 'Недавняя активность', 'dash.heatmap': 'Календарь активности',
    'dash.less': 'Меньше', 'dash.more': 'Больше', 'dash.quick': 'Быстрые действия',
    'dash.qa.practice': 'Продолжить практику', 'dash.qa.papers': 'Экзамены прошлых лет',
    'dash.qa.bank': 'Банк вопросов', 'dash.qa.mistakes': 'Тетрадь ошибок',
    'dash.qa.marked': 'Отмеченные вопросы', 'dash.none': 'Пока нет активности',
    'time.today': 'Сегодня', 'time.yesterday': 'Вчера', 'time.daysAgo': '{n} дн. назад',
    'subj.Mathematics': 'Математика', 'subj.Chemistry': 'Химия',
    'subj.Physics': 'Физика', 'subj.Biology': 'Биология',
    'papers.title': 'Экзамены прошлых лет (режим экзамена)', 'papers.subtitle': 'Выберите экзамен',
    'papers.subject': 'Предмет', 'papers.year': 'Год', 'papers.paper': 'Вариант',
    'papers.component': 'Компонент {n}', 'papers.start': 'Начать экзамен',
    'papers.note': 'Режим экзамена имитирует реальную экзаменационную среду. Прогресс сохранится только после сдачи экзамена.',
    'exam.remaining': 'Оставшееся время', 'exam.timeLeft': 'Осталось {pct}% времени',
    'exam.qOf': 'Вопрос {a} из {b}', 'exam.qTitle': 'Вопрос {n} ({m} баллов)',
    'exam.save': 'Сохранить вопрос', 'exam.saved': 'Сохранено',
    'exam.placeholder': 'Напишите ваш ответ здесь...',
    'exam.prev': 'Назад', 'exam.next': 'Далее', 'exam.submit': 'Сдать экзамен', 'exam.end': 'Завершить',
    'exam.confirmEnd': 'Завершить экзамен без сдачи? Ответы будут потеряны.',
    'exam.confirmSubmit': 'Отправить экзамен на проверку?',
    'results.banner': 'Ваш ожидаемый балл (по AI)', 'results.overview': 'Обзор',
    'results.review': 'Разбор вопросов', 'results.q': 'Вопрос',
    'results.yourAnswer': 'Ваш ответ', 'results.expected': 'Ожидаемый балл (AI)',
    'results.status': 'Статус', 'results.reviewAll': 'Разобрать все вопросы',
    'results.noAnswer': '(нет ответа)',
    'bank.title': 'Банк вопросов (режим практики)', 'bank.topic': 'Тема', 'bank.all': 'Все',
    'bank.start': 'Начать', 'bank.random': 'Случайный вопрос',
    'bank.save': 'Сохранить', 'bank.saved': 'Сохранено', 'bank.submit': 'Отправить',
    'bank.scheme': 'Показать критерии', 'bank.schemeTitle': 'Критерии оценивания',
    'bank.next': 'Следующий вопрос', 'bank.ai': 'Отзыв AI',
    'bank.expected': 'Ожидаемый балл (AI)', 'bank.confidence': 'Уверенность: {level}',
    'bank.conf.high': 'Высокая', 'bank.conf.medium': 'Средняя', 'bank.conf.low': 'Низкая',
    'bank.empty': 'Нет вопросов по этим фильтрам.',
    'bank.done': 'Вы дошли до конца набора. 🎉',
    'obj.title': 'Прогресс по целям обучения', 'obj.attempted': '{n} попыток',
    'mist.title': 'Мои ошибки', 'mist.total': 'Всего ошибок:', 'mist.wrong': 'Неверный ответ',
    'mist.retry': 'Повторить', 'mist.practice': 'Практиковать только ошибки',
    'mist.allSubjects': 'Все предметы', 'mist.empty': 'Ошибок нет — продолжайте практиковаться! 🎉',
    'marked.title': 'Отмеченные вопросы', 'marked.total': 'Всего отмечено:',
    'marked.open': 'Практика', 'marked.remove': 'Убрать',
    'marked.empty': 'Вы ещё не отметили ни одного вопроса.',
    'about.tagline': 'Вдохновляем учеников. Стремимся к совершенству.',
    'about.blurb': 'Назарбаев Интеллектуальные школы (NIS) дают образование мирового уровня, которое помогает ученикам стать критически мыслящими, эффективно общающимися и учащимися на протяжении всей жизни.',
    'about.c1': 'Высокие стандарты', 'about.c2': 'Инновационное обучение', 'about.c3': 'Глобальное мышление',
    'about.contact': 'Связаться с нами', 'about.website': 'Сайт', 'about.email': 'Почта',
    'about.telegram': 'Telegram',
    'common.loading': 'Загрузка...', 'common.error': 'Что-то пошло не так. Попробуйте ещё раз.',
    'common.marks': '{m} баллов', 'q.number': 'Вопрос {n}',
  },
};

const LANG_LABELS = { en: 'EN', kk: 'ҚАЗ', ru: 'РУС' };

function t(key, vars) {
  const dict = I18N[App.lang] || I18N.en;
  let s = dict[key] || I18N.en[key] || key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.replaceAll('{' + k + '}', String(vars[k]));
  }
  return s;
}
```

- [ ] **Step 3: Write `public/js/api.js`**

```js
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && App.user) {
      App.user = null;
      location.hash = '';
      renderRoute();
    }
    const err = new Error((data && data.error) || 'server_error');
    err.code = (data && data.error) || 'server_error';
    err.status = res.status;
    throw err;
  }
  return data;
}
```

- [ ] **Step 4: Write `public/js/state.js`**

```js
// Global client state + shared render helpers.
const App = {
  user: null,
  lang: localStorage.getItem('nis_lang') || 'en',
  cleanup: null, // views with timers set this; router calls it on navigation
};

const Views = {};

function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderMath(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  }
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function relDay(iso) {
  const day = String(iso).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(today) - new Date(day)) / 86400000);
  if (diff <= 0) return t('time.today');
  if (diff === 1) return t('time.yesterday');
  return t('time.daysAgo', { n: diff });
}

function ringSVG(value, max, size) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const frac = max ? Math.min(1, value / max) : 0;
  const cx = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#e6ece6" stroke-width="8"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#3d8b40" stroke-width="8"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"
      transform="rotate(-90 ${cx} ${cx})"/>
    <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
      font-size="${size / 4.6}" font-weight="800" fill="#1f2a1f">${value}/${max}</text>
  </svg>`;
}
```

- [ ] **Step 5: Write `public/js/app.js`** — router, shell, auth screen

```js
const LOGO_SVG = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 37V15" stroke="#3d8b40" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M20 21 C 19 12, 10 8, 5 10 C 7 19, 14 23, 20 21 Z" fill="#4a9e4e"/>
  <path d="M20 16 C 21 8, 30 4, 35 6 C 33 16, 26 19, 20 16 Z" fill="#2e6b31"/>
</svg>`;

const NAV_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  papers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/></svg>',
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  objectives: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  mistakes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  marked: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.9 5.9 6.1.9-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3L3 9.8l6.1-.9z"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
  about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
};

const NAV_ITEMS = [
  ['dashboard', '#/dashboard', 'nav.dashboard'],
  ['papers', '#/papers', 'nav.papers'],
  ['bank', '#/bank', 'nav.bank'],
  ['objectives', '#/objectives', 'nav.objectives'],
  ['mistakes', '#/mistakes', 'nav.mistakes'],
  ['marked', '#/marked', 'nav.marked'],
  ['progress', '#/objectives', 'nav.progress'],
  ['about', '#/about', 'nav.about'],
];

function parseHash() {
  const h = location.hash || '#/dashboard';
  const [pathPart, queryPart] = h.split('?');
  const name = pathPart.replace(/^#\//, '') || 'dashboard';
  const q = {};
  if (queryPart) {
    for (const kv of queryPart.split('&')) {
      const [k, v] = kv.split('=');
      q[k] = decodeURIComponent(v || '');
    }
  }
  return { name, q };
}

function langSwitchHTML() {
  return `<div class="lang-switch">${Object.keys(LANG_LABELS).map((l) =>
    `<button data-lang="${l}" class="${App.lang === l ? 'active' : ''}">${LANG_LABELS[l]}</button>`
  ).join('')}</div>`;
}

function bindLangSwitch(scope) {
  scope.querySelectorAll('.lang-switch button').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
}

async function setLang(lang) {
  App.lang = lang;
  localStorage.setItem('nis_lang', lang);
  if (App.user) {
    try { await api('PATCH', '/api/me', { language: lang }); } catch { /* non-fatal */ }
  }
  renderRoute();
}

function renderShell(active) {
  const el = document.getElementById('app');
  el.innerHTML = `
  <div class="app-layout">
    <aside class="sidebar">
      <div class="logo">${LOGO_SVG}<div>
        <div class="logo-name">NIS</div>
        <div class="logo-sub">${t('app.school')}</div>
      </div></div>
      ${NAV_ITEMS.map(([key, href, label]) =>
        `<a class="nav-item ${active === key || (key === 'objectives' && active === 'progress') ? 'active' : ''}" href="${href}">${NAV_ICONS[key]}${t(label)}</a>`
      ).join('')}
      <button class="nav-item logout" id="btn-logout">${NAV_ICONS.logout}${t('nav.logout')}</button>
    </aside>
    <div class="main">
      <header class="topbar">
        ${langSwitchHTML()}
        <div class="user-chip">${esc(App.user.name)}</div>
      </header>
      <main id="view"></main>
    </div>
  </div>`;
  bindLangSwitch(el);
  el.querySelector('#btn-logout').addEventListener('click', logout);
}

async function logout() {
  try { await api('POST', '/api/logout'); } catch { /* ignore */ }
  App.user = null;
  location.hash = '';
  renderRoute();
}

function renderAuth() {
  const el = document.getElementById('app');
  el.innerHTML = `
  <div class="auth-wrap">
    <div class="card auth-card">
      <div class="logo">${LOGO_SVG}<div>
        <div class="logo-name">NIS</div>
        <div class="logo-sub">${t('app.school')}</div>
      </div></div>
      ${langSwitchHTML()}
      <h1>${t('auth.welcome')}</h1>
      <p class="page-sub">${t('auth.subtitle')}</p>
      <form id="auth-form">
        <div class="fld hidden" id="fld-name">
          <label>${t('auth.name')}</label>
          <input id="in-name" autocomplete="name">
        </div>
        <div class="fld">
          <label>${t('auth.email')}</label>
          <input id="in-email" type="email" autocomplete="email">
        </div>
        <div class="fld">
          <label>${t('auth.password')}</label>
          <input id="in-password" type="password" autocomplete="current-password">
        </div>
        <div class="form-error hidden" id="auth-error"></div>
        <button type="submit" class="btn btn-primary btn-block" id="auth-submit">${t('auth.login')}</button>
      </form>
      <div style="text-align:center">
        <button class="linklike" id="auth-toggle">${t('auth.toRegister')}</button>
      </div>
    </div>
  </div>`;
  bindLangSwitch(el);

  let mode = 'login';
  const toggle = el.querySelector('#auth-toggle');
  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    el.querySelector('#fld-name').classList.toggle('hidden', mode === 'login');
    el.querySelector('#auth-submit').textContent = mode === 'login' ? t('auth.login') : t('auth.register');
    toggle.textContent = mode === 'login' ? t('auth.toRegister') : t('auth.toLogin');
  });

  el.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = el.querySelector('#auth-error');
    errBox.classList.add('hidden');
    const email = el.querySelector('#in-email').value.trim();
    const password = el.querySelector('#in-password').value;
    const name = el.querySelector('#in-name').value;
    try {
      const r = mode === 'login'
        ? await api('POST', '/api/login', { email, password })
        : await api('POST', '/api/register', { email, password, name });
      App.user = r.user;
      if (mode === 'register' && App.lang !== 'en') {
        try { await api('PATCH', '/api/me', { language: App.lang }); } catch { /* non-fatal */ }
      } else if (mode === 'login') {
        App.lang = r.user.language;
        localStorage.setItem('nis_lang', App.lang);
      }
      location.hash = '#/dashboard';
      renderRoute();
    } catch (err) {
      errBox.textContent = t('auth.err.' + err.code) !== 'auth.err.' + err.code
        ? t('auth.err.' + err.code) : t('common.error');
      errBox.classList.remove('hidden');
    }
  });
}

function viewMissing(root) {
  root.innerHTML = '<div class="card empty">…</div>';
}

async function renderRoute() {
  if (typeof App.cleanup === 'function') { App.cleanup(); App.cleanup = null; }
  const { name, q } = parseHash();
  if (!App.user) { renderAuth(); return; }
  renderShell(name);
  const target = document.getElementById('view');
  const view = Views[name] || (name === 'progress' ? Views.objectives : null) || Views.dashboard || viewMissing;
  target.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
  try {
    await view(target, q);
    renderMath(target);
  } catch (err) {
    console.error(err);
    if (!App.user) { renderAuth(); return; }
    target.innerHTML = `<div class="card error-box">${t('common.error')}</div>`;
  }
}

async function boot() {
  try {
    const r = await api('GET', '/api/me');
    App.user = r.user;
    App.lang = r.user.language;
    localStorage.setItem('nis_lang', App.lang);
  } catch { /* not logged in */ }
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

boot();
```

- [ ] **Step 6: Write `public/css/styles.css`** — the full design system

```css
:root {
  --green:#3d8b40; --green-dark:#2e6b31; --green-tint:#e9f4e9;
  --bg:#f4f6f4; --text:#1f2a1f; --muted:#6b7a6b; --border:#e3e8e3;
  --gold:#e6a817; --red:#d64545; --blue:#4a90d9;
  --radius:16px; --shadow:0 1px 3px rgba(20,40,20,.06);
  font-size:15px;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); }
button { font:inherit; cursor:pointer; }
input, select, textarea { font:inherit; color:inherit; }
a { color:var(--green-dark); text-decoration:none; }
.hidden { display:none !important; }
.muted { color:var(--muted); }

/* ---- Layout ---- */
.app-layout { display:flex; min-height:100vh; }
.sidebar { width:232px; background:#fff; border-right:1px solid var(--border); padding:20px 14px; display:flex; flex-direction:column; gap:4px; position:sticky; top:0; height:100vh; overflow-y:auto; }
.logo { display:flex; align-items:center; gap:10px; padding:6px 8px 18px; }
.logo svg { width:38px; height:38px; flex:none; }
.logo-name { font-weight:800; font-size:22px; letter-spacing:.5px; color:var(--green-dark); }
.logo-sub { font-size:10.5px; color:var(--muted); line-height:1.25; }
.nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; color:var(--text); background:none; border:none; width:100%; text-align:left; font-weight:500; font-size:14px; }
.nav-item svg { width:18px; height:18px; flex:none; }
.nav-item:hover { background:var(--green-tint); }
.nav-item.active { background:var(--green); color:#fff; }
.nav-item.logout { margin-top:auto; color:var(--muted); }
.main { flex:1; display:flex; flex-direction:column; min-width:0; }
.topbar { display:flex; justify-content:flex-end; align-items:center; gap:14px; padding:14px 28px 0; }
#view { padding:18px 28px 40px; max-width:1080px; width:100%; }

.lang-switch { display:flex; gap:4px; background:#fff; border:1px solid var(--border); border-radius:999px; padding:3px; width:max-content; }
.lang-switch button { border:none; background:none; padding:4px 10px; border-radius:999px; font-weight:600; font-size:12.5px; color:var(--muted); }
.lang-switch button.active { background:var(--green); color:#fff; }
.user-chip { background:#fff; border:1px solid var(--border); border-radius:999px; padding:6px 14px; font-weight:600; font-size:13px; }

/* ---- Cards & typography ---- */
.card { background:#fff; border:1px solid var(--border); border-radius:var(--radius); padding:20px; box-shadow:var(--shadow); }
.page-title { font-size:24px; font-weight:800; margin-bottom:4px; }
.page-sub { color:var(--muted); margin-bottom:18px; }
.section-title { font-weight:700; margin-bottom:12px; }
.grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px; }
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
@media (max-width:900px) {
  .grid-4 { grid-template-columns:repeat(2,1fr); }
  .grid-2 { grid-template-columns:1fr; }
  .sidebar { display:none; }
}
.stat-card { display:flex; gap:12px; align-items:center; }
.stat-icon { font-size:22px; }
.stat-value { font-size:20px; font-weight:800; line-height:1.1; }
.stat-label { font-size:12.5px; color:var(--muted); }

/* ---- Buttons ---- */
.btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:10px; padding:9px 18px; font-weight:600; border:1px solid transparent; }
.btn-primary { background:var(--green); color:#fff; }
.btn-primary:hover { background:var(--green-dark); }
.btn-outline { background:#fff; border-color:var(--border); color:var(--text); }
.btn-outline:hover { border-color:var(--green); color:var(--green-dark); }
.btn-outline:disabled { opacity:.45; cursor:default; }
.btn-danger { background:#fff; border-color:var(--red); color:var(--red); }
.btn-blue { background:#2f6fb8; color:#fff; }
.btn-block { width:100%; }
.btn-sm { padding:6px 12px; font-size:13px; border-radius:8px; }
.linklike { background:none; border:none; color:var(--green-dark); font-weight:600; margin-top:12px; }

/* ---- Forms ---- */
.fld { margin-bottom:12px; }
.fld label { display:block; font-size:13px; font-weight:600; margin-bottom:5px; }
.fld input, .filter select, textarea.answer { width:100%; border:1px solid var(--border); border-radius:10px; padding:9px 12px; background:#fff; }
.fld input:focus, textarea.answer:focus { outline:2px solid var(--green-tint); border-color:var(--green); }
.form-error { color:var(--red); font-size:13px; margin-bottom:10px; }

/* ---- Auth ---- */
.auth-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.auth-card { width:400px; max-width:100%; }
.auth-card .logo { justify-content:center; padding-bottom:8px; }
.auth-card h1 { font-size:20px; text-align:center; }
.auth-card .page-sub { text-align:center; }
.auth-card .lang-switch { margin:0 auto 16px; }

/* ---- Progress bars & heatmap ---- */
.progress { height:8px; border-radius:999px; background:#e6ece6; overflow:hidden; }
.progress > i { display:block; height:100%; border-radius:999px; background:var(--green); }
.heatmap { display:grid; grid-auto-flow:column; grid-template-rows:repeat(7,13px); gap:3px; margin:10px 0; overflow-x:auto; padding-bottom:4px; }
.hm { width:13px; height:13px; border-radius:3px; background:#e3eae3; }
.hm[data-l="1"] { background:#bfe0c0; }
.hm[data-l="2"] { background:#8cc78f; }
.hm[data-l="3"] { background:#57a75c; }
.hm[data-l="4"] { background:#2e6b31; }
.hm-legend { display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--muted); justify-content:flex-end; }
.hm-legend .hm { width:10px; height:10px; }

/* ---- Past-papers choices ---- */
.choice-row { display:flex; flex-wrap:wrap; gap:10px; margin:8px 0 18px; }
.choice { border:1px solid var(--border); background:#fff; border-radius:10px; padding:9px 20px; font-weight:600; }
.choice.selected { background:var(--green); border-color:var(--green); color:#fff; }
.step-num { display:inline-flex; width:22px; height:22px; border-radius:50%; background:var(--green); color:#fff; align-items:center; justify-content:center; font-size:12.5px; font-weight:700; margin-right:8px; }
.note { background:#eef6ff; border:1px solid #d5e7fb; color:#2c5c8f; border-radius:12px; padding:12px 16px; font-size:13.5px; margin-top:18px; }

/* ---- Exam ---- */
.exam-header { background:linear-gradient(90deg,#4a90d9,#67a7e6); color:#fff; border-radius:var(--radius); padding:16px 20px; margin-bottom:16px; }
.exam-header .row1 { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.exam-title { font-weight:700; }
.timer-box { background:rgba(255,255,255,.93); color:var(--text); border-radius:12px; padding:10px 16px; text-align:center; }
.timer { font-size:26px; font-weight:800; color:var(--green-dark); font-variant-numeric:tabular-nums; }
.timebar { height:6px; border-radius:999px; background:rgba(0,0,0,.08); margin-top:8px; overflow:hidden; }
.timebar > i { display:block; height:100%; background:var(--green); }
.q-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px; }
.q-title { font-weight:700; font-size:17px; }
.star-btn { background:none; border:none; color:var(--muted); font-weight:600; display:inline-flex; gap:6px; align-items:center; }
.star-btn.on { color:var(--gold); }
.q-text { line-height:1.65; margin-bottom:12px; }
.q-figure { max-width:360px; display:block; margin:10px 0; }
textarea.answer { min-height:120px; resize:vertical; display:block; }
.exam-nav { display:flex; justify-content:space-between; align-items:center; margin-top:14px; gap:10px; }

/* ---- Results ---- */
.score-banner { background:linear-gradient(120deg,#3d8b40,#59a75d); color:#fff; border-radius:var(--radius); padding:28px; text-align:center; margin-bottom:16px; }
.score-banner .big { font-size:40px; font-weight:800; }
.score-banner .pct { color:#d9f7b0; font-weight:700; font-size:18px; }
.tabs { display:flex; gap:2px; border-bottom:1px solid var(--border); margin-bottom:14px; }
.tab { background:none; border:none; padding:9px 16px; font-weight:600; color:var(--muted); border-bottom:2px solid transparent; }
.tab.active { color:var(--green-dark); border-bottom-color:var(--green); }
table.results { width:100%; border-collapse:collapse; font-size:14px; }
table.results th { text-align:left; color:var(--muted); font-size:12.5px; padding:8px 10px; border-bottom:1px solid var(--border); }
table.results td { padding:10px; border-bottom:1px solid var(--border); }
.status-ic { font-size:16px; }

/* ---- Practice / feedback ---- */
.filter-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:0; align-items:end; }
.filter { min-width:150px; }
.filter label { display:block; font-size:12px; color:var(--muted); font-weight:600; margin-bottom:4px; }
.filter select { width:100%; border:1px solid var(--border); border-radius:10px; padding:8px 10px; background:#fff; }
.practice-grid { display:grid; grid-template-columns:1fr 300px; gap:16px; align-items:start; margin-top:16px; }
@media (max-width:900px) { .practice-grid { grid-template-columns:1fr; } }
.toolbar { display:flex; gap:4px; border:1px solid var(--border); border-bottom:none; border-radius:10px 10px 0 0; padding:6px 8px; background:#fafbfa; }
.toolbar button { border:none; background:none; min-width:30px; height:28px; border-radius:6px; font-weight:700; }
.toolbar button:hover { background:var(--green-tint); }
.toolbar + textarea.answer { border-radius:0 0 10px 10px; }
.fb-title { font-weight:700; margin-bottom:10px; }
.fb-text { font-size:13.5px; line-height:1.6; }
.ring-wrap { display:flex; flex-direction:column; align-items:center; margin:16px 0 8px; }
.ring-label { font-size:12.5px; color:var(--muted); margin-bottom:6px; }
.conf { font-size:12.5px; color:var(--muted); margin-top:10px; }
.conf-bar { height:6px; border-radius:999px; background:#e6ece6; margin-top:5px; overflow:hidden; }
.conf-bar > i { display:block; height:100%; background:var(--green); }
.scheme-box { background:#fdf9ee; border:1px solid #f0e3bb; border-radius:12px; padding:14px 16px; margin-top:14px; font-size:13.5px; line-height:1.6; }

/* ---- List rows (mistakes / marked / recent / objectives) ---- */
.row-item { display:flex; align-items:center; gap:14px; padding:14px 4px; border-bottom:1px solid var(--border); }
.row-item:last-child { border-bottom:none; }
.row-ic { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; font-size:17px; }
.row-ic.red { background:#fdeaea; color:var(--red); }
.row-ic.gold { background:#fdf3dc; color:var(--gold); }
.row-ic.green { background:var(--green-tint); color:var(--green-dark); }
.row-main { flex:1; min-width:0; }
.row-title { font-weight:700; }
.row-sub { font-size:12.5px; color:var(--muted); margin-top:2px; }
.badge { font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:999px; }
.badge.red { background:#fdeaea; color:var(--red); }
.obj-bar { flex:1; max-width:320px; display:flex; align-items:center; gap:10px; }
.obj-pct { font-weight:700; width:44px; text-align:right; font-size:13.5px; }

/* ---- About ---- */
.about-hero { text-align:center; padding:34px 20px; }
.about-hero .logo { justify-content:center; }
.about-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:18px 0; }
.about-card { text-align:center; padding:22px 14px; }
.about-ic { width:52px; height:52px; margin:0 auto 10px; border-radius:50%; background:var(--green-tint); display:flex; align-items:center; justify-content:center; font-size:24px; }
.contact-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
@media (max-width:900px) { .about-cards, .contact-grid { grid-template-columns:1fr; } }

/* ---- Misc ---- */
.loading { color:var(--muted); padding:30px; text-align:center; }
.error-box { color:var(--red); }
.empty { color:var(--muted); text-align:center; padding:26px; }
.katex { font-size:1.05em; }
```

- [ ] **Step 7: Write `.claude/launch.json`** (for browser preview during development)

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "nis",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["start"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 8: Manual verification in browser**

Start the `nis` preview server and open http://localhost:3000. Verify:
1. Login card renders centered with logo, EN/ҚАЗ/РУС pills, Inter font, green button.
2. Switching language re-labels the card instantly.
3. Register a user (e.g. `aya@test.kz` / `secret123` / `Aya`) → app shell renders: white sidebar with 8 items + logout, topbar with language pills and name chip, dashboard placeholder (dashboard view not built yet — the fallback `…` card is fine).
4. Wrong-password login shows the red inline error in the current language.
5. Refresh keeps you logged in. Logout returns to the login card.

- [ ] **Step 9: Commit**

```bash
git add public/ .claude/launch.json
git commit -m "feat: add SPA shell, styles, i18n and auth screen"
```

---

### Task 7: Dashboard + About views

**Files:**
- Create: `public/js/views/dashboard.js`, `public/js/views/about.js`
- Modify: `public/index.html` (add the two script tags before `js/app.js`)

**Interfaces:**
- Consumes: `GET /api/stats` (Task 5 shape), globals from Task 6.
- Produces: `Views.dashboard`, `Views.about`.

- [ ] **Step 1: Write `public/js/views/dashboard.js`**

```js
function statCard(icon, value, label) {
  return `<div class="card stat-card"><span class="stat-icon">${icon}</span><div>
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div>`;
}

function heatmapHTML(cells) {
  const level = (c) => (c === 0 ? 0 : c < 3 ? 1 : c < 6 ? 2 : c < 10 ? 3 : 4);
  return `<div class="heatmap">${cells.map((c) =>
    `<span class="hm" data-l="${level(c.count)}" title="${c.date}: ${c.count}"></span>`
  ).join('')}</div>`;
}

function continueCardHTML(cont) {
  if (!cont) return '';
  const href = `#/exam?subject=${encodeURIComponent(cont.subject)}&year=${cont.year}&component=${cont.component}`;
  return `<div style="margin-top:16px;padding:14px;background:var(--green-tint);border-radius:12px">
    <div class="section-title" style="margin-bottom:6px">${t('dash.continue')}</div>
    <div class="row-sub">${t('subj.' + cont.subject)} · ${cont.year} · ${t('papers.component', { n: cont.component })}</div>
    <a class="btn btn-primary btn-sm" style="margin-top:10px" href="${href}">${t('dash.continueBtn')}</a>
  </div>`;
}

function recentRowHTML(r) {
  return `<div class="row-item"><span class="row-ic green">✓</span>
    <div class="row-main">
      <div class="row-title">${t('subj.' + r.subject)} · ${r.year} · ${t('papers.component', { n: r.component })}</div>
      <div class="row-sub">${relDay(r.submitted_at)}</div>
    </div>
    <b>${r.score} / ${r.total}</b></div>`;
}

Views.dashboard = async function (root) {
  const s = await api('GET', '/api/stats');
  const goalPct = Math.min(100, Math.round((100 * s.today_count) / s.goal));
  const qa = [
    ['#/bank', '▶️', t('dash.qa.practice')],
    ['#/papers', '📄', t('dash.qa.papers')],
    ['#/bank', '📚', t('dash.qa.bank')],
    ['#/mistakes', '✖️', t('dash.qa.mistakes')],
    ['#/marked', '⭐', t('dash.qa.marked')],
  ];
  root.innerHTML = `
    <h1 class="page-title">${t('dash.hello', { name: esc(App.user.name) })} 👋</h1>
    <p class="page-sub">${t('dash.ready')}</p>
    <div class="grid-4">
      ${statCard('🔥', s.streak, t('dash.streak'))}
      ${statCard('⏱️', fmtDuration(s.time_today_sec), t('dash.today'))}
      ${statCard('📊', s.solved, t('dash.solved'))}
      ${statCard('✅', s.accuracy + '%', t('dash.accuracy'))}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="section-title">${t('dash.goal')}</div>
        <p class="muted" style="font-size:13px">${t('dash.goalText')}</p>
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <div class="progress" style="flex:1"><i style="width:${goalPct}%"></i></div>
          <b>${s.today_count} / ${s.goal}</b>
        </div>
        ${continueCardHTML(s.continue)}
      </div>
      <div class="card">
        <div class="section-title">${t('dash.quick')}</div>
        ${qa.map(([h, ic, label]) =>
          `<a class="row-item" href="${h}"><span class="row-ic green">${ic}</span><span class="row-main row-title">${label}</span></a>`
        ).join('')}
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="section-title">${t('dash.recent')}</div>
        ${s.recent.length ? s.recent.map(recentRowHTML).join('') : `<div class="empty">${t('dash.none')}</div>`}
      </div>
      <div class="card">
        <div class="section-title">${t('dash.heatmap')}</div>
        ${heatmapHTML(s.heatmap)}
        <div class="hm-legend">${t('dash.less')}
          <span class="hm"></span><span class="hm" data-l="1"></span><span class="hm" data-l="2"></span><span class="hm" data-l="3"></span><span class="hm" data-l="4"></span>
        ${t('dash.more')}</div>
      </div>
    </div>`;
};
```

- [ ] **Step 2: Write `public/js/views/about.js`**

```js
Views.about = async function (root) {
  root.innerHTML = `
    <div class="card about-hero">
      <div class="logo">${LOGO_SVG}</div>
      <h1 class="page-title" style="margin-top:6px">NIS</h1>
      <p class="muted">${t('app.school')}</p>
      <p style="margin-top:14px;font-weight:700">${t('about.tagline')}</p>
      <p class="muted" style="max-width:560px;margin:10px auto 0;line-height:1.7">${t('about.blurb')}</p>
    </div>
    <div class="about-cards">
      <div class="card about-card"><div class="about-ic">🎓</div><b>${t('about.c1')}</b></div>
      <div class="card about-card"><div class="about-ic">💡</div><b>${t('about.c2')}</b></div>
      <div class="card about-card"><div class="about-ic">🌍</div><b>${t('about.c3')}</b></div>
    </div>
    <div class="card">
      <div class="section-title">${t('about.contact')}</div>
      <div class="contact-grid">
        <div class="row-item"><span class="row-ic green">🌐</span><div class="row-main"><div class="row-title">${t('about.website')}</div><div class="row-sub">www.nis.edu.kz</div></div></div>
        <div class="row-item"><span class="row-ic green">✉️</span><div class="row-main"><div class="row-title">${t('about.email')}</div><div class="row-sub">info@nis.edu.kz</div></div></div>
        <div class="row-item"><span class="row-ic green">📨</span><div class="row-main"><div class="row-title">${t('about.telegram')}</div><div class="row-sub">@NIS_Official_Bot</div></div></div>
      </div>
    </div>`;
};
```

- [ ] **Step 3: Add script tags to `public/index.html`** (before `js/app.js`)

```html
  <script src="js/views/dashboard.js"></script>
  <script src="js/views/about.js"></script>
```

- [ ] **Step 4: Manual verification in browser**

With the server running, log in and verify:
1. Dashboard shows 4 stat cards (all zeros for a fresh user), goal bar 0/20, quick actions, empty recent activity, all-gray heatmap.
2. About page matches mockup: hero with logo + tagline + blurb, 3 feature cards, contact block.
3. Both pages re-render correctly in ҚАЗ and РУС.

- [ ] **Step 5: Commit**

```bash
git add public/
git commit -m "feat: add dashboard and about views"
```

---

### Task 8: Past Papers selection + Exam mode + Results views

**Files:**
- Create: `public/js/views/papers.js`, `public/js/views/exam.js`, `public/js/views/results.js`
- Modify: `public/index.html` (script tags before `js/app.js`)

**Interfaces:**
- Consumes: `POST /api/exams`, `POST /api/exams/:id/submit`, `GET /api/exams/:id`, `PUT/DELETE /api/marked/:id` (Tasks 4–5), globals from Task 6.
- Produces: `Views.papers`, `Views.exam` (route `#/exam?subject=S&year=Y&component=C` — creates a NEW exam from params), `Views.results` (route `#/results?id=N`).

- [ ] **Step 1: Write `public/js/views/papers.js`**

```js
Views.papers = async function (root) {
  const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
  const YEARS = [2025, 2024, 2023, 2022, 2021];
  const sel = { subject: 'Mathematics', year: 2025, component: 2 };

  function draw() {
    const startHref = `#/exam?subject=${encodeURIComponent(sel.subject)}&year=${sel.year}&component=${sel.component}`;
    root.innerHTML = `
      <h1 class="page-title">${t('papers.title')}</h1>
      <p class="page-sub">${t('papers.subtitle')}</p>
      <div class="card">
        <div class="section-title"><span class="step-num">1</span>${t('papers.subject')}</div>
        <div class="choice-row">${SUBJECTS.map((s) =>
          `<button class="choice ${s === sel.subject ? 'selected' : ''}" data-k="subject" data-v="${s}">${t('subj.' + s)}</button>`).join('')}</div>
        <div class="section-title"><span class="step-num">2</span>${t('papers.year')}</div>
        <div class="choice-row">${YEARS.map((y) =>
          `<button class="choice ${y === sel.year ? 'selected' : ''}" data-k="year" data-v="${y}">${y}</button>`).join('')}</div>
        <div class="section-title"><span class="step-num">3</span>${t('papers.paper')}</div>
        <div class="choice-row">${[1, 2, 3].map((c) =>
          `<button class="choice ${c === sel.component ? 'selected' : ''}" data-k="component" data-v="${c}">${t('papers.component', { n: c })}</button>`).join('')}</div>
        <div style="text-align:center;margin-top:8px">
          <a class="btn btn-primary" href="${startHref}">${t('papers.start')}</a>
        </div>
      </div>
      <div class="note">${t('papers.note')}</div>`;
    root.querySelectorAll('.choice').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.k;
        sel[k] = k === 'subject' ? b.dataset.v : Number(b.dataset.v);
        draw();
      });
    });
  }
  draw();
};
```

- [ ] **Step 2: Write `public/js/views/exam.js`**

```js
Views.exam = async function (root, params) {
  const subject = params.subject || 'Mathematics';
  const year = Number(params.year) || 2025;
  const component = Number(params.component) || 2;
  const data = await api('POST', '/api/exams', { subject, year, component });
  const totalMs = data.exam.duration_min * 60000;
  const st = {
    exam: data.exam,
    qs: data.questions,
    marked: new Set(data.marked_ids),
    answers: {},
    idx: 0,
    started: Date.now(),
    deadline: Date.now() + totalMs,
  };

  root.innerHTML = `
    <div class="exam-header">
      <div class="row1">
        <div class="exam-title">${t('subj.' + subject)} · ${t('papers.component', { n: component })} · ${year}</div>
        <button class="btn btn-danger btn-sm" id="end-exam">${t('exam.end')}</button>
      </div>
      <div class="timer-box">
        <div class="ring-label">${t('exam.remaining')}</div>
        <div class="timer" id="timer">--:--:--</div>
        <div class="timebar"><i id="timebar" style="width:100%"></i></div>
        <div class="row-sub" id="timeleft"></div>
      </div>
    </div>
    <div class="card" id="q-card"></div>
    <div class="exam-nav">
      <button class="btn btn-outline" id="prev">${t('exam.prev')}</button>
      <span class="muted" id="q-count"></span>
      <span style="display:inline-flex;gap:10px">
        <button class="btn btn-primary" id="next">${t('exam.next')}</button>
        <button class="btn btn-blue" id="submit">${t('exam.submit')}</button>
      </span>
    </div>`;

  const timerEl = root.querySelector('#timer');
  const barEl = root.querySelector('#timebar');
  const leftEl = root.querySelector('#timeleft');
  let finished = false;

  function tick() {
    const ms = Math.max(0, st.deadline - Date.now());
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timerEl.textContent = `${hh}:${mm}:${ss}`;
    const pct = Math.round((100 * ms) / totalMs);
    barEl.style.width = pct + '%';
    leftEl.textContent = t('exam.timeLeft', { pct });
    if (ms <= 0 && !finished) submit(true);
  }
  const iv = setInterval(tick, 1000);
  App.cleanup = () => clearInterval(iv);
  tick();

  function saveCurrent() {
    const ta = root.querySelector('#answer');
    if (ta) st.answers[st.qs[st.idx].id] = ta.value;
  }

  function drawQ() {
    const qq = st.qs[st.idx];
    const isMarked = st.marked.has(qq.id);
    const qCard = root.querySelector('#q-card');
    qCard.innerHTML = `
      <div class="q-header">
        <div class="q-title">${t('exam.qTitle', { n: qq.number, m: qq.marks })}</div>
        <button class="star-btn ${isMarked ? 'on' : ''}" id="star">★ ${isMarked ? t('exam.saved') : t('exam.save')}</button>
      </div>
      <div class="q-text">${qq.text_latex}</div>
      ${qq.figure_svg || ''}
      <textarea class="answer" id="answer" placeholder="${t('exam.placeholder')}">${esc(st.answers[qq.id] || '')}</textarea>`;
    root.querySelector('#q-count').textContent = t('exam.qOf', { a: st.idx + 1, b: st.qs.length });
    root.querySelector('#prev').disabled = st.idx === 0;
    root.querySelector('#next').classList.toggle('hidden', st.idx === st.qs.length - 1);
    qCard.querySelector('#star').addEventListener('click', async () => {
      const on = st.marked.has(qq.id);
      try {
        await api(on ? 'DELETE' : 'PUT', `/api/marked/${qq.id}`);
        if (on) st.marked.delete(qq.id); else st.marked.add(qq.id);
        saveCurrent();
        drawQ();
      } catch { /* non-fatal */ }
    });
    renderMath(qCard);
  }

  async function submit(auto) {
    if (finished) return;
    if (!auto && !confirm(t('exam.confirmSubmit'))) return;
    finished = true;
    saveCurrent();
    clearInterval(iv);
    const answers = st.qs.map((qq) => ({ question_id: qq.id, answer_text: st.answers[qq.id] || '' }));
    const duration = Math.round((Date.now() - st.started) / 1000);
    try {
      const r = await api('POST', `/api/exams/${st.exam.id}/submit`, { answers, duration_sec: duration });
      location.hash = `#/results?id=${r.exam.id}`;
    } catch {
      finished = false;
      alert(t('common.error'));
    }
  }

  root.querySelector('#prev').addEventListener('click', () => {
    saveCurrent();
    if (st.idx > 0) { st.idx -= 1; drawQ(); }
  });
  root.querySelector('#next').addEventListener('click', () => {
    saveCurrent();
    if (st.idx < st.qs.length - 1) { st.idx += 1; drawQ(); }
  });
  root.querySelector('#submit').addEventListener('click', () => submit(false));
  root.querySelector('#end-exam').addEventListener('click', () => {
    if (confirm(t('exam.confirmEnd'))) location.hash = '#/papers';
  });
  drawQ();
};
```

- [ ] **Step 3: Write `public/js/views/results.js`**

```js
Views.results = async function (root, params) {
  const data = await api('GET', `/api/exams/${params.id}`);
  const { exam, results } = data;
  let tab = 'overview';

  function statusIcon(r) {
    if (r.awarded_mark >= r.marks) return '<span class="status-ic">✅</span>';
    if (r.awarded_mark > 0) return '<span class="status-ic">🟡</span>';
    return '<span class="status-ic">❌</span>';
  }

  function overviewHTML() {
    return `<table class="results">
      <tr><th>${t('results.q')}</th><th>${t('results.yourAnswer')}</th><th>${t('results.expected')}</th><th>${t('results.status')}</th></tr>
      ${results.map((r) => `<tr>
        <td><b>${r.number}</b> <span class="muted">(${t('common.marks', { m: r.marks })})</span></td>
        <td>${r.answer_text.trim()
          ? esc(r.answer_text.slice(0, 40)) + (r.answer_text.length > 40 ? '…' : '')
          : `<span class="muted">${t('results.noAnswer')}</span>`}</td>
        <td><b>${r.awarded_mark} / ${r.marks}</b></td>
        <td>${statusIcon(r)}</td>
      </tr>`).join('')}
    </table>
    <div style="text-align:center;margin-top:14px"><button class="btn btn-outline" id="review-all">${t('results.reviewAll')}</button></div>`;
  }

  function reviewHTML() {
    return results.map((r) => `
      <div class="row-item" style="display:block">
        <div class="q-header">
          <div class="q-title">${t('exam.qTitle', { n: r.number, m: r.marks })}</div>
          <b>${r.awarded_mark} / ${r.marks}</b>
        </div>
        <div class="q-text">${r.text_latex}</div>
        ${r.figure_svg || ''}
        <div class="row-sub" style="margin-bottom:8px">${t('results.yourAnswer')}:
          ${r.answer_text.trim() ? esc(r.answer_text) : t('results.noAnswer')}</div>
        <div class="fb-text">💡 ${r.ai_feedback}</div>
        <div class="scheme-box">📋 ${r.mark_scheme}</div>
      </div>`).join('');
  }

  function draw() {
    root.innerHTML = `
      <div class="score-banner">
        <div>${t('results.banner')}</div>
        <div class="big">${exam.score} / ${exam.total} 🏆</div>
        <div class="pct">${exam.pct}%</div>
      </div>
      <div class="card">
        <div class="tabs">
          <button class="tab ${tab === 'overview' ? 'active' : ''}" data-t="overview">${t('results.overview')}</button>
          <button class="tab ${tab === 'review' ? 'active' : ''}" data-t="review">${t('results.review')}</button>
        </div>
        <div id="tab-body">${tab === 'overview' ? overviewHTML() : reviewHTML()}</div>
      </div>`;
    root.querySelectorAll('.tab').forEach((b) => {
      b.addEventListener('click', () => { tab = b.dataset.t; draw(); });
    });
    const ra = root.querySelector('#review-all');
    if (ra) ra.addEventListener('click', () => { tab = 'review'; draw(); });
    renderMath(root);
  }
  draw();
};
```

- [ ] **Step 4: Add script tags to `public/index.html`** (before `js/app.js`)

```html
  <script src="js/views/papers.js"></script>
  <script src="js/views/exam.js"></script>
  <script src="js/views/results.js"></script>
```

- [ ] **Step 5: Manual verification in browser**

1. Past Papers: pick Mathematics → 2025 → Component 2 → Start Exam.
2. Exam: blue header, live countdown from 01:30:00, question 1 with rendered KaTeX; Q6 shows the SVG figure; Prev disabled on Q1; Next/Prev navigate and keep typed answers; ⭐ toggles gold; "Question N of 12" updates.
3. Type answers into several questions, leave others blank, Submit Exam → confirm dialog → Results.
4. Results: green banner with score (e.g. 20 / 60 if you answered Q1,Q4,Q6 etc.), Overview table with ✅/🟡/❌ per answer state, Questions Review tab shows feedback + mark scheme with KaTeX.
5. End Exam mid-way → returns to selection; Dashboard now shows a "Continue where you left off" card for that paper.

- [ ] **Step 6: Commit**

```bash
git add public/
git commit -m "feat: add past papers, exam mode and results views"
```

---

### Task 9: Question Bank + Objectives + Mistakes + Marked views

**Files:**
- Create: `public/js/views/bank.js`, `public/js/views/objectives.js`, `public/js/views/mistakes.js`, `public/js/views/marked.js`
- Modify: `public/index.html` (script tags before `js/app.js`)

**Interfaces:**
- Consumes: `GET /api/questions[?filters|/:id]`, `GET /api/topics`, `POST /api/attempts`, `GET /api/mistakes`, `GET/PUT/DELETE /api/marked`, `GET /api/objectives` (Tasks 4–5), globals from Task 6.
- Produces: `Views.bank` (routes: `#/bank`, `#/bank?qid=N` for retry/marked practice, `#/bank?mistakes=1` for practice-only-mistakes), `Views.objectives`, `Views.mistakes`, `Views.marked`.

- [ ] **Step 1: Write `public/js/views/bank.js`**

```js
Views.bank = async function (root, params) {
  const SUBJECTS = ['Mathematics', 'Chemistry', 'Physics', 'Biology'];
  const YEARS = ['2025', '2024', '2023', '2022', '2021'];
  const sel = { subject: 'Mathematics', year: '2025', component: '2', topic: '' };
  const fixedMode = Boolean(params.qid || params.mistakes); // no filter bar in retry/mistakes mode
  let list = [];
  let idx = 0;
  let topics = [];
  let started = Date.now();
  const marked = new Set((await api('GET', '/api/marked')).marked.map((m) => m.question_id));

  async function loadTopics() {
    topics = (await api('GET', `/api/topics?subject=${encodeURIComponent(sel.subject)}`)).topics;
  }

  async function loadByFilters() {
    const base = `subject=${encodeURIComponent(sel.subject)}`
      + (sel.topic ? `&topic=${encodeURIComponent(sel.topic)}` : '');
    let r = await api('GET', `/api/questions?${base}&year=${sel.year}&component=${sel.component}`);
    if (r.questions.length === 0) r = await api('GET', `/api/questions?${base}`); // subject-pool fallback
    return r.questions;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function filterSelHTML(key, label, opts) {
    return `<div class="filter"><label>${label}</label><select data-k="${key}">
      ${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(sel[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
    </select></div>`;
  }

  function filterBarHTML() {
    return `<div class="card"><div class="filter-row">
      ${filterSelHTML('subject', t('papers.subject'), SUBJECTS.map((s) => [s, t('subj.' + s)]))}
      ${filterSelHTML('year', t('papers.year'), YEARS.map((y) => [y, y]))}
      ${filterSelHTML('component', t('papers.paper'), ['1', '2', '3'].map((c) => [c, t('papers.component', { n: c })]))}
      ${filterSelHTML('topic', t('bank.topic'), [['', t('bank.all')]].concat(topics.map((x) => [x, x])))}
      <button class="btn btn-primary" id="f-start">${t('bank.start')}</button>
      <button class="btn btn-outline" id="f-random">${t('bank.random')}</button>
    </div></div>`;
  }

  function qCardHTML(qq) {
    const isM = marked.has(qq.id);
    return `<div class="card">
      <div class="q-header">
        <div class="q-title">${t('exam.qTitle', { n: qq.number, m: qq.marks })}</div>
        <button class="star-btn ${isM ? 'on' : ''}" id="p-star">★ ${isM ? t('bank.saved') : t('bank.save')}</button>
      </div>
      <div class="q-text">${qq.text_latex}</div>
      ${qq.figure_svg || ''}
      <div class="toolbar">
        <button data-ins="**">𝐁</button><button data-ins="_">𝘐</button><button data-ins="__">U̲</button>
        <button data-ins="Σ">Σ</button><button data-ins="∞">∞</button><button data-ins="∫">∫</button><button data-ins="√">√</button>
      </div>
      <textarea class="answer" id="p-answer" placeholder="${t('exam.placeholder')}"></textarea>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="p-submit">${t('bank.submit')}</button>
        <button class="btn btn-outline" id="p-scheme" disabled>${t('bank.scheme')}</button>
        <span style="flex:1"></span>
        <button class="btn btn-outline" id="p-next">${t('bank.next')} →</button>
      </div>
      <div id="p-scheme-box" class="scheme-box hidden"></div>
    </div>`;
  }

  function fbPanelHTML() {
    return `<div class="card">
      <div class="fb-title">${t('bank.ai')}</div>
      <div class="fb-text muted" id="fb-text">—</div>
      <div class="ring-wrap">
        <div class="ring-label">${t('bank.expected')}</div>
        <div id="fb-ring"></div>
      </div>
      <div class="conf hidden" id="fb-conf"></div>
      <div class="conf-bar"><i id="fb-conf-bar" style="width:0%"></i></div>
    </div>`;
  }

  function draw() {
    const qq = list[idx];
    root.innerHTML = `
      <h1 class="page-title">${t('bank.title')}</h1>
      <p class="page-sub"></p>
      ${fixedMode ? '' : filterBarHTML()}
      ${qq
        ? `<div class="practice-grid"><div id="q-col">${qCardHTML(qq)}</div>${fbPanelHTML()}</div>`
        : `<div class="card empty" style="margin-top:16px">${list.length === 0 && (params.mistakes || params.qid) ? t('mist.empty') : idx > 0 ? t('bank.done') : t('bank.empty')}</div>`}`;

    if (!fixedMode) {
      root.querySelectorAll('.filter select').forEach((s) => {
        s.addEventListener('change', async () => {
          sel[s.dataset.k] = s.value;
          if (s.dataset.k === 'subject') { sel.topic = ''; await loadTopics(); draw(); }
        });
      });
      root.querySelector('#f-start').addEventListener('click', async () => {
        list = await loadByFilters(); idx = 0; started = Date.now(); draw();
      });
      root.querySelector('#f-random').addEventListener('click', async () => {
        list = shuffle(await loadByFilters()); idx = 0; started = Date.now(); draw();
      });
    }
    if (!qq) return;

    const ta = root.querySelector('#p-answer');
    root.querySelectorAll('.toolbar button').forEach((b) => {
      b.addEventListener('click', () => {
        const ins = b.dataset.ins;
        const s = ta.selectionStart || 0;
        ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd || s);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + ins.length;
      });
    });

    root.querySelector('#p-star').addEventListener('click', async () => {
      const on = marked.has(qq.id);
      try {
        await api(on ? 'DELETE' : 'PUT', `/api/marked/${qq.id}`);
        if (on) marked.delete(qq.id); else marked.add(qq.id);
        const btn = root.querySelector('#p-star');
        btn.classList.toggle('on', !on);
        btn.innerHTML = `★ ${!on ? t('bank.saved') : t('bank.save')}`;
      } catch { /* non-fatal */ }
    });

    let scheme = null;
    root.querySelector('#p-submit').addEventListener('click', async () => {
      const r = await api('POST', '/api/attempts', {
        question_id: qq.id,
        answer_text: ta.value,
        mode: 'practice',
        duration_sec: Math.round((Date.now() - started) / 1000),
      });
      const fbText = root.querySelector('#fb-text');
      fbText.classList.remove('muted');
      fbText.innerHTML = r.ai_feedback;
      root.querySelector('#fb-ring').innerHTML = ringSVG(r.awarded_mark, r.marks, 96);
      const conf = root.querySelector('#fb-conf');
      conf.classList.remove('hidden');
      conf.textContent = t('bank.confidence', { level: t('bank.conf.' + r.confidence) });
      root.querySelector('#fb-conf-bar').style.width =
        { high: '90%', medium: '60%', low: '30%' }[r.confidence];
      scheme = r.mark_scheme;
      root.querySelector('#p-scheme').disabled = false;
      renderMath(root);
    });

    root.querySelector('#p-scheme').addEventListener('click', () => {
      const box = root.querySelector('#p-scheme-box');
      if (box.classList.contains('hidden') && scheme !== null) {
        box.innerHTML = `<b>${t('bank.schemeTitle')}</b><br>${scheme}`;
        box.classList.remove('hidden');
        renderMath(box);
      } else {
        box.classList.add('hidden');
      }
    });

    root.querySelector('#p-next').addEventListener('click', () => {
      idx += 1;
      started = Date.now();
      draw();
    });

    renderMath(root);
  }

  // --- entry modes ---
  if (params.qid) {
    list = [(await api('GET', `/api/questions/${params.qid}`)).question];
  } else if (params.mistakes) {
    const ms = (await api('GET', '/api/mistakes')).mistakes;
    list = [];
    for (const m of ms) {
      list.push((await api('GET', `/api/questions/${m.question_id}`)).question);
    }
  } else {
    await loadTopics();
  }
  draw();
};
```

- [ ] **Step 2: Write `public/js/views/objectives.js`**

```js
Views.objectives = async function (root) {
  const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
  const OBJ_ICONS = ['🧬', '⚗️', '🔬', '🧲', '⚛️', '📐', '📊', '🧪', '📘'];
  let subject = 'Chemistry';

  async function draw() {
    const r = await api('GET', `/api/objectives?subject=${encodeURIComponent(subject)}`);
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${t('obj.title')}</h1>
        <div class="filter"><select id="obj-subj">${SUBJECTS.map((s) =>
          `<option ${s === subject ? 'selected' : ''} value="${s}">${t('subj.' + s)}</option>`).join('')}</select></div>
      </div>
      <div class="card">
        ${r.objectives.map((o, i) => `<div class="row-item">
          <span class="row-ic green">${OBJ_ICONS[i % OBJ_ICONS.length]}</span>
          <div class="row-main">
            <div class="row-title">${esc(o.topic)}</div>
            <div class="row-sub">${t('obj.attempted', { n: o.attempts })}</div>
          </div>
          <div class="obj-bar">
            <div class="progress" style="flex:1"><i style="width:${o.pct}%"></i></div>
            <span class="obj-pct">${o.pct}%</span>
          </div>
        </div>`).join('')}
      </div>`;
    root.querySelector('#obj-subj').addEventListener('change', (e) => {
      subject = e.target.value;
      draw();
    });
  }
  await draw();
};
```

- [ ] **Step 3: Write `public/js/views/mistakes.js`**

```js
Views.mistakes = async function (root) {
  const all = (await api('GET', '/api/mistakes')).mistakes;
  let subject = '';

  function draw() {
    const rows = subject ? all.filter((m) => m.subject === subject) : all;
    const subjects = [...new Set(all.map((m) => m.subject))];
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${t('mist.title')}</h1>
        <div style="display:flex;gap:12px;align-items:center">
          <span class="muted">${t('mist.total')} <b>${all.length}</b></span>
          <div class="filter"><select id="m-subj">
            <option value="">${t('mist.allSubjects')}</option>
            ${subjects.map((s) => `<option ${s === subject ? 'selected' : ''} value="${s}">${t('subj.' + s)}</option>`).join('')}
          </select></div>
        </div>
      </div>
      <div class="card">
        ${rows.length ? rows.map((m) => `<div class="row-item">
          <span class="row-ic red">✕</span>
          <div class="row-main">
            <div class="row-title">${t('q.number', { n: m.number })}
              <span class="badge red" style="margin-left:8px">${t('mist.wrong')}</span></div>
            <div class="row-sub">${t('subj.' + m.subject)} · ${m.year} · ${t('papers.component', { n: m.component })} · ${m.awarded_mark}/${m.marks}</div>
          </div>
          <a class="btn btn-outline btn-sm" href="#/bank?qid=${m.question_id}">${t('mist.retry')}</a>
        </div>`).join('') : `<div class="empty">${t('mist.empty')}</div>`}
      </div>
      ${all.length ? `<div style="text-align:center;margin-top:16px">
        <a class="btn btn-primary" href="#/bank?mistakes=1">${t('mist.practice')}</a></div>` : ''}`;
    root.querySelector('#m-subj').addEventListener('change', (e) => {
      subject = e.target.value;
      draw();
    });
  }
  draw();
};
```

- [ ] **Step 4: Write `public/js/views/marked.js`**

```js
Views.marked = async function (root) {
  let all = (await api('GET', '/api/marked')).marked;

  function draw() {
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h1 class="page-title" style="margin:0">${t('marked.title')}</h1>
        <span class="muted">${t('marked.total')} <b>${all.length}</b></span>
      </div>
      <div class="card">
        ${all.length ? all.map((m) => `<div class="row-item">
          <span class="row-ic gold">★</span>
          <div class="row-main">
            <div class="row-title">${t('q.number', { n: m.number })}</div>
            <div class="row-sub">${t('subj.' + m.subject)} · ${m.year} · ${t('papers.component', { n: m.component })} · ${t('common.marks', { m: m.marks })}</div>
          </div>
          <a class="btn btn-outline btn-sm" href="#/bank?qid=${m.question_id}">${t('marked.open')}</a>
          <button class="btn btn-outline btn-sm" data-rm="${m.question_id}">${t('marked.remove')}</button>
        </div>`).join('') : `<div class="empty">${t('marked.empty')}</div>`}
      </div>`;
    root.querySelectorAll('[data-rm]').forEach((b) => {
      b.addEventListener('click', async () => {
        await api('DELETE', `/api/marked/${b.dataset.rm}`);
        all = all.filter((m) => String(m.question_id) !== b.dataset.rm);
        draw();
      });
    });
  }
  draw();
};
```

- [ ] **Step 5: Add script tags to `public/index.html`** (before `js/app.js`)

```html
  <script src="js/views/bank.js"></script>
  <script src="js/views/objectives.js"></script>
  <script src="js/views/mistakes.js"></script>
  <script src="js/views/marked.js"></script>
```

- [ ] **Step 6: Manual verification in browser**

1. Question Bank: default filters (Mathematics/2025/Component 2/All) → Start → Question 1 with KaTeX; toolbar buttons insert symbols; Submit with text → AI Feedback panel fills (feedback text, ring e.g. 3/3, confidence bar), Show Mark Scheme toggles the yellow box; Next Question advances; end of set shows the 🎉 done card.
2. Filters: Chemistry + 2025 + Component 2 → falls back to the Chemistry pool (5 questions). Topic filter narrows correctly. Random shuffles.
3. Submit an answer to Math Q2 (2/4 expected) → Mistake Notebook lists it with red badge and Retry; Retry opens exactly that question; Practice Only Mistakes walks the mistake list.
4. Star a question in practice → appears in Marked Questions; Practice opens it; Remove deletes it live.
5. Learning Objectives: Chemistry topics listed with bars; the attempted Math topics show non-zero % under Mathematics; sidebar "Progress" also lands here.
6. Dashboard stats now non-zero (solved, accuracy, heatmap cell for today, streak 1).

- [ ] **Step 7: Commit**

```bash
git add public/
git commit -m "feat: add question bank, objectives, mistakes and marked views"
```

---

### Task 10: End-to-end verification + README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: verified, documented app.

- [ ] **Step 1: Run the full backend test suite**

Run: `npm test`
Expected: ALL tests pass (health, db, auth, content, exams-stats).

- [ ] **Step 2: Write `README.md`**

```markdown
# NIS Practice Platform

A demo practice platform for NIS students: past-paper exam mode, question-bank
practice with AI-style feedback, mistake notebook, marked questions, learning
objectives and real per-account progress tracking. UI in English, Kazakh and
Russian.

## Run

    npm install
    npm start

Open http://localhost:3000 and register an account (any email works — it is
a local demo database).

## Notes

- Data lives in `data.sqlite` (created automatically). Delete the file to reset.
- Question content is sample data; "AI" feedback is pre-written per question —
  any non-empty answer receives the question's expected mark.
- Tests: `npm test`
```

- [ ] **Step 3: Full click-through against the mockups**

With a fresh browser session on http://localhost:3000:
1. Register → dashboard (zeros) → run one full Mathematics 2025 C2 exam answering everything → results 48/60 80% matching the mockup banner.
2. Dashboard now: solved 12, accuracy 80%, streak 1, heatmap dot, recent activity row.
3. Practice 2–3 questions in the bank (feedback panel, mark scheme, ring).
4. Verify Mistake Notebook (partial-credit questions appear; Retry works), Marked Questions (star/unstar), Learning Objectives percentages, About page.
5. Switch to ҚАЗ and РУС on: login, dashboard, exam, results, bank, mistakes — no raw i18n keys anywhere.
6. Take screenshots of dashboard, exam, results, bank for comparison with the user's mockups.

- [ ] **Step 4: Verify a server restart keeps data**

Stop and restart the server; log in again — stats, mistakes and marked questions persist (sessions may reset; data must not).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with run instructions"
```

---

## Plan complete

Execution: subagent-driven (superpowers:subagent-driven-development) or inline (superpowers:executing-plans), task-by-task with review between tasks.




