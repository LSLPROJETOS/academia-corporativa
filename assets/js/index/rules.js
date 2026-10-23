// ============================================================================
// 4. REGRAS DE PONTOS, NÍVEIS E CONQUISTAS
// ============================================================================
// Pontos têm dois contadores: "points" é o saldo (gasto na loja) e "xp" é o total já ganho (define nível e ranking).
function levelInfo(xp) {
  const step = S.settings.levelStep || 100, level = Math.floor(Math.sqrt(xp / step)) + 1;
  const cur = (level - 1) ** 2 * step, next = level ** 2 * step;
  return { level, cur, next, pct: Math.round(((xp - cur) / (next - cur)) * 100), title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] };
}
// Soma ou subtrai pontos, registra o motivo e avisa quando sobe de nível.
function award(uid, amt, reason) {
  const u = user(uid); if (!u || !amt) return;
  const before = levelInfo(u.xp).level; u.points += amt; if (amt > 0) u.xp += amt;
  S.log.push({ userId: uid, delta: amt, reason, at: Date.now() });
  if (amt > 0 && levelInfo(u.xp).level > before) notify(uid, `⭐ Você subiu para o nível ${levelInfo(u.xp).level}!`, '#/profile');
}
// Lista de conquistas. "test" decide quando o usuário ganha; "bonus" são pontos extras.
const BADGES = [
  { id: 'first', icon: '🚀', name: 'Primeiro passo', desc: 'Conclua sua primeira aula', bonus: 5, test: (u, s) => s.lessons >= 1 },
  { id: 'lessons10', icon: '📚', name: 'Estudioso', desc: 'Conclua 10 aulas', bonus: 20, test: (u, s) => s.lessons >= 10 },
  { id: 'lessons50', icon: '🧠', name: 'Maratonista', desc: 'Conclua 50 aulas', bonus: 80, test: (u, s) => s.lessons >= 50 },
  { id: 'course1', icon: '🎓', name: 'Formado', desc: 'Conclua seu primeiro curso', bonus: 30, test: (u, s) => s.courses >= 1 },
  { id: 'course5', icon: '🏆', name: 'Colecionador', desc: 'Conclua 5 cursos', bonus: 100, test: (u, s) => s.courses >= 5 },
  { id: 'perfect', icon: '💯', name: 'Nota máxima', desc: 'Tire 100% em uma prova', bonus: 25, test: (u, s) => s.perfect >= 1 },
  { id: 'streak7', icon: '🔥', name: 'Constância', desc: '7 dias seguidos de check-in', bonus: 40, test: (u, s) => s.streak >= 7 },
  { id: 'xp500', icon: '💰', name: 'Poupador', desc: 'Acumule 500 pontos', bonus: 30, test: (u) => u.xp >= 500 },
  { id: 'shop', icon: '🎁', name: 'Primeira troca', desc: 'Troque pontos por um produto', bonus: 0, test: (u, s) => s.redeems >= 1 },
  { id: 'duty', icon: '✅', name: 'Cumpridor', desc: 'Conclua um curso obrigatório', bonus: 30, test: (u, s) => s.mandatory >= 1 }
];
function userStats(u) {
  return { lessons: S.progress.filter((p) => p.userId === u.id).length, courses: S.certificates.filter((c) => c.userId === u.id).length,
    perfect: S.attempts.filter((a) => a.userId === u.id && a.score === 100).length, redeems: S.redemptions.filter((r) => r.userId === u.id).length,
    streak: u.streak || 0, mandatory: S.certificates.filter((c) => c.userId === u.id && course(c.courseId)?.mandatory).length };
}
// Confere se o usuário ganhou novas conquistas.
function checkBadges(uid) {
  const u = user(uid); if (!u) return; const st = userStats(u);
  BADGES.forEach((b) => {
    if (!u.badges.includes(b.id) && b.test(u, st)) {
      u.badges.push(b.id); notify(uid, `${b.icon} Nova conquista: ${b.name}!`, '#/profile'); award(uid, b.bonus || 0, `Conquista: ${b.name}`);
    }
  });
}
// Progresso do usuário em um curso. "complete" exige todas as aulas e a prova (se houver).
function courseProg(uid, cid) {
  const ls = lessonsOf(cid), done = ls.filter((l) => isDone(uid, l.id)).length, q = quizOf(cid);
  const quizOk = !q || S.attempts.some((a) => a.userId === uid && a.courseId === cid && a.passed);
  return { total: ls.length, done, pct: ls.length ? Math.round((done / ls.length) * 100) : 0, quizOk, complete: ls.length > 0 && done === ls.length && quizOk };
}
// Emite o certificado e dá o bônus quando o curso é concluído (só uma vez).
function checkCourseCompletion(uid, cid) {
  if (!courseProg(uid, cid).complete || certOf(uid, cid)) return null;
  const c = course(cid), cert = { code: genCode(10), userId: uid, courseId: cid, at: Date.now() };
  S.certificates.push(cert);
  if (c.bonus > 0) award(uid, c.bonus, `Curso concluído: ${c.title}`);
  notify(uid, `🎓 Você concluiu "${c.title}" e ganhou um certificado!`, `#/certificate/${cert.code}`);
  checkBadges(uid); return cert;
}
// Conclui uma aula: pontos só na primeira vez. Depois confere o curso e as conquistas.
function completeLesson(uid, lid) {
  if (isDone(uid, lid)) return null;
  const l = lesson(lid), pts = Number(l.points) || 0;
  S.progress.push({ userId: uid, lessonId: lid, at: Date.now() });
  if (pts > 0) award(uid, pts, `Aula concluída: ${l.title}`);
  const cert = checkCourseCompletion(uid, l.courseId); checkBadges(uid); save();
  return { earned: pts, cert };
}
// Check-in diário: dá pontos e conta dias seguidos. A cada 7 dias seguidos, bônus extra.
function checkin(uid) {
  const u = user(uid), t = todayISO(); if (u.lastCheckin === t) return null;
  const yesterday = isoOf(new Date(Date.now() - 864e5));
  u.streak = u.lastCheckin === yesterday ? (u.streak || 0) + 1 : 1; u.lastCheckin = t;
  let total = S.settings.dailyBonus;
  award(uid, S.settings.dailyBonus, `Check-in diário (${u.streak} dia${u.streak > 1 ? 's' : ''} seguidos)`);
  if (u.streak % 7 === 0) { award(uid, S.settings.streak7Bonus, 'Bônus de 7 dias seguidos'); total += S.settings.streak7Bonus; }
  checkBadges(uid); save(); return total;
}

// Leitura/escrita da prova no formato de texto:  P: pergunta / a) opção / b) *opção correta / E: explicação
function parseQuiz(text) {
  const qs = []; let cur = null;
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    if (/^P:/i.test(l)) { cur = { q: l.slice(2).trim(), options: [], correct: -1, explain: '' }; qs.push(cur); }
    else if (/^[a-eA-E]\)/.test(l) && cur) { let t = l.slice(2).trim(), ok = false; if (t.startsWith('*')) { ok = true; t = t.slice(1).trim(); } cur.options.push(t); if (ok) cur.correct = cur.options.length - 1; }
    else if (/^E:/i.test(l) && cur) cur.explain = l.slice(2).trim();
    else fail(`Linha não reconhecida: "${l}"`);
  });
  qs.forEach((q, i) => {
    if (!q.q) fail(`Pergunta ${i + 1} está vazia.`);
    if (q.options.length < 2) fail(`Pergunta ${i + 1}: use pelo menos 2 alternativas.`);
    if (q.correct < 0) fail(`Pergunta ${i + 1}: marque a correta com * (ex.: b) *texto).`);
  });
  if (!qs.length) fail('Adicione ao menos uma pergunta.');
  return qs;
}
const quizToText = (qs) => qs.map((q) => `P: ${q.q}\n${q.options.map((o, i) => `${'abcde'[i]}) ${i === q.correct ? '*' : ''}${o}`).join('\n')}${q.explain ? `\nE: ${q.explain}` : ''}`).join('\n\n');

// Tabelas de ações (cliques) e de formulários. São preenchidas nas seções 7, 8 e 9.
const FORMS = {}, ACTIONS = {}, VIEWS = {};
// Filtros digitáveis de cada tela (C=cursos, U=usuários, S=loja, R=ranking, X=relatórios) e como atualizar a lista.
const FILTERS = { C: { q: '', cat: '', area: '', level: '', status: '', sort: 'recent' }, U: { q: '', role: '', dept: '', status: '' }, S: { q: '', cat: '', afford: false }, R: { scope: 'geral', dept: '' }, X: { course: '' } };
const REFRESH = {};
