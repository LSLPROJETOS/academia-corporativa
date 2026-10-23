// ============================================================================
// 5. DADOS DE DEMONSTRAÇÃO (botão no Início e em Administração > Dados)
// ============================================================================
async function seedDemo() {
  const demoUsers = [me()];
  const inDays = (n) => isoOf(new Date(Date.now() + n * 864e5));
  // Cria curso + aulas de texto + prova de exemplo.
  const mk = (c, lessons, quiz) => {
    const id = nid(); S.courses.push({ id, status: 'publicado', area: '', level: 'iniciante', instructor: 'Equipe de Treinamento', objectives: '', mandatory: false, sequential: false, deadline: '', bonus: S.settings.courseBonus, prereq: '', emoji: '📘', createdAt: Date.now(), materials: [], ...c });
    lessons.forEach((l, i) => S.lessons.push({ id: nid(), courseId: id, position: i + 1, type: 'texto', points: S.settings.pointsPerLesson, duration: 5, url: '', fileId: null, ...l }));
    if (quiz) S.quizzes.push({ courseId: id, passScore: 70, points: S.settings.quizPassBonus, maxAttempts: 3, questions: quiz });
    return id;
  };
  const c1 = mk({ title: 'Atendimento ao Cliente: Fundamentos', category: 'padrao_servico', area: 'Atendimento', emoji: '🤝', mandatory: true, sequential: true, deadline: inDays(10),
    description: 'Padrão oficial de atendimento: postura, escuta ativa e resolução de problemas.', objectives: 'Aplicar o padrão de atendimento em todos os canais.' }, [
    { title: 'Postura e primeira impressão', module: 'Módulo 1: Base', content: '# Primeira impressão\n\nOs primeiros **10 segundos** definem a experiência.\n\n- Cumprimente com sorriso e contato visual\n- Use o nome do cliente\n- Mantenha a postura aberta' },
    { title: 'Escuta ativa', module: 'Módulo 1: Base', content: '# Escuta ativa\n\nOuça para entender, não para responder.\n\n- Não interrompa\n- Repita o pedido com suas palavras\n- Faça perguntas abertas' },
    { title: 'Resolvendo reclamações', module: 'Módulo 2: Prática', content: '# Método ORA\n\n**O**uvir, **R**econhecer, **A**gir.\n\nNunca discuta com o cliente. Ofereça uma solução e um prazo.' },
    { title: 'Encerramento e pós-atendimento', module: 'Módulo 2: Prática', content: '# Encerrando bem\n\nConfirme se tudo foi resolvido e agradeça.\n\nRegistre o atendimento no sistema.' }
  ], [
    { q: 'Quanto tempo define a primeira impressão?', options: ['10 segundos', '10 minutos', '1 hora'], correct: 0, explain: 'Os primeiros segundos pesam mais.' },
    { q: 'O que significa o método ORA?', options: ['Ouvir, Reconhecer, Agir', 'Opinar, Responder, Arquivar', 'Observar, Registrar, Avisar'], correct: 0, explain: '' },
    { q: 'Diante de uma reclamação, o correto é:', options: ['Discutir os fatos', 'Oferecer solução e prazo', 'Encaminhar sem explicar'], correct: 1, explain: '' }]);
  const c2 = mk({ title: 'Padrão de Serviço: Abertura e Fechamento da Loja', category: 'padrao_servico', area: 'Operações', emoji: '🏪', mandatory: true, deadline: inDays(-2),
    description: 'Checklists oficiais de abertura e fechamento, segurança e organização.' }, [
    { title: 'Checklist de abertura', module: 'Rotinas', content: '# Abertura\n\n- Desligar o alarme\n- Conferir o caixa\n- Ligar sistemas e iluminação' },
    { title: 'Checklist de fechamento', module: 'Rotinas', content: '# Fechamento\n\n- Fechar o caixa\n- Guardar valores\n- Ligar o alarme e trancar' },
    { title: 'Segurança e ocorrências', module: 'Segurança', content: 'Qualquer ocorrência deve ser registrada **no mesmo dia** e comunicada ao gestor.' }
  ], [
    { q: 'O alarme deve ser ligado:', options: ['Na abertura', 'No fechamento', 'Nunca'], correct: 1, explain: '' },
    { q: 'Ocorrências devem ser registradas:', options: ['No mesmo dia', 'No fim do mês'], correct: 0, explain: '' }]);
  const c3 = mk({ title: 'Técnicas de Vendas Consultivas', category: 'curso', area: 'Vendas', level: 'intermediario', emoji: '📈',
    description: 'Do diagnóstico ao fechamento: venda entendendo a necessidade do cliente.', objectives: 'Conduzir uma venda consultiva completa.' }, [
    { title: 'Diagnóstico de necessidades', module: 'Etapas', content: 'Antes de oferecer, **pergunte**. Descubra o problema real do cliente.' },
    { title: 'Apresentando a solução', module: 'Etapas', content: 'Conecte cada característica a um benefício para o cliente.' },
    { title: 'Contornando objeções', module: 'Etapas', content: '# Objeções\n\n- Escute até o fim\n- Valide a preocupação\n- Responda com fatos' },
    { title: 'Fechamento', module: 'Etapas', content: 'Peça a decisão com naturalidade e confirme os próximos passos.' }
  ], [
    { q: 'O primeiro passo da venda consultiva é:', options: ['Oferecer desconto', 'Diagnosticar a necessidade', 'Fechar o pedido'], correct: 1, explain: '' },
    { q: 'Ao ouvir uma objeção, você deve:', options: ['Interromper', 'Escutar e validar', 'Ignorar'], correct: 1, explain: '' }]);
  // Inscreve os alunos de exemplo e cria progresso variado (alimenta gráficos e ranking).
  demoUsers.forEach((u) => [c1, c2, c3].forEach((cid) => {
    if (!isEnrolled(u.id, cid)) S.enrollments.push({ userId: u.id, courseId: cid, at: Date.now(), dueDate: '' });
    lessonsOf(cid).forEach((l) => { if (Math.random() < 0.5 && !isDone(u.id, l.id)) S.progress.push({ userId: u.id, lessonId: l.id, at: Date.now() - Math.floor(Math.random() * 13) * 864e5 }); });
  }));
  const prods = [['☕', 'Vale-café', 'Vale', 50, 30, 'Um café na cafeteria parceira.'], ['👕', 'Camiseta da empresa', 'Brindes', 300, 15, 'Camiseta oficial.'],
    ['🎧', 'Fone de ouvido', 'Eletrônicos', 800, 5, 'Fone bluetooth.'], ['🌴', 'Folga de um dia', 'Benefícios', 1500, 3, 'Um dia de folga com aprovação do gestor.']];
  prods.forEach(([emoji, name, category, cost, stock, description]) => { if (!S.products.some((p) => p.name === name)) S.products.push({ id: nid(), name, category, cost, stock, unlimited: false, limit: 0, description, emoji, image: '', active: true }); });
  S.announcements.push({ id: nid(), title: 'Bem-vindo(a) à plataforma!', text: 'Faça seu check-in diário, conclua os cursos obrigatórios e troque seus pontos por prêmios na loja.', at: Date.now(), authorId: sessionId, pinned: true });
  audit('Dados de demonstração carregados'); save();
}
