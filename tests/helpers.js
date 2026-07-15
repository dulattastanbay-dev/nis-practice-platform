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
