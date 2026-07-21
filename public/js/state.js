// Global client state + shared render helpers.
const App = {
  user: null,
  lang: localStorage.getItem('nis_lang') || 'en',
  theme: localStorage.getItem('nis_theme')
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  cleanup: null, // views with timers set this; router calls it on navigation
};

const Views = {};

// ---- Theme ----
function applyTheme(theme) {
  App.theme = theme;
  localStorage.setItem('nis_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

// ---- Confirm dialog (replaces window.confirm so it matches the UI) ----
// Resolves true/false. Esc or the backdrop cancels; Enter confirms.
function confirmDialog(message, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal card" role="alertdialog" aria-modal="true" aria-label="${esc(message)}">
        <p class="modal-msg">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-outline" data-a="cancel">${esc(o.cancelLabel || t('common.cancel'))}</button>
          <button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-a="ok">${esc(o.confirmLabel || t('common.confirm'))}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const prev = document.activeElement;
    const done = (v) => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      if (prev && prev.focus) prev.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };
    wrap.querySelector('[data-a="cancel"]').addEventListener('click', () => done(false));
    wrap.querySelector('[data-a="ok"]').addEventListener('click', () => done(true));
    wrap.querySelector('.modal-backdrop').addEventListener('click', () => done(false));
    document.addEventListener('keydown', onKey);
    wrap.querySelector('[data-a="ok"]').focus();
  });
}

// ---- Toast (replaces window.alert); auto-dismisses, announced politely ----
function toast(message, type) {
  const kind = type || 'info';
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  const ic = kind === 'success' ? 'checkCircle' : kind === 'error' ? 'xCircle' : 'sparkles';
  el.innerHTML = `${icon(ic)}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ---- Skeleton loading placeholder ----
function skeletonHTML() {
  return `<div class="skeleton-wrap">
    <div class="sk sk-title"></div>
    <div class="sk-grid">
      <div class="sk sk-card"></div><div class="sk sk-card"></div>
      <div class="sk sk-card"></div><div class="sk sk-card"></div>
    </div>
    <div class="sk sk-wide"></div>
  </div>`;
}

// ---- Confetti burst (celebration). Respects reduced motion. ----
function burstConfetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#4caf50', '#e6a817', '#4a90d9', '#7c6cf0', '#2e7d32', '#ff9a3c'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  document.body.appendChild(layer);
  for (let i = 0; i < 70; i += 1) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (2.4 + Math.random() * 1.8) + 's';
    c.style.animationDelay = (Math.random() * 0.5) + 's';
    c.style.transform = `translateY(-20px) rotate(${Math.random() * 360}deg)`;
    if (i % 3 === 0) c.style.borderRadius = '50%';
    layer.appendChild(c);
  }
  setTimeout(() => layer.remove(), 5200);
}

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

// A cropped figure shows only its slice of the page. The window's height is a
// fraction of the image's RENDERED height, so it has to be set once the image
// has laid out (and again if the column resizes).
function sizeCropWindows(root) {
  root.querySelectorAll('.q-crop').forEach((fig) => {
    const win = fig.querySelector('.q-crop-window');
    const img = fig.querySelector('img');
    if (!win || !img) return;
    const frac = parseFloat(fig.style.getPropertyValue('--crop-h')) / 100;
    if (!isFinite(frac) || frac <= 0) return;
    const apply = () => {
      if (!img.clientHeight) return;
      // Replace the A4 estimate with the real ratio once the image has laid out.
      win.style.aspectRatio = 'auto';
      win.style.height = `${Math.round(frac * img.clientHeight)}px`;
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
    if (window.ResizeObserver && !fig._ro) {
      fig._ro = new ResizeObserver(apply);
      fig._ro.observe(img);
    }
  });
}

// Count-up animation for elements carrying data-count (and optional data-suffix).
// Respects prefers-reduced-motion. Called by the router after each view renders.
function animateCounters(root) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    if (!isFinite(target)) return;
    const suffix = el.dataset.suffix || '';
    const setFinal = () => { el.textContent = target + suffix; };
    if (reduce || target === 0) { setFinal(); return; }
    const dur = 900;
    const start = performance.now();
    let done = false;
    function step(now) {
      if (done) return;
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else { done = true; setFinal(); }
    }
    requestAnimationFrame(step);
    // Safety net: guarantee the final value even if rAF is throttled/paused.
    setTimeout(() => { if (!done) { done = true; setFinal(); } }, dur + 150);
  });
}

// Figures now live in an images table (a question may carry several); older
// single-figure rows still render via figure_svg.
// Whether page scans start expanded. Remembered so a student who prefers the
// scan always open does not have to re-open it on every question.
function scansOpen() {
  return localStorage.getItem('nis_show_scan') === '1';
}

function figuresHTML(q) {
  const imgs = q.images || [];
  if (!imgs.length) return q.figure_svg || '';

  // An inline SVG IS the question's diagram, so it is always shown. A scan is a
  // photo of the whole exam page — useful for checking a garbled formula, but it
  // also reveals neighbouring questions, so it is collapsed behind a toggle.
  const inline = imgs.filter((im) => !im.src && im.svg);
  const scans = imgs.filter((im) => im.src);

  let out = inline.map((im) => `<figure class="q-fig">${im.svg}
    ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');

  // A figure needed by the task is shown with the question. It is cropped to the
  // task's slice of the page (crop_top/crop_bottom are fractions of the page
  // height) using CSS, so the original file is never re-encoded.
  out += scans.map((im) => {
    const top = Number(im.crop_top);
    const bottom = Number(im.crop_bottom);
    const cropped = isFinite(top) && isFinite(bottom) && bottom > top && (bottom - top) < 0.995;
    const img = `<img class="q-scan" src="${esc(im.src)}" alt="${esc(im.caption || 'Figure')}" loading="lazy">`;
    if (!cropped) return `<figure class="q-fig">${img}</figure>`;
    const h = bottom - top;
    // The window reveals `h` of the image, shifted up by `top`.
    // It must have a height BEFORE the image loads, otherwise a zero-height
    // window makes the browser treat the image as off-screen and it never
    // loads. These scans are A4 pages (height ≈ 1.414 × width), which gives a
    // good initial box; sizeCropWindows() corrects it from the real dimensions.
    const ar = (1.414 * h).toFixed(4);
    return `<figure class="q-fig q-crop" style="--crop-h:${(h * 100).toFixed(3)}%">
      <div class="q-crop-window" style="aspect-ratio:1 / ${ar}"><img class="q-scan" src="${esc(im.src)}"
        alt="${esc(im.caption || 'Figure')}"
        style="transform:translateY(-${(top * 100).toFixed(3)}%)"></div>
    </figure>`;
  }).join('');
  return out;
}

// One answer box per part for questions split into (a)(b)(c); otherwise a single box.
// `answers` is keyed "p<partId>" for parts and by question id for whole questions.
function answerBoxesHTML(q, answers) {
  const parts = q.parts || [];
  if (!parts.length) {
    return `<textarea class="answer" id="answer" data-key="${q.id}"
      placeholder="${t('exam.placeholder')}">${esc(answers[q.id] || '')}</textarea>`;
  }
  return parts.map((p) => `
    <div class="part">
      <div class="part-head">
        <span class="part-letter">(${esc(p.letter)})</span>
        <span class="part-marks">${marksLabel(p.marks)}</span>
      </div>
      <div class="q-text">${p.text_latex}</div>
      <textarea class="answer" data-key="p${p.id}"
        placeholder="${t('exam.placeholder')}">${esc(answers['p' + p.id] || '')}</textarea>
    </div>`).join('');
}

function ringSVG(value, max, size) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const frac = max ? Math.min(1, value / max) : 0;
  const cx = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring-svg">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" class="ring-track" stroke-width="8"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#4caf50" stroke-width="8"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"
      transform="rotate(-90 ${cx} ${cx})"/>
    <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
      font-size="${size / 4.6}" font-weight="800" fill="currentColor">${value}/${max}</text>
  </svg>`;
}
