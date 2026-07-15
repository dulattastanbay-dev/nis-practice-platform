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
