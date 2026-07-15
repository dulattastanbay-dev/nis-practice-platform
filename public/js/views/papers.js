Views.papers = async function (root) {
  const SUBJECTS = ['Chemistry', 'Mathematics', 'Physics', 'Biology'];
  const YEARS = [2025, 2024, 2023, 2022, 2021];
  const sel = { subject: 'Mathematics', year: 2025, component: 2 };

  function draw() {
    const startHref = `#/exam?subject=${encodeURIComponent(sel.subject)}&year=${sel.year}&component=${sel.component}`;
    root.innerHTML = `
      <h1 class="page-title">${t('papers.title')}</h1>
      <p class="page-sub">${t('papers.subtitle')}</p>
      <div class="card">
        <div class="section-title"><span class="step-num">1</span>${t('papers.subject')}</div>
        <div class="choice-row">${SUBJECTS.map((s) =>
          `<button class="choice ${s === sel.subject ? 'selected' : ''}" data-k="subject" data-v="${s}">${t('subj.' + s)}</button>`).join('')}</div>
        <div class="section-title"><span class="step-num">2</span>${t('papers.year')}</div>
        <div class="choice-row">${YEARS.map((y) =>
          `<button class="choice ${y === sel.year ? 'selected' : ''}" data-k="year" data-v="${y}">${y}</button>`).join('')}</div>
        <div class="section-title"><span class="step-num">3</span>${t('papers.paper')}</div>
        <div class="choice-row">${[1, 2, 3].map((c) =>
          `<button class="choice ${c === sel.component ? 'selected' : ''}" data-k="component" data-v="${c}">${t('papers.component', { n: c })}</button>`).join('')}</div>
        <div style="text-align:center;margin-top:8px">
          <a class="btn btn-primary" href="${startHref}">${t('papers.start')}</a>
        </div>
      </div>
      <div class="note">${t('papers.note')}</div>`;
    root.querySelectorAll('.choice').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.k;
        sel[k] = k === 'subject' ? b.dataset.v : Number(b.dataset.v);
        draw();
      });
    });
  }
  draw();
};
