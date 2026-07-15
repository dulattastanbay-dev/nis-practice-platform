Views.mistakes = async function (root) {
  const all = (await api('GET', '/api/mistakes')).mistakes;
  let subject = '';

  function draw() {
    const rows = subject ? all.filter((m) => m.subject === subject) : all;
    const subjects = [...new Set(all.map((m) => m.subject))];
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${t('mist.title')}</h1>
        <div style="display:flex;gap:12px;align-items:center">
          <span class="muted">${t('mist.total')} <b>${all.length}</b></span>
          <div class="filter"><select id="m-subj">
            <option value="">${t('mist.allSubjects')}</option>
            ${subjects.map((s) => `<option ${s === subject ? 'selected' : ''} value="${s}">${t('subj.' + s)}</option>`).join('')}
          </select></div>
        </div>
      </div>
      <div class="card">
        ${rows.length ? rows.map((m) => `<div class="row-item">
          <span class="row-ic red">${icon('x')}</span>
          <div class="row-main">
            <div class="row-title">${t('q.number', { n: m.number })}
              <span class="badge red" style="margin-left:8px">${t('mist.wrong')}</span></div>
            <div class="row-sub">${t('subj.' + m.subject)} · ${m.year} · ${t('papers.component', { n: m.component })} · ${m.awarded_mark}/${m.marks}</div>
          </div>
          <a class="btn btn-outline btn-sm" href="#/bank?qid=${m.question_id}">${t('mist.retry')}</a>
        </div>`).join('') : `<div class="empty">${t('mist.empty')}</div>`}
      </div>
      ${all.length ? `<div style="text-align:center;margin-top:16px">
        <a class="btn btn-primary" href="#/bank?mistakes=1">${t('mist.practice')}</a></div>` : ''}`;
    root.querySelector('#m-subj').addEventListener('change', (e) => {
      subject = e.target.value;
      draw();
    });
  }
  draw();
};
