// Admin screen: the authoritative page scan beside the extracted text, so
// garbled formulas can be corrected quickly and the review flag cleared.
Views.review = async function (root, params) {
  if (!App.user || !App.user.is_admin) {
    root.innerHTML = `<div class="card empty">${t('review.forbidden')}</div>`;
    return;
  }

  let queue = [];
  let idx = 0;
  let showAll = params.all === '1';

  async function loadQueue() {
    const r = await api('GET', `/api/review/queue${showAll ? '?all=1' : ''}`);
    queue = r.questions;
    return r;
  }

  async function draw(stats) {
    if (!queue.length) {
      root.innerHTML = `
        <h1 class="page-title">${t('review.title')}</h1>
        <p class="page-sub">${t('review.progress', { done: stats.total - stats.pending, total: stats.total })}</p>
        <div class="card empty">${t('review.allClear')}</div>
        ${toggleHTML()}`;
      bindToggle();
      return;
    }
    idx = Math.max(0, Math.min(idx, queue.length - 1));
    const { question: q } = await api('GET', `/api/review/${queue[idx].id}`);

    const scan = (q.images || []).map((im) => im.src
      ? `<img class="rv-scan" src="${esc(im.src)}" alt="${esc(im.caption || '')}">`
      : (im.svg || '')).join('') || `<div class="empty">${t('review.noScan')}</div>`;

    root.innerHTML = `
      <h1 class="page-title">${t('review.title')}</h1>
      <p class="page-sub">${t('review.progress', { done: stats.total - stats.pending, total: stats.total })}
        · ${t('review.pos', { a: idx + 1, b: queue.length })}</p>

      <div class="rv-bar card">
        <button class="btn btn-outline btn-sm" id="rv-prev" ${idx === 0 ? 'disabled' : ''}>← ${t('exam.prev')}</button>
        <b>${esc(q.subject)} ${q.year} · ${t('papers.component', { n: q.component })} · ${t('q.number', { n: q.number })}</b>
        <span class="badge ${q.needs_review ? 'red' : ''}">${q.needs_review ? t('review.pending') : t('review.done')}</span>
        <span style="flex:1"></span>
        ${toggleHTML()}
        <button class="btn btn-outline btn-sm" id="rv-next" ${idx >= queue.length - 1 ? 'disabled' : ''}>${t('exam.next')} →</button>
      </div>

      <div class="rv-grid">
        <div class="card rv-scanwrap">
          <div class="section-title">${t('review.scan')}${q.original_pdf_page ? ` · ${t('review.page', { n: q.original_pdf_page })}` : ''}</div>
          ${scan}
        </div>

        <div class="card">
          <div class="section-title">${t('review.edit')}</div>
          <div class="fld">
            <label>${t('review.qText')}</label>
            <textarea class="answer rv-text" id="rv-qtext">${esc(q.text_latex || '')}</textarea>
          </div>
          <div class="rv-row">
            <div class="fld"><label>${t('review.marks')}</label>
              <input id="rv-marks" type="number" min="1" value="${q.marks}"></div>
            <div class="fld"><label>${t('review.expected')}</label>
              <input id="rv-expected" type="number" min="0" value="${q.expected_mark}"></div>
          </div>

          ${(q.parts || []).map((p) => `
            <div class="part rv-part" data-part="${p.id}">
              <div class="part-head"><span class="part-letter">(${esc(p.letter)})</span>
                <span class="part-marks">${t('common.marks', { m: p.marks })}</span></div>
              <textarea class="answer rv-text" data-f="text">${esc(p.text_latex || '')}</textarea>
              <div class="rv-row">
                <div class="fld"><label>${t('review.marks')}</label>
                  <input type="number" min="1" data-f="marks" value="${p.marks}"></div>
                <div class="fld"><label>${t('review.expected')}</label>
                  <input type="number" min="0" data-f="expected" value="${p.expected_mark}"></div>
              </div>
            </div>`).join('')}

          <div class="fld">
            <label>${t('review.scheme')}</label>
            <textarea class="answer rv-text" id="rv-scheme">${esc(q.mark_scheme || '')}</textarea>
          </div>

          <div class="rv-actions">
            <button class="btn btn-primary" id="rv-save">${t('review.saveDone')}</button>
            <button class="btn btn-outline" id="rv-savekeep">${t('review.saveKeep')}</button>
          </div>
        </div>
      </div>`;

    bindToggle();
    root.querySelector('#rv-prev').addEventListener('click', () => { idx -= 1; refresh(); });
    root.querySelector('#rv-next').addEventListener('click', () => { idx += 1; refresh(); });
    root.querySelector('#rv-save').addEventListener('click', () => save(q, false));
    root.querySelector('#rv-savekeep').addEventListener('click', () => save(q, true));
  }

  function toggleHTML() {
    return `<button class="btn btn-outline btn-sm" id="rv-toggle">
      ${showAll ? t('review.showPending') : t('review.showAll')}</button>`;
  }
  function bindToggle() {
    const b = root.querySelector('#rv-toggle');
    if (b) b.addEventListener('click', () => { showAll = !showAll; idx = 0; refresh(); });
  }

  async function save(q, keepFlag) {
    const payload = {
      text_latex: root.querySelector('#rv-qtext').value,
      mark_scheme: root.querySelector('#rv-scheme').value,
      marks: Number(root.querySelector('#rv-marks').value),
      expected_mark: Number(root.querySelector('#rv-expected').value),
      needs_review: keepFlag,
    };
    const partEls = [...root.querySelectorAll('.rv-part')];
    if (partEls.length) {
      payload.parts = partEls.map((el) => ({
        id: Number(el.dataset.part),
        text_latex: el.querySelector('[data-f="text"]').value,
        marks: Number(el.querySelector('[data-f="marks"]').value),
        expected_mark: Number(el.querySelector('[data-f="expected"]').value),
      }));
    }
    try {
      await api('PATCH', `/api/review/${q.id}`, payload);
      toast(t('review.saved'), 'success');
      if (!keepFlag && !showAll) {
        // it left the pending queue; stay on the same slot to get the next one
        queue.splice(idx, 1);
      }
      refresh();
    } catch (err) {
      toast(t('review.err.' + err.code) !== 'review.err.' + err.code
        ? t('review.err.' + err.code) : t('common.error'), 'error');
    }
  }

  async function refresh() {
    const stats = await loadQueue();
    await draw(stats);
    renderMath(root);
  }

  await refresh();
};
