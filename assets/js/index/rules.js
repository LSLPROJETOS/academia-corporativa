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

function generateQuizSuggestions(courseId) {
  const lessons = lessonsOf(Number(courseId)).filter((lesson) => lesson.type === 'texto' && lesson.content.trim());
  if (!lessons.length) fail('Este curso não tem aulas de texto com conteúdo para analisar.');

  const maxSuggestions = 8, suggestions = [], seenQuestions = new Set();
  const clean = (text) => text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normalize = (text) => text.toLocaleLowerCase('pt-BR');
  const addSuggestion = (question, options, answer, explain, seed) => {
    const distinct = [...new Map(options.map((option) => [normalize(option), option])).values()];
    if (!question || suggestions.length >= maxSuggestions || distinct.length < 3) return;
    const qKey = normalize(question);
    if (seenQuestions.has(qKey)) return;
    const correct = distinct.findIndex((option) => normalize(option) === normalize(answer));
    if (correct < 0) return;
    const offset = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % distinct.length;
    const rotated = distinct.slice(offset).concat(distinct.slice(0, offset));
    seenQuestions.add(qKey);
    suggestions.push({
      q: question,
      options: rotated,
      correct: rotated.findIndex((option) => normalize(option) === normalize(answer)),
      explain
    });
  };
  const formatNumber = (value) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const singularUnits = {
    segundo: 'segundo', segundos: 'segundo', minuto: 'minuto', minutos: 'minuto',
    hora: 'hora', horas: 'hora', dia: 'dia', dias: 'dia', semana: 'semana',
    semanas: 'semana', mes: 'mês', meses: 'mês', ano: 'ano', anos: 'ano',
    ponto: 'ponto', pontos: 'ponto', etapa: 'etapa', etapas: 'etapa',
    vez: 'vez', vezes: 'vez'
  };
  const pluralUnits = {
    segundo: 'segundos', minuto: 'minutos', hora: 'horas', dia: 'dias',
    semana: 'semanas', mês: 'meses', ano: 'anos', ponto: 'pontos',
    etapa: 'etapas', vez: 'vezes'
  };

  lessons.forEach((lesson) => {
    const lines = lesson.content.split(/\r?\n/);
    const stages = lines.flatMap((line) => {
      const match = line.trim().match(/^(?:#{1,6}\s*)?(?:ETAPA|FASE)\s+(\d{1,2})\s*[:.)–-]\s*(.+)$/i);
      if (!match) return [];
      const title = clean(match[2]).replace(/[.!?;]+$/, '');
      return title ? [{ number: Number(match[1]), title }] : [];
    }).filter((stage, index, all) =>
      all.findIndex((other) => other.number === stage.number && normalize(other.title) === normalize(stage.title)) === index
    );

    if (stages.length >= 3) {
      stages.forEach((stage) => {
        const answer = stage.title;
        const options = [answer, ...stages
          .filter((other) => other.number !== stage.number && normalize(other.title) !== normalize(answer))
          .map((other) => other.title)
          .slice(0, 3)];
        addSuggestion(
          `Qual é o foco da ETAPA ${stage.number} no processo apresentado na aula "${lesson.title}"?`,
          options,
          answer,
          `O material identifica a ETAPA ${stage.number} como "${stage.title}".`,
          `${lesson.id}:etapa-${stage.number}`
        );
      });
    }

    lines.forEach((line) => {
      const plain = clean(line);
      if (!plain || /^#{1,6}\s/.test(line.trim())) return;

      for (const match of line.matchAll(/\*\*([^*]+)\*\*|__([^_]+)__/g)) {
        const answer = (match[1] || match[2]).trim();
        const quantity = answer.match(/^(\d+(?:[.,]\d+)?)\s+(segundos?|minutos?|horas?|dias?|semanas?|meses?|anos?|pontos?|etapas?|vezes?)$/i);
        if (!quantity) continue;
        const value = Number(quantity[1].replace(',', '.'));
        const unit = singularUnits[quantity[2].toLocaleLowerCase('pt-BR')];
        if (!Number.isFinite(value) || value <= 0 || value > 1000000 || !unit) continue;
        const alternatives = [...new Set([value > 1 ? value - 1 : value / 2, value + 1, value * 2, value + 3].filter((n) => n > 0 && n !== value))].slice(0, 3);
        const options = [answer, ...alternatives.map((n) => `${formatNumber(n)} ${n === 1 ? unit : pluralUnits[unit]}`)];
        const question = `Complete conforme a aula "${lesson.title}": ${plain.replace(answer, '_____')}`;
        addSuggestion(question, options, answer, `A aula informa: "${plain}".`, `${lesson.id}:${answer}`);
      }

      const acronymItems = [...line.matchAll(/\*\*([A-ZÀ-ÖØ-Þ])\*\*([a-zà-öø-ÿ][A-Za-zÀ-ÿ'’-]*)/g)]
        .map((match) => ({ initial: match[1], word: `${match[1]}${match[2]}` }));
      if (acronymItems.length >= 3) {
        const acronym = acronymItems.map((item) => item.initial).join('');
        const answer = acronymItems.map((item) => item.word).join(', ');
        const options = [answer];
        for (let offset = 1; offset < acronymItems.length && options.length < 4; offset += 1) {
          options.push(acronymItems.slice(offset).concat(acronymItems.slice(0, offset)).map((item) => item.word).join(', '));
        }
        addSuggestion(
          `Quais etapas formam a sigla ${acronym}, na ordem apresentada?`,
          options,
          answer,
          `Na aula "${lesson.title}", ${acronym} significa ${answer}.`,
          `${lesson.id}:${acronym}`
        );
      }
    });

    let orderedItems = [];
    const addOrderedList = () => {
      if (orderedItems.length >= 3 && orderedItems.every((item, index) => item.number === index + 1)) {
        orderedItems.forEach((item, index) => {
          const answer = item.text;
          const options = [answer, ...orderedItems.filter((_, optionIndex) => optionIndex !== index).map((option) => option.text).slice(0, 4)];
          addSuggestion(
            `Qual é o passo ${item.number} do processo apresentado na aula "${lesson.title}"?`,
            options,
            answer,
            `A sequência apresentada na aula é: ${orderedItems.map((option) => option.text).join(' → ')}.`,
            `${lesson.id}:passo-${item.number}`
          );
        });
      }
      orderedItems = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      const item = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      if (item) {
        const number = Number(item[1]);
        if (orderedItems.length && number !== orderedItems[orderedItems.length - 1].number + 1) addOrderedList();
        orderedItems.push({ number, text: clean(item[2]).replace(/[.!?;]+$/, '') });
      } else if (trimmed) addOrderedList();
    });
    addOrderedList();
  });

  if (!suggestions.length) fail('Não encontrei conteúdo estruturado suficiente para sugerir questões confiáveis. Use quantidades importantes em negrito, siglas como **O**uvir, **R**econhecer, **A**gir, ou processos em listas numeradas com pelo menos 3 passos.');
  return suggestions;
}

// Tabelas de ações (cliques) e de formulários. São preenchidas nas seções 7, 8 e 9.
const FORMS = {}, ACTIONS = {}, VIEWS = {};
// Filtros digitáveis de cada tela (C=cursos, U=usuários, S=loja, R=ranking, X=relatórios) e como atualizar a lista.
const FILTERS = { C: { q: '', cat: '', area: '', level: '', status: '', sort: 'recent' }, U: { q: '', role: '', dept: '', status: '' }, S: { q: '', cat: '', afford: false }, R: { scope: 'semana', dept: '' }, X: { course: '' } };
const REFRESH = {};
