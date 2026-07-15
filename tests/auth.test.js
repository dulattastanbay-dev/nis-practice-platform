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
