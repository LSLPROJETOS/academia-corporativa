// ============================================================================
// 7. TELAS DO ALUNO
// ============================================================================
// Cursos que o usuário pode ver: staff vê todos; aluno vê os publicados e os que já está inscrito.
const visibleCourses = (u) => S.courses.filter((c) => isStaff() || c.status === 'publicado' || isEnrolled(u.id, c.id));
// Seletor de filtro: ao mudar, atualiza a lista na hora (veja o evento "input" na seção 9).
const fsel = (label, key, opts, val) => `<label>${label}<select data-filter="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const ICON = { video: '▶', link: '🔗', texto: '📄' };
const ytId = (url) => ((url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/) || [])[1] || '';
const ANNOUNCEMENT_CATEGORIES = {
  novo: { label: 'NOVO', className: 'new' },
  comunicado: { label: 'COMUNICADO', className: 'notice' },
  melhoria: { label: 'MELHORIA', className: 'improve' }
};
const announcementStatus = (item) => item.status || 'published';
const announcementDate = (item) => Number(item.status === 'scheduled' ? item.scheduledAt : (item.publishedAt || item.at)) || 0;
const isAnnouncementVisible = (item, now = Date.now()) => {
  const status = announcementStatus(item);
  if (!['published', 'scheduled'].includes(status)) return false;
  const date = announcementDate(item);
  return date <= now;
};
const visibleAnnouncements = () => S.announcements.filter((item) => isAnnouncementVisible(item))
  .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || announcementDate(b) - announcementDate(a));
const announcementCard = (item, imageUrl = '') => {
  const category = ANNOUNCEMENT_CATEGORIES[item.category] || ANNOUNCEMENT_CATEGORIES.comunicado;
  const description = item.description || item.text || '';
  return `<article class="update-card">
    <div class="update-card-meta"><span class="update-category ${category.className}">${category.label}</span>
      <time datetime="${new Date(announcementDate(item)).toISOString()}">${fmtDate(announcementDate(item))}</time></div>
    ${item.pinned ? '<span class="update-pinned">Fixada</span>' : ''}
    <h3>${esc(item.title)}</h3><p>${esc(description)}</p>
    ${imageUrl ? `<img class="update-image" src="${esc(imageUrl)}" alt="${esc(item.imageAlt || item.title)}" loading="lazy">` : ''}
  </article>`;
};

// ---------- INÍCIO ----------
VIEWS.home = async () => {
  await refreshAnnouncements();
  const u = me(), li = levelInfo(u.xp), st = userStats(u), checked = u.lastCheckin === todayISO();
  const mine = S.enrollments.filter((e) => e.userId === u.id).map((e) => ({ e, c: course(e.courseId), p: courseProg(u.id, e.courseId) })).filter((x) => x.c);
  const pend = mine.filter((x) => !x.p.complete);
  const duty = pend.filter((x) => x.c.mandatory).sort((a, b) => (dueOf(a.e, a.c) || '9').localeCompare(dueOf(b.e, b.c) || '9'));
  const cont = pend.find((x) => x.p.done > 0) || pend[0];
  const recs = visibleCourses(u).filter((c) => !isEnrolled(u.id, c.id) && c.status === 'publicado').slice(0, 3);
  const news = visibleAnnouncements().slice(0, 3);
  const newsImages = await announcementImageURLs(news);
  app.innerHTML = `
    <section class="hero learning-hero"><div class="grow"><span class="eyebrow">${esc(u.dept || ROLE[u.role])} <span aria-hidden="true">·</span> NÍVEL ${li.level}</span>
      <h1>Oi, ${esc(u.name.split(' ')[0])}!<br>O que vamos aprender <span>hoje?</span></h1>
      <p class="hero-subtitle">Seu próximo passo está mais perto do que parece.</p>
      <div class="hero-progress"><div class="spread small"><span>${li.title} · ${u.xp} XP</span><span>${li.next - u.xp} XP para o nível ${li.level + 1}</span></div><div class="bar"><span style="width:${li.pct}%"></span></div></div></div>
      <div class="hero-actions"><div class="hero-streak">${st.streak ? `🔥 ${st.streak} dia${st.streak > 1 ? 's' : ''} seguidos` : '✳ Seu ritmo, sua jornada'}</div>
        <button class="btn gold" data-action="checkin" ${checked ? 'disabled' : ''}>${checked ? 'Check-in feito hoje ✓' : `Fazer check-in · +${S.settings.dailyBonus} pts`}</button><a class="hero-store-link" href="#/store">Explorar a loja <span aria-hidden="true">↗</span></a></div></section>
    <div class="grid sm" style="margin-bottom:20px">
      <div class="stat"><b>${u.points}</b><span>Pontos disponíveis</span></div><div class="stat"><b>${pend.length}</b><span>Cursos em andamento</span></div>
      <div class="stat"><b>${st.courses}</b><span>Cursos concluídos</span></div><div class="stat"><b>${st.lessons}</b><span>Aulas concluídas</span></div>
      <div class="stat"><b>${u.badges.length}/${BADGES.length}</b><span>Conquistas</span></div></div>
    ${isAdmin() && !S.courses.length ? panel('<h2>Plataforma vazia</h2><p class="muted">Quer ver tudo funcionando? Carregue cursos, produtos e alunos de exemplo (você pode apagar depois).</p><button class="btn" data-action="seed">Carregar dados de demonstração</button>') : ''}
    ${duty.length ? panel(`<div class="section-heading"><div><span class="eyebrow">NA SUA JORNADA</span><h2>Obrigatórios pendentes</h2></div></div>${duty.map((x) => `<div class="spread course-row"><div><a href="#/course/${x.c.id}"><strong>${esc(x.c.title)}</strong></a><div class="muted small">${x.p.done}/${x.p.total} aulas${x.p.quizOk ? '' : ' · prova pendente'}</div></div>${dueTag(dueOf(x.e, x.c))}</div>`).join('')}`) : ''}
    ${cont ? panel(`<div class="section-heading"><div><span class="eyebrow">RETOME DE ONDE PAROU</span><h2>Continue aprendendo</h2></div><a class="text-link" href="#/mine">Ver meus cursos ↗</a></div><div class="continue-card"><div class="continue-art"><span>${esc(cont.c.emoji || '✳')}</span></div><div class="continue-info"><span class="tag">${esc(cont.c.area || CAT[cont.c.category])}</span><h3>${esc(cont.c.title)}</h3><div class="bar"><span style="width:${cont.p.pct}%"></span></div><div class="muted small">${cont.p.pct}% concluído · ${cont.p.done} de ${cont.p.total} aulas</div></div><a class="btn" href="#/course/${cont.c.id}">Continuar <span aria-hidden="true">→</span></a></div>`) : ''}
    <section class="home-discovery-grid ${recs.length ? '' : 'updates-only'}">
      <div class="home-course-discovery">${recs.length ? `<div class="section-heading"><div><span class="eyebrow">FEITO PARA VOCÊ</span><h2>Descubra seu próximo curso</h2></div><a class="text-link" href="#/courses">Ver catálogo ↗</a></div><div class="grid" style="margin-bottom:28px">${recs.map((c) => courseCard(c, u)).join('')}</div>` : ''}</div>
      <aside class="updates-wall" aria-labelledby="updates-wall-title">
        <div class="updates-wall-heading"><div><span class="eyebrow">NOVIDADES</span><h2 id="updates-wall-title">Atualizações da academia</h2></div><span class="updates-count">${news.length}</span></div>
        <div class="updates-wall-list">${news.length ? news.map((item) => announcementCard(item, newsImages.get(String(item.id)))).join('') : '<p class="updates-empty">Ainda não há novidades publicadas.</p>'}</div>
        <a class="updates-all-link" href="#/updates">Ver todas as novidades <span aria-hidden="true">→</span></a>
      </aside>
    </section>
    <section class="achievement-section"><div class="achievement-heading"><div><span class="eyebrow">CADA CONQUISTA CONTA</span><h2>Suas conquistas</h2><p>Aprender também é colecionar pequenas vitórias.</p></div><span class="achievement-total"><strong>${u.badges.length}</strong><span>de ${BADGES.length}<br>conquistas</span></span></div>
      <div class="badges achievement-grid">${BADGES.map((b) => { const earned = u.badges.includes(b.id); return `<article class="badge achievement-card badge-${b.id} ${earned ? 'earned' : 'locked'}"><div class="badge-medal"><span class="badge-medal-shine"></span><span class="ic">${b.icon}</span><span class="badge-check" aria-hidden="true">${earned ? '✓' : '·'}</span></div><strong>${b.name}</strong><div class="muted small">${b.desc}</div><span class="badge-status">${earned ? 'Conquistada' : 'Continue aprendendo'}</span></article>`; }).join('')}</div></section>`;
};
ACTIONS.checkin = async () => { const t = LOCAL_MODE ? checkin(me().id) : await rpc('daily_checkin'); if (t) toast(`Check-in feito! +${t} pontos`); renderChrome(); rerender(); };
ACTIONS.seed = async () => { need('admin'); await seedDemo(); toast('Cursos, aulas e produtos de demonstração carregados.'); rerender(); };

VIEWS.updates = async () => {
  await refreshAnnouncements();
  const items = visibleAnnouncements();
  const images = await announcementImageURLs(items);
  app.innerHTML = `<div class="updates-history">
    <div class="page-head"><div><span class="eyebrow">ACADEMIA CORPORATIVA</span><h1>Atualizações</h1><p class="muted">Novidades, comunicados e melhorias da plataforma.</p></div><a class="btn ghost" href="#/home">Voltar ao início</a></div>
    ${items.length ? `<div class="updates-history-list">${items.map((item) => announcementCard(item, images.get(String(item.id)))).join('')}</div>` : '<div class="panel empty"><h2>Nenhuma novidade publicada</h2><p class="muted">Quando houver atualizações, elas aparecerão aqui.</p></div>'}
  </div>`;
};

// ---------- CATÁLOGO DE CURSOS ("Cursos" e "Meus cursos") ----------
let catalogMode = 'all';
VIEWS.courses = () => { catalogMode = 'all'; viewCatalog(); };
VIEWS.mine = () => { catalogMode = 'mine'; viewCatalog(); };
// Aplica busca, filtros e ordenação.
function filterCourses(u) {
  const f = FILTERS.C; let L = visibleCourses(u);
  if (catalogMode === 'mine') L = L.filter((c) => isEnrolled(u.id, c.id));
  const q = f.q.toLowerCase().trim(); if (q) L = L.filter((c) => `${c.title} ${c.description} ${c.area} ${c.instructor}`.toLowerCase().includes(q));
  if (f.cat) L = L.filter((c) => c.category === f.cat); if (f.area) L = L.filter((c) => c.area === f.area); if (f.level) L = L.filter((c) => c.level === f.level);
  const st = { inscritos: (c) => isEnrolled(u.id, c.id), nao: (c) => !isEnrolled(u.id, c.id), andamento: (c) => isEnrolled(u.id, c.id) && !courseProg(u.id, c.id).complete && courseProg(u.id, c.id).done > 0,
    concluidos: (c) => courseProg(u.id, c.id).complete, obrigatorios: (c) => c.mandatory, favoritos: (c) => isFav(u.id, c.id) }[f.status];
  if (st) L = L.filter(st);
  const by = { recent: (a, b) => b.createdAt - a.createdAt, title: (a, b) => a.title.localeCompare(b.title), popular: (a, b) => S.enrollments.filter((e) => e.courseId === b.id).length - S.enrollments.filter((e) => e.courseId === a.id).length, rating: (a, b) => avgRating(b.id).avg - avgRating(a.id).avg }[f.sort];
  return L.sort(by);
}
const courseListHTML = () => {
  const u = me(), L = filterCourses(u), count = $('course-result-count');
  if (count) count.textContent = `${L.length} ${L.length === 1 ? 'curso encontrado' : 'cursos encontrados'}`;
  const grid = $('course-list');
  if (grid) grid.classList.toggle('single-course-grid', L.length === 1);
  return L.length ? L.map((c, i) => courseCard(c, u, i === 0)).join('') : `<div class="panel empty" style="grid-column:1/-1">${catalogMode === 'mine' ? 'Você ainda não está inscrito em nenhum curso (ou nenhum bate com o filtro).' : 'Nenhum curso encontrado.'}</div>`;
};
REFRESH.C = () => { $('course-list').innerHTML = courseListHTML(); };
function viewCatalog() {
  const f = FILTERS.C, areas = [...new Set(S.courses.map((c) => c.area).filter(Boolean))].sort();
  const total = catalogMode === 'mine' ? S.enrollments.filter((e) => e.userId === me().id).length : visibleCourses(me()).filter((c) => c.status === 'publicado' || isEnrolled(me().id, c.id)).length;
  const resultCount = filterCourses(me()).length;
  app.innerHTML = `<section class="catalog-banner ${catalogMode === 'mine' ? 'my-learning-banner' : ''}">
      <div class="catalog-banner-copy"><span class="catalog-kicker"><span class="catalog-kicker-dot"></span>${catalogMode === 'mine' ? 'SUA ÁREA DE APRENDIZADO' : 'CONHECIMENTO PARA IR ALÉM'}</span>
        <h1>${catalogMode === 'mine' ? 'Sua próxima conquista está aqui.' : 'Aprenda algo que move você.'}</h1>
        <p>${catalogMode === 'mine' ? 'Retome seu ritmo, acompanhe seu progresso e celebre cada etapa.' : 'Conteúdos práticos para abrir caminhos e transformar o seu dia a dia.'}</p>
        <div class="catalog-proof"><span class="catalog-proof-mark">✳</span><span><strong>${total}</strong> ${total === 1 ? 'jornada de aprendizado' : 'jornadas de aprendizado'}<small>no seu tempo, do seu jeito</small></span></div>
      </div>
      <div class="catalog-banner-art" aria-hidden="true"><div class="catalog-art-disc"></div><div class="catalog-art-ring"></div><span class="catalog-art-spark spark-one">✳</span><span class="catalog-art-spark spark-two">✦</span><span class="catalog-art-book">${catalogMode === 'mine' ? '✓' : '↗'}</span><span class="catalog-art-word">VAI<br>ALÉM</span></div>
      ${isStaff() ? '<button class="btn catalog-create" data-action="course-new">+ Criar curso</button>' : ''}</section>
    <div class="catalog-tools"><label class="catalog-search"><span aria-hidden="true">⌕</span><input data-filter="C.q" value="${esc(f.q)}" placeholder="Busque por curso, tema ou instrutor..."></label>
      <details class="course-filters"><summary><span aria-hidden="true">☷</span> Filtrar e ordenar</summary><div class="course-filter-grid">
        ${fsel('Tipo de conteúdo', 'C.cat', [['', 'Todos os tipos'], ['curso', 'Cursos'], ['padrao_servico', 'Padrões de serviço']], f.cat)}
        ${fsel('Área', 'C.area', [['', 'Todas as áreas'], ...areas.map((a) => [a, a])], f.area)}
        ${fsel('Nível', 'C.level', [['', 'Todos os níveis'], ...Object.entries(LEVELS)], f.level)}
        ${fsel('Seu progresso', 'C.status', [['', 'Todas as situações'], ['andamento', 'Em andamento'], ['concluidos', 'Concluídos'], ['obrigatorios', 'Obrigatórios'], ['favoritos', 'Favoritos'], ...(catalogMode === 'all' ? [['inscritos', 'Inscrito'], ['nao', 'Não inscrito']] : [])], f.status)}
        ${fsel('Ordenar por', 'C.sort', [['recent', 'Mais recentes'], ['title', 'Título (A-Z)'], ['popular', 'Mais populares'], ['rating', 'Melhor avaliados']], f.sort)}</div></details>
    </div>
    <div class="catalog-results-heading"><div><span class="eyebrow">${catalogMode === 'mine' ? 'CONTINUE DE ONDE PAROU' : 'ESCOLHA SEU PRÓXIMO PASSO'}</span><h2>${catalogMode === 'mine' ? 'Seus cursos' : 'Um mundo de possibilidades'}</h2></div><span class="catalog-result-count" id="course-result-count"></span></div>
    <div class="grid course-grid" id="course-list">${courseListHTML()}</div>`;
  $('course-result-count').textContent = `${resultCount} ${resultCount === 1 ? 'curso encontrado' : 'cursos encontrados'}`;
  $('course-list').classList.toggle('single-course-grid', resultCount === 1);
}
// Cartão de curso (clicável). O botão de favorito tem ação própria.
function courseCard(c, u, featured = false) {
  const en = enrollment(u.id, c.id), p = courseProg(u.id, c.id), r = avgRating(c.id), fav = isFav(u.id, c.id);
  const area = c.area || 'FORMAÇÃO CONTÍNUA';
  return `<article class="card course course-card ${featured ? 'course-featured' : ''}" data-action="go" data-href="#/course/${c.id}">
    <div class="course-cover" style="--h:${hue(c.id)}">
      <div class="course-cover-decoration" aria-hidden="true"></div>
      <div class="course-cover-top"><span class="course-cover-type">${esc(CAT[c.category] || 'Curso')}</span><button class="fav ${fav ? 'on' : ''}" data-action="fav" data-id="${c.id}" aria-label="${fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${fav ? '★' : '☆'}</button></div>
      <div class="course-cover-main"><span class="course-cover-area">${esc(area)}</span><h3>${esc(c.title)}</h3><span class="course-cover-lessons">${p.total} AULA${p.total === 1 ? '' : 'S'} <i></i> ${fmtDur(courseHours(c.id))}</span></div>
      <div class="course-cover-art" aria-hidden="true"><span>${esc(c.emoji || '📘')}</span></div>
      <span class="course-cover-index" aria-hidden="true">${String((c.id % 99) + 1).padStart(2, '0')}</span>
    </div>
    <div class="course-card-body">
      <div class="course-card-tags">${tag(LEVELS[c.level] || 'Todos os níveis', 'course-level')}${c.mandatory ? tag('Obrigatório', 'course-required') : ''}${c.status !== 'publicado' ? tag('Rascunho', 'warn') : ''}${p.complete ? tag('Concluído ✓', 'ok') : ''}</div>
      <p class="course-description">${esc(c.description || 'Conteúdo prático para você desenvolver novas habilidades e avançar na sua jornada profissional.')}</p>
      ${en ? `<div class="course-progress"><div class="spread small"><span>${p.pct}% concluído</span>${dueTag(dueOf(en, c), p.complete)}</div><div class="bar"><span style="width:${p.pct}%"></span></div></div>` : ''}
      <div class="course-card-footer"><span>${r.n ? `★ ${r.avg.toFixed(1)} <i>·</i> ${r.n} avaliação${r.n === 1 ? '' : 'ões'}` : esc(c.instructor || 'Academia Corporativa')}</span><a href="#/course/${c.id}" class="course-open-link">${en ? 'Continuar' : 'Conhecer curso'} <span aria-hidden="true">→</span></a></div>
    </div>
  </article>`;
}
ACTIONS.go = (d) => { location.hash = d.href; };
ACTIONS.fav = (d) => { const u = me(), id = Number(d.id); S.favorites = isFav(u.id, id) ? S.favorites.filter((f) => !(f.userId === u.id && f.courseId === id)) : [...S.favorites, { userId: u.id, courseId: id }]; save(); rerender(); };
function refreshAvatarBuilder(builder, form) {
  const avatar = avatarFromForm(form);
  builder.querySelector('.avatar-preview-art').innerHTML = avatarSVG(avatar);
  builder.querySelectorAll('.avatar-choice').forEach((choice) => {
    const selected = avatar[choice.dataset.key] === choice.dataset.value;
    choice.classList.toggle('selected', selected);
    choice.setAttribute('aria-pressed', String(selected));
    const optionArt = choice.querySelector('.avatar-option-art');
    if (optionArt) optionArt.innerHTML = avatarSVG({ ...avatar, [choice.dataset.key]: choice.dataset.value });
  });
}
ACTIONS['avatar-pick'] = (d, el) => {
  if (!Object.hasOwn(AVATAR_OPTIONS, d.key)) fail('Esta opção de personagem não existe.');
  const option = AVATAR_OPTIONS[d.key].find(([id]) => id === d.value);
  if (!option) fail('Esta aparência não está disponível.');
  const builder = el.closest('.avatar-builder'), form = el.closest('form');
  if (!builder || !form) fail('Não foi possível atualizar o personagem.');
  const input = form.elements[`avatar_${d.key}`];
  if (!input) fail('Campo do personagem não encontrado.');
  input.value = d.value;
  refreshAvatarBuilder(builder, form);
};
ACTIONS['avatar-randomize'] = (d, el) => {
  const builder = el.closest('.avatar-builder'), form = el.closest('form');
  if (!builder || !form) fail('Não foi possível sortear o personagem.');
  Object.entries(AVATAR_OPTIONS).forEach(([key, options]) => {
    form.elements[`avatar_${key}`].value = options[Math.floor(Math.random() * options.length)][0];
  });
  refreshAvatarBuilder(builder, form);
};

// Biblioteca central: lista vídeos dos cursos acessíveis e abre a aula selecionada.
VIEWS.videos = () => {
  const u = me();
  const videos = S.lessons.filter((l) => ['video', 'link'].includes(l.type) && (isStaff() || isEnrolled(u.id, l.courseId)))
    .map((l) => ({ l, c: course(l.courseId) })).filter((x) => x.c)
    .sort((a, b) => a.c.title.localeCompare(b.c.title) || a.l.position - b.l.position);
  app.innerHTML = `<div class="page-head"><div><h1>Vídeos</h1><p class="muted">Aulas em vídeo disponíveis nos seus cursos.</p></div><span class="muted small">${videos.length} ${videos.length === 1 ? 'vídeo' : 'vídeos'}</span></div>
    ${videos.length ? `<div class="grid">${videos.map(({ l, c }) => {
      const w = S.watch[u.id + ':' + l.id], pct = w?.dur ? Math.min(100, Math.round((covered(w.ranges || []) / w.dur) * 100)) : 0;
      return `<article class="card"><div class="spread"><span class="tag">${l.type === 'video' ? 'Arquivo de vídeo' : 'Vídeo por link'}</span><span class="muted small">${l.duration ? fmtDur(l.duration) : 'Duração não informada'}</span></div>
        <h2>${esc(l.title)}</h2><p class="muted small">${esc(c.title)}${l.module ? ` · ${esc(l.module)}` : ''}</p>
        ${pct ? `<div class="bar" aria-label="${pct}% assistido"><span style="width:${pct}%"></span></div><span class="muted small">${pct}% assistido</span>` : ''}
        <button class="btn" data-action="watch-video" data-id="${l.id}">▶ ${w?.pos > 0 ? 'Continuar reprodução' : 'Reproduzir vídeo'}</button></article>`;
    }).join('')}</div>` : `<div class="panel empty"><h2>Nenhum vídeo disponível</h2><p>${isStaff() ? 'Adicione aulas do tipo vídeo ou link aos cursos para que apareçam aqui.' : 'Inscreva-se em um curso com aulas em vídeo para encontrá-las aqui.'}</p>${isStaff() && S.courses.length ? `<a class="btn" href="#/admin/courses">Gerenciar cursos</a>` : ''}</div>`}`;
};
ACTIONS['watch-video'] = (d) => {
  const l = lesson(d.id);
  if (!l || (!isStaff() && !isEnrolled(me().id, l.courseId))) fail('Este vídeo não está disponível para sua conta.');
  curCourse = l.courseId; courseTab = 'aulas'; curLesson = l.id; go('#/course/' + l.courseId);
};

// ---------- PÁGINA DO CURSO ----------
let courseTab = 'aulas', curLesson = null, curCourse = null; // aba aberta, aula tocando e curso atual
// Em cursos "sequenciais" a aula só abre depois de concluir a anterior.
const lockedLesson = (l, ls, u, c) => { const i = ls.findIndex((x) => x.id === l.id); return c.sequential && !isStaff() && i > 0 && !isDone(u.id, ls[i - 1].id); };

VIEWS.course = async (id) => {
  id = Number(id); const c = course(id); if (!c) fail('Curso não encontrado.');
  const u = me(), staff = isStaff();
  if (c.status !== 'publicado' && !staff && !isEnrolled(u.id, id)) fail('Este curso não está disponível.');
  if (curCourse !== id) { curCourse = id; courseTab = 'aulas'; curLesson = null; }
  const en = enrollment(u.id, id), canView = !!en || staff, ls = lessonsOf(id), p = courseProg(u.id, id), cert = certOf(u.id, id), q = quizOf(id), r = avgRating(id);
  const pre = c.prereq ? course(c.prereq) : null, preOk = !pre || staff || !!certOf(u.id, pre.id);
  // Escolhe a aula aberta: a primeira não concluída e liberada.
  if (!curLesson || !lesson(curLesson) || lesson(curLesson).courseId !== id || lockedLesson(lesson(curLesson), ls, u, c)) curLesson = (ls.find((l) => !isDone(u.id, l.id) && !lockedLesson(l, ls, u, c)) || ls[0] || {}).id || null;
  const mine = S.ratings.find((x) => x.userId === u.id && x.courseId === id)?.stars || 0;
  const tabs = [['aulas', 'Aulas'], ['sobre', 'Sobre e materiais'], ['discussao', `Discussão (${S.comments.filter((x) => x.courseId === id).length})`], ...(q ? [['prova', 'Prova']] : [])];
  const body = courseTab === 'sobre' ? tabSobre(c, canView) : courseTab === 'discussao' ? tabDiscussao(c, u, canView) : courseTab === 'prova' && q ? tabProva(c, u, canView, p) : tabAulas(c, ls, u, canView, preOk, pre);
  app.innerHTML = `<div class="panel"><div class="spread" style="align-items:flex-start"><div style="flex:1 1 380px">
      <div class="tags">${tag(CAT[c.category], c.category === 'padrao_servico' ? 'service' : '')}${c.mandatory ? tag('Obrigatório', 'bad') : ''}${c.sequential ? tag('Aulas em sequência') : ''}${c.status !== 'publicado' ? tag('Rascunho', 'warn') : ''}${tag(LEVELS[c.level] || '')}</div>
      <h1 style="margin-top:8px">${esc(c.emoji || '')} ${esc(c.title)}</h1><p class="muted">${esc(c.description)}</p>
      <div class="muted small">👤 ${esc(c.instructor || '—')} · 🏷 ${esc(c.area || 'Geral')} · ⏱ ${fmtDur(courseHours(id))} · 👥 ${S.enrollments.filter((e) => e.courseId === id).length} inscritos · 🎯 +${c.bonus} pontos ao concluir</div>
      <div class="stars" style="margin-top:6px">${r.n ? `<strong>★ ${r.avg.toFixed(1)}</strong> <span class="muted small">(${r.n})</span> ` : '<span class="muted small">Sem avaliações </span>'}${en ? [1, 2, 3, 4, 5].map((n) => `<button class="${n <= mine ? 'on' : ''}" data-action="rate" data-id="${id}" data-stars="${n}" aria-label="${n} estrelas">★</button>`).join('') : ''}</div></div>
      <div class="actions">${!en && !staff ? `<button class="btn" data-action="enroll" data-id="${id}" ${preOk ? '' : 'disabled'}>Inscrever-me</button>` : ''}${en && !staff ? `<button class="btn ghost small" data-action="unenroll" data-id="${id}">Cancelar inscrição</button>` : ''}
        <button class="btn ghost small" data-action="fav" data-id="${id}">${isFav(u.id, id) ? '★ Favorito' : '☆ Favoritar'}</button>
        ${staff ? `<button class="btn ghost small" data-action="course-edit" data-id="${id}">Editar curso</button><button class="btn ghost small" data-action="quiz-edit" data-id="${id}">${q ? 'Editar prova' : 'Criar prova'}</button><button class="btn ghost small" data-action="assign-open" data-id="${id}">Atribuir</button><button class="btn ghost small" data-action="course-publish" data-id="${id}">${c.status === 'publicado' ? 'Despublicar' : 'Publicar'}</button>` : ''}</div></div>
      ${pre && !preOk ? `<div class="notice" style="margin-top:12px">Pré-requisito: conclua primeiro <a href="#/course/${pre.id}">${esc(pre.title)}</a>.</div>` : ''}
      ${en ? `<div style="margin-top:14px"><div class="bar"><span id="prog-bar" style="width:${p.pct}%"></span></div><div class="actions small muted" style="margin-top:4px"><span id="prog-text">${p.done}/${p.total} aulas · ${p.pct}%</span>${q ? (p.quizOk ? tag('Prova aprovada ✓', 'ok') : tag('Prova pendente', 'warn')) : ''}${dueTag(dueOf(en, c), p.complete)}${cert ? `<a class="btn gold small" href="#/certificate/${cert.code}">🎓 Ver certificado</a>` : ''}</div></div>` : ''}</div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${courseTab === k ? 'on' : ''}" data-action="ctab" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
  if (courseTab === 'aulas') await setupMedia();
};
ACTIONS.ctab = (d) => { courseTab = d.tab; rerender(); };
ACTIONS.enroll = async (d) => {
  const u = me(), c = course(d.id), pre = c.prereq ? course(c.prereq) : null;
  if (pre && !isStaff() && !certOf(u.id, pre.id)) fail(`Conclua antes: ${pre.title}`);
  const added = !isEnrolled(u.id, c.id);
  if (added && LOCAL_MODE) S.enrollments.push({ userId: u.id, courseId: c.id, at: Date.now(), dueDate: '' });
  audit(`Inscrição: ${c.title}`);
  if (added && !LOCAL_MODE) await rpc('enroll_in_course', { p_course_id: String(c.id) }); // o servidor valida curso publicado e pré-requisito
  save(); toast('Inscrição feita!'); rerender();
};
ACTIONS.unenroll = async (d) => { if (!confirm('Cancelar sua inscrição? Seu progresso é mantido.')) return; const u = me(); if (LOCAL_MODE) { S.enrollments = S.enrollments.filter((e) => !(e.userId === u.id && e.courseId === Number(d.id))); save(); } else await rpc('unenroll_from_course', { p_course_id: String(d.id) }); rerender(); };
ACTIONS.rate = (d) => { const u = me(), id = Number(d.id); S.ratings = S.ratings.filter((x) => !(x.userId === u.id && x.courseId === id)); S.ratings.push({ userId: u.id, courseId: id, stars: Number(d.stars) }); save(); toast('Obrigado pela avaliação!'); rerender(); };

// Aba AULAS: player (ou texto) à esquerda e lista de aulas por módulo à direita.
function tabAulas(c, ls, u, canView, preOk, pre) {
  const staff = isStaff();
  if (!ls.length) return panel('<div class="empty">Este curso ainda não tem aulas.</div>' + (staff ? `<div style="text-align:center"><button class="btn" data-action="lesson-new" data-id="${c.id}">+ Adicionar aula</button></div>` : ''));
  let lastMod = null;
  const items = ls.map((x) => {
    let h = ''; const mod = x.module || ''; if (mod !== lastMod) { h = `<li class="mod">${esc(mod || 'Aulas')}</li>`; lastMod = mod; }
    const lk = lockedLesson(x, ls, u, c), dn = isDone(u.id, x.id);
    return h + `<li class="l ${dn ? 'done' : ''} ${x.id === curLesson ? 'active' : ''} ${lk ? 'locked' : ''}" data-action="lesson" data-id="${x.id}"><span class="check">${dn ? '✓' : lk ? '🔒' : ''}</span>
      <span>${ICON[x.type] || ''} ${esc(x.title)}</span><span class="pts">${x.duration ? x.duration + ' min · ' : ''}+${x.points}</span>
      ${staff ? `<button class="btn ghost small" data-action="lesson-up" data-id="${x.id}" aria-label="Subir">↑</button><button class="btn ghost small" data-action="lesson-down" data-id="${x.id}" aria-label="Descer">↓</button><button class="btn ghost small" data-action="lesson-edit" data-id="${x.id}" aria-label="Editar">✎</button><button class="btn danger small" data-action="lesson-del" data-id="${x.id}" aria-label="Excluir">✕</button>` : ''}</li>`;
  }).join('');
  const main = canView ? lessonView(c, ls, lesson(curLesson), u) : panel(`<div class="empty"><p>Inscreva-se para assistir às aulas e ganhar pontos.</p><button class="btn" data-action="enroll" data-id="${c.id}" ${preOk ? '' : 'disabled'}>Inscrever-me</button></div>`);
  return `<div class="course-layout"><div>${main}</div><aside class="panel"><div class="spread"><h3>Aulas (${ls.length})</h3>${staff ? `<button class="btn small" data-action="lesson-new" data-id="${c.id}">+ Aula</button>` : ''}</div><ul class="lessons">${items}</ul></aside></div>`;
}
// Conteúdo da aula aberta: vídeo, YouTube ou texto, botões e anotações.
function lessonView(c, ls, l, u) {
  const dn = isDone(u.id, l.id), next = ls[ls.findIndex((x) => x.id === l.id) + 1], yt = l.type === 'link' ? ytId(l.url) : '';
  const tracked = l.type === 'video' || (l.type === 'link' && !yt); // só vídeos próprios/diretos têm controle de quanto foi assistido
  const media = l.type === 'texto' ? `<article class="panel prose">${renderText(l.content || '')}</article>`
    : yt ? `<iframe class="player" src="https://www.youtube-nocookie.com/embed/${yt}" allowfullscreen title="${esc(l.title)}"></iframe>`
    : `<video id="player" class="player" controls controlsList="nodownload" preload="metadata" data-lesson="${l.id}"></video>`;
  return media + `<div class="panel" style="margin-top:16px"><div class="spread"><div><h2>${esc(l.title)}</h2><div class="muted small">${esc(l.module || '')} · +${l.points} pontos</div></div>
    <div class="actions" id="lesson-actions">${dn ? tag('Concluída ✓', 'ok') : tracked && !isStaff() ? `<span class="muted small">Conclui sozinha ao assistir ${S.settings.minWatchPct}%</span>` : `<button class="btn" data-action="complete" data-id="${l.id}">Marcar como concluída</button>`}
      ${next ? `<button class="btn ghost" data-action="lesson-next" data-id="${next.id}">Próxima aula →</button>` : ''}</div></div>
    ${tracked ? '<label class="small">Velocidade <select data-speed style="width:auto;display:inline-block"><option>0.75</option><option selected>1</option><option>1.25</option><option>1.5</option><option>2</option></select></label>' : ''}
    <label>Minhas anotações (salvas automaticamente)<textarea data-note="${l.id}" placeholder="Escreva aqui...">${esc(S.notes[u.id + ':' + l.id] || '')}</textarea></label></div>`;
}
// Liga o vídeo: carrega o arquivo, retoma de onde parou e controla o quanto foi assistido (anti-pulo).
async function setupMedia() {
  const v = $('player'); if (!v) return;
  const lid = Number(v.dataset.lesson), l = lesson(lid), u = me();
  if (l.type === 'video') {
    if (l.filePath && !LOCAL_MODE) {
      const { data, error } = await backend.storage.from('course-videos').createSignedUrl(l.filePath, 3600);
      if (error) { toast(error.message, true); return; } mediaUrl = data.signedUrl; v.src = mediaUrl;
    } else {
      const blob = l.fileId ? await idbGet(l.fileId) : null;
      if (!blob) { toast('Arquivo de vídeo não encontrado neste navegador.', true); return; }
      mediaUrl = URL.createObjectURL(blob); v.src = mediaUrl;
    }
  }
  else v.src = l.url;
  const key = u.id + ':' + lid, w = S.watch[key] || (S.watch[key] = { pos: 0, ranges: [], dur: 0 });
  let last = 0, lastSave = 0;
  const enough = () => w.dur && (covered(w.ranges) / w.dur) * 100 >= S.settings.minWatchPct;
  v.addEventListener('loadedmetadata', () => { w.dur = v.duration; if (w.pos > 3 && w.pos < v.duration - 5) v.currentTime = w.pos; last = v.currentTime; });
  v.addEventListener('seeking', () => { last = v.currentTime; });
  v.addEventListener('timeupdate', () => {
    const t = v.currentTime; if (!v.seeking && t >= last && t - last < 2) addRange(w.ranges, Math.floor(last), Math.ceil(t));
    last = t; w.pos = t; w.dur = v.duration || w.dur;
    if (Date.now() - lastSave > 5000) { save(); lastSave = Date.now(); }
    if (!isDone(u.id, lid) && enough()) finishLesson(lid);
  });
  v.addEventListener('pause', save);
  v.addEventListener('ended', () => { save(); if (!isDone(u.id, lid) && !enough()) toast(`Assista pelo menos ${S.settings.minWatchPct}% da aula (sem pular trechos) para concluir.`, true); });
  v.addEventListener('ratechange', () => {});
}
// Conclui a aula e atualiza a tela sem interromper o vídeo.
const finishingLessons = new Set(); // evita enviar a mesma conclusão várias vezes enquanto o servidor responde
async function finishLesson(lid) {
  let r;
  if (LOCAL_MODE) r = completeLesson(me().id, lid);
  else {
    if (isDone(me().id, lid) || finishingLessons.has(lid)) return;
    finishingLessons.add(lid);
    try {
      const res = await rpc('complete_lesson', { p_lesson_id: String(lid) });
      r = { earned: Number(res?.earned) || 0, cert: res?.certificate || null };
      finishingLessons.delete(lid);
    } catch (error) { setTimeout(() => finishingLessons.delete(lid), 15000); throw error; } // não repete a chamada a cada tique do vídeo
  }
  const u = me(); if (!r) return;
  toast(r.earned ? `Aula concluída! +${r.earned} pontos` : 'Aula concluída!'); if (r.cert) setTimeout(() => toast('🎓 Curso concluído! Seu certificado foi emitido.'), 2600);
  const li = document.querySelector(`.lessons li[data-id="${lid}"]`); if (li) { li.classList.add('done'); li.querySelector('.check').textContent = '✓'; }
  const p = courseProg(u.id, lesson(lid).courseId); if ($('prog-bar')) { $('prog-bar').style.width = p.pct + '%'; $('prog-text').textContent = `${p.done}/${p.total} aulas · ${p.pct}%`; }
  const a = $('lesson-actions'); if (a && !a.querySelector('.tag')) a.insertAdjacentHTML('afterbegin', tag('Concluída ✓', 'ok'));
  renderChrome();
}
ACTIONS.lesson = (d) => { const l = lesson(d.id), c = course(l.courseId); if (lockedLesson(l, lessonsOf(c.id), me(), c)) return toast('Conclua a aula anterior para liberar esta.', true); curLesson = l.id; rerender(); };
ACTIONS['lesson-next'] = (d) => { const l = lesson(d.id), c = course(l.courseId); if (lockedLesson(l, lessonsOf(c.id), me(), c)) return toast('Conclua esta aula para liberar a próxima.', true); curLesson = l.id; rerender(); window.scrollTo(0, 0); };
ACTIONS.complete = async (d) => { await finishLesson(Number(d.id)); rerender(); };

// Aba SOBRE E MATERIAIS: descrição completa e arquivos de apoio para baixar.
function tabSobre(c, canView) {
  const mats = c.materials || [];
  return panel(`<h2>Sobre o curso</h2><div class="prose">${renderText(c.description)}</div>${c.objectives ? `<h3>Objetivos</h3><div class="prose">${renderText(c.objectives)}</div>` : ''}`)
    + panel(`<h2>Materiais de apoio</h2>${mats.length ? `<ul>${mats.map((m) => `<li>${esc(m.name)} <span class="muted small">(${Math.max(1, Math.round(m.size / 1024))} KB)</span> ${canView ? `<button class="btn small ghost" data-action="mat-dl" data-id="${c.id}" data-mid="${m.id}">Baixar</button>` : ''}${isStaff() ? ` <button class="btn small danger" data-action="mat-del" data-id="${c.id}" data-mid="${m.id}">Excluir</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhum material enviado.</p>'}
      ${isStaff() ? `<form data-form="material" data-id="${c.id}" class="row"><label>Nome do material<input name="name" required></label><label>Arquivo<input type="file" name="file" required></label><div><button class="btn" type="submit">Enviar material</button></div></form>` : ''}`);
}
FORMS.material = async (d, form) => {
  need('staff'); const c = course(form.dataset.id), f = form.file.files[0]; if (!f) fail('Escolha um arquivo.');
  const id = nid(), filename = f.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'arquivo';
  let filePath = null, fileId = id;
  if (LOCAL_MODE) await idbPut(fileId, f);
  else {
    filePath = `${c.id}/${id}/${filename}`;
    const { error } = await backend.storage.from('course-materials').upload(filePath, f, { contentType: f.type, upsert: false });
    if (error) fail(error.message);
    fileId = null;
  }
  (c.materials = c.materials || []).push({ id, name: d.name.trim() || f.name, filePath, fileId, size: f.size, type: f.type });
  save(); toast('Material enviado.'); rerender();
};
ACTIONS['mat-dl'] = async (d) => {
  const m = course(d.id).materials.find((x) => x.id === Number(d.mid));
  if (m.filePath && !LOCAL_MODE) {
    const { data, error } = await backend.storage.from('course-materials').createSignedUrl(m.filePath, 300);
    if (error) fail(error.message); const response = await fetch(data.signedUrl); if (!response.ok) fail('Não foi possível baixar o material.');
    downloadBlob(m.name, await response.blob());
  } else { const blob = await idbGet(m.fileId); if (!blob) fail('Arquivo não encontrado neste navegador.'); downloadBlob(m.name, blob); }
};
ACTIONS['mat-del'] = async (d) => {
  need('staff'); if (!confirm('Excluir este material?')) return;
  const c = course(d.id), m = c.materials.find((x) => x.id === Number(d.mid));
  if (m.filePath && !LOCAL_MODE) { const { error } = await backend.storage.from('course-materials').remove([m.filePath]); if (error) fail(error.message); }
  if (m.fileId) await idbDel(m.fileId); c.materials = c.materials.filter((x) => x !== m); save(); rerender();
};

// Aba DISCUSSÃO: perguntas e respostas do curso.
function tabDiscussao(c, u, canView) {
  const cs = S.comments.filter((x) => x.courseId === c.id), top = cs.filter((x) => !x.parentId).sort((a, b) => b.at - a.at);
  const one = (x, reply) => { const a = user(x.userId) || { id: 0, name: 'Usuário removido' };
    return `<div class="comment ${reply ? 'reply' : ''}">${avatar(a, 'sm')}<div style="flex:1"><strong>${esc(a.name)}</strong> ${a.role && a.role !== 'aluno' ? tag(ROLE[a.role]) : ''} <span class="muted small">${fmtDate(x.at)}</span>
      <div>${esc(x.text).replace(/\n/g, '<br>')}</div><div class="actions">${canView && !reply ? `<button class="btn ghost small" data-action="reply" data-id="${x.id}" data-course="${c.id}">Responder</button>` : ''}${x.userId === u.id || isStaff() ? `<button class="btn danger small" data-action="comment-del" data-id="${x.id}">Excluir</button>` : ''}</div></div></div>`; };
  return panel(`<h2>Discussão</h2>${canView ? `<form data-form="comment" data-id="${c.id}"><label>Escreva uma pergunta ou comentário<textarea name="text" required maxlength="1000"></textarea></label><button class="btn" type="submit">Publicar</button></form>` : '<p class="muted">Inscreva-se para participar.</p>'}`)
    + panel(top.length ? top.map((x) => one(x, false) + cs.filter((y) => y.parentId === x.id).sort((a, b) => a.at - b.at).map((y) => one(y, true)).join('')).join('') : '<div class="empty">Ninguém comentou ainda. Seja o primeiro!</div>');
}
FORMS.comment = (d, form) => { const u = me(); if (!d.text.trim()) fail('Escreva algo.'); S.comments.push({ id: nid(), courseId: Number(form.dataset.id), userId: u.id, text: d.text.trim(), at: Date.now(), parentId: 0 }); save(); rerender(); };
ACTIONS.reply = (d) => { const t = prompt('Sua resposta:'); if (!t || !t.trim()) return; S.comments.push({ id: nid(), courseId: Number(d.course), userId: me().id, text: t.trim().slice(0, 1000), at: Date.now(), parentId: Number(d.id) }); save(); rerender(); };
ACTIONS['comment-del'] = (d) => { const id = Number(d.id), x = S.comments.find((c) => c.id === id); if (x.userId !== me().id && !isStaff()) fail('Sem permissão.'); if (!confirm('Excluir este comentário?')) return; S.comments = S.comments.filter((c) => c.id !== id && c.parentId !== id); save(); rerender(); };

// Aba PROVA: regras, melhor nota e histórico de tentativas.
function tabProva(c, u, canView, p) {
  const q = quizOf(c.id), mine = S.attempts.filter((a) => a.userId === u.id && a.courseId === c.id), best = mine.reduce((m, a) => Math.max(m, a.score), 0);
  const left = q.maxAttempts ? q.maxAttempts - mine.length : Infinity, allDone = p.done === p.total;
  return panel(`<h2>Prova final</h2><p>${q.questions.length} perguntas · nota mínima ${q.passScore}% · ${q.maxAttempts ? q.maxAttempts + ' tentativas' : 'tentativas ilimitadas'} · vale ${q.points} pontos na primeira aprovação.</p>
    ${mine.length ? `<p>Melhor nota: <strong>${best}%</strong> ${mine.some((a) => a.passed) ? tag('Aprovado ✓', 'ok') : tag('Ainda não aprovado', 'bad')} · tentativas usadas: ${mine.length}</p>` : ''}
    ${!canView ? '<p class="muted">Inscreva-se para fazer a prova.</p>' : !allDone && !isStaff() ? '<p class="muted">Conclua todas as aulas para liberar a prova.</p>' : left <= 0 && !isStaff() ? '<p class="muted">Você usou todas as tentativas. Fale com o instrutor.</p>' : `<a class="btn" href="#/quiz/${c.id}">${mine.length ? 'Tentar novamente' : 'Fazer a prova'}</a>`}`)
    + (mine.length ? panel(`<h3>Histórico de tentativas</h3><div class="table-wrap"><table><tr><th>Data</th><th>Nota</th><th>Resultado</th></tr>${mine.slice().reverse().map((a) => `<tr><td>${fmtDate(a.at)}</td><td>${a.score}%</td><td>${a.passed ? 'Aprovado' : 'Reprovado'}</td></tr>`).join('')}</table></div>`) : '');
}

// ---------- PROVA (fazer e ver resultado) ----------
VIEWS.quiz = async (cid) => {
  cid = Number(cid); const c = course(cid), q = quizOf(cid), u = me(); if (!c || !q) fail('Prova não encontrada.');
  if (!isEnrolled(u.id, cid) && !isStaff()) fail('Inscreva-se no curso para fazer a prova.');
  const p = courseProg(u.id, cid); if (p.done < p.total && !isStaff()) fail('Conclua todas as aulas antes da prova.');
  const used = S.attempts.filter((a) => a.userId === u.id && a.courseId === cid).length; if (q.maxAttempts && used >= q.maxAttempts && !isStaff()) fail('Você usou todas as tentativas.');
  const questions = LOCAL_MODE ? q.questions : ((await callRpc('get_quiz', { p_course_id: String(cid) }))?.questions || []); // sem gabarito
  app.innerHTML = `<div class="page-head"><div><a href="#/course/${cid}">← ${esc(c.title)}</a><h1>Prova final</h1></div><span class="muted">Nota mínima: ${q.passScore}%</span></div>
    <form data-form="quiz" data-id="${cid}">${questions.map((x, i) => `<div class="q"><strong>${i + 1}. ${esc(x.q)}</strong>${x.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}" required> ${esc(o)}</label>`).join('')}</div>`).join('')}
    <button class="btn" type="submit">Enviar respostas</button></form>`;
};
// Corrige a prova, registra a tentativa e dá pontos/certificado na primeira aprovação.
FORMS.quiz = async (d, form) => {
  if (!LOCAL_MODE) { // a correção acontece no servidor; o gabarito só volta depois do envio
    const cid = Number(form.dataset.id), total = form.querySelectorAll('.q').length;
    const answers = Array.from({ length: total }, (_, i) => Number(d['q' + i]));
    const res = await rpc('submit_quiz', { p_course_id: String(cid), p_answers: answers });
    renderChrome(); showQuizResult({ ...res.attempt, userId: me().id, courseId: cid, answers }, res.certificate ? { code: res.certificate } : null, res.review); window.scrollTo(0, 0); return;
  }
  const cid = Number(form.dataset.id), q = quizOf(cid), u = me();
  const answers = q.questions.map((x, i) => Number(d['q' + i])), right = answers.filter((a, i) => a === q.questions[i].correct).length;
  const score = Math.round((right / q.questions.length) * 100), passed = score >= q.passScore;
  const first = passed && !S.attempts.some((a) => a.userId === u.id && a.courseId === cid && a.passed);
  const att = { id: nid(), userId: u.id, courseId: cid, score, passed, at: Date.now(), answers }; S.attempts.push(att);
  let cert = null; if (first) { if (q.points > 0) award(u.id, q.points, `Prova aprovada: ${course(cid).title}`); cert = checkCourseCompletion(u.id, cid); }
  checkBadges(u.id); save(); renderChrome(); showQuizResult(att, cert); window.scrollTo(0, 0);
};
function showQuizResult(att, cert, review) {
  const c = course(att.courseId), q = quizOf(att.courseId), u = me(), left = q.maxAttempts ? q.maxAttempts - S.attempts.filter((a) => a.userId === u.id && a.courseId === att.courseId).length : Infinity;
  app.innerHTML = `<div class="panel"><h1>${att.passed ? 'Aprovado! 🎉' : 'Quase lá'}</h1><p class="price">Sua nota: ${att.score}%</p><p class="muted">Nota mínima: ${q.passScore}%</p>
    ${cert ? `<p>${tag('Certificado emitido ✓', 'ok')} <a class="btn gold small" href="#/certificate/${cert.code}">Ver certificado</a></p>` : ''}
    <div class="actions"><a class="btn ghost" href="#/course/${c.id}">Voltar ao curso</a>${!att.passed && left > 0 ? `<a class="btn" href="#/quiz/${c.id}">Tentar novamente</a>` : ''}</div></div>
    ${(review || q.questions).map((x, i) => `<div class="q"><strong>${i + 1}. ${esc(x.q)}</strong>${x.options.map((o, j) => `<div class="${j === x.correct ? 'right' : att.answers[i] === j ? 'wrong' : ''}" style="padding:6px 8px;border-radius:8px">${j === x.correct ? '✓' : att.answers[i] === j ? '✗' : '○'} ${esc(o)}</div>`).join('')}${x.explain ? `<p class="muted small">💡 ${esc(x.explain)}</p>` : ''}</div>`).join('')}`;
}

// ---------- CERTIFICADO (com verificação pública) ----------
function certHTML(ct) {
  const u = user(ct.userId), c = course(ct.courseId), url = location.href.split('#')[0] + '#/verify/' + ct.code;
  return `<div class="cert"><div style="font-size:3rem">🎓</div><h1>Certificado de Conclusão</h1><p>Certificamos que</p><div class="name">${esc(u?.name || 'Aluno')}</div>
    <p>concluiu com êxito o ${c?.category === 'padrao_servico' ? 'padrão de serviço' : 'curso'}</p><h2>${esc(c?.title || 'Curso removido')}</h2>
    <p>Carga horária: ${fmtDur(courseHours(ct.courseId))} · Instrutor: ${esc(c?.instructor || '—')}</p><p>Emitido em ${new Date(ct.at).toLocaleDateString('pt-BR')} por ${esc(S.settings.platformName)}</p>
    <p class="small" style="color:#5b6b7a">Código de verificação: <strong>${ct.code}</strong><br>${esc(url)}</p></div>`;
}
VIEWS.certificate = (code) => {
  const ct = S.certificates.find((x) => x.code === code); if (!ct) fail('Certificado não encontrado.');
  if (ct.userId !== me().id && !isStaff()) fail('Você não tem acesso a este certificado.');
  app.innerHTML = `<div class="no-print actions" style="margin-bottom:14px"><button class="btn" data-action="print">Imprimir / salvar em PDF</button><a class="btn ghost" href="#/profile">Voltar</a></div>${certHTML(ct)}`;
};
async function viewVerify(code) {
  if (LOCAL_MODE) {
    const cert = S.certificates.find((x) => x.code === code);
    if (!cert) {
      app.innerHTML = '<div class="panel empty"><h2>Certificado não encontrado</h2><p>O código não existe nesta plataforma local.</p></div>'; return;
    }
    app.innerHTML = certHTML(cert);
    return;
  }
  const { data, error } = await backend.rpc('verify_course_certificate', { p_code: code });
  if (error) fail(error.message);
  const cert = Array.isArray(data) ? data[0] : data;
  if (!cert?.valid) {
    app.innerHTML = '<div class="panel empty"><h2>Certificado não encontrado</h2><p>O código não existe nesta plataforma.</p></div>'; return;
  }
  const url = location.href.split('#')[0] + '#/verify/' + encodeURIComponent(cert.certificate_code);
  app.innerHTML = `<div class="notice" style="background:#dcf3e2;color:#17692f">✓ Certificado válido, emitido por ${esc(cert.platform_name)}.</div>
    <div class="cert"><div style="font-size:3rem">🎓</div><h1>Certificado de Conclusão</h1><p>Certificamos que</p><div class="name">${esc(cert.learner_name)}</div>
      <p>concluiu com êxito o ${cert.course_category === 'padrao_servico' ? 'padrão de serviço' : 'curso'}</p><h2>${esc(cert.course_title)}</h2>
      <p>Emitido em ${new Date(cert.issued_at).toLocaleDateString('pt-BR')} por ${esc(cert.platform_name)}</p>
      <p class="small" style="color:#5b6b7a">Código de verificação: <strong>${esc(cert.certificate_code)}</strong><br>${esc(url)}</p></div>`;
}
ACTIONS.print = () => window.print();

// ---------- LOJA DE PONTOS ----------
function storeGridHTML(u) {
  const f = FILTERS.S; let L = S.products.filter((p) => p.active); const q = f.q.toLowerCase();
  if (q) L = L.filter((p) => (p.name + ' ' + p.description).toLowerCase().includes(q)); if (f.cat) L = L.filter((p) => p.category === f.cat); if (f.afford) L = L.filter((p) => u.points >= p.cost);
  L.sort((a, b) => a.cost - b.cost);
  if (!L.length) return '<div class="panel empty" style="grid-column:1/-1">Nenhum produto encontrado.</div>';
  return L.map((p) => {
    const out = !p.unlimited && p.stock <= 0, got = S.redemptions.filter((r) => r.userId === u.id && r.productId === p.id && r.status !== 'cancelado').length, lim = p.limit && got >= p.limit;
    return `<div class="card"><div class="cover" style="--h:${hue(p.id)}">${p.image ? `<img src="${p.image}" alt="" style="max-height:88px;border-radius:6px">` : `<span>${esc(p.emoji || '🎁')}</span>`}</div>
      ${tag(esc(p.category || 'Geral'))}<h3>${esc(p.name)}</h3><p class="muted clamp">${esc(p.description)}</p><div class="price">${p.cost} pontos</div>
      <div class="muted small">${p.unlimited ? 'Estoque ilimitado' : out ? 'Sem estoque' : p.stock + ' em estoque'}${p.limit ? ` · limite ${p.limit} por pessoa` : ''}</div>
      <button class="btn" data-action="redeem" data-id="${p.id}" ${out || lim || u.points < p.cost ? 'disabled' : ''}>${out ? 'Esgotado' : lim ? 'Limite atingido' : u.points < p.cost ? `Faltam ${p.cost - u.points} pts` : 'Trocar pontos'}</button></div>`;
  }).join('');
}
REFRESH.S = () => { $('store-grid').innerHTML = storeGridHTML(me()); };
const STATUS_TAG = { pendente: 'warn', aprovado: '', entregue: 'ok', cancelado: 'bad' };
VIEWS.store = () => {
  const u = me(), f = FILTERS.S, cats = [...new Set(S.products.map((p) => p.category).filter(Boolean))].sort();
  const mine = S.redemptions.filter((r) => r.userId === u.id).slice().reverse(), hist = S.log.filter((l) => l.userId === u.id).slice().reverse().slice(0, 40);
  app.innerHTML = `<div class="page-head"><h1>Loja de pontos</h1><div class="price">Seu saldo: ${u.points} pontos</div></div>
    <div class="panel"><div class="row"><label>Buscar<input data-filter="S.q" value="${esc(f.q)}" placeholder="Nome do produto..."></label>${fsel('Categoria', 'S.cat', [['', 'Todas'], ...cats.map((c) => [c, c])], f.cat)}
      <label class="check" style="align-self:end"><input type="checkbox" data-filter="S.afford" ${f.afford ? 'checked' : ''}> Só os que posso trocar agora</label></div></div>
    <div class="grid" id="store-grid">${storeGridHTML(u)}</div>
    <h2 style="margin-top:28px">Minhas trocas</h2><div class="panel table-wrap">${mine.length ? `<table><tr><th>Produto</th><th>Pontos</th><th>Código</th><th>Situação</th><th>Data</th><th></th></tr>
      ${mine.map((r) => `<tr><td>${esc(r.productName)}</td><td>${r.cost}</td><td><strong>${r.code}</strong></td><td>${tag(r.status, STATUS_TAG[r.status])}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td><td>${fmtDate(r.at)}</td><td>${r.status === 'pendente' ? `<button class="btn small danger" data-action="redeem-cancel-mine" data-id="${r.id}">Cancelar</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Você ainda não fez nenhuma troca.</p>'}</div>
    <h2>Histórico de pontos</h2><div class="panel table-wrap">${hist.length ? `<table><tr><th>Motivo</th><th>Pontos</th><th>Data</th></tr>${hist.map((h) => `<tr><td>${esc(h.reason)}</td><td>${h.delta > 0 ? '+' : ''}${h.delta}</td><td>${fmtDate(h.at)}</td></tr>`).join('')}</table>` : '<p class="muted">Assista a aulas e faça o check-in para ganhar pontos.</p>'}</div>`;
};
// Estorno: devolve os pontos gastos SEM aumentar o XP (nível e ranking não mudam).
function refund(uid, amt, reason) { const u = user(uid); if (!u) return; u.points += amt; S.log.push({ id: nid(), userId: uid, delta: amt, reason, at: Date.now() }); }
// Cancela um pedido: devolve pontos e estoque.
function cancelRedemption(r, note) {
  if (['entregue', 'cancelado'].includes(r.status)) fail('Este pedido não pode ser cancelado.');
  r.status = 'cancelado'; r.note = note || ''; refund(r.userId, r.cost, `Estorno: ${r.productName}`);
  const p = product(r.productId); if (p && !p.unlimited) p.stock++;
  notify(r.userId, `Sua troca "${r.productName}" foi cancelada e os pontos foram devolvidos.`, '#/store');
}
// TROCAR PONTOS POR PRODUTO: confere estoque, saldo e limite; desconta pontos; cria o pedido com código.
// Para mudar as regras da loja, edite esta ação.
ACTIONS.redeem = async (d) => {
  const u = me(), p = product(d.id); if (!p || !p.active) fail('Produto indisponível.');
  if (!p.unlimited && p.stock <= 0) fail('Produto sem estoque.'); if (u.points < p.cost) fail('Pontos insuficientes.');
  const got = S.redemptions.filter((r) => r.userId === u.id && r.productId === p.id && r.status !== 'cancelado').length; if (p.limit && got >= p.limit) fail('Você atingiu o limite deste produto.');
  if (!confirm(`Trocar ${p.cost} pontos por "${p.name}"?`)) return;
  if (!LOCAL_MODE) { const res = await rpc('redeem_product', { p_product_id: String(p.id) }); toast(`Troca realizada! Código: ${res.code}`); renderChrome(); rerender(); return; } // saldo, estoque e limite validados no servidor
  if (!p.unlimited) p.stock--; award(u.id, -p.cost, `Troca: ${p.name}`);
  const r = { id: nid(), userId: u.id, productId: p.id, productName: p.name, cost: p.cost, status: 'pendente', code: genCode(8), at: Date.now(), note: '' }; S.redemptions.push(r);
  S.users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, `🎁 Nova troca: ${p.name} (${u.name})`, '#/admin/redemptions'));
  checkBadges(u.id); audit(`Troca: ${p.name}`); save(); toast(`Troca realizada! Código: ${r.code}`); renderChrome(); rerender();
};
ACTIONS['redeem-cancel-mine'] = async (d) => { const r = S.redemptions.find((x) => x.id === Number(d.id) && x.userId === me().id); if (!r || r.status !== 'pendente') fail('Só dá para cancelar pedidos pendentes.'); if (!confirm('Cancelar esta troca e receber os pontos de volta?')) return; if (LOCAL_MODE) { cancelRedemption(r, 'Cancelado pelo usuário'); save(); } else await rpc('cancel_redemption', { p_redemption_id: String(r.id), p_note: 'Cancelado pelo usuário' }); renderChrome(); rerender(); };

// ---------- RANKING ----------
let rankingRefreshTimer = null;
REFRESH.R = () => rerender();
VIEWS.ranking = async () => {
  const u = me(), f = FILTERS.R;
  let periodScores;
  if (LOCAL_MODE) {
    const now = new Date(), weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodScores = S.log.reduce((scores, entry) => {
      if (entry.delta <= 0 || String(entry.reason || '').startsWith('Estorno:')) return scores;
      const score = scores.get(entry.userId) || { week: 0, month: 0 };
      if (entry.at >= weekStart.getTime()) score.week += entry.delta;
      if (entry.at >= monthStart.getTime()) score.month += entry.delta;
      scores.set(entry.userId, score);
      return scores;
    }, new Map());
  } else {
    const { data, error } = await backend.rpc('ranking_xp');
    if (error) fail(`Não foi possível carregar o ranking por período. Execute novamente supabase/schema.sql. ${error.message}`);
    periodScores = new Map((data || []).map((row) => [Number(row.user_id), {
      week: Number(row.weekly_xp) || 0, month: Number(row.monthly_xp) || 0
    }]));
  }
  let leaders = S.users.filter((x) => x.active && !x.pending && x.role === 'aluno' && (!f.dept || x.dept === f.dept));
  leaders = leaders.map((x) => {
    const periods = periodScores.get(x.id) || { week: 0, month: 0 };
    const score = f.scope === 'geral' ? x.xp : f.scope === 'mes' ? periods.month : periods.week;
    return { x, score };
  }).sort((a, b) => b.score - a.score || b.x.xp - a.x.xp || a.x.name.localeCompare(b.x.name, 'pt-BR'));
  const medal = (place, compact = false) => `<span class="rank-medal rank-medal-${place} ${compact ? 'compact' : ''}" role="img" aria-label="${place}º lugar"><span class="medal-ribbon" aria-hidden="true"></span><span class="medal-face" aria-hidden="true">★</span></span>`;
  const period = f.scope === 'geral' ? 'Todo o período' : f.scope === 'mes' ? 'Este mês' : 'Esta semana';
  const top = leaders.slice(0, 3), podium = [top[1], top[0], top[2]].filter(Boolean);
  if (rankingRefreshTimer) clearInterval(rankingRefreshTimer);
  rankingRefreshTimer = setInterval(() => {
    if (location.hash.split('/')[1] !== 'ranking') {
      clearInterval(rankingRefreshTimer);
      rankingRefreshTimer = null;
      return;
    }
    rerender();
  }, 60000);
  app.innerHTML = `<div class="ranking-page">
    <header class="ranking-heading"><div><span class="eyebrow">JORNADA EM MOVIMENTO</span><h1>Ranking</h1><p>Aprendizado que vira conquista. Quem está avançando agora?</p></div><span class="ranking-live"><i></i> Atualizado automaticamente</span></header>
    <section class="ranking-filters"><div class="ranking-period-tabs" role="group" aria-label="Período do ranking">
      ${[['semana', 'Esta semana'], ['mes', 'Este mês'], ['geral', 'Geral']].map(([value, label]) => `<button type="button" class="${f.scope === value ? 'active' : ''}" data-action="ranking-period" data-value="${value}" aria-pressed="${f.scope === value}">${label}</button>`).join('')}
    </div>${fsel('Departamento', 'R.dept', [['', 'Todos os departamentos'], ...S.depts.map((d) => [d, d])], f.dept)}</section>
    <div class="ranking-period-note"><span class="ranking-period-icon">◷</span><span><strong>${period}</strong> · ${f.scope === 'semana' ? 'a semana recomeça automaticamente toda segunda-feira' : f.scope === 'mes' ? 'o placar reinicia automaticamente no primeiro dia do mês' : 'XP acumulado desde o início'}</span><span class="ranking-reset">Atualização automática a cada minuto</span></div>
    ${leaders.length ? `${top.length ? `<section class="ranking-podium" aria-label="Pódio da ${period.toLowerCase()}">${podium.map((r) => {
      const place = leaders.indexOf(r) + 1;
      return `<article class="podium-card place-${place} ${r.x.id === u.id ? 'current-user' : ''}">${medal(place)}${avatar(r.x, 'lg')}<strong class="podium-name">${esc(r.x.name)}</strong><span class="podium-dept">${esc(r.x.dept || 'Sem departamento')}</span><b class="podium-score">${r.score.toLocaleString('pt-BR')} <small>XP</small></b><span class="podium-level">Nível ${levelInfo(r.x.xp).level}</span><div class="podium-base"><span>${String(place).padStart(2, '0')}</span></div></article>`;
    }).join('')}</section>` : ''}
    <section class="ranking-list panel"><div class="ranking-list-heading"><div><span class="eyebrow">PLACAR COMPLETO</span><h2>Todos os participantes</h2></div><span>${leaders.length} ${leaders.length === 1 ? 'participante' : 'participantes'}</span></div><div class="table-wrap"><table><thead><tr><th>Posição</th><th>Participante</th><th>Departamento</th><th>Nível</th><th>${f.scope === 'geral' ? 'XP total' : 'XP no período'}</th></tr></thead><tbody>
      ${leaders.map((r, i) => `<tr class="${r.x.id === u.id ? 'me ranking-me' : ''}"><td>${i < 3 ? medal(i + 1, true) : `<span class="ranking-position">${String(i + 1).padStart(2, '0')}</span>`}</td><td><span class="ranking-person">${avatar(r.x, 'sm')}<strong>${esc(r.x.name)}${r.x.id === u.id ? '<small>Você</small>' : ''}</strong></span></td><td>${esc(r.x.dept || '—')}</td><td><span class="ranking-level">${levelInfo(r.x.xp).level}</span></td><td><strong class="ranking-xp">${r.score.toLocaleString('pt-BR')} <small>XP</small></strong></td></tr>`).join('')}
    </tbody></table></div></section>` : '<div class="panel empty">Ainda não há participantes neste ranking.</div>'}
  </div>`;
};
ACTIONS['ranking-period'] = (d) => {
  if (!['semana', 'mes', 'geral'].includes(d.value)) fail('Período de ranking inválido.');
  FILTERS.R.scope = d.value; rerender();
};

// ---------- PERFIL (conquistas, certificados e histórico) ----------
VIEWS.profile = (id) => {
  const me_ = me(), t = id && isStaff() ? user(id) : me_; if (!t) fail('Usuário não encontrado.');
  const li = levelInfo(t.xp), st = userStats(t), certs = S.certificates.filter((c) => c.userId === t.id), enr = S.enrollments.filter((e) => e.userId === t.id);
  const hist = S.log.filter((l) => l.userId === t.id).slice().reverse().slice(0, 30);
  app.innerHTML = `<div class="panel"><div class="spread"><div class="actions">${avatar(t, 'lg')}<div><h1 style="margin:0">${esc(t.name)}</h1><div class="muted">${esc(t.jobTitle || ROLE[t.role])} · ${esc(t.dept || 'Sem departamento')}</div><div class="muted small">${esc(t.email)}</div></div></div>
      <div style="min-width:240px"><strong>Nível ${li.level} · ${li.title}</strong><div class="bar gold" style="margin:6px 0"><span style="width:${li.pct}%"></span></div><div class="small muted">${t.xp} XP · saldo ${t.points} pontos · 🔥 ${st.streak} dias</div></div></div></div>
    <div class="grid sm" style="margin-bottom:20px"><div class="stat"><b>${st.lessons}</b><span>Aulas concluídas</span></div><div class="stat"><b>${st.courses}</b><span>Cursos concluídos</span></div><div class="stat"><b>${enr.length}</b><span>Inscrições</span></div><div class="stat"><b>${st.redeems}</b><span>Trocas</span></div></div>
    <section class="achievement-section profile-achievements"><div class="achievement-heading"><div><span class="eyebrow">JORNADA DE APRENDIZADO</span><h2>Conquistas</h2><p>Marcos que contam a história de cada avanço.</p></div><span class="achievement-total"><strong>${t.badges.length}</strong><span>de ${BADGES.length}<br>conquistas</span></span></div>
      <div class="badges achievement-grid">${BADGES.map((b) => { const earned = t.badges.includes(b.id); return `<article class="badge achievement-card badge-${b.id} ${earned ? 'earned' : 'locked'}"><div class="badge-medal"><span class="badge-medal-shine"></span><span class="ic">${b.icon}</span><span class="badge-check" aria-hidden="true">${earned ? '✓' : '·'}</span></div><strong>${b.name}</strong><div class="muted small">${b.desc}</div><span class="badge-status">${earned ? 'Conquistada' : 'Continue aprendendo'}</span></article>`; }).join('')}</div></section>
    ${panel(`<h2>Certificados</h2>${certs.length ? certs.map((c) => `<div class="spread" style="padding:6px 0"><span>🎓 ${esc(course(c.courseId)?.title || 'Curso removido')} <span class="muted small">${new Date(c.at).toLocaleDateString('pt-BR')}</span></span><a class="btn small gold" href="#/certificate/${c.code}">Abrir</a></div>`).join('') : '<p class="muted">Nenhum certificado ainda.</p>'}`)}
    ${panel(`<h2>Últimos pontos</h2>${hist.length ? `<div class="table-wrap"><table>${hist.map((h) => `<tr><td>${esc(h.reason)}</td><td>${h.delta > 0 ? '+' : ''}${h.delta}</td><td>${fmtDate(h.at)}</td></tr>`).join('')}</table></div>` : '<p class="muted">Sem movimentações.</p>'}`)}`;
};

// ---------- NOTIFICAÇÕES ----------
VIEWS.notifications = () => {
  const u = me(), L = S.notifications.filter((n) => n.userId === u.id).slice().reverse().slice(0, 100);
  app.innerHTML = `<div class="page-head"><h1>Notificações</h1></div>${panel(L.length ? L.map((n) => `<div class="spread" style="padding:9px 0;border-bottom:1px solid var(--line)"><div>${n.read ? '' : '● '}${n.link ? `<a href="${esc(n.link)}">${esc(n.text)}</a>` : esc(n.text)}</div><span class="muted small">${fmtDate(n.at)}</span></div>`).join('') : '<div class="empty">Nada por aqui ainda.</div>')}`;
  S.notifications.forEach((n) => { if (n.userId === u.id) n.read = true; }); save(); // marca como lidas ao abrir
};

// ---------- MINHA CONTA ----------
VIEWS.account = () => {
  const u = me();
  app.innerHTML = `<div class="page-head"><h1>Minha conta</h1></div>${u.mustChange ? '<div class="notice">Por segurança, defina uma nova senha para continuar.</div>' : ''}
    <div class="row">${u.mustChange ? '' : `<section class="panel account-profile-panel"><h2>Meus dados</h2><form data-form="profile">${fld('Nome', 'name', u.name, 'required minlength="2"')}${fld('Cargo', 'jobTitle', u.jobTitle)}
      ${sel('Departamento', 'dept', [['', 'Nenhum'], ...S.depts.map((d) => [d, d])], u.dept)}${sel('Tema', 'theme', [['dark', 'Escuro com degradê (padrão)'], ['light', 'Claro']], u.theme === 'light' ? 'light' : 'dark')}<p class="muted small">O tema afeta apenas sua conta. O degradê azul-escuro permanece como padrão.</p><div class="avatar-setup-heading"><strong>Seu personagem</strong><span>Troque o visual quando quiser. A mudança aparece no seu perfil e na plataforma.</span></div>${avatarBuilderHTML(u.avatar)}<p class="muted small">E-mail: ${esc(u.email)}</p><button class="btn" type="submit">Salvar alterações</button></form></section>`}
    <section class="panel"><h2>Alterar senha</h2><form data-form="password"><label>Senha atual<input name="current" type="password" autocomplete="current-password" required></label>
      <label>Nova senha (8+ caracteres, letras e números)<input name="next" type="password" autocomplete="new-password" required minlength="8"></label><button class="btn" type="submit">Salvar senha</button></form></section></div>`;
};
FORMS.profile = async (d, form) => {
  const u = me(); if (d.name.trim().length < 2) fail('Informe o nome.');
  const avatar = avatarFromForm(form);
  const patch = { name: d.name.trim(), job_title: d.jobTitle.trim(), dept: d.dept, theme: d.theme, avatar };
  if (!LOCAL_MODE) {
    const { error } = await backend.from('profiles').update(patch).eq('id', sessionAuthId);
    if (error) fail(error.message);
  }
  Object.assign(u, { name: patch.name, jobTitle: patch.job_title, dept: patch.dept, theme: patch.theme, avatar });
  profileSnapshots.set(u.authId, profileSnapshot(u)); save(); applyTheme(); toast('Dados salvos.'); rerender();
};
FORMS.password = async (d, form) => {
  const u = me(); if (!pwOk(d.next)) fail(PW_MSG);
  if (LOCAL_MODE) {
    if (!(await verifyLocalPassword(d.current, localPasswords[u.authId]))) fail('A senha atual está incorreta.');
    localPasswords[u.authId] = await hashLocalPassword(d.next);
    localStorage.setItem(LOCAL_PASSWORDS_KEY, JSON.stringify(localPasswords));
  } else {
    const { error: verifyError } = await backend.auth.signInWithPassword({ email: u.email, password: d.current });
    if (verifyError) fail('A senha atual está incorreta.');
    const { error } = await backend.auth.updateUser({ password: d.next });
    if (error) fail(error.message);
  }
  audit('Senha alterada'); save(); form.reset(); toast('Senha alterada.'); if (location.hash !== '#/home') go('#/home'); else rerender();
};
