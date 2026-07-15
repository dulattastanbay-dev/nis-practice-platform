Views.marked = async function (root) {
  let all = (await api('GET', '/api/marked')).marked;

  function draw() {
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h1 class="page-title" style="margin:0">${t('marked.title')}</h1>
        <span class="muted">${t('marked.total')} <b>${all.length}</b></span>
      </div>
      <div class="card">
        ${all.length ? all.map((m) => `<div class="row-item">
          <span class="row-ic gold">★</span>
          <div class="row-main">
            <div class="row-title">${t('q.number', { n: m.number })}</div>
            <div class="row-sub">${t('subj.' + m.subject)} · ${m.year} · ${t('papers.component', { n: m.component })} · ${t('common.marks', { m: m.marks })}</div>
          </div>
          <a class="btn btn-outline btn-sm" href="#/bank?qid=${m.question_id}">${t('marked.open')}</a>
          <button class="btn btn-outline btn-sm" data-rm="${m.question_id}">${t('marked.remove')}</button>
        </div>`).join('') : `<div class="empty">${t('marked.empty')}</div>`}
      </div>`;
    root.querySelectorAll('[data-rm]').forEach((b) => {
      b.addEventListener('click', async () => {
        await api('DELETE', `/api/marked/${b.dataset.rm}`);
        all = all.filter((m) => String(m.question_id) !== b.dataset.rm);
        draw();
      });
    });
  }
  draw();
};
