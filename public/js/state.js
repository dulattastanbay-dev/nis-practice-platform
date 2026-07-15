// Global client state + shared render helpers.
const App = {
  user: null,
  lang: localStorage.getItem('nis_lang') || 'en',
  cleanup: null, // views with timers set this; router calls it on navigation
};

const Views = {};

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

function ringSVG(value, max, size) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const frac = max ? Math.min(1, value / max) : 0;
  const cx = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#e6ece6" stroke-width="8"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#3d8b40" stroke-width="8"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"
      transform="rotate(-90 ${cx} ${cx})"/>
    <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
      font-size="${size / 4.6}" font-weight="800" fill="#1f2a1f">${value}/${max}</text>
  </svg>`;
}
