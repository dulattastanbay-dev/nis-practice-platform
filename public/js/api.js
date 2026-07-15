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
