Views.exam = async function (root, params) {
  const subject = params.subject || 'Mathematics';
  const year = Number(params.year) || 2025;
  const component = Number(params.component) || 2;
  const data = await api('POST', '/api/exams', { subject, year, component });
  const totalMs = data.exam.duration_min * 60000;
  const st = {
    exam: data.exam,
    qs: data.questions,
    marked: new Set(data.marked_ids),
    answers: {},
    idx: 0,
    started: Date.now(),
    deadline: Date.now() + totalMs,
  };

  root.innerHTML = `
    <div class="exam-header">
      <div class="row1">
        <div class="exam-title">${t('subj.' + subject)} · ${t('papers.component', { n: component })} · ${year}</div>
        <button class="btn btn-danger btn-sm" id="end-exam">${t('exam.end')}</button>
      </div>
      <div class="timer-box">
        <div class="ring-label">${t('exam.remaining')}</div>
        <div class="timer" id="timer">--:--:--</div>
        <div class="timebar"><i id="timebar" style="width:100%"></i></div>
        <div class="row-sub" id="timeleft"></div>
      </div>
    </div>
    <div class="card" id="q-card"></div>
    <div class="exam-nav">
      <button class="btn btn-outline" id="prev">${t('exam.prev')}</button>
      <span class="muted" id="q-count"></span>
      <span style="display:inline-flex;gap:10px">
        <button class="btn btn-primary" id="next">${t('exam.next')}</button>
        <button class="btn btn-blue" id="submit">${t('exam.submit')}</button>
      </span>
    </div>`;

  const timerEl = root.querySelector('#timer');
  const barEl = root.querySelector('#timebar');
  const leftEl = root.querySelector('#timeleft');
  let finished = false;

  function tick() {
    const ms = Math.max(0, st.deadline - Date.now());
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timerEl.textContent = `${hh}:${mm}:${ss}`;
    const pct = Math.round((100 * ms) / totalMs);
    barEl.style.width = pct + '%';
    leftEl.textContent = t('exam.timeLeft', { pct });
    if (ms <= 0 && !finished) submit(true);
  }
  const iv = setInterval(tick, 1000);
  App.cleanup = () => clearInterval(iv);
  tick();

  function saveCurrent() {
    const ta = root.querySelector('#answer');
    if (ta) st.answers[st.qs[st.idx].id] = ta.value;
  }

  function drawQ() {
    const qq = st.qs[st.idx];
    const isMarked = st.marked.has(qq.id);
    const qCard = root.querySelector('#q-card');
    qCard.innerHTML = `
      <div class="q-header">
        <div class="q-title">${t('exam.qTitle', { n: qq.number, m: qq.marks })}</div>
        <button class="star-btn ${isMarked ? 'on' : ''}" id="star">${icon(isMarked ? 'star' : 'starOutline')} ${isMarked ? t('exam.saved') : t('exam.save')}</button>
      </div>
      <div class="q-text">${qq.text_latex}</div>
      ${qq.figure_svg || ''}
      <textarea class="answer" id="answer" placeholder="${t('exam.placeholder')}">${esc(st.answers[qq.id] || '')}</textarea>`;
    root.querySelector('#q-count').textContent = t('exam.qOf', { a: st.idx + 1, b: st.qs.length });
    root.querySelector('#prev').disabled = st.idx === 0;
    root.querySelector('#next').classList.toggle('hidden', st.idx === st.qs.length - 1);
    qCard.querySelector('#star').addEventListener('click', async () => {
      const on = st.marked.has(qq.id);
      try {
        await api(on ? 'DELETE' : 'PUT', `/api/marked/${qq.id}`);
        if (on) st.marked.delete(qq.id); else st.marked.add(qq.id);
        saveCurrent();
        drawQ();
      } catch { /* non-fatal */ }
    });
    renderMath(qCard);
  }

  async function submit(auto) {
    if (finished) return;
    if (!auto && !confirm(t('exam.confirmSubmit'))) return;
    finished = true;
    saveCurrent();
    clearInterval(iv);
    const answers = st.qs.map((qq) => ({ question_id: qq.id, answer_text: st.answers[qq.id] || '' }));
    const duration = Math.round((Date.now() - st.started) / 1000);
    try {
      const r = await api('POST', `/api/exams/${st.exam.id}/submit`, { answers, duration_sec: duration });
      location.hash = `#/results?id=${r.exam.id}`;
    } catch {
      finished = false;
      alert(t('common.error'));
    }
  }

  root.querySelector('#prev').addEventListener('click', () => {
    saveCurrent();
    if (st.idx > 0) { st.idx -= 1; drawQ(); }
  });
  root.querySelector('#next').addEventListener('click', () => {
    saveCurrent();
    if (st.idx < st.qs.length - 1) { st.idx += 1; drawQ(); }
  });
  root.querySelector('#submit').addEventListener('click', () => submit(false));
  root.querySelector('#end-exam').addEventListener('click', () => {
    if (confirm(t('exam.confirmEnd'))) location.hash = '#/papers';
  });
  drawQ();
};
