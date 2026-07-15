function statCard(icon, value, label) {
  return `<div class="card stat-card"><span class="stat-icon">${icon}</span><div>
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div>`;
}

function heatmapHTML(cells) {
  const level = (c) => (c === 0 ? 0 : c < 3 ? 1 : c < 6 ? 2 : c < 10 ? 3 : 4);
  return `<div class="heatmap">${cells.map((c) =>
    `<span class="hm" data-l="${level(c.count)}" title="${c.date}: ${c.count}"></span>`
  ).join('')}</div>`;
}

function continueCardHTML(cont) {
  if (!cont) return '';
  const href = `#/exam?subject=${encodeURIComponent(cont.subject)}&year=${cont.year}&component=${cont.component}`;
  return `<div style="margin-top:16px;padding:14px;background:var(--green-tint);border-radius:12px">
    <div class="section-title" style="margin-bottom:6px">${t('dash.continue')}</div>
    <div class="row-sub">${t('subj.' + cont.subject)} · ${cont.year} · ${t('papers.component', { n: cont.component })}</div>
    <a class="btn btn-primary btn-sm" style="margin-top:10px" href="${href}">${t('dash.continueBtn')}</a>
  </div>`;
}

function recentRowHTML(r) {
  return `<div class="row-item"><span class="row-ic green">✓</span>
    <div class="row-main">
      <div class="row-title">${t('subj.' + r.subject)} · ${r.year} · ${t('papers.component', { n: r.component })}</div>
      <div class="row-sub">${relDay(r.submitted_at)}</div>
    </div>
    <b>${r.score} / ${r.total}</b></div>`;
}

Views.dashboard = async function (root) {
  const s = await api('GET', '/api/stats');
  const goalPct = Math.min(100, Math.round((100 * s.today_count) / s.goal));
  const qa = [
    ['#/bank', '▶️', t('dash.qa.practice')],
    ['#/papers', '📄', t('dash.qa.papers')],
    ['#/bank', '📚', t('dash.qa.bank')],
    ['#/mistakes', '✖️', t('dash.qa.mistakes')],
    ['#/marked', '⭐', t('dash.qa.marked')],
  ];
  root.innerHTML = `
    <h1 class="page-title">${t('dash.hello', { name: esc(App.user.name) })} 👋</h1>
    <p class="page-sub">${t('dash.ready')}</p>
    <div class="grid-4">
      ${statCard('🔥', s.streak, t('dash.streak'))}
      ${statCard('⏱️', fmtDuration(s.time_today_sec), t('dash.today'))}
      ${statCard('📊', s.solved, t('dash.solved'))}
      ${statCard('✅', s.accuracy + '%', t('dash.accuracy'))}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="section-title">${t('dash.goal')}</div>
        <p class="muted" style="font-size:13px">${t('dash.goalText')}</p>
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <div class="progress" style="flex:1"><i style="width:${goalPct}%"></i></div>
          <b>${s.today_count} / ${s.goal}</b>
        </div>
        ${continueCardHTML(s.continue)}
      </div>
      <div class="card">
        <div class="section-title">${t('dash.quick')}</div>
        ${qa.map(([h, ic, label]) =>
          `<a class="row-item" href="${h}"><span class="row-ic green">${ic}</span><span class="row-main row-title">${label}</span></a>`
        ).join('')}
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="section-title">${t('dash.recent')}</div>
        ${s.recent.length ? s.recent.map(recentRowHTML).join('') : `<div class="empty">${t('dash.none')}</div>`}
      </div>
      <div class="card">
        <div class="section-title">${t('dash.heatmap')}</div>
        ${heatmapHTML(s.heatmap)}
        <div class="hm-legend">${t('dash.less')}
          <span class="hm"></span><span class="hm" data-l="1"></span><span class="hm" data-l="2"></span><span class="hm" data-l="3"></span><span class="hm" data-l="4"></span>
        ${t('dash.more')}</div>
      </div>
    </div>`;
};
