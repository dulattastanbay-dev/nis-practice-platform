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
function figuresHTML(q) {
  const imgs = q.images || [];
  if (imgs.length) {
    return imgs.map((im) => `<figure class="q-fig">${im.svg}
      ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
  }
  return q.figure_svg || '';
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
        <span class="part-marks">${t('common.marks', { m: p.marks })}</span>
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
