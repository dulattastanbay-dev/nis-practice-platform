Views.objectives = async function (root) {
  const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
  const OBJ_ICONS = [icon('bookOpen')];
  let subject = 'Chemistry';

  async function draw() {
    const r = await api('GET', `/api/objectives?subject=${encodeURIComponent(subject)}`);
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${t('obj.title')}</h1>
        <div class="filter"><select id="obj-subj">${SUBJECTS.map((s) =>
          `<option ${s === subject ? 'selected' : ''} value="${s}">${t('subj.' + s)}</option>`).join('')}</select></div>
      </div>
      <div class="card">
        ${r.objectives.map((o, i) => `<div class="row-item">
          <span class="row-ic green">${OBJ_ICONS[i % OBJ_ICONS.length]}</span>
          <div class="row-main">
            <div class="row-title">${esc(o.topic)}</div>
            <div class="row-sub">${t('obj.attempted', { n: o.attempts })}</div>
          </div>
          <div class="obj-bar">
            <div class="progress" style="flex:1"><i style="width:${o.pct}%"></i></div>
            <span class="obj-pct">${o.pct}%</span>
          </div>
        </div>`).join('')}
      </div>`;
    root.querySelector('#obj-subj').addEventListener('change', (e) => {
      subject = e.target.value;
      draw();
    });
  }
  await draw();
};
