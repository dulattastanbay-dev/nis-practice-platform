const { test } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

// The first registered account owns the instance (admin); later ones are students.
async function admin(api) {
  await api('POST', '/api/register', { email: 'admin@nis.kz', password: 'secret123', name: 'Admin' });
}
async function student(api) {
  await api('POST', '/api/register', { email: 'admin@nis.kz', password: 'secret123', name: 'Admin' });
  await api('POST', '/api/logout');
  await api('POST', '/api/register', { email: 'kid@nis.kz', password: 'secret123', name: 'Kid' });
}

test('review endpoints are admin-only', async () => {
  const { server, api } = await startServer();
  try {
    // logged out
    assert.strictEqual((await api('GET', '/api/review/queue')).status, 401);
    // ordinary student
    await student(api);
    const q = await api('GET', '/api/review/queue');
    assert.strictEqual(q.status, 403, 'students must not read the review queue');
    assert.strictEqual((await api('PATCH', '/api/review/1', { text_latex: 'hack' })).status, 403);
  } finally { server.close(); }
});

test('first account is admin and can read the queue', async () => {
  const { server, api } = await startServer();
  try {
    await admin(api);
    const me = await api('GET', '/api/me');
    assert.strictEqual(me.data.user.is_admin, 1);
    const r = await api('GET', '/api/review/queue');
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.data.questions));
    assert.strictEqual(typeof r.data.pending, 'number');
    assert.strictEqual(typeof r.data.total, 'number');
  } finally { server.close(); }
});

test('an edit saves the text and clears the review flag', async () => {
  const { server, api } = await startServer();
  try {
    await admin(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics')).data.questions;
    const id = qs[0].id;
    // seeded questions are not flagged; mark it for review then fix it
    await api('PATCH', `/api/review/${id}`, { needs_review: true });
    const before = await api('GET', `/api/review/${id}`);
    assert.strictEqual(before.data.question.needs_review, 1);
    assert.ok(before.data.question.mark_scheme, 'editor sees the mark scheme');

    const saved = await api('PATCH', `/api/review/${id}`, {
      text_latex: 'Corrected wording x^4 - 4x^2',
      mark_scheme: 'M1 A1 corrected',
      needs_review: false,
    });
    assert.strictEqual(saved.status, 200);
    assert.strictEqual(saved.data.question.text_latex, 'Corrected wording x^4 - 4x^2');
    assert.strictEqual(saved.data.question.needs_review, 0);
    // and it is really persisted
    const again = await api('GET', `/api/review/${id}`);
    assert.strictEqual(again.data.question.mark_scheme, 'M1 A1 corrected');
  } finally { server.close(); }
});

test('edits cannot break the marks invariants', async () => {
  const { server, api } = await startServer();
  try {
    await admin(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics')).data.questions;
    const plain = qs.find((q) => !q.parts.length);
    assert.strictEqual((await api('PATCH', `/api/review/${plain.id}`, { marks: 0 })).status, 400);
    assert.strictEqual((await api('PATCH', `/api/review/${plain.id}`, { marks: -3 })).status, 400);
    // expected mark may not exceed the marks available
    assert.strictEqual(
      (await api('PATCH', `/api/review/${plain.id}`, { marks: 3, expected_mark: 9 })).status, 400
    );
    // a bare question still needs wording
    assert.strictEqual((await api('PATCH', `/api/review/${plain.id}`, { text_latex: '   ' })).status, 400);

    // parts must still sum to the question total
    const withParts = qs.find((q) => q.parts.length >= 2);
    if (withParts) {
      const bad = withParts.parts.map((p, i) => ({ id: p.id, marks: i === 0 ? p.marks + 5 : p.marks }));
      const res = await api('PATCH', `/api/review/${withParts.id}`, { parts: bad });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error, 'part_marks_mismatch');
    }
  } finally { server.close(); }
});

test('part text can be corrected while marks stay balanced', async () => {
  const { server, api } = await startServer();
  try {
    await admin(api);
    const qs = (await api('GET', '/api/questions?subject=Mathematics')).data.questions;
    const withParts = qs.find((q) => q.parts.length >= 2);
    if (!withParts) return; // nothing to check in this dataset
    const parts = withParts.parts.map((p) => ({ id: p.id, text_latex: `fixed ${p.letter}` }));
    const res = await api('PATCH', `/api/review/${withParts.id}`, { parts, needs_review: false });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.data.question.parts.map((p) => p.text_latex),
      withParts.parts.map((p) => `fixed ${p.letter}`)
    );
    const sum = res.data.question.parts.reduce((s, p) => s + p.marks, 0);
    assert.strictEqual(sum, res.data.question.marks);
  } finally { server.close(); }
});
