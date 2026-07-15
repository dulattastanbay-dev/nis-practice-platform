Views.results = async function (root, params) {
  const data = await api('GET', `/api/exams/${params.id}`);
  const { exam, results } = data;
  let tab = 'overview';

  function statusIcon(r) {
    if (r.awarded_mark >= r.marks) return `<span class="status-ic ok">${icon('checkCircle')}</span>`;
    if (r.awarded_mark > 0) return `<span class="status-ic warn">${icon('alertCircle')}</span>`;
    return `<span class="status-ic bad">${icon('xCircle')}</span>`;
  }

  function overviewHTML() {
    return `<table class="results">
      <tr><th>${t('results.q')}</th><th>${t('results.yourAnswer')}</th><th>${t('results.expected')}</th><th>${t('results.status')}</th></tr>
      ${results.map((r) => `<tr>
        <td><b>${r.number}</b> <span class="muted">(${t('common.marks', { m: r.marks })})</span></td>
        <td>${r.answer_text.trim()
          ? esc(r.answer_text.slice(0, 40)) + (r.answer_text.length > 40 ? '…' : '')
          : `<span class="muted">${t('results.noAnswer')}</span>`}</td>
        <td><b>${r.awarded_mark} / ${r.marks}</b></td>
        <td>${statusIcon(r)}</td>
      </tr>`).join('')}
    </table>
    <div style="text-align:center;margin-top:14px"><button class="btn btn-outline" id="review-all">${t('results.reviewAll')}</button></div>`;
  }

  function reviewHTML() {
    return results.map((r) => `
      <div class="row-item" style="display:block">
        <div class="q-header">
          <div class="q-title">${t('exam.qTitle', { n: r.number, m: r.marks })}</div>
          <b>${r.awarded_mark} / ${r.marks}</b>
        </div>
        <div class="q-text">${r.text_latex}</div>
        ${r.figure_svg || ''}
        <div class="row-sub" style="margin-bottom:8px">${t('results.yourAnswer')}:
          ${r.answer_text.trim() ? esc(r.answer_text) : t('results.noAnswer')}</div>
        <div class="fb-text">💡 ${r.ai_feedback}</div>
        <div class="scheme-box">📋 ${r.mark_scheme}</div>
      </div>`).join('');
  }

  function draw() {
    root.innerHTML = `
      <div class="score-banner">
        <div>${t('results.banner')}</div>
        <div class="big">${exam.score} / ${exam.total}<span class="trophy">${icon('trophy')}</span></div>
        <div class="pct">${exam.pct}%</div>
      </div>
      <div class="card">
        <div class="tabs">
          <button class="tab ${tab === 'overview' ? 'active' : ''}" data-t="overview">${t('results.overview')}</button>
          <button class="tab ${tab === 'review' ? 'active' : ''}" data-t="review">${t('results.review')}</button>
        </div>
        <div id="tab-body">${tab === 'overview' ? overviewHTML() : reviewHTML()}</div>
      </div>`;
    root.querySelectorAll('.tab').forEach((b) => {
      b.addEventListener('click', () => { tab = b.dataset.t; draw(); });
    });
    const ra = root.querySelector('#review-all');
    if (ra) ra.addEventListener('click', () => { tab = 'review'; draw(); });
    renderMath(root);
  }
  draw();
  burstConfetti();
};
