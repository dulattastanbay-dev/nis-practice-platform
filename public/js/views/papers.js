Views.papers = async function (root) {
  // Only offer papers that actually exist in the database.
  const { papers } = await api('GET', '/api/papers');
  if (!papers.length) {
    root.innerHTML = `<h1 class="page-title">${t('papers.title')}</h1>
      <div class="card empty">${t('bank.empty')}</div>`;
    return;
  }

  const subjects = [...new Set(papers.map((p) => p.subject))];
  const sel = { subject: subjects.includes('Mathematics') ? 'Mathematics' : subjects[0] };

  const yearsFor = (s) => [...new Set(papers.filter((p) => p.subject === s).map((p) => p.year))]
    .sort((a, b) => b - a);
  const compsFor = (s, y) => papers.filter((p) => p.subject === s && p.year === y)
    .map((p) => p.component).sort((a, b) => a - b);
  const paperFor = (s, y, c) => papers.find((p) => p.subject === s && p.year === y && p.component === c);

  function normalise() {
    const ys = yearsFor(sel.subject);
    if (!ys.includes(sel.year)) sel.year = ys[0];
    const cs = compsFor(sel.subject, sel.year);
    if (!cs.includes(sel.component)) sel.component = cs[0];
  }

  function draw() {
    normalise();
    const chosen = paperFor(sel.subject, sel.year, sel.component);
    const startHref = `#/exam?subject=${encodeURIComponent(sel.subject)}&year=${sel.year}&component=${sel.component}`;
    root.innerHTML = `
      <h1 class="page-title">${t('papers.title')}</h1>
      <p class="page-sub">${t('papers.subtitle')}</p>
      <div class="card">
        <div class="section-title"><span class="step-num">1</span>${t('papers.subject')}</div>
        <div class="choice-row">${subjects.map((s) =>
          `<button class="choice ${s === sel.subject ? 'selected' : ''}" data-k="subject" data-v="${esc(s)}">${t('subj.' + s)}</button>`).join('')}</div>

        <div class="section-title"><span class="step-num">2</span>${t('papers.year')}</div>
        <div class="choice-row">${yearsFor(sel.subject).map((y) =>
          `<button class="choice ${y === sel.year ? 'selected' : ''}" data-k="year" data-v="${y}">${y}</button>`).join('')}</div>

        <div class="section-title"><span class="step-num">3</span>${t('papers.paper')}</div>
        <div class="choice-row">${compsFor(sel.subject, sel.year).map((c) =>
          `<button class="choice ${c === sel.component ? 'selected' : ''}" data-k="component" data-v="${c}">${t('papers.component', { n: c })}</button>`).join('')}</div>

        ${chosen ? `<p class="paper-meta">${t('papers.meta', { q: chosen.questions, m: chosen.marks })}</p>` : ''}
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
