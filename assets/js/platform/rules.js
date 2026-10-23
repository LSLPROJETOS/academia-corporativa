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

// Monta os campos estruturados usados pelo editor visual de provas.
function quizEditorOptionHTML(option, questionIndex, optionIndex, correctIndex) {
  return `<div class="quiz-editor-option"><input type="radio" name="quiz-correct-${questionIndex}" value="${optionIndex}" aria-label="Marcar alternativa ${'ABCDE'[optionIndex]} como correta" ${optionIndex === correctIndex ? 'checked' : ''} required>
    <input type="text" data-quiz-option value="${esc(option)}" placeholder="Texto da alternativa" aria-label="Texto da alternativa ${'ABCDE'[optionIndex]}" required>
    <button type="button" class="btn danger small" data-action="quiz-option-remove" aria-label="Remover alternativa ${'ABCDE'[optionIndex]}" ${optionIndex < 2 ? 'disabled' : ''}>Remover</button></div>`;
}

function quizEditorQuestionHTML(question, questionIndex) {
  const q = question || { q: '', options: ['', ''], correct: 0, explain: '' };
  const options = q.options.length >= 2 ? q.options : ['', ''];
  const correct = Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length ? q.correct : 0;
  return `<section class="quiz-editor-question" data-quiz-question data-index="${questionIndex}">
    <div class="spread"><h3>Pergunta ${questionIndex + 1}</h3><button type="button" class="btn danger small" data-action="quiz-question-remove" ${questionIndex === 0 ? 'disabled' : ''}>Remover pergunta</button></div>
    <label>Enunciado<textarea data-quiz-question-text rows="2" required placeholder="Digite a pergunta">${esc(q.q)}</textarea></label>
    <strong>Alternativas</strong><p class="muted small">Selecione o círculo da resposta correta. Mínimo 2, máximo 5.</p>
    <div data-quiz-options>${options.map((option, i) => quizEditorOptionHTML(option, questionIndex, i, correct)).join('')}</div>
    <button type="button" class="btn ghost small" data-action="quiz-option-add" ${options.length >= 5 ? 'disabled' : ''}>+ Adicionar alternativa</button>
    <label>Explicação (opcional)<textarea data-quiz-explanation rows="2" placeholder="Explique a resposta">${esc(q.explain || '')}</textarea></label>
  </section>`;
}

function renumberQuizEditor(form) {
  const questions = [...form.querySelectorAll('[data-quiz-question]')];
  questions.forEach((question, questionIndex) => {
    question.dataset.index = questionIndex;
    question.querySelector('h3').textContent = `Pergunta ${questionIndex + 1}`;
    question.querySelector('[data-action="quiz-question-remove"]').disabled = questions.length === 1;
    const options = [...question.querySelectorAll('.quiz-editor-option')];
    options.forEach((option, optionIndex) => {
      const radio = option.querySelector('input[type="radio"]');
      radio.name = `quiz-correct-${questionIndex}`;
      radio.value = optionIndex;
      radio.setAttribute('aria-label', `Marcar alternativa ${'ABCDE'[optionIndex]} como correta`);
      const remove = option.querySelector('[data-action="quiz-option-remove"]');
      remove.disabled = options.length <= 2;
      remove.setAttribute('aria-label', `Remover alternativa ${'ABCDE'[optionIndex]}`);
    });
    question.querySelector('[data-action="quiz-option-add"]').disabled = options.length >= 5;
    if (!question.querySelector('input[type="radio"]:checked')) question.querySelector('input[type="radio"]').checked = true;
  });
}

// Tabelas de ações (cliques) e de formulários. São preenchidas nas seções 7, 8 e 9.
const FORMS = {}, ACTIONS = {}, VIEWS = {};
// Filtros digitáveis de cada tela (C=cursos, U=usuários, S=loja, R=ranking, X=relatórios) e como atualizar a lista.
const FILTERS = { C: { q: '', cat: '', area: '', level: '', status: '', sort: 'recent' }, U: { q: '', role: '', dept: '', status: '' }, S: { q: '', cat: '', afford: false }, R: { scope: 'geral', dept: '' }, X: { course: '' } };
const REFRESH = {};
