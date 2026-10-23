// ============================================================================
// 7. TELAS DO ALUNO
// ============================================================================
// Cursos que o usuário pode ver: staff vê todos; aluno vê os publicados e os que já está inscrito.
const visibleCourses = (u) => S.courses.filter((c) => isStaff() || c.status === 'publicado' || isEnrolled(u.id, c.id));
// Seletor de filtro: ao mudar, atualiza a lista na hora (veja o evento "input" na seção 9).
const fsel = (label, key, opts, val) => `<label>${label}<select data-filter="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const ICON = { video: '▶', link: '🔗', texto: '📄' };
const ytId = (url) => ((url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/) || [])[1] || '';

// ---------- INÍCIO ----------
VIEWS.home = async () => {
  const u = me(), li = levelInfo(u.xp), st = userStats(u), checked = u.lastCheckin === todayISO();
  const mine = S.enrollments.filter((e) => e.userId === u.id).map((e) => ({ e, c: course(e.courseId), p: courseProg(u.id, e.courseId) })).filter((x) => x.c);
  const pend = mine.filter((x) => !x.p.complete);
  const duty = pend.filter((x) => x.c.mandatory).sort((a, b) => (dueOf(a.e, a.c) || '9').localeCompare(dueOf(b.e, b.c) || '9'));
  const cont = pend.find((x) => x.p.done > 0) || pend[0];
  const recs = visibleCourses(u).filter((c) => !isEnrolled(u.id, c.id) && c.status === 'publicado').slice(0, 3);
  const news = S.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.at - a.at).slice(0, 3);
  app.innerHTML = `
    <div class="hero"><div class="grow"><div class="small">${esc(u.dept || ROLE[u.role])}</div><h1>Olá, ${esc(u.name.split(' ')[0])}!</h1>
      <p style="margin:6px 0">Nível ${li.level} · ${li.title} · ${u.xp} XP${st.streak ? ` · 🔥 ${st.streak} dia${st.streak > 1 ? 's' : ''} seguidos` : ''}</p>
      <div class="bar"><span style="width:${li.pct}%"></span></div><div class="small" style="margin-top:4px">${li.next - u.xp} XP para o nível ${li.level + 1}</div></div>
      <div class="actions"><button class="btn gold" data-action="checkin" ${checked ? 'disabled' : ''}>${checked ? 'Check-in feito hoje ✓' : `Check-in diário (+${S.settings.dailyBonus} pts)`}</button><a class="btn ghost" style="color:#fff;border-color:#fff" href="#/store">Ir à loja</a></div></div>
    <div class="grid sm" style="margin-bottom:20px">
      <div class="stat"><b>${u.points}</b><span>Pontos disponíveis</span></div><div class="stat"><b>${pend.length}</b><span>Cursos em andamento</span></div>
      <div class="stat"><b>${st.courses}</b><span>Cursos concluídos</span></div><div class="stat"><b>${st.lessons}</b><span>Aulas concluídas</span></div>
      <div class="stat"><b>${u.badges.length}/${BADGES.length}</b><span>Conquistas</span></div></div>
    ${isAdmin() && !S.courses.length ? panel('<h2>Plataforma vazia</h2><p class="muted">Quer ver tudo funcionando? Carregue cursos, produtos e alunos de exemplo (você pode apagar depois).</p><button class="btn" data-action="seed">Carregar dados de demonstração</button>') : ''}
    ${duty.length ? panel(`<h2>⚠ Obrigatórios pendentes</h2>${duty.map((x) => `<div class="spread" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><a href="#/course/${x.c.id}"><strong>${esc(x.c.title)}</strong></a><div class="muted small">${x.p.done}/${x.p.total} aulas${x.p.quizOk ? '' : ' · prova pendente'}</div></div>${dueTag(dueOf(x.e, x.c))}</div>`).join('')}`) : ''}
    ${cont ? panel(`<h2>Continuar estudando</h2><div class="spread"><div><strong>${esc(cont.c.title)}</strong><div class="bar" style="width:260px;margin-top:6px"><span style="width:${cont.p.pct}%"></span></div><div class="muted small">${cont.p.pct}% concluído</div></div><a class="btn" href="#/course/${cont.c.id}">Continuar</a></div>`) : ''}
    ${news.length ? panel(`<h2>📢 Mural de avisos</h2>${news.map((n) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><strong>${n.pinned ? '📌 ' : ''}${esc(n.title)}</strong> <span class="muted small">${fmtDate(n.at)}</span><div>${esc(n.text)}</div></div>`).join('')}`) : ''}
    ${recs.length ? `<h2>Recomendados para você</h2><div class="grid" style="margin-bottom:20px">${recs.map((c) => courseCard(c, u)).join('')}</div>` : ''}
    <h2>Conquistas</h2><div class="badges">${BADGES.map((b) => `<div class="badge ${u.badges.includes(b.id) ? '' : 'locked'}"><div class="ic">${b.icon}</div><strong>${b.name}</strong><div class="muted small">${b.desc}</div></div>`).join('')}</div>`;
};
ACTIONS.checkin = () => { const t = checkin(me().id); if (t) toast(`Check-in feito! +${t} pontos`); renderChrome(); rerender(); };
ACTIONS.seed = async () => { need('admin'); await seedDemo(); toast('Cursos, aulas e produtos de demonstração carregados.'); rerender(); };

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
const courseListHTML = () => { const u = me(), L = filterCourses(u); return L.length ? L.map((c) => courseCard(c, u)).join('') : `<div class="panel empty" style="grid-column:1/-1">${catalogMode === 'mine' ? 'Você ainda não está inscrito em nenhum curso (ou nenhum bate com o filtro).' : 'Nenhum curso encontrado.'}</div>`; };
REFRESH.C = () => { $('course-list').innerHTML = courseListHTML(); };
function viewCatalog() {
  const f = FILTERS.C, areas = [...new Set(S.courses.map((c) => c.area).filter(Boolean))].sort();
  app.innerHTML = `<div class="page-head"><h1>${catalogMode === 'mine' ? 'Meus cursos' : 'Cursos e padrões de serviço'}</h1>${isStaff() ? '<button class="btn" data-action="course-new">+ Novo curso</button>' : ''}</div>
    <div class="panel"><div class="row"><label>Buscar<input data-filter="C.q" value="${esc(f.q)}" placeholder="Título, área, instrutor..."></label>
      ${fsel('Tipo', 'C.cat', [['', 'Todos'], ['curso', 'Cursos'], ['padrao_servico', 'Padrões de serviço']], f.cat)}
      ${fsel('Área', 'C.area', [['', 'Todas'], ...areas.map((a) => [a, a])], f.area)}
      ${fsel('Nível', 'C.level', [['', 'Todos'], ...Object.entries(LEVELS)], f.level)}
      ${fsel('Situação', 'C.status', [['', 'Todas'], ['andamento', 'Em andamento'], ['concluidos', 'Concluídos'], ['obrigatorios', 'Obrigatórios'], ['favoritos', 'Favoritos'], ...(catalogMode === 'all' ? [['inscritos', 'Inscrito'], ['nao', 'Não inscrito']] : [])], f.status)}
      ${fsel('Ordenar', 'C.sort', [['recent', 'Mais recentes'], ['title', 'Título (A-Z)'], ['popular', 'Mais populares'], ['rating', 'Melhor avaliados']], f.sort)}</div></div>
    <div class="grid" id="course-list">${courseListHTML()}</div>`;
}
// Cartão de curso (clicável). O botão de favorito tem ação própria.
function courseCard(c, u) {
  const en = enrollment(u.id, c.id), p = courseProg(u.id, c.id), r = avgRating(c.id), fav = isFav(u.id, c.id);
  return `<div class="card course" data-action="go" data-href="#/course/${c.id}"><div class="cover" style="--h:${hue(c.id)}"><span>${esc(c.emoji || '📘')}</span>
    <button class="fav ${fav ? 'on' : ''}" data-action="fav" data-id="${c.id}" aria-label="Favoritar">${fav ? '★' : '☆'}</button></div>
    <div class="tags">${tag(CAT[c.category], c.category === 'padrao_servico' ? 'service' : '')}${c.mandatory ? tag('Obrigatório', 'bad') : ''}${c.status !== 'publicado' ? tag('Rascunho', 'warn') : ''}${p.complete ? tag('Concluído ✓', 'ok') : ''}</div>
    <h3><a href="#/course/${c.id}">${esc(c.title)}</a></h3><p class="muted clamp">${esc(c.description)}</p>
    <div class="muted small">${p.total} aula${p.total === 1 ? '' : 's'} · ${fmtDur(courseHours(c.id))}${r.n ? ` · ★ ${r.avg.toFixed(1)}` : ''}</div>
    ${en ? `<div class="bar"><span style="width:${p.pct}%"></span></div><div class="actions small muted">${p.pct}% concluído ${dueTag(dueOf(en, c), p.complete)}</div>` : '<div class="muted small">Não inscrito</div>'}</div>`;
}
ACTIONS.go = (d) => { location.hash = d.href; };
ACTIONS.fav = (d) => { const u = me(), id = Number(d.id); S.favorites = isFav(u.id, id) ? S.favorites.filter((f) => !(f.userId === u.id && f.courseId === id)) : [...S.favorites, { userId: u.id, courseId: id }]; save(); rerender(); };

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
  if (added) S.enrollments.push({ userId: u.id, courseId: c.id, at: Date.now(), dueDate: '' });
  if (added && !LOCAL_MODE) {
    try { await syncCollection('enrollments'); }
    catch (error) { S.enrollments = S.enrollments.filter((e) => !(e.userId === u.id && e.courseId === c.id)); throw error; }
    const { data, error } = await backend.from('app_records').select('payload').eq('collection', 'quizzes').eq('record_id', String(c.id)).is('owner_id', null).maybeSingle();
    if (error) fail(error.message); if (data && !quizOf(c.id)) S.quizzes.push(data.payload);
  }
  audit(`Inscrição: ${c.title}`); save(); toast('Inscrição feita!'); rerender();
};
ACTIONS.unenroll = (d) => { if (!confirm('Cancelar sua inscrição? Seu progresso é mantido.')) return; const u = me(); S.enrollments = S.enrollments.filter((e) => !(e.userId === u.id && e.courseId === Number(d.id))); save(); rerender(); };
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
function finishLesson(lid) {
  const u = me(), r = completeLesson(u.id, lid); if (!r) return;
  toast(r.earned ? `Aula concluída! +${r.earned} pontos` : 'Aula concluída!'); if (r.cert) setTimeout(() => toast('🎓 Curso concluído! Seu certificado foi emitido.'), 2600);
  const li = document.querySelector(`.lessons li[data-id="${lid}"]`); if (li) { li.classList.add('done'); li.querySelector('.check').textContent = '✓'; }
  const p = courseProg(u.id, lesson(lid).courseId); if ($('prog-bar')) { $('prog-bar').style.width = p.pct + '%'; $('prog-text').textContent = `${p.done}/${p.total} aulas · ${p.pct}%`; }
  const a = $('lesson-actions'); if (a && !a.querySelector('.tag')) a.insertAdjacentHTML('afterbegin', tag('Concluída ✓', 'ok'));
  renderChrome();
}
ACTIONS.lesson = (d) => { const l = lesson(d.id), c = course(l.courseId); if (lockedLesson(l, lessonsOf(c.id), me(), c)) return toast('Conclua a aula anterior para liberar esta.', true); curLesson = l.id; rerender(); };
ACTIONS['lesson-next'] = (d) => { const l = lesson(d.id), c = course(l.courseId); if (lockedLesson(l, lessonsOf(c.id), me(), c)) return toast('Conclua esta aula para liberar a próxima.', true); curLesson = l.id; rerender(); window.scrollTo(0, 0); };
ACTIONS.complete = (d) => { finishLesson(Number(d.id)); rerender(); };

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
  app.innerHTML = `<div class="page-head"><div><a href="#/course/${cid}">← ${esc(c.title)}</a><h1>Prova final</h1></div><span class="muted">Nota mínima: ${q.passScore}%</span></div>
    <form data-form="quiz" data-id="${cid}">${q.questions.map((x, i) => `<div class="q"><strong>${i + 1}. ${esc(x.q)}</strong>${x.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}" required> ${esc(o)}</label>`).join('')}</div>`).join('')}
    <button class="btn" type="submit">Enviar respostas</button></form>`;
};
// Corrige a prova, registra a tentativa e dá pontos/certificado na primeira aprovação.
FORMS.quiz = async (d, form) => {
  const cid = Number(form.dataset.id), q = quizOf(cid), u = me();
  const answers = q.questions.map((x, i) => Number(d['q' + i])), right = answers.filter((a, i) => a === q.questions[i].correct).length;
  const score = Math.round((right / q.questions.length) * 100), passed = score >= q.passScore;
  const first = passed && !S.attempts.some((a) => a.userId === u.id && a.courseId === cid && a.passed);
  const att = { id: nid(), userId: u.id, courseId: cid, score, passed, at: Date.now(), answers }; S.attempts.push(att);
  let cert = null; if (first) { if (q.points > 0) award(u.id, q.points, `Prova aprovada: ${course(cid).title}`); cert = checkCourseCompletion(u.id, cid); }
  checkBadges(u.id); save(); renderChrome(); showQuizResult(att, cert); window.scrollTo(0, 0);
};
function showQuizResult(att, cert) {
  const c = course(att.courseId), q = quizOf(att.courseId), u = me(), left = q.maxAttempts ? q.maxAttempts - S.attempts.filter((a) => a.userId === u.id && a.courseId === att.courseId).length : Infinity;
  app.innerHTML = `<div class="panel"><h1>${att.passed ? 'Aprovado! 🎉' : 'Quase lá'}</h1><p class="price">Sua nota: ${att.score}%</p><p class="muted">Nota mínima: ${q.passScore}%</p>
    ${cert ? `<p>${tag('Certificado emitido ✓', 'ok')} <a class="btn gold small" href="#/certificate/${cert.code}">Ver certificado</a></p>` : ''}
    <div class="actions"><a class="btn ghost" href="#/course/${c.id}">Voltar ao curso</a>${!att.passed && left > 0 ? `<a class="btn" href="#/quiz/${c.id}">Tentar novamente</a>` : ''}</div></div>
    ${q.questions.map((x, i) => `<div class="q"><strong>${i + 1}. ${esc(x.q)}</strong>${x.options.map((o, j) => `<div class="${j === x.correct ? 'right' : att.answers[i] === j ? 'wrong' : ''}" style="padding:6px 8px;border-radius:8px">${j === x.correct ? '✓' : att.answers[i] === j ? '✗' : '○'} ${esc(o)}</div>`).join('')}${x.explain ? `<p class="muted small">💡 ${esc(x.explain)}</p>` : ''}</div>`).join('')}`;
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
function refund(uid, amt, reason) { const u = user(uid); if (!u) return; u.points += amt; S.log.push({ userId: uid, delta: amt, reason, at: Date.now() }); }
// Cancela um pedido: devolve pontos e estoque.
function cancelRedemption(r, note) {
  if (['entregue', 'cancelado'].includes(r.status)) fail('Este pedido não pode ser cancelado.');
  r.status = 'cancelado'; r.note = note || ''; refund(r.userId, r.cost, `Estorno: ${r.productName}`);
  const p = product(r.productId); if (p && !p.unlimited) p.stock++;
  notify(r.userId, `Sua troca "${r.productName}" foi cancelada e os pontos foram devolvidos.`, '#/store');
}
// TROCAR PONTOS POR PRODUTO: confere estoque, saldo e limite; desconta pontos; cria o pedido com código.
// Para mudar as regras da loja, edite esta ação.
ACTIONS.redeem = (d) => {
  const u = me(), p = product(d.id); if (!p || !p.active) fail('Produto indisponível.');
  if (!p.unlimited && p.stock <= 0) fail('Produto sem estoque.'); if (u.points < p.cost) fail('Pontos insuficientes.');
  const got = S.redemptions.filter((r) => r.userId === u.id && r.productId === p.id && r.status !== 'cancelado').length; if (p.limit && got >= p.limit) fail('Você atingiu o limite deste produto.');
  if (!confirm(`Trocar ${p.cost} pontos por "${p.name}"?`)) return;
  if (!p.unlimited) p.stock--; award(u.id, -p.cost, `Troca: ${p.name}`);
  const r = { id: nid(), userId: u.id, productId: p.id, productName: p.name, cost: p.cost, status: 'pendente', code: genCode(8), at: Date.now(), note: '' }; S.redemptions.push(r);
  S.users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, `🎁 Nova troca: ${p.name} (${u.name})`, '#/admin/redemptions'));
  checkBadges(u.id); audit(`Troca: ${p.name}`); save(); toast(`Troca realizada! Código: ${r.code}`); renderChrome(); rerender();
};
ACTIONS['redeem-cancel-mine'] = (d) => { const r = S.redemptions.find((x) => x.id === Number(d.id) && x.userId === me().id); if (!r || r.status !== 'pendente') fail('Só dá para cancelar pedidos pendentes.'); if (!confirm('Cancelar esta troca e receber os pontos de volta?')) return; cancelRedemption(r, 'Cancelado pelo usuário'); save(); renderChrome(); rerender(); };

// ---------- RANKING ----------
REFRESH.R = () => rerender();
VIEWS.ranking = () => {
  const u = me(), f = FILTERS.R, ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0);
  let L = S.users.filter((x) => x.active && !x.pending && x.role === 'aluno' && (!f.dept || x.dept === f.dept));
  L = L.map((x) => ({ x, score: f.scope === 'mes' ? S.log.filter((l) => l.userId === x.id && l.delta > 0 && l.at >= ms.getTime()).reduce((s, l) => s + l.delta, 0) : x.xp })).sort((a, b) => b.score - a.score);
  const medal = ['🥇', '🥈', '🥉'];
  app.innerHTML = `<div class="page-head"><h1>Ranking</h1></div>
    <div class="panel"><div class="row">${fsel('Período', 'R.scope', [['geral', 'Geral (todo o tempo)'], ['mes', 'Este mês']], f.scope)}${fsel('Departamento', 'R.dept', [['', 'Todos'], ...S.depts.map((d) => [d, d])], f.dept)}</div></div>
    ${L.length ? `<div class="grid sm" style="margin-bottom:20px">${L.slice(0, 3).map((r, i) => `<div class="stat" style="text-align:center"><div style="font-size:2rem">${medal[i]}</div>${avatar(r.x, 'lg')}<h3 style="margin-top:8px">${esc(r.x.name)}</h3><b>${r.score} XP</b><span>${esc(r.x.dept || '')}</span></div>`).join('')}</div>
    <div class="panel table-wrap"><table><tr><th>#</th><th>Nome</th><th>Departamento</th><th>Nível</th><th>XP</th></tr>
      ${L.map((r, i) => `<tr class="${r.x.id === u.id ? 'me' : ''}"><td>${i + 1}</td><td>${avatar(r.x, 'sm')} ${esc(r.x.name)}</td><td>${esc(r.x.dept || '—')}</td><td>${levelInfo(r.x.xp).level}</td><td><strong>${r.score}</strong></td></tr>`).join('')}</table></div>` : '<div class="panel empty">Ainda não há participantes no ranking.</div>'}`;
};

// ---------- PERFIL (conquistas, certificados e histórico) ----------
VIEWS.profile = (id) => {
  const me_ = me(), t = id && isStaff() ? user(id) : me_; if (!t) fail('Usuário não encontrado.');
  const li = levelInfo(t.xp), st = userStats(t), certs = S.certificates.filter((c) => c.userId === t.id), enr = S.enrollments.filter((e) => e.userId === t.id);
  const hist = S.log.filter((l) => l.userId === t.id).slice().reverse().slice(0, 30);
  app.innerHTML = `<div class="panel"><div class="spread"><div class="actions">${avatar(t, 'lg')}<div><h1 style="margin:0">${esc(t.name)}</h1><div class="muted">${esc(t.jobTitle || ROLE[t.role])} · ${esc(t.dept || 'Sem departamento')}</div><div class="muted small">${esc(t.email)}</div></div></div>
      <div style="min-width:240px"><strong>Nível ${li.level} · ${li.title}</strong><div class="bar gold" style="margin:6px 0"><span style="width:${li.pct}%"></span></div><div class="small muted">${t.xp} XP · saldo ${t.points} pontos · 🔥 ${st.streak} dias</div></div></div></div>
    <div class="grid sm" style="margin-bottom:20px"><div class="stat"><b>${st.lessons}</b><span>Aulas concluídas</span></div><div class="stat"><b>${st.courses}</b><span>Cursos concluídos</span></div><div class="stat"><b>${enr.length}</b><span>Inscrições</span></div><div class="stat"><b>${st.redeems}</b><span>Trocas</span></div></div>
    <h2>Conquistas (${t.badges.length}/${BADGES.length})</h2><div class="badges" style="margin-bottom:20px">${BADGES.map((b) => `<div class="badge ${t.badges.includes(b.id) ? '' : 'locked'}"><div class="ic">${b.icon}</div><strong>${b.name}</strong><div class="muted small">${b.desc}</div></div>`).join('')}</div>
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
    <div class="row">${u.mustChange ? '' : `<section class="panel"><h2>Meus dados</h2><form data-form="profile">${fld('Nome', 'name', u.name, 'required minlength="2"')}${fld('Cargo', 'jobTitle', u.jobTitle)}
      ${sel('Departamento', 'dept', [['', 'Nenhum'], ...S.depts.map((d) => [d, d])], u.dept)}${sel('Tema', 'theme', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], u.theme)}<p class="muted small">E-mail: ${esc(u.email)}</p><button class="btn" type="submit">Salvar</button></form></section>`}
    <section class="panel"><h2>Alterar senha</h2><form data-form="password"><label>Senha atual<input name="current" type="password" autocomplete="current-password" required></label>
      <label>Nova senha (8+ caracteres, letras e números)<input name="next" type="password" autocomplete="new-password" required minlength="8"></label><button class="btn" type="submit">Salvar senha</button></form></section></div>`;
};
FORMS.profile = async (d) => {
  const u = me(); if (d.name.trim().length < 2) fail('Informe o nome.');
  const patch = { name: d.name.trim(), job_title: d.jobTitle.trim(), dept: d.dept, theme: d.theme };
  if (!LOCAL_MODE) {
    const { error } = await backend.from('profiles').update(patch).eq('id', sessionAuthId);
    if (error) fail(error.message);
  }
  Object.assign(u, { name: patch.name, jobTitle: patch.job_title, dept: patch.dept, theme: patch.theme });
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
