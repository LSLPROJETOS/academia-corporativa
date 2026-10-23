// ============================================================================
// 2. SEGURANÇA
// ============================================================================
// Regra de senha: 8+ caracteres, com ao menos uma letra e um número.
const pwOk = (p) => typeof p === 'string' && p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p);
const PW_MSG = 'A senha precisa ter 8+ caracteres, com letras e números.';

// Perfis: admin faz tudo; instrutor gerencia cursos/relatórios; aluno estuda.
const ROLE = { admin: 'Administrador', instrutor: 'Instrutor', aluno: 'Aluno' };
// Usuário logado (precisa estar ativo e aprovado).
const me = () => S.users.find((u) => u.id === sessionId && u.active && !u.pending) || null;
const isAdmin = () => me()?.role === 'admin';
const isStaff = () => ['admin', 'instrutor'].includes(me()?.role);
// Barra quem não tem permissão. Usada no início de toda ação administrativa.
function need(level) { if ((level === 'admin' && !isAdmin()) || (level === 'staff' && !isStaff())) fail('Você não tem permissão para isso.'); }
