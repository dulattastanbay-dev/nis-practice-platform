Views.bank = async function (root, params) {
  const SUBJECTS = ['Mathematics', 'Chemistry', 'Physics', 'Biology'];
  const YEARS = ['2025', '2024', '2023', '2022', '2021'];
  const sel = { subject: 'Mathematics', year: '2025', component: '2', topic: '' };
  const fixedMode = Boolean(params.qid || params.mistakes); // no filter bar in retry/mistakes mode
  let list = [];
  let idx = 0;
  let topics = [];
  let started = Date.now();
  let hasLoaded = fixedMode; // filter mode shows a prompt until Start/Random is pressed
  const marked = new Set((await api('GET', '/api/marked')).marked.map((m) => m.question_id));

  async function loadTopics() {
    topics = (await api('GET', `/api/topics?subject=${encodeURIComponent(sel.subject)}`)).topics;
  }

  async function loadByFilters() {
    const base = `subject=${encodeURIComponent(sel.subject)}`
      + (sel.topic ? `&topic=${encodeURIComponent(sel.topic)}` : '');
    let r = await api('GET', `/api/questions?${base}&year=${sel.year}&component=${sel.component}`);
    if (r.questions.length === 0) r = await api('GET', `/api/questions?${base}`); // subject-pool fallback
    return r.questions;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function filterSelHTML(key, label, opts) {
    return `<div class="filter"><label>${label}</label><select data-k="${key}">
      ${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(sel[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
    </select></div>`;
  }

  function filterBarHTML() {
    return `<div class="card"><div class="filter-row">
      ${filterSelHTML('subject', t('papers.subject'), SUBJECTS.map((s) => [s, t('subj.' + s)]))}
      ${filterSelHTML('year', t('papers.year'), YEARS.map((y) => [y, y]))}
      ${filterSelHTML('component', t('papers.paper'), ['1', '2', '3'].map((c) => [c, t('papers.component', { n: c })]))}
      ${filterSelHTML('topic', t('bank.topic'), [['', t('bank.all')]].concat(topics.map((x) => [x, x])))}
      <button class="btn btn-primary" id="f-start">${t('bank.start')}</button>
      <button class="btn btn-outline" id="f-random">${t('bank.random')}</button>
    </div></div>`;
  }

  function qCardHTML(qq) {
    const isM = marked.has(qq.id);
    return `<div class="card">
      <div class="q-header">
        <div class="q-title">${t('exam.qTitle', { n: qq.number, m: qq.marks })}</div>
        <button class="star-btn ${isM ? 'on' : ''}" id="p-star">${icon(isM ? 'star' : 'starOutline')} ${isM ? t('bank.saved') : t('bank.save')}</button>
      </div>
      <div class="q-text">${qq.text_latex}</div>
      ${qq.figure_svg || ''}
      <div class="toolbar">
        <button data-ins="**">𝐁</button><button data-ins="_">𝘐</button><button data-ins="__">U̲</button>
        <button data-ins="Σ">Σ</button><button data-ins="∞">∞</button><button data-ins="∫">∫</button><button data-ins="√">√</button>
      </div>
      <textarea class="answer" id="p-answer" placeholder="${t('exam.placeholder')}"></textarea>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="p-submit">${t('bank.submit')}</button>
        <button class="btn btn-outline" id="p-scheme" disabled>${t('bank.scheme')}</button>
        <span style="flex:1"></span>
        <button class="btn btn-outline" id="p-next">${t('bank.next')} →</button>
      </div>
      <div id="p-scheme-box" class="scheme-box hidden"></div>
    </div>`;
  }

  function fbPanelHTML() {
    return `<div class="card">
      <div class="fb-title">${icon('sparkles')}${t('bank.ai')}</div>
      <div class="fb-text muted" id="fb-text">—</div>
      <div class="ring-wrap">
        <div class="ring-label">${t('bank.expected')}</div>
        <div id="fb-ring"></div>
      </div>
      <div class="conf hidden" id="fb-conf"></div>
      <div class="conf-bar"><i id="fb-conf-bar" style="width:0%"></i></div>
    </div>`;
  }

  function draw() {
    const qq = list[idx];
    root.innerHTML = `
      <h1 class="page-title">${t('bank.title')}</h1>
      <p class="page-sub"></p>
      ${fixedMode ? '' : filterBarHTML()}
      ${qq
        ? `<div class="practice-grid"><div id="q-col">${qCardHTML(qq)}</div>${fbPanelHTML()}</div>`
        : `<div class="card empty" style="margin-top:16px">${fixedMode ? t('mist.empty') : !hasLoaded ? t('bank.prompt') : idx > 0 ? t('bank.done') : t('bank.empty')}</div>`}`;

    if (!fixedMode) {
      root.querySelectorAll('.filter select').forEach((s) => {
        s.addEventListener('change', async () => {
          sel[s.dataset.k] = s.value;
          if (s.dataset.k === 'subject') { sel.topic = ''; await loadTopics(); draw(); }
        });
      });
      root.querySelector('#f-start').addEventListener('click', async () => {
        list = await loadByFilters(); idx = 0; started = Date.now(); hasLoaded = true; draw();
      });
      root.querySelector('#f-random').addEventListener('click', async () => {
        list = shuffle(await loadByFilters()); idx = 0; started = Date.now(); hasLoaded = true; draw();
      });
    }
    if (!qq) return;

    const ta = root.querySelector('#p-answer');
    root.querySelectorAll('.toolbar button').forEach((b) => {
      b.addEventListener('click', () => {
        const ins = b.dataset.ins;
        const s = ta.selectionStart || 0;
        ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd || s);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + ins.length;
      });
    });

    root.querySelector('#p-star').addEventListener('click', async () => {
      const on = marked.has(qq.id);
      try {
        await api(on ? 'DELETE' : 'PUT', `/api/marked/${qq.id}`);
        if (on) marked.delete(qq.id); else marked.add(qq.id);
        const btn = root.querySelector('#p-star');
        btn.classList.toggle('on', !on);
        btn.innerHTML = `${icon(!on ? 'star' : 'starOutline')} ${!on ? t('bank.saved') : t('bank.save')}`;
      } catch { /* non-fatal */ }
    });

    let scheme = null;
    root.querySelector('#p-submit').addEventListener('click', async () => {
      const r = await api('POST', '/api/attempts', {
        question_id: qq.id,
        answer_text: ta.value,
        mode: 'practice',
        duration_sec: Math.round((Date.now() - started) / 1000),
      });
      const fbText = root.querySelector('#fb-text');
      fbText.classList.remove('muted');
      fbText.innerHTML = r.ai_feedback;
      root.querySelector('#fb-ring').innerHTML = ringSVG(r.awarded_mark, r.marks, 96);
      const conf = root.querySelector('#fb-conf');
      conf.classList.remove('hidden');
      conf.textContent = t('bank.confidence', { level: t('bank.conf.' + r.confidence) });
      root.querySelector('#fb-conf-bar').style.width =
        { high: '90%', medium: '60%', low: '30%' }[r.confidence];
      scheme = r.mark_scheme;
      root.querySelector('#p-scheme').disabled = false;
      renderMath(root);
    });

    root.querySelector('#p-scheme').addEventListener('click', () => {
      const box = root.querySelector('#p-scheme-box');
      if (box.classList.contains('hidden') && scheme !== null) {
        box.innerHTML = `<b>${t('bank.schemeTitle')}</b><br>${scheme}`;
        box.classList.remove('hidden');
        renderMath(box);
      } else {
        box.classList.add('hidden');
      }
    });

    root.querySelector('#p-next').addEventListener('click', () => {
      idx += 1;
      started = Date.now();
      draw();
    });

    renderMath(root);
  }

  // --- entry modes ---
  if (params.qid) {
    list = [(await api('GET', `/api/questions/${params.qid}`)).question];
  } else if (params.mistakes) {
    const ms = (await api('GET', '/api/mistakes')).mistakes;
    list = [];
    for (const m of ms) {
      list.push((await api('GET', `/api/questions/${m.question_id}`)).question);
    }
  } else {
    await loadTopics();
  }
  draw();
};
