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
