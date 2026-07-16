Views.exam = async function (root, params) {
  // Either resume the in-progress exam, or start a fresh one from the chosen paper.
  let data;
  if (params.resume) {
    try {
      data = await api('GET', '/api/exams/current');
    } catch {
      location.hash = '#/papers';
      return;
    }
  } else {
    const subject = params.subject || 'Mathematics';
    const year = Number(params.year) || 2025;
    const component = Number(params.component) || 2;
    data = await api('POST', '/api/exams', { subject, year, component });
  }

  const totalMs = data.exam.duration_min * 60000;
  const resumeSec = data.exam.draft_remaining_sec;
  const st = {
    exam: data.exam,
    qs: data.questions,
    marked: new Set(data.marked_ids),
    answers: data.answers || {},
    idx: Math.min(data.exam.draft_idx || 0, Math.max(0, (data.questions.length || 1) - 1)),
    started: Date.now(),
    deadline: Date.now() + (resumeSec != null ? resumeSec * 1000 : totalMs),
  };

  root.innerHTML = `
    <div class="exam-header">
      <div class="row1">
        <div class="exam-title">${t('subj.' + st.exam.subject)} · ${t('papers.component', { n: st.exam.component })} · ${st.exam.year}</div>
        <button class="btn btn-danger btn-sm" id="end-exam">${t('exam.end')}</button>
      </div>
      <div class="timer-box">
        <div class="ring-label">${t('exam.remaining')}</div>
        <div class="timer" id="timer">--:--:--</div>
        <div class="timebar"><i id="timebar" style="width:100%"></i></div>
        <div class="row-sub" id="timeleft"></div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">${t('exam.navTitle')}</div>
      <div class="qnav" id="qnav"></div>
      <div class="qnav-legend">
        <span><i class="qnav-dot"></i>${t('exam.legendAnswered')}</span>
        <span><i class="qnav-dot plain"></i>${t('exam.legendUnanswered')}</span>
        <span>${icon('star')}${t('exam.legendSaved')}</span>
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
  let saveTimer = null;
  let tickCount = 0;

  function remainingSec() {
    return Math.max(0, Math.round((st.deadline - Date.now()) / 1000));
  }

  // Persist the draft so a closed browser can resume exactly here.
  async function saveDraft() {
    if (finished) return;
    try {
      await api('POST', `/api/exams/${st.exam.id}/draft`, {
        answers: st.answers, idx: st.idx, remaining_sec: remainingSec(),
      });
    } catch { /* autosave is best-effort */ }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 1200);
  }

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
    tickCount += 1;
    if (tickCount % 15 === 0) saveDraft(); // periodic safety net
    if (ms <= 0 && !finished) submit(true);
  }
  const iv = setInterval(tick, 1000);
  const onLeave = () => { saveCurrent(); navigator.sendBeacon && navigator.sendBeacon(
    `/api/exams/${st.exam.id}/draft`,
    new Blob([JSON.stringify({ answers: st.answers, idx: st.idx, remaining_sec: remainingSec() })],
      { type: 'application/json' })
  ); };
  window.addEventListener('beforeunload', onLeave);
  App.cleanup = () => {
    clearInterval(iv);
    clearTimeout(saveTimer);
    window.removeEventListener('beforeunload', onLeave);
    if (!finished) saveDraft();
  };
  tick();

  function saveCurrent() {
    const ta = root.querySelector('#answer');
    if (ta) st.answers[st.qs[st.idx].id] = ta.value;
  }

  function answered(q) {
    return String(st.answers[q.id] || '').trim().length > 0;
  }

  // Numbered navigator: green when answered, star when bookmarked, jump anywhere.
  function drawNav() {
    const nav = root.querySelector('#qnav');
    nav.innerHTML = st.qs.map((q, i) => `
      <button class="qnav-btn ${answered(q) ? 'answered' : ''} ${i === st.idx ? 'current' : ''}"
        data-i="${i}" aria-label="${t('exam.qOf', { a: i + 1, b: st.qs.length })}">${i + 1}
        ${st.marked.has(q.id) ? `<span class="qnav-star">${icon('star')}</span>` : ''}
      </button>`).join('');
    nav.querySelectorAll('.qnav-btn').forEach((b) => {
      b.addEventListener('click', () => {
        saveCurrent();
        st.idx = Number(b.dataset.i);
        drawQ();
        scheduleSave();
      });
    });
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
    qCard.querySelector('#answer').addEventListener('input', () => {
      saveCurrent();
      drawNav();
      scheduleSave();
    });
    qCard.querySelector('#star').addEventListener('click', async () => {
      const on = st.marked.has(qq.id);
      try {
        await api(on ? 'DELETE' : 'PUT', `/api/marked/${qq.id}`);
        if (on) st.marked.delete(qq.id); else st.marked.add(qq.id);
        saveCurrent();
        drawQ();
      } catch { /* non-fatal */ }
    });
    drawNav();
    renderMath(qCard);
  }

  async function submit(auto) {
    if (finished) return;
    if (!auto && !confirm(t('exam.confirmSubmit'))) return;
    finished = true;
    saveCurrent();
    clearInterval(iv);
    clearTimeout(saveTimer);
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
    if (st.idx > 0) { st.idx -= 1; drawQ(); scheduleSave(); }
  });
  root.querySelector('#next').addEventListener('click', () => {
    saveCurrent();
    if (st.idx < st.qs.length - 1) { st.idx += 1; drawQ(); scheduleSave(); }
  });
  root.querySelector('#submit').addEventListener('click', () => submit(false));
  root.querySelector('#end-exam').addEventListener('click', () => {
    if (confirm(t('exam.confirmEnd'))) { finished = true; location.hash = '#/papers'; }
  });
  drawQ();
};
