// ============================================================================
// 8. TELAS DE ADMINISTRAÇÃO E GESTÃO
// Administrador vê todas as abas. Instrutor vê só Painel, Cursos, Relatórios e Avisos.
// ============================================================================
const ADMIN_TABS = [['dashboard', 'Painel'], ['users', 'Usuários'], ['groups', 'Grupos e atribuições'], ['courses', 'Cursos'], ['store', 'Produtos da loja'], ['redemptions', 'Trocas'], ['reports', 'Relatórios'], ['announcements', 'Avisos'], ['settings', 'Configurações'], ['data', 'Dados e logs']];
const STAFF_TABS = ['dashboard', 'courses', 'reports', 'announcements'];
const AT = {}; // AT[aba] devolve o HTML de cada aba

VIEWS.admin = async (tab, arg) => {
  need('staff'); tab = tab || 'dashboard';
  const allowed = isAdmin() ? ADMIN_TABS : ADMIN_TABS.filter((t) => STAFF_TABS.includes(t[0])); if (!allowed.some((t) => t[0] === tab)) tab = 'dashboard';
  app.innerHTML = `<div class="page-head"><h1>${isAdmin() ? 'Administração' : 'Gestão'}</h1></div><div class="tabs">${allowed.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="#/admin/${k}">${l}</a>`).join('')}</div><div id="admin-body"></div>`;
  $('admin-body').innerHTML = await AT[tab](arg);
  if (tab === 'data') fillStorage();
};
const barChart = (items) => { const max = Math.max(1, ...items.map((i) => i.value)); return `<div class="vbars">${items.map((i) => `<div title="${i.value}"><small>${i.value || ''}</small><div class="b" style="height:${(i.value / max) * 78}%"></div><small>${i.label}</small></div>`).join('')}</div>`; };

// ---------- PAINEL ----------
AT.dashboard = () => {
  const today = todayISO(), active30 = S.users.filter((u) => u.lastLogin && Date.now() - u.lastLogin < 30 * 864e5).length;
  const overdue = S.enrollments.filter((e) => { const c = course(e.courseId), d = c && dueOf(e, c); return d && d < today && !courseProg(e.userId, e.courseId).complete; }).length;
  const given = S.log.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0), pendRed = S.redemptions.filter((r) => r.status === 'pendente').length;
  const rate = S.enrollments.length ? Math.round((S.certificates.length / S.enrollments.length) * 100) : 0;
  const days = [...Array(14)].map((_, i) => { const iso = isoOf(new Date(Date.now() - (13 - i) * 864e5)); return { label: iso.slice(8), value: S.progress.filter((p) => isoOf(new Date(p.at)) === iso).length }; });
  const bars = S.courses.map((c) => { const e = S.enrollments.filter((x) => x.courseId === c.id).length, k = S.certificates.filter((x) => x.courseId === c.id).length; return { c, e, k, pct: e ? Math.round((k / e) * 100) : 0 }; }).sort((a, b) => b.e - a.e).slice(0, 8);
  const top = S.users.filter((u) => u.role === 'aluno').sort((a, b) => b.xp - a.xp).slice(0, 5);
  return `<div class="grid sm" style="margin-bottom:20px">
      <div class="stat"><b>${S.users.length}</b><span>Usuários (${active30} ativos em 30 dias)</span></div><div class="stat"><b>${S.courses.filter((c) => c.status === 'publicado').length}</b><span>Cursos publicados</span></div>
      <div class="stat"><b>${S.lessons.length}</b><span>Aulas</span></div><div class="stat"><b>${S.enrollments.length}</b><span>Inscrições</span></div>
      <div class="stat"><b>${rate}%</b><span>Taxa de conclusão</span></div><div class="stat"><b>${overdue}</b><span>Prazos atrasados</span></div>
      <div class="stat"><b>${given}</b><span>Pontos distribuídos</span></div><div class="stat"><b>${pendRed}</b><span>Trocas pendentes</span></div></div>
    <div class="row">${panel(`<h2>Aulas concluídas (14 dias)</h2>${barChart(days)}`)}${panel(`<h2>Conclusão por curso</h2>${bars.length ? bars.map((b) => `<div class="hbar"><span title="${esc(b.c.title)}">${esc(b.c.title.slice(0, 26))}</span><div class="bar"><span style="width:${b.pct}%"></span></div><span>${b.pct}%</span></div>`).join('') : '<p class="muted">Sem cursos.</p>'}`)}</div>
    <div class="row">${panel(`<h2>Top 5 do ranking</h2>${top.length ? top.map((u, i) => `<div class="spread" style="padding:5px 0"><span>${i + 1}. ${esc(u.name)}</span><strong>${u.xp} XP</strong></div>`).join('') : '<p class="muted">Sem alunos.</p>'}`)}
      ${panel(`<h2>Atividade recente</h2>${S.audit.slice(-8).reverse().map((a) => `<div class="small" style="padding:3px 0"><span class="muted">${fmtDate(a.at)}</span> · ${esc(user(a.userId)?.name || '—')}: ${esc(a.action)}</div>`).join('') || '<p class="muted">Nada ainda.</p>'}`)}</div>`;
};

// ---------- USUÁRIOS ----------
function userTableHTML() {
  const f = FILTERS.U, q = f.q.toLowerCase(); let L = S.users.slice().reverse();
  if (q) L = L.filter((u) => `${u.name} ${u.email} ${u.jobTitle}`.toLowerCase().includes(q)); if (f.role) L = L.filter((u) => u.role === f.role); if (f.dept) L = L.filter((u) => u.dept === f.dept);
  if (f.status === 'ativo') L = L.filter((u) => u.active && !u.pending); if (f.status === 'inativo') L = L.filter((u) => !u.active); if (f.status === 'pendente') L = L.filter((u) => u.pending);
  if (!L.length) return '<p class="muted">Nenhum usuário encontrado.</p>';
  return `<table><tr><th>Nome</th><th>Perfil</th><th>Depto.</th><th>Nível</th><th>Saldo</th><th>Último acesso</th><th>Situação</th><th>Ações</th></tr>${L.map((u) => `<tr>
    <td>${avatar(u, 'sm')} <a href="#/profile/${u.id}">${esc(u.name)}</a><div class="muted small">${esc(u.email)}</div></td><td>${ROLE[u.role]}</td><td>${esc(u.dept || '—')}</td><td>${levelInfo(u.xp).level}</td><td>${u.points}</td>
    <td>${u.lastLogin ? fmtDate(u.lastLogin) : '—'}</td><td>${u.pending ? tag('Aguardando', 'warn') : u.active ? tag('Ativo', 'ok') : tag('Desativado', 'bad')}</td>
    <td><div class="actions">${u.pending ? `<button class="btn small" data-action="user-approve" data-id="${u.id}">Aprovar</button>` : ''}<button class="btn small ghost" data-action="user-edit" data-id="${u.id}">Editar</button><button class="btn small ghost" data-action="user-points" data-id="${u.id}">Pontos</button>
    <button class="btn small ghost" data-action="user-pw" data-id="${u.id}">Enviar redefinição</button><button class="btn small ghost" data-action="user-toggle" data-id="${u.id}">${u.active ? 'Desativar' : 'Reativar'}</button></div></td></tr>`).join('')}</table>`;
}
REFRESH.U = () => { $('user-table').innerHTML = userTableHTML(); };
AT.users = () => {
  const f = FILTERS.U, pend = S.users.filter((u) => u.pending).length;
  return `${pend ? `<div class="notice">${pend} cadastro(s) aguardando aprovação.</div>` : ''}
    <div class="panel"><div class="spread"><h2 style="margin:0">Usuários (${S.users.length})</h2><div class="actions"><button class="btn" data-action="user-new">+ Novo usuário</button><button class="btn ghost" data-action="user-import">Importar CSV</button><button class="btn ghost" data-action="export-report" data-kind="users">Exportar CSV</button></div></div>
    <div class="row" style="margin-top:12px"><label>Buscar<input data-filter="U.q" value="${esc(f.q)}" placeholder="Nome, e-mail, cargo..."></label>${fsel('Perfil', 'U.role', [['', 'Todos'], ...Object.entries(ROLE)], f.role)}${fsel('Departamento', 'U.dept', [['', 'Todos'], ...S.depts.map((d) => [d, d])], f.dept)}${fsel('Situação', 'U.status', [['', 'Todas'], ['ativo', 'Ativos'], ['inativo', 'Desativados'], ['pendente', 'Aguardando aprovação']], f.status)}</div></div>
    <div class="panel table-wrap" id="user-table">${userTableHTML()}</div>`;
};
const userFields = (u) => `${fld('Nome completo', 'name', u.name, 'required minlength="2"')}<p class="muted small">E-mail de login: ${esc(u.email)}. A alteração é feita pelo próprio usuário na autenticação.</p>
  <div class="row">${sel('Perfil', 'role', Object.entries(ROLE), u.role)}${sel('Departamento', 'dept', [['', 'Nenhum'], ...S.depts.map((d) => [d, d])], u.dept)}${fld('Cargo', 'jobTitle', u.jobTitle)}</div>`;
ACTIONS['user-new'] = () => {
  need('admin'); const url = location.href.split('#')[0] + '#/register';
  openModal('Adicionar usuário', `<p>Envie este endereço para a pessoa criar a própria conta. O acesso começa como aluno; depois você pode ajustar o perfil.</p><label>Link de cadastro<input readonly value="${esc(url)}"></label>`);
};
FORMS.newuser = () => fail(LOCAL_MODE ? 'Compartilhe o link de cadastro local com a pessoa.' : 'Contas são criadas pelo formulário de cadastro do Supabase.');
ACTIONS['user-edit'] = (d) => { need('admin'); const u = user(d.id); openModal('Editar usuário', `<form data-form="edituser" data-id="${u.id}">${userFields(u)}<button class="btn" type="submit">Salvar</button></form>`); };
FORMS.edituser = async (d, form) => {
  need('admin'); const u = user(form.dataset.id);
  if (!u?.authId) fail('Perfil de autenticação não encontrado.');
  if (d.name.trim().length < 2) fail('Informe o nome.');
  if (u.id === me().id && d.role !== 'admin') fail('Você não pode remover seu próprio acesso de administrador.');
  const patch = { name: d.name.trim(), role: d.role, dept: d.dept, job_title: d.jobTitle.trim() };
  if (!LOCAL_MODE) {
    const { error } = await backend.from('profiles').update(patch).eq('id', u.authId);
    if (error) fail(error.message);
  }
  Object.assign(u, { name: patch.name, role: patch.role, dept: patch.dept, jobTitle: patch.job_title });
  profileSnapshots.set(u.authId, profileSnapshot(u)); audit(`Usuário editado: ${u.email}`); save(); closeModal(); rerender();
};
ACTIONS['user-points'] = (d) => { need('admin'); const u = user(d.id); openModal(`Pontos de ${u.name}`, `<p>Saldo atual: <strong>${u.points}</strong></p><form data-form="points" data-id="${u.id}">${fld('Pontos (negativo remove)', 'delta', '10', 'type="number" required')}${fld('Motivo', 'reason', 'Ajuste manual', 'required')}<button class="btn" type="submit">Aplicar</button></form>`); };
FORMS.points = (d, form) => {
  need('admin'); const u = user(form.dataset.id), delta = Math.trunc(Number(d.delta)); if (!delta) fail('Informe uma quantidade diferente de zero.'); if (u.points + delta < 0) fail('O saldo não pode ficar negativo.');
  award(u.id, delta, d.reason.trim() || 'Ajuste manual'); notify(u.id, `Seu saldo foi ajustado em ${delta > 0 ? '+' : ''}${delta} pontos: ${d.reason}`, '#/store'); audit(`Pontos ${delta} para ${u.email}`); save(); closeModal(); renderChrome(); rerender();
};
ACTIONS['user-pw'] = async (d) => {
  need('admin'); const u = user(d.id); if (!u?.email) fail('E-mail do usuário não encontrado.');
  if (LOCAL_MODE) fail('No modo local, peça à pessoa para alterar a senha em Minha conta.');
  const { error } = await backend.auth.resetPasswordForEmail(u.email, { redirectTo: location.origin + location.pathname + '?recovery=1' });
  if (error) fail(error.message); toast(`Link de redefinição enviado para ${u.email}.`);
};
ACTIONS['user-toggle'] = async (d) => {
  need('admin'); const u = user(d.id); if (u.id === me().id) fail('Você não pode desativar a própria conta.');
  const active = !u.active;
  if (!LOCAL_MODE) {
    const { error } = await backend.from('profiles').update({ active }).eq('id', u.authId);
    if (error) fail(error.message);
  }
  u.active = active; profileSnapshots.set(u.authId, profileSnapshot(u)); audit(`${u.active ? 'Reativado' : 'Desativado'}: ${u.email}`); save(); rerender();
};
ACTIONS['user-approve'] = async (d) => {
  need('admin'); const u = user(d.id);
  if (!LOCAL_MODE) {
    const { error } = await backend.from('profiles').update({ pending: false }).eq('id', u.authId);
    if (error) fail(error.message);
  }
  u.pending = false; profileSnapshots.set(u.authId, profileSnapshot(u)); notify(u.id, 'Seu cadastro foi aprovado. Bem-vindo(a)!', '#/home'); audit(`Aprovado: ${u.email}`); save(); rerender();
};
ACTIONS['user-del'] = () => fail('Desative a conta. A exclusão definitiva exige uma função administrativa no servidor.');
ACTIONS['user-import'] = () => { need('admin'); openModal('Importar usuários', '<p>A importação direta foi desativada. Cada pessoa deve criar a própria conta pelo link de cadastro para autenticar com segurança.</p><button class="btn" data-action="close">Fechar</button>'); };
FORMS.importusers = () => fail('A importação direta de contas não está disponível.');

// ---------- GRUPOS (departamentos) E ATRIBUIÇÕES ----------
function assignFormHTML(courseId) {
  const targets = [['all', 'Todos os usuários ativos'], ...S.depts.map((d) => ['dept:' + d, 'Departamento: ' + d]), ['role:aluno', 'Todos os alunos'], ['role:instrutor', 'Todos os instrutores'], ...S.users.filter((u) => u.active).map((u) => ['user:' + u.id, 'Pessoa: ' + u.name])];
  return `<form data-form="assign">${sel('Curso ou padrão de serviço', 'courseId', S.courses.map((c) => [c.id, c.title]), courseId)}${sel('Destino', 'target', targets, 'all')}<label>Prazo (opcional)<input type="date" name="dueDate"></label><button class="btn" type="submit">Atribuir e notificar</button></form>`;
}
// Inscreve os usuários escolhidos (e define o prazo). Quem já estava inscrito só recebe o novo prazo.
FORMS.assign = (d) => {
  need('staff'); const c = course(d.courseId); if (!c) fail('Escolha um curso.');
  const [kind, val] = d.target.split(':'); let L = S.users.filter((u) => u.active && !u.pending);
  if (kind === 'dept') L = L.filter((u) => u.dept === val); if (kind === 'role') L = L.filter((u) => u.role === val); if (kind === 'user') L = L.filter((u) => u.id === Number(val));
  if (!L.length) fail('Nenhum usuário encontrado nesse destino.'); let added = 0;
  L.forEach((u) => { const e = enrollment(u.id, c.id); if (e) { if (d.dueDate) e.dueDate = d.dueDate; } else { S.enrollments.push({ userId: u.id, courseId: c.id, at: Date.now(), dueDate: d.dueDate || '', by: me().id }); added++; }
    notify(u.id, `📌 Curso atribuído: ${c.title}${d.dueDate ? ` (prazo ${fmtISO(d.dueDate)})` : ''}`, `#/course/${c.id}`); });
  audit(`Atribuído "${c.title}" a ${L.length} pessoa(s)`); save(); closeModal(); toast(`${added} nova(s) inscrição(ões); ${L.length} notificada(s).`); rerender();
};
ACTIONS['assign-open'] = (d) => { need('staff'); openModal('Atribuir curso', assignFormHTML(d.id)); };
AT.groups = () => panel(`<h2>Departamentos</h2><form data-form="dept" class="row"><label>Novo departamento<input name="name" required></label><div><button class="btn" type="submit">Adicionar</button></div></form>
    <div class="table-wrap"><table><tr><th>Departamento</th><th>Pessoas</th><th></th></tr>${S.depts.map((d) => `<tr><td>${esc(d)}</td><td>${S.users.filter((u) => u.dept === d).length}</td><td><button class="btn small danger" data-action="dept-del" data-name="${esc(d)}">Excluir</button></td></tr>`).join('')}</table></div>`)
  + panel(`<h2>Atribuir curso ou padrão de serviço</h2><p class="muted small">Inscreve pessoas de uma vez, define prazo e envia notificação. Ideal para padrões de serviço obrigatórios.</p>${S.courses.length ? assignFormHTML('') : '<p class="muted">Crie um curso primeiro.</p>'}`);
FORMS.dept = (d) => { need('admin'); const n = d.name.trim(); if (!n) fail('Informe o nome.'); if (S.depts.includes(n)) fail('Esse departamento já existe.'); S.depts.push(n); save(); rerender(); };
ACTIONS['dept-del'] = (d) => { need('admin'); if (!confirm(`Excluir o departamento "${d.name}"? As pessoas mantêm o nome dele no cadastro.`)) return; S.depts = S.depts.filter((x) => x !== d.name); save(); rerender(); };

// ---------- CURSOS (criar, editar, publicar, excluir) ----------
AT.courses = () => `<div class="panel"><div class="spread"><h2 style="margin:0">Cursos e padrões de serviço (${S.courses.length})</h2><button class="btn" data-action="course-new">+ Novo curso</button></div></div>
  <div class="panel table-wrap">${S.courses.length ? `<table><tr><th>Título</th><th>Tipo</th><th>Status</th><th>Aulas</th><th>Inscritos</th><th>Concluíram</th><th>Nota</th><th>Ações</th></tr>${S.courses.slice().reverse().map((c) => {
    const r = avgRating(c.id); return `<tr><td><a href="#/course/${c.id}">${esc(c.emoji || '')} ${esc(c.title)}</a>${c.mandatory ? ' ' + tag('Obrigatório', 'bad') : ''}</td><td>${CAT[c.category]}</td><td>${c.status === 'publicado' ? tag('Publicado', 'ok') : tag('Rascunho', 'warn')}</td>
    <td>${lessonsOf(c.id).length}</td><td>${S.enrollments.filter((e) => e.courseId === c.id).length}</td><td>${S.certificates.filter((x) => x.courseId === c.id).length}</td><td>${r.n ? '★ ' + r.avg.toFixed(1) : '—'}</td>
    <td><div class="actions"><a class="btn small ghost" href="#/course/${c.id}">Abrir</a><button class="btn small ghost" data-action="course-edit" data-id="${c.id}">Editar</button><button class="btn small ghost" data-action="assign-open" data-id="${c.id}">Atribuir</button>
    <button class="btn small ghost" data-action="course-publish" data-id="${c.id}">${c.status === 'publicado' ? 'Despublicar' : 'Publicar'}</button>${isAdmin() ? `<button class="btn small danger" data-action="course-del" data-id="${c.id}">Excluir</button>` : ''}</div></td></tr>`; }).join('')}</table>` : '<div class="empty">Nenhum curso ainda. Crie o primeiro!</div>'}</div>`;
function courseForm(c) {
  c = c || { title: '', description: '', objectives: '', category: 'curso', area: '', level: 'iniciante', instructor: me().name, status: 'rascunho', mandatory: false, sequential: false, deadline: '', bonus: S.settings.courseBonus, prereq: '', emoji: '📘' };
  return `<form data-form="course" data-id="${c.id || ''}">${fld('Título', 'title', c.title, 'required minlength="2"')}${area('Descrição', 'description', c.description)}${area('Objetivos (opcional)', 'objectives', c.objectives)}
    <div class="row">${sel('Tipo', 'category', Object.entries(CAT), c.category)}${fld('Área', 'area', c.area, 'list="areas"')}${sel('Nível', 'level', Object.entries(LEVELS), c.level)}</div>
    <div class="row">${fld('Instrutor', 'instructor', c.instructor)}${fld('Emoji da capa', 'emoji', c.emoji, 'maxlength="4"')}${sel('Status', 'status', [['rascunho', 'Rascunho (só a equipe vê)'], ['publicado', 'Publicado']], c.status)}</div>
    <div class="row"><label>Prazo geral (opcional)<input type="date" name="deadline" value="${c.deadline || ''}"></label>${fld('Pontos ao concluir o curso', 'bonus', c.bonus, 'type="number" min="0"')}${sel('Pré-requisito', 'prereq', [['', 'Nenhum'], ...S.courses.filter((x) => x.id !== c.id).map((x) => [x.id, x.title])], c.prereq)}</div>
    ${chk('Curso obrigatório (aparece como pendência no início)', 'mandatory', c.mandatory)}${chk('Aulas em sequência (libera uma após concluir a anterior)', 'sequential', c.sequential)}
    <datalist id="areas">${[...new Set(S.courses.map((x) => x.area).filter(Boolean))].map((a) => `<option value="${esc(a)}">`).join('')}</datalist><button class="btn" type="submit">Salvar</button></form>`;
}
ACTIONS['course-new'] = () => { need('staff'); openModal('Novo curso', courseForm(), true); };
ACTIONS['course-edit'] = (d) => { need('staff'); openModal('Editar curso', courseForm(course(d.id)), true); };
FORMS.course = (d, form) => {
  need('staff'); if (d.title.trim().length < 2) fail('Informe o título.');
  const data = { title: d.title.trim(), description: d.description.trim(), objectives: d.objectives.trim(), category: d.category, area: d.area.trim(), level: d.level, instructor: d.instructor.trim(), emoji: d.emoji.trim() || '📘', status: d.status,
    deadline: d.deadline, bonus: Math.max(0, Math.trunc(Number(d.bonus)) || 0), prereq: d.prereq ? Number(d.prereq) : '', mandatory: d.mandatory === 'on', sequential: d.sequential === 'on' };
  const id = Number(form.dataset.id);
  if (id) { Object.assign(course(id), data); audit(`Curso editado: ${data.title}`); save(); closeModal(); rerender(); }
  else { const nidc = nid(); S.courses.push({ id: nidc, createdAt: Date.now(), materials: [], ...data }); audit(`Curso criado: ${data.title}`); save(); closeModal(); toast('Curso criado! Agora adicione as aulas.'); go('#/course/' + nidc); }
};
ACTIONS['course-publish'] = (d) => { need('staff'); const c = course(d.id); if (c.status !== 'publicado' && !lessonsOf(c.id).length && !confirm('Este curso ainda não tem aulas. Publicar mesmo assim?')) return; c.status = c.status === 'publicado' ? 'rascunho' : 'publicado'; audit(`${c.status}: ${c.title}`); save(); rerender(); };
ACTIONS['course-del'] = async (d) => { need('admin'); const c = course(d.id); if (!confirm(`Excluir "${c.title}", todas as aulas, vídeos, provas, inscrições e certificados? Não dá para desfazer.`)) return; audit(`Curso excluído: ${c.title}`); await purgeCourse(c.id); save(); curCourse = null; go('#/admin/courses'); };

// ---------- AULAS (criar, editar, ordenar, excluir) ----------
function lessonForm(l, courseId) {
  l = l || { title: '', module: '', type: 'video', url: '', content: '', filePath: null, duration: 5, points: S.settings.pointsPerLesson };
  return `<form data-form="lesson" data-id="${l.id || ''}" data-course="${courseId}">${fld('Título da aula', 'title', l.title, 'required minlength="2"')}<div class="row">${fld('Módulo (agrupa as aulas)', 'module', l.module)}${sel('Tipo de conteúdo', 'type', [['video', 'Vídeo — anexar arquivo'], ['link', 'Vídeo — adicionar link'], ['texto', 'Texto']], l.type)}</div>
    <div class="only-video"><label>Arquivo de vídeo (MP4, WebM, OGG ou MOV)${l.id && (l.filePath || l.fileId) ? ' — deixe vazio para manter o atual' : ''}<input type="file" name="video" accept="video/mp4,video/webm,video/ogg,video/quicktime"></label>
      ${LOCAL_MODE ? '<p class="muted small">No modo de teste, o arquivo fica armazenado neste navegador (IndexedDB), sem envio ao banco.</p>' : ''}</div>
    <div class="only-link"><label>Link do vídeo<input name="url" value="${esc(l.url)}" placeholder="Link do YouTube ou URL direta do arquivo de vídeo"></label><p class="muted small">Aceita links do YouTube ou um endereço direto para um vídeo que possa ser reproduzido no navegador.</p></div>
    <label class="only-texto">Conteúdo (use # título, - lista, **negrito**)<textarea name="content" rows="8">${esc(l.content)}</textarea></label>
    <div class="row">${fld('Duração (minutos)', 'duration', l.duration, 'type="number" min="0"')}${fld('Pontos ao concluir', 'points', l.points, 'type="number" min="0" required')}</div><button class="btn" type="submit">Salvar aula</button></form>`;
}
// Mostra só os campos do tipo de aula escolhido.
function syncLessonForm(form) { const t = form.type.value; ['video', 'link', 'texto'].forEach((k) => form.querySelectorAll('.only-' + k).forEach((el) => el.classList.toggle('hide', k !== t))); }
ACTIONS['lesson-new'] = (d) => { need('staff'); openModal('Nova aula', lessonForm(null, d.id), true); syncLessonForm($('modal-body').querySelector('form')); };
ACTIONS['lesson-edit'] = (d) => { need('staff'); const l = lesson(d.id); openModal('Editar aula', lessonForm(l, l.courseId), true); syncLessonForm($('modal-body').querySelector('form')); };
FORMS.lesson = async (d, form) => {
  need('staff'); const cid = Number(form.dataset.course), id = Number(form.dataset.id), old = id ? lesson(id) : null;
  if (d.title.trim().length < 2) fail('Informe o título da aula.'); const points = Math.trunc(Number(d.points)); if (!(points >= 0)) fail('Pontos inválidos.');
  const lessonId = id || nid();
  const rec = { title: d.title.trim(), module: d.module.trim(), type: d.type, points, duration: Math.max(0, Math.trunc(Number(d.duration)) || 0), url: '', content: '', fileId: old?.fileId || null, filePath: old?.filePath || null };
  if (d.type === 'video') {
    const f = form.video.files[0]; if (!f && !(old && (old.fileId || old.filePath))) fail('Selecione o arquivo de vídeo.');
    if (f) {
      if (!['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'].includes(f.type)) fail('Use um vídeo MP4, WebM, OGG ou MOV.');
      const filename = f.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'video';
      if (LOCAL_MODE) {
        rec.filePath = null;
        rec.fileId = `${cid}/${lessonId}/${Date.now()}`;
        await idbPut(rec.fileId, f);
      } else {
        const filePath = `${cid}/${lessonId}/${Date.now()}-${filename}`;
        const { error } = await backend.storage.from('course-videos').upload(filePath, f, { contentType: f.type, upsert: false });
        if (error) fail(error.message);
        if (old?.filePath) await backend.storage.from('course-videos').remove([old.filePath]);
        rec.filePath = filePath; rec.fileId = null;
      }
      if (old?.fileId) await idbDel(old.fileId);
      if (!rec.duration) rec.duration = await probeDuration(f);
    }
  } else {
    if (old?.filePath && !LOCAL_MODE) { const { error } = await backend.storage.from('course-videos').remove([old.filePath]); if (error) fail(error.message); rec.filePath = null; }
    if (old?.fileId) { await idbDel(old.fileId); rec.fileId = null; }
    if (d.type === 'link') { if (!/^https?:\/\//i.test(d.url.trim())) fail('Informe um endereço começando com http:// ou https://'); rec.url = d.url.trim(); }
    else { if (!d.content.trim()) fail('Escreva o conteúdo da aula.'); rec.content = d.content; }
  }
  if (old) Object.assign(old, rec); else S.lessons.push({ id: lessonId, courseId: cid, position: Math.max(0, ...lessonsOf(cid).map((l) => l.position)) + 1, ...rec });
  audit(`Aula salva: ${rec.title}`); save(); closeModal(); toast('Aula salva.'); rerender();
};
// Sobe/desce a aula trocando as posições.
function moveLesson(id, dir) { const l = lesson(id), ls = lessonsOf(l.courseId), i = ls.findIndex((x) => x.id === l.id), o = ls[i + dir]; if (!o) return; [l.position, o.position] = [o.position, l.position]; save(); rerender(); }
ACTIONS['lesson-up'] = (d) => { need('staff'); moveLesson(Number(d.id), -1); };
ACTIONS['lesson-down'] = (d) => { need('staff'); moveLesson(Number(d.id), 1); };
ACTIONS['lesson-del'] = async (d) => { need('staff'); const l = lesson(d.id); if (!confirm(`Excluir a aula "${l.title}"?`)) return; if (l.fileId) await idbDel(l.fileId); if (l.filePath && !LOCAL_MODE) { const { error } = await backend.storage.from('course-videos').remove([l.filePath]); if (error) fail(error.message); } S.lessons = S.lessons.filter((x) => x.id !== l.id); S.progress = S.progress.filter((p) => p.lessonId !== l.id); Object.keys(S.watch).forEach((k) => Number(k.split(':')[1]) === l.id && delete S.watch[k]); save(); rerender(); };

// ---------- PROVA (editor visual) ----------
ACTIONS['quiz-edit'] = (d) => {
  need('staff'); const q = quizOf(Number(d.id)) || { passScore: 70, points: S.settings.quizPassBonus, maxAttempts: 3, questions: [] };
  const questions = q.questions.length ? q.questions : [{ q: '', options: ['', ''], correct: 0, explain: '' }];
  openModal('Prova do curso', `<form data-form="quizedit" data-id="${d.id}">
    <p class="muted small">Crie cada pergunta e suas alternativas abaixo. Marque uma única resposta correta em cada pergunta.</p>
    <div class="row">${fld('Nota mínima (%)', 'passScore', q.passScore, 'type="number" min="1" max="100" required')}${fld('Pontos na 1ª aprovação', 'points', q.points, 'type="number" min="0"')}${fld('Máx. de tentativas (0 = ilimitado)', 'maxAttempts', q.maxAttempts, 'type="number" min="0"')}</div>
    <div data-quiz-questions>${questions.map(quizEditorQuestionHTML).join('')}</div>
    <div class="actions"><button type="button" class="btn ghost" data-action="quiz-question-add">+ Adicionar pergunta</button>
      <button class="btn" type="submit">Salvar prova</button>${quizOf(Number(d.id)) ? `<button class="btn danger" type="button" data-action="quiz-del" data-id="${d.id}">Remover prova</button>` : ''}</div>
  </form>`, true);
};
FORMS.quizedit = (d, form) => {
  need('staff');
  const cid = Number(form.dataset.id);
  const questions = [...form.querySelectorAll('[data-quiz-question]')].map((card, index) => {
    const question = card.querySelector('[data-quiz-question-text]').value.trim();
    const options = [...card.querySelectorAll('[data-quiz-option]')].map((input) => input.value.trim());
    const selected = card.querySelector('input[type="radio"]:checked');
    if (!question) fail(`Informe o enunciado da pergunta ${index + 1}.`);
    if (options.length < 2 || options.length > 5) fail(`A pergunta ${index + 1} precisa ter de 2 a 5 alternativas.`);
    if (options.some((option) => !option)) fail(`Preencha todas as alternativas da pergunta ${index + 1}.`);
    if (!selected) fail(`Selecione a resposta correta da pergunta ${index + 1}.`);
    return { q: question, options, correct: Number(selected.value), explain: card.querySelector('[data-quiz-explanation]').value.trim() };
  });
  if (!questions.length) fail('Adicione pelo menos uma pergunta.');
  const passScore = Math.trunc(Number(d.passScore)), points = Math.trunc(Number(d.points)), maxAttempts = Math.trunc(Number(d.maxAttempts));
  if (!(passScore >= 1 && passScore <= 100)) fail('A nota mínima deve estar entre 1 e 100%.');
  if (!(points >= 0) || !(maxAttempts >= 0)) fail('Pontos e tentativas não podem ser negativos.');
  const rec = { courseId: cid, questions, passScore, points, maxAttempts };
  const q = quizOf(cid); if (q) Object.assign(q, rec); else S.quizzes.push(rec); audit(`Prova salva: ${course(cid).title}`); save(); closeModal(); toast('Prova salva.'); rerender();
};
ACTIONS['quiz-question-add'] = (d, el) => {
  need('staff');
  const form = el.closest('form[data-form="quizedit"]'), list = form.querySelector('[data-quiz-questions]');
  list.insertAdjacentHTML('beforeend', quizEditorQuestionHTML(null, list.querySelectorAll('[data-quiz-question]').length));
  renumberQuizEditor(form);
  list.lastElementChild.scrollIntoView({ block: 'nearest' });
};
ACTIONS['quiz-question-remove'] = (d, el) => {
  need('staff');
  const form = el.closest('form[data-form="quizedit"]'), questions = form.querySelectorAll('[data-quiz-question]');
  if (questions.length <= 1) fail('A prova precisa ter pelo menos uma pergunta.');
  el.closest('[data-quiz-question]').remove();
  renumberQuizEditor(form);
};
ACTIONS['quiz-option-add'] = (d, el) => {
  need('staff');
  const form = el.closest('form[data-form="quizedit"]'), question = el.closest('[data-quiz-question]');
  const options = question.querySelectorAll('.quiz-editor-option'), index = Number(question.dataset.index);
  if (options.length >= 5) fail('Cada pergunta pode ter no máximo 5 alternativas.');
  question.querySelector('[data-quiz-options]').insertAdjacentHTML('beforeend', quizEditorOptionHTML('', index, options.length, -1));
  renumberQuizEditor(form);
};
ACTIONS['quiz-option-remove'] = (d, el) => {
  need('staff');
  const form = el.closest('form[data-form="quizedit"]'), question = el.closest('[data-quiz-question]');
  const options = question.querySelectorAll('.quiz-editor-option');
  if (options.length <= 2) fail('Cada pergunta precisa ter pelo menos 2 alternativas.');
  const wasCorrect = el.closest('.quiz-editor-option').querySelector('input[type="radio"]').checked;
  el.closest('.quiz-editor-option').remove();
  renumberQuizEditor(form);
  if (wasCorrect) question.querySelector('input[type="radio"]').checked = true;
};
ACTIONS['quiz-del'] = (d) => { need('staff'); if (!confirm('Remover a prova? As tentativas anteriores também serão apagadas.')) return; const cid = Number(d.id); S.quizzes = S.quizzes.filter((q) => q.courseId !== cid); S.attempts = S.attempts.filter((a) => a.courseId !== cid); S.users.forEach((u) => checkCourseCompletion(u.id, cid)); save(); closeModal(); rerender(); };

// ---------- PRODUTOS DA LOJA (BASE: edite aqui para personalizar) ----------
AT.store = () => `<div class="panel"><div class="spread"><h2 style="margin:0">Produtos da loja (${S.products.length})</h2><button class="btn" data-action="product-new">+ Novo produto</button></div></div>
  <div class="panel table-wrap">${S.products.length ? `<table><tr><th>Produto</th><th>Categoria</th><th>Pontos</th><th>Estoque</th><th>Limite</th><th>Situação</th><th>Ações</th></tr>${S.products.slice().reverse().map((p) => `<tr><td>${p.image ? `<img src="${p.image}" alt="" width="28" style="vertical-align:middle;border-radius:4px">` : esc(p.emoji || '🎁')} ${esc(p.name)}</td><td>${esc(p.category || '—')}</td><td>${p.cost}</td><td>${p.unlimited ? '∞' : p.stock}</td><td>${p.limit || '—'}</td><td>${p.active ? tag('Visível', 'ok') : tag('Oculto', 'warn')}</td>
    <td><div class="actions"><button class="btn small ghost" data-action="product-edit" data-id="${p.id}">Editar</button><button class="btn small ghost" data-action="product-toggle" data-id="${p.id}">${p.active ? 'Ocultar' : 'Mostrar'}</button><button class="btn small danger" data-action="product-del" data-id="${p.id}">Excluir</button></div></td></tr>`).join('')}</table>` : '<div class="empty">Nenhum produto cadastrado.</div>'}</div>`;
function productForm(p) {
  p = p || { name: '', description: '', category: '', cost: 100, stock: 10, unlimited: false, limit: 0, emoji: '🎁', image: '', active: true };
  return `<form data-form="product" data-id="${p.id || ''}">${fld('Nome', 'name', p.name, 'required minlength="2"')}${area('Descrição', 'description', p.description)}
    <div class="row">${fld('Categoria', 'category', p.category, 'list="pcats"')}${fld('Custo em pontos', 'cost', p.cost, 'type="number" min="1" required')}${fld('Emoji (se não tiver imagem)', 'emoji', p.emoji, 'maxlength="4"')}</div>
    <div class="row">${fld('Estoque', 'stock', p.stock, 'type="number" min="0"')}${fld('Limite por pessoa (0 = sem limite)', 'limit', p.limit, 'type="number" min="0"')}<label>Imagem (opcional)<input type="file" name="image" accept="image/*"></label></div>
    ${chk('Estoque ilimitado', 'unlimited', p.unlimited)}${chk('Visível na loja', 'active', p.active)}${p.image ? chk('Remover imagem atual', 'removeImage', false) : ''}
    <datalist id="pcats">${[...new Set(S.products.map((x) => x.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist><button class="btn" type="submit">Salvar produto</button></form>`;
}
ACTIONS['product-new'] = () => { need('admin'); openModal('Novo produto', productForm()); };
ACTIONS['product-edit'] = (d) => { need('admin'); openModal('Editar produto', productForm(product(d.id))); };
FORMS.product = async (d, form) => {
  need('admin'); const cost = Math.trunc(Number(d.cost)); if (d.name.trim().length < 2) fail('Informe o nome.'); if (!(cost >= 1)) fail('O custo precisa ser de pelo menos 1 ponto.');
  const id = Number(form.dataset.id), old = id ? product(id) : null, f = form.image.files[0];
  const rec = { name: d.name.trim(), description: d.description.trim(), category: d.category.trim(), cost, stock: Math.max(0, Math.trunc(Number(d.stock)) || 0), unlimited: d.unlimited === 'on', limit: Math.max(0, Math.trunc(Number(d.limit)) || 0), emoji: d.emoji.trim() || '🎁', active: d.active === 'on', image: old?.image || '' };
  if (d.removeImage === 'on') rec.image = ''; if (f) rec.image = await imageToDataURL(f);
  if (old) Object.assign(old, rec); else S.products.push({ id: nid(), ...rec }); audit(`Produto salvo: ${rec.name}`); save(); closeModal(); rerender();
};
ACTIONS['product-toggle'] = (d) => { need('admin'); const p = product(d.id); p.active = !p.active; save(); rerender(); };
ACTIONS['product-del'] = (d) => { need('admin'); const p = product(d.id); if (!confirm(`Excluir "${p.name}"? Os pedidos já feitos continuam no histórico.`)) return; S.products = S.products.filter((x) => x.id !== p.id); save(); rerender(); };

// ---------- TROCAS (pedidos: pendente > aprovado > entregue, ou cancelado) ----------
AT.redemptions = (st) => {
  const L = S.redemptions.filter((r) => !st || r.status === st).slice().reverse();
  const tabs = [['', 'Todas'], ['pendente', 'Pendentes'], ['aprovado', 'Aprovadas'], ['entregue', 'Entregues'], ['cancelado', 'Canceladas']];
  return `<div class="tabs">${tabs.map(([k, l]) => `<a class="${(st || '') === k ? 'on' : ''}" href="#/admin/redemptions${k ? '/' + k : ''}">${l} (${S.redemptions.filter((r) => !k || r.status === k).length})</a>`).join('')}</div>
    <div class="panel table-wrap">${L.length ? `<table><tr><th>Pessoa</th><th>Produto</th><th>Pontos</th><th>Código</th><th>Situação</th><th>Data</th><th>Ações</th></tr>${L.map((r) => { const u = user(r.userId); return `<tr><td>${esc(u?.name || 'Removido')}<div class="muted small">${esc(u?.dept || '')}</div></td><td>${esc(r.productName)}</td><td>${r.cost}</td><td><strong>${r.code}</strong></td><td>${tag(r.status, STATUS_TAG[r.status])}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td><td>${fmtDate(r.at)}</td>
      <td><div class="actions">${r.status === 'pendente' ? `<button class="btn small" data-action="red-set" data-id="${r.id}" data-to="aprovado">Aprovar</button>` : ''}${r.status === 'aprovado' ? `<button class="btn small" data-action="red-set" data-id="${r.id}" data-to="entregue">Marcar entregue</button>` : ''}${['pendente', 'aprovado'].includes(r.status) ? `<button class="btn small danger" data-action="red-cancel" data-id="${r.id}">Cancelar e estornar</button>` : ''}</div></td></tr>`; }).join('')}</table>` : '<p class="muted">Nenhum pedido nesta situação.</p>'}</div>`;
};
ACTIONS['red-set'] = (d) => { need('admin'); const r = S.redemptions.find((x) => x.id === Number(d.id)); r.status = d.to; notify(r.userId, d.to === 'aprovado' ? `✅ Sua troca "${r.productName}" foi aprovada!` : `📦 Sua troca "${r.productName}" foi entregue!`, '#/store'); audit(`Troca ${r.code}: ${d.to}`); save(); rerender(); };
ACTIONS['red-cancel'] = (d) => { need('admin'); const note = prompt('Motivo do cancelamento (a pessoa verá):', 'Produto indisponível'); if (note === null) return; cancelRedemption(S.redemptions.find((x) => x.id === Number(d.id)), note); audit('Troca cancelada e estornada'); save(); rerender(); };

// ---------- RELATÓRIOS (tabela na tela e exportação CSV) ----------
function courseReportRows(cid) {
  const c = course(cid), q = quizOf(cid), rows = [['Nome', 'Departamento', 'Aulas concluídas', 'Progresso %', 'Melhor nota', 'Concluído em', 'Prazo', 'Situação']];
  S.enrollments.filter((e) => e.courseId === cid).forEach((e) => { const u = user(e.userId); if (!u) return; const p = courseProg(u.id, cid), cert = certOf(u.id, cid), due = dueOf(e, c), best = S.attempts.filter((a) => a.userId === u.id && a.courseId === cid).reduce((m, a) => Math.max(m, a.score), -1);
    rows.push([u.name, u.dept || '', `${p.done}/${p.total}`, p.pct, q ? (best >= 0 ? best + '%' : '—') : 'sem prova', cert ? new Date(cert.at).toLocaleDateString('pt-BR') : '', fmtISO(due), p.complete ? 'Concluído' : due && due < todayISO() ? 'Atrasado' : p.done ? 'Em andamento' : 'Não iniciado']); });
  return rows;
}
const tableFromRows = (rows) => `<table><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
REFRESH.X = () => rerender();
AT.reports = () => {
  const f = FILTERS.X; if (!f.course && S.courses[0]) f.course = String(S.courses[0].id); const rows = f.course ? courseReportRows(Number(f.course)) : null;
  return panel(`<h2>Relatório por curso</h2>${S.courses.length ? `<div class="row">${fsel('Curso', 'X.course', S.courses.map((c) => [String(c.id), c.title]), f.course)}<div style="align-self:end"><button class="btn ghost" data-action="export-report" data-kind="course">Exportar CSV</button></div></div>` : ''}
      <div class="table-wrap">${rows && rows.length > 1 ? tableFromRows(rows) : '<p class="muted">Sem inscritos neste curso.</p>'}</div>`)
    + panel(`<h2>Outros relatórios (CSV)</h2><div class="actions"><button class="btn ghost" data-action="export-report" data-kind="users">Usuários e desempenho</button><button class="btn ghost" data-action="export-report" data-kind="redemptions">Trocas da loja</button><button class="btn ghost" data-action="export-report" data-kind="points">Histórico de pontos</button></div>`);
};
ACTIONS['export-report'] = (d) => {
  need('staff'); const day = todayISO();
  if (d.kind === 'course') { if (!FILTERS.X.course) fail('Escolha um curso.'); downloadCSV(`relatorio-curso-${day}.csv`, courseReportRows(Number(FILTERS.X.course))); }
  else if (d.kind === 'users') downloadCSV(`usuarios-${day}.csv`, [['Nome', 'E-mail', 'Perfil', 'Departamento', 'Inscrições', 'Cursos concluídos', 'Aulas', 'XP', 'Saldo', 'Último acesso'], ...S.users.map((u) => { const st = userStats(u); return [u.name, u.email, ROLE[u.role], u.dept, S.enrollments.filter((e) => e.userId === u.id).length, st.courses, st.lessons, u.xp, u.points, u.lastLogin ? fmtDate(u.lastLogin) : '']; })]);
  else if (d.kind === 'redemptions') { need('admin'); downloadCSV(`trocas-${day}.csv`, [['Pessoa', 'Produto', 'Pontos', 'Código', 'Situação', 'Data'], ...S.redemptions.map((r) => [user(r.userId)?.name || '', r.productName, r.cost, r.code, r.status, fmtDate(r.at)])]); }
  else if (d.kind === 'points') { need('admin'); downloadCSV(`pontos-${day}.csv`, [['Pessoa', 'Pontos', 'Motivo', 'Data'], ...S.log.map((l) => [user(l.userId)?.name || '', l.delta, l.reason, fmtDate(l.at)])]); }
};

// ---------- AVISOS (mural na tela inicial) ----------
AT.announcements = () => panel(`<h2>Novo aviso</h2><form data-form="announce">${fld('Título', 'title', '', 'required')}${area('Mensagem', 'text', '', 'required')}${chk('Fixar no topo', 'pinned', false)}<button class="btn" type="submit">Publicar aviso</button></form>`)
  + panel(`<h2>Avisos publicados</h2>${S.announcements.length ? S.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.at - a.at).map((n) => `<div class="spread" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><strong>${n.pinned ? '📌 ' : ''}${esc(n.title)}</strong> <span class="muted small">${fmtDate(n.at)}</span><div>${esc(n.text)}</div></div><button class="btn small danger" data-action="announce-del" data-id="${n.id}">Excluir</button></div>`).join('') : '<p class="muted">Nenhum aviso.</p>'}`);
FORMS.announce = (d) => { need('staff'); if (!d.title.trim() || !d.text.trim()) fail('Preencha título e mensagem.'); S.announcements.push({ id: nid(), title: d.title.trim(), text: d.text.trim(), at: Date.now(), authorId: me().id, pinned: d.pinned === 'on' }); S.users.filter((u) => u.id !== me().id && u.active).forEach((u) => notify(u.id, `📢 ${d.title.trim()}`, '#/home')); audit(`Aviso: ${d.title}`); save(); toast('Aviso publicado.'); rerender(); };
ACTIONS['announce-del'] = (d) => { need('staff'); S.announcements = S.announcements.filter((n) => n.id !== Number(d.id)); save(); rerender(); };

// ---------- CONFIGURAÇÕES (regras de pontos, aparência, cadastro) ----------
AT.settings = () => {
  const s = S.settings;
  return panel(`<h2>Configurações da plataforma</h2><form data-form="settings"><div class="row">${fld('Nome da plataforma', 'platformName', s.platformName, 'required')}<label>Cor de destaque<input type="color" name="accent" value="${s.accent}"></label></div>
    ${chk('Permitir que pessoas se cadastrem sozinhas', 'openSignup', s.openSignup)}${chk('Exigir aprovação do administrador para novos cadastros', 'requireApproval', s.requireApproval)}
    <h3 style="margin-top:16px">Regras de pontos</h3><div class="row">${fld('Pontos padrão por aula (novas aulas)', 'pointsPerLesson', s.pointsPerLesson, 'type="number" min="0"')}${fld('Bônus padrão ao concluir curso', 'courseBonus', s.courseBonus, 'type="number" min="0"')}${fld('Pontos padrão por aprovação em prova', 'quizPassBonus', s.quizPassBonus, 'type="number" min="0"')}</div>
    <div class="row">${fld('Pontos do check-in diário', 'dailyBonus', s.dailyBonus, 'type="number" min="0"')}${fld('Bônus a cada 7 dias seguidos', 'streak7Bonus', s.streak7Bonus, 'type="number" min="0"')}${fld('XP por nível (base da curva)', 'levelStep', s.levelStep, 'type="number" min="10"')}${fld('% mínimo assistido para concluir vídeo', 'minWatchPct', s.minWatchPct, 'type="number" min="10" max="100"')}</div>
    <p class="muted small">Os valores padrão valem para cursos e aulas novos; os já criados mantêm os seus.</p><button class="btn" type="submit">Salvar configurações</button></form>`);
};
FORMS.settings = (d) => {
  need('admin'); const n = (k, min = 0) => Math.max(min, Math.trunc(Number(d[k])) || 0);
  Object.assign(S.settings, { platformName: d.platformName.trim() || 'Academia Corporativa', accent: /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : '#0b6e5f', openSignup: d.openSignup === 'on', requireApproval: d.requireApproval === 'on',
    pointsPerLesson: n('pointsPerLesson'), courseBonus: n('courseBonus'), quizPassBonus: n('quizPassBonus'), dailyBonus: n('dailyBonus'), streak7Bonus: n('streak7Bonus'), levelStep: n('levelStep', 10) || 100, minWatchPct: Math.min(100, n('minWatchPct', 10)) });
  audit('Configurações alteradas'); save(); applyTheme(); toast('Configurações salvas.'); rerender();
};

// ---------- DADOS E LOGS (backup, demonstração, atividades) ----------
AT.data = () => panel(`<h2>Dados da plataforma</h2><p class="muted">${LOCAL_MODE ? 'Modo de teste local: os dados ficam neste navegador e os arquivos ficam no IndexedDB. Ao limpar os dados do navegador, a demonstração também será apagada.' : 'Contas e dados do curso são sincronizados com o Supabase. Vídeos ficam no Storage privado do projeto. Para restaurar ou apagar dados, use o painel administrativo do Supabase.'}</p>
  <div class="actions"><button class="btn" data-action="export">Baixar exportação (.json)</button><button class="btn ghost" data-action="seed">Carregar dados de demonstração</button></div>`)
  + panel(`<h2>Registro de atividades (últimas 100)</h2><div class="table-wrap">${S.audit.length ? `<table><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr>${S.audit.slice(-100).reverse().map((a) => `<tr><td>${fmtDate(a.at)}</td><td>${esc(user(a.userId)?.name || '—')}</td><td>${esc(a.action)}</td></tr>`).join('')}</table>` : '<p class="muted">Sem registros.</p>'}</div>`);
function fillStorage() { const el = $('storage-info'); if (el) el.textContent = LOCAL_MODE ? 'LocalStorage + IndexedDB' : 'Supabase'; }
ACTIONS.export = () => { need('admin'); downloadBlob(`backup-${todayISO()}.json`, new Blob([JSON.stringify(S)], { type: 'application/json' })); };
ACTIONS.reset = () => fail('A exclusão global deve ser feita no painel do Supabase para evitar apagar dados por engano.');
