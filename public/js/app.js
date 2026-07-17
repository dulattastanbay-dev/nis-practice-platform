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

function themeToggleHTML() {
  return `<button class="theme-btn" id="btn-theme" aria-label="${t('nav.theme')}">${icon(App.theme === 'dark' ? 'sun' : 'moon')}</button>`;
}

function bindThemeToggle(scope) {
  const btn = scope.querySelector('#btn-theme');
  if (!btn) return;
  btn.addEventListener('click', () => {
    applyTheme(App.theme === 'dark' ? 'light' : 'dark');
    btn.innerHTML = icon(App.theme === 'dark' ? 'sun' : 'moon');
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

// The official lockup already contains the "NIS" wordmark and school name, so no
// separate text is rendered. Both variants ship; CSS shows the right one per theme.
function logoHTML(extraClass) {
  const alt = 'NIS — Nazarbayev Intellectual Schools';
  return `<div class="logo ${extraClass || ''}">
    <img class="logo-img light-only" src="img/logo-light.jpg" alt="${alt}">
    <img class="logo-img dark-only" src="img/logo-dark.jpg" alt="${alt}">
  </div>`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function avatarHTML(name) {
  return `<div class="avatar">${esc(initials(name))}</div>`;
}

function renderShell(active) {
  const el = document.getElementById('app');
  const MENU_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  el.innerHTML = `
  <div class="app-layout">
    <aside class="sidebar" id="sidebar">
      ${logoHTML('logo-side')}
      <div class="side-profile">
        ${avatarHTML(App.user.name)}
        <div style="min-width:0">
          <div class="sp-name">${esc(App.user.name)}</div>
          <div class="sp-mail">${esc(App.user.email)}</div>
        </div>
      </div>
      ${NAV_ITEMS.map(([key, href, label]) =>
        `<a class="nav-item ${active === key || (key === 'objectives' && active === 'progress') ? 'active' : ''}" href="${href}">${NAV_ICONS[key]}${t(label)}</a>`
      ).join('')}
      <button class="nav-item logout" id="btn-logout">${NAV_ICONS.logout}${t('nav.logout')}</button>
    </aside>
    <div class="backdrop" id="sb-backdrop"></div>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn" id="btn-menu" aria-label="${t('nav.menu')}">${MENU_SVG}</button>
        <div class="topbar-right">
          ${themeToggleHTML()}
          ${langSwitchHTML()}
          <div class="user-chip">${avatarHTML(App.user.name)}<span class="uc-name">${esc(App.user.name)}</span></div>
        </div>
      </header>
      <main id="view"></main>
    </div>
  </div>`;
  bindLangSwitch(el);
  bindThemeToggle(el);
  el.querySelector('#btn-logout').addEventListener('click', logout);

  const sidebar = el.querySelector('#sidebar');
  const backdrop = el.querySelector('#sb-backdrop');
  const closeNav = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };
  const openNav = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); };
  el.querySelector('#btn-menu').addEventListener('click', openNav);
  backdrop.addEventListener('click', closeNav);
  // Tapping any nav link closes the mobile drawer.
  sidebar.querySelectorAll('a.nav-item').forEach((a) => a.addEventListener('click', closeNav));
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
    <div class="aurora a1"></div><div class="aurora a2"></div><div class="aurora a3"></div>
    <div class="card auth-card">
      <div style="display:flex;justify-content:flex-end">${themeToggleHTML()}</div>
      ${logoHTML('logo-auth')}
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
  bindThemeToggle(el);

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
  target.innerHTML = skeletonHTML();
  try {
    await view(target, q);
    renderMath(target);
    animateCounters(target);
  } catch (err) {
    console.error(err);
    if (!App.user) { renderAuth(); return; }
    target.innerHTML = `<div class="card error-box">${t('common.error')}</div>`;
  }
}

async function boot() {
  applyTheme(App.theme);
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
