const { test } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

async function login(api) {
  await api('POST', '/api/register', { email: 'a@b.co', password: 'secret123', name: 'Aya' });
}

// Answer every question, sending one entry per part where a question has parts.
function answerAll(questions, text = 'my answer') {
  const out = [];
  for (const q of questions) {
    if (q.parts && q.parts.length) {
      for (const p of q.parts) out.push({ question_id: q.id, part_id: p.id, answer_text: text });
    } else {
      out.push({ question_id: q.id, answer_text: text });
    }
  }
  return out;
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
    const answers = answerAll(ex.data.questions);
    const sub = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers, duration_sec: 3600 });
    assert.strictEqual(sub.status, 200);
    assert.strictEqual(sub.data.exam.score, 48);
    assert.strictEqual(sub.data.exam.pct, 80);
    assert.strictEqual(sub.data.results.length, 12);
    assert.strictEqual(sub.data.results[0].number, 1);
    assert.ok(sub.data.results[0].ai_feedback.length > 0);
    // Q12 is split into (a)(b)(c); results merge its parts into one question row.
    const q12 = sub.data.results.find((r) => r.number === 12);
    assert.strictEqual(q12.parts.length, 3);
    assert.deepStrictEqual(q12.parts.map((p) => p.letter), ['a', 'b', 'c']);
    assert.strictEqual(q12.awarded_mark, 8);
    assert.strictEqual(q12.marks, 10);
    const again = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers, duration_sec: 1 });
    assert.strictEqual(again.status, 409);
    const get = await api('GET', `/api/exams/${ex.data.exam.id}`);
    assert.strictEqual(get.data.exam.score, 48);
  } finally { server.close(); }
});

test('submit grades over the exam question set: duplicate/foreign ids cannot inflate score', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const ex = await api('POST', '/api/exams', { subject: 'Mathematics', year: 2025, component: 2 });
    const qs = ex.data.questions;
    // Repeat every question 3x and append a foreign id from another subject.
    const foreign = (await api('GET', '/api/questions?subject=Physics')).data.questions[0];
    const answers = [];
    for (let i = 0; i < 3; i += 1) answers.push(...answerAll(qs, 'dup'));
    answers.push({ question_id: foreign.id, answer_text: 'foreign' });
    const sub = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, { answers, duration_sec: 600 });
    assert.strictEqual(sub.status, 200);
    assert.strictEqual(sub.data.exam.score, 48); // not inflated past the true total
    assert.ok(sub.data.exam.pct <= 100);
    assert.strictEqual(sub.data.results.length, 12); // one row per exam question, no dupes
  } finally { server.close(); }
});

test('exam draft autosaves and resumes exactly where it stopped', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    // no exam yet
    assert.strictEqual((await api('GET', '/api/exams/current')).status, 404);

    const ex = await api('POST', '/api/exams', { subject: 'Mathematics', year: 2025, component: 2 });
    const qs = ex.data.questions;
    const answers = { [qs[0].id]: 'partial work', [qs[2].id]: 'more work' };
    const save = await api('POST', `/api/exams/${ex.data.exam.id}/draft`, {
      answers, idx: 2, remaining_sec: 4200,
    });
    assert.strictEqual(save.status, 200);

    // simulate closing the browser and coming back
    const cur = await api('GET', '/api/exams/current');
    assert.strictEqual(cur.status, 200);
    assert.strictEqual(cur.data.exam.id, ex.data.exam.id);
    assert.strictEqual(cur.data.exam.draft_idx, 2);
    assert.strictEqual(cur.data.exam.draft_remaining_sec, 4200);
    assert.strictEqual(cur.data.questions.length, 12);
    assert.deepStrictEqual(cur.data.answers, answers);

    // the resumed draft still submits normally, and disappears from "current"
    const sub = await api('POST', `/api/exams/${ex.data.exam.id}/submit`, {
      answers: answerAll(qs, 'resumed answer'),
      duration_sec: 600,
    });
    assert.strictEqual(sub.status, 200);
    assert.strictEqual((await api('GET', '/api/exams/current')).status, 404);
    // drafting a submitted exam is rejected
    assert.strictEqual((await api('POST', `/api/exams/${ex.data.exam.id}/draft`, { answers: {}, idx: 0 })).status, 409);
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
    const answers = answerAll(ex.data.questions, 'ans');
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

test('objectives report progress per learning objective (many-to-many)', async () => {
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
    // Objectives are LO codes with descriptions, sorted by code.
    assert.ok(obj.length >= 10);
    assert.ok(obj.every((o) => o.code && o.description));

    // 11.1.1 covers Integration (q1 3/3, q4 5/5) -> 100% over 2 attempts
    const integ = obj.find((o) => o.code === '11.1.1');
    assert.strictEqual(integ.pct, 100);
    assert.strictEqual(integ.attempts, 2);
    // 11.4.1 covers Sequences and Series (q5 1/3) -> 33%
    assert.strictEqual(obj.find((o) => o.code === '11.4.1').pct, 33);
    // Unattempted objective reports zero, not missing
    const vec = obj.find((o) => o.code === '11.5.1');
    assert.strictEqual(vec.pct, 0);
    assert.strictEqual(vec.attempts, 0);
  } finally { server.close(); }
});

test('a question maps to several learning objectives', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics&year=2025&component=2')).data.questions;
    // Q2 is Differentiation, covered by BOTH 11.2.1 and 11.2.2
    const q2 = qs.find((q) => q.number === 2);
    await api('POST', '/api/attempts', { question_id: q2.id, answer_text: 'ans', mode: 'practice' });
    const obj = (await api('GET', '/api/objectives?subject=Mathematics')).data.objectives;
    assert.strictEqual(obj.find((o) => o.code === '11.2.1').attempts, 1);
    assert.strictEqual(obj.find((o) => o.code === '11.2.2').attempts, 1);
  } finally { server.close(); }
});

test('stats report the longest streak alongside the current one', async () => {
  const { server, api } = await startServer();
  try {
    await login(api);
    let stats = (await api('GET', '/api/stats')).data;
    assert.strictEqual(stats.longest_streak, 0);
    const qs = (await api('GET', '/api/questions?subject=Physics')).data.questions;
    await api('POST', '/api/attempts', { question_id: qs[0].id, answer_text: 'ans', mode: 'practice' });
    stats = (await api('GET', '/api/stats')).data;
    assert.strictEqual(stats.streak, 1);
    assert.strictEqual(stats.longest_streak, 1);
  } finally { server.close(); }
});
