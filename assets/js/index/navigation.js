// ============================================================================
// 6. NAVEGAÇÃO, TEMA E LOGIN
// ============================================================================
const app = $('app'), nav = $('nav');
let mediaUrl = null;
function stopMedia() { if (mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(mediaUrl); mediaUrl = null; }

// Aplica tema claro/escuro, cor de destaque e nome da plataforma.
function applyTheme() {
  const t = me()?.theme || 'auto';
  document.documentElement.dataset.theme = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
  document.documentElement.style.setProperty('--brand', S.settings.accent);
  $('brand').textContent = S.settings.platformName; document.title = S.settings.platformName;
}
// Desenha o menu e a área do usuário (pontos, sino, perfil, sair).
function renderChrome() {
  const u = me(); applyTheme();
  if (!u) { nav.innerHTML = ''; $('user-area').innerHTML = ''; return; }
  const cur = location.hash.split('/')[1] || 'home';
  const L = (h, l, k) => `<a href="#/${h}" class="${cur === k ? 'active' : ''}">${l}</a>`;
  nav.innerHTML = L('home', 'Início', 'home') + L('courses', 'Cursos', 'courses') + L('mine', 'Meus cursos', 'mine') + L('videos', 'Vídeos', 'videos') + L('store', 'Loja', 'store') + L('ranking', 'Ranking', 'ranking')
    + (isStaff() ? L('admin/dashboard', isAdmin() ? 'Administração' : 'Gestão', 'admin') : '');
  const unread = S.notifications.filter((n) => n.userId === u.id && !n.read).length;
  $('user-area').innerHTML = `<a class="chip coins" href="#/store" title="Seu saldo">${u.points} pts</a>
    <a class="icon-btn" href="#/notifications" aria-label="Notificações">🔔${unread ? `<span class="dot">${unread}</span>` : ''}</a>
    <a class="user-link" href="#/profile">${avatar(u, 'sm')}<span class="hide-sm">${esc(u.name.split(' ')[0])}</span></a>
    <a class="icon-btn" href="#/account" aria-label="Minha conta">⚙</a><button class="link-btn" data-action="logout">Sair</button>`;
}
// Navega para um endereço (se já está nele, apenas redesenha).
const go = (h) => (location.hash === h ? route() : (location.hash = h));
const rerender = () => route(false); // redesenha a tela atual sem voltar ao topo

// ROTEADOR: lê o endereço (#/courses, #/store...) e decide qual tela mostrar.
async function route(scroll = true) {
  stopMedia();
  const [, page, a, b] = (location.hash || '#/home').split('/');
  try {
    if (!backendReady) await initializeBackend();
    if (new URLSearchParams(location.search).get('recovery') === '1') { renderChrome(); VIEWS.resetPassword(); return; }
    if (page === 'verify') { renderChrome(); await viewVerify(a); return; } // verificação pública de certificado
    const u = me(); renderChrome();
    if (!u) { page === 'register' ? viewRegister() : viewLogin(); return; }
    if (u.mustChange && page !== 'account') { go('#/account'); return; } // troca de senha obrigatória
    if (scroll) closeModal();
    await (VIEWS[page] || VIEWS.home)(a, b);
  } catch (e) {
    app.innerHTML = `<div class="panel empty"><h2>Não foi possível abrir</h2><p>${esc(e.message)}</p><a class="btn" href="#/home">Voltar ao início</a></div>`;
  }
  renderChrome(); if (scroll) window.scrollTo(0, 0);
}
VIEWS.login = VIEWS.register = () => go('#/home');
VIEWS.resetPassword = () => {
  app.innerHTML = `<section class="auth panel"><h1>Redefinir senha</h1><form data-form="resetpassword">
    <label>Nova senha (8+ caracteres, letras e números)<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
    <label>Repita a nova senha<input name="password2" type="password" autocomplete="new-password" required minlength="8"></label>
    <button class="btn" type="submit">Salvar senha</button></form></section>`;
};

// ---------- Login e cadastro ----------
function viewLogin() {
  app.innerHTML = `<section class="auth panel"><h1>Entrar</h1>
    ${LOCAL_MODE ? '<div class="notice">Modo de teste local — e-mail: <strong>admin@local.test</strong> · senha: <strong>admin123</strong>. Seus dados ficam salvos somente neste navegador.</div>' : ''}
    <form data-form="login">
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn" type="submit">Entrar</button> <button class="btn ghost" type="button" data-action="forgot">Esqueci a senha</button>
    </form>
    ${S.settings.openSignup ? '<p class="muted">Ainda não tem conta? <a href="#/register">Cadastre-se</a></p>' : '<p class="muted">Cadastros são feitos pelo administrador.</p>'}</section>`;
}
function viewRegister() {
  if (!S.settings.openSignup) return viewLogin();
  app.innerHTML = `<section class="auth panel"><h1>Criar conta</h1>
    <div class="notice">A conta será criada como aluno. Um administrador poderá ajustar seu perfil depois.</div>
    <form data-form="register">
      <label>Nome completo<input name="name" autocomplete="name" required minlength="2"></label>
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      ${sel('Departamento', 'dept', [['', 'Selecione...'], ...S.depts.map((d) => [d, d])], '')}
      <label>Senha (8+ caracteres, letras e números)<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
      <label>Repita a senha<input name="password2" type="password" autocomplete="new-password" required minlength="8"></label>
      <button class="btn" type="submit">Criar conta</button>
    </form><p class="muted">Já tem conta? <a href="#/login">Entrar</a></p></section>`;
}
FORMS.login = async (d) => {
  if (LOCAL_MODE) {
    const email = d.email.trim().toLowerCase();
    const u = S.users.find((x) => x.email.toLowerCase() === email);
    if (!u || !(await verifyLocalPassword(d.password, localPasswords[u.authId]))) fail('E-mail ou senha incorretos.');
    if (!u.active || u.pending) fail(u.pending ? 'A conta aguarda aprovação.' : 'A conta está desativada. Fale com o administrador.');
    sessionId = u.id; sessionAuthId = u.authId; u.lastLogin = Date.now();
    localStorage.setItem(LOCAL_SESSION_KEY, String(u.id));
    audit('Login'); save(); go('#/home'); return;
  }
  const { data, error } = await backend.auth.signInWithPassword({ email: d.email.trim().toLowerCase(), password: d.password });
  if (error) fail('E-mail ou senha incorretos.');
  if (!(await loadRemoteState(data.user))) return;
  audit('Login'); save(); go('#/home');
};
FORMS.register = async (d) => {
  if (!S.settings.openSignup) fail('Cadastro fechado.');
  if (d.name.trim().length < 2) fail('Informe o nome (mínimo 2 letras).');
  if (d.password !== d.password2) fail('As senhas não coincidem.');
  if (!pwOk(d.password)) fail(PW_MSG);
  if (LOCAL_MODE) {
    const email = d.email.trim().toLowerCase();
    if (S.users.some((u) => u.email.toLowerCase() === email)) fail('Já existe uma conta com este e-mail.');
    const u = { id: nid(), authId: `local-${nid()}`, name: d.name.trim(), email, role: 'aluno', dept: d.dept || '',
      jobTitle: '', active: true, pending: !!S.settings.requireApproval, points: 0, xp: 0, badges: [], theme: 'auto',
      createdAt: Date.now(), lastLogin: null, streak: 0, lastCheckin: null, fails: 0, lockUntil: 0, mustChange: false };
    S.users.push(u); localPasswords[u.authId] = await hashLocalPassword(d.password);
    localStorage.setItem(LOCAL_PASSWORDS_KEY, JSON.stringify(localPasswords)); save();
    if (u.pending) { toast('Cadastro criado. A conta aguarda aprovação do administrador.'); go('#/login'); return; }
    sessionId = u.id; sessionAuthId = u.authId; u.lastLogin = Date.now(); localStorage.setItem(LOCAL_SESSION_KEY, String(u.id));
    audit('Cadastro'); save(); go('#/home'); return;
  }
  const { data, error } = await backend.auth.signUp({ email: d.email.trim().toLowerCase(), password: d.password, options: { data: { name: d.name.trim(), dept: d.dept || '' } } });
  if (error) fail(error.message);
  if (!data.session) { toast('Cadastro criado. Confirme o e-mail para entrar.'); go('#/login'); return; }
  if (!(await loadRemoteState(data.user))) { go('#/login'); return; }
  audit('Cadastro'); save(); go('#/home');
};
ACTIONS.forgot = async () => {
  if (LOCAL_MODE) { toast('A redefinição por e-mail será configurada quando o banco estiver pronto. Para testar, use a conta de demonstração.'); return; }
  const email = prompt('Informe o e-mail da conta para receber o link de redefinição:');
  if (!emailOk(email)) return;
  const { error } = await backend.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname + '?recovery=1' });
  if (error) fail(error.message);
  toast('Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.');
};
FORMS.resetpassword = async (d) => {
  if (d.password !== d.password2) fail('As senhas não coincidem.');
  if (!pwOk(d.password)) fail(PW_MSG);
  if (LOCAL_MODE) fail('A redefinição por link será configurada quando o banco estiver pronto.');
  const { error } = await backend.auth.updateUser({ password: d.password });
  if (error) fail(error.message);
  history.replaceState(null, '', location.pathname); toast('Senha redefinida. Entre novamente.'); await backend.auth.signOut(); go('#/login');
};
ACTIONS.logout = async () => {
  audit('Logout'); save(); clearTimeout(saveTimer);
  if (!LOCAL_MODE) { await saveQueue; await syncRemoteState(); }
  else localStorage.removeItem(LOCAL_SESSION_KEY);
  if (!LOCAL_MODE) await backend.auth.signOut();
  sessionId = null; sessionAuthId = null; remoteReady = false; go('#/login');
};
