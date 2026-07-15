Views.about = async function (root) {
  root.innerHTML = `
    <div class="card about-hero">
      <div class="logo">${LOGO_SVG}</div>
      <h1 class="page-title" style="margin-top:6px">NIS</h1>
      <p class="muted">${t('app.school')}</p>
      <p style="margin-top:14px;font-weight:700">${t('about.tagline')}</p>
      <p class="muted" style="max-width:560px;margin:10px auto 0;line-height:1.7">${t('about.blurb')}</p>
    </div>
    <div class="about-cards">
      <div class="card about-card"><div class="about-ic">${icon('cap')}</div><b>${t('about.c1')}</b></div>
      <div class="card about-card"><div class="about-ic">${icon('bulb')}</div><b>${t('about.c2')}</b></div>
      <div class="card about-card"><div class="about-ic">${icon('globe')}</div><b>${t('about.c3')}</b></div>
    </div>
    <div class="card">
      <div class="section-title">${t('about.contact')}</div>
      <div class="contact-grid">
        <div class="row-item"><span class="row-ic green">${icon('globe')}</span><div class="row-main"><div class="row-title">${t('about.website')}</div><div class="row-sub">www.nis.edu.kz</div></div></div>
        <div class="row-item"><span class="row-ic green">${icon('mail')}</span><div class="row-main"><div class="row-title">${t('about.email')}</div><div class="row-sub">info@nis.edu.kz</div></div></div>
        <div class="row-item"><span class="row-ic green">${icon('send')}</span><div class="row-main"><div class="row-title">${t('about.telegram')}</div><div class="row-sub">@NIS_Official_Bot</div></div></div>
      </div>
    </div>`;
};
