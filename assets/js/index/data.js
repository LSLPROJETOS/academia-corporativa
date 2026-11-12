'use strict';
// ============================================================================
// MAPA DO CÓDIGO
//  1. DADOS .......... estado compartilhado no Supabase e arquivos no Storage
//  2. SEGURANÇA ...... senhas embaralhadas (hash), regras de senha, permissões
//  3. AUXILIARES ..... funções pequenas usadas em todo o código
//  4. REGRAS ......... pontos, níveis, conquistas, progresso, certificados, check-in
//  5. DEMONSTRAÇÃO ... botão que cria cursos, produtos e usuários de exemplo
//  6. NAVEGAÇÃO ...... menu, tema, roteador e login/cadastro
//  7. TELAS DO ALUNO . início, cursos, curso, prova, certificado, loja, ranking, perfil
//  8. TELAS DE ADMIN . painel, usuários, grupos, cursos, loja, trocas, relatórios...
//  9. EVENTOS ........ o que acontece em cada clique, formulário e digitação
// ============================================================================

// ============================================================================
// 1. DADOS
// ============================================================================
const SUPABASE_URL = 'https://nkwizwwsuulvdenxzllh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ZLJxCL3FFxM2AfFETGzqeg_NSRiNsdd';
const LOCAL_MODE = false;
const backend = LOCAL_MODE ? null : window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const LOCAL_STATE_KEY = 'academia-corporativa-local-state';
const LOCAL_PASSWORDS_KEY = 'academia-corporativa-local-passwords';
const LOCAL_SESSION_KEY = 'academia-corporativa-local-session';

// Estado inicial. Cada lista funciona como uma tabela de banco de dados.
const DEFAULTS = () => ({
  settings: { platformName: 'Academia Corporativa', accent: '#7057f5', openSignup: true, requireApproval: false,
    pointsPerLesson: 10, courseBonus: 50, quizPassBonus: 30, dailyBonus: 5, streak7Bonus: 50, levelStep: 100, minWatchPct: 90 },
  depts: ['Atendimento', 'Vendas', 'Operações', 'Financeiro', 'RH'], // departamentos/grupos
  users: [],          // usuários (aluno, instrutor, admin)
  courses: [],        // cursos e padrões de serviço
  lessons: [],        // aulas (vídeo, link ou texto) ligadas a um curso
  quizzes: [],        // prova de cada curso
  enrollments: [],    // inscrições (com prazo opcional)
  progress: [],       // aulas concluídas por usuário
  watch: {},          // posição e trechos assistidos de cada vídeo, por usuário
  attempts: [],       // tentativas de prova
  certificates: [],   // certificados emitidos
  ratings: [], comments: [], notes: {}, favorites: [],
  products: [], redemptions: [],   // loja e pedidos de troca
  log: [],            // histórico de pontos
  notifications: [], announcements: [], audit: [], seq: 1
});

// O estado de trabalho é local durante a montagem da interface; o Supabase fica para depois.
let S = DEFAULTS();
let sessionId = null, sessionAuthId = null, backendReady = false, remoteReady = false;
let saveTimer = null, saveQueue = Promise.resolve();
let localPasswords = {};
let O = { organizations: [], units: [], sectors: [], memberships: [], context: { organizationId: null, unitId: null, sectorId: null } };

// Gravações locais persistem no navegador. O modo remoto continua disponível para configuração futura.
function save() {
  if (LOCAL_MODE) {
    try { localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(S)); }
    catch (error) { toast(`Não foi possível salvar neste navegador: ${error.message}`, true); }
  } else if (remoteReady) scheduleRemoteSave();
}

const nid = () => { const r = crypto.getRandomValues(new Uint32Array(2)); return r[0] * 2097152 + (r[1] >>> 11); };
async function hashLocalPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex(salt)}:${hex(bits)}`;
}
async function verifyLocalPassword(password, stored) {
  const [saltHex, expected] = (stored || '').split(':');
  if (!/^[0-9a-f]{32}$/i.test(saltHex || '') || !/^[0-9a-f]{64}$/i.test(expected || '')) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
  return (await hashLocalPassword(password, salt)).split(':')[1] === expected;
}

// ---------- Arquivos grandes (vídeos, materiais) no IndexedDB ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('plataforma-completa', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const idbPut = (id, blob) => idbOp('readwrite', (s) => s.put(blob, id));
const idbGet = (id) => idbOp('readonly', (s) => s.get(id));
const idbDel = (id) => idbOp('readwrite', (s) => s.delete(id));

const sharedCollections = ['courses', 'lessons', 'quizzes', 'products', 'announcements', 'audit'];
const privateCollections = ['enrollments', 'progress', 'watch', 'attempts', 'certificates', 'ratings', 'comments', 'notes', 'favorites', 'redemptions', 'log', 'notifications'];
const simpleCollections = ['courses', 'lessons', 'quizzes', 'products', 'announcements', 'enrollments', 'progress', 'attempts', 'certificates', 'ratings', 'comments', 'favorites', 'redemptions', 'log', 'notifications', 'audit'];
// ---------- Regras no servidor (RPC) ----------
// Pontos, provas, certificados e trocas são calculados no banco (migration-regras-no-servidor.sql).
// O aluno só grava diretamente estas coleções; o restante entra por funções (rpc).
const studentWritableCollections = ['watch', 'notes', 'ratings', 'comments', 'favorites', 'notifications'];
async function callRpc(name, args = {}) {
  if (LOCAL_MODE || !backend) throw new Error('Esta ação exige o banco remoto.');
  const { data, error } = await backend.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
async function loadOrganizationalState(platformAdmin = false) {
  const data = await callRpc('organizational_bootstrap');
  O = {
    organizations: data.organizations || [],
    units: data.units || [],
    sectors: data.sectors || [],
    memberships: data.memberships || [],
    context: data.context || { organizationId: null, unitId: null, sectorId: null }
  };
  const contextIsValid = O.context.organizationId
    && O.organizations.some((organization) =>
      organization.id === O.context.organizationId && organization.status === 'active')
    && (!O.context.unitId || O.units.some((unit) =>
      unit.id === O.context.unitId && unit.status === 'active'))
    && (!O.context.sectorId || O.sectors.some((sector) =>
      sector.id === O.context.sectorId && sector.status === 'active'))
    && O.memberships.some((membership) => membership.userId === sessionAuthId && membership.active
      && membership.organizationId === O.context.organizationId
      && (!membership.unitId || membership.unitId === O.context.unitId)
      && (!membership.sectorId || membership.sectorId === O.context.sectorId));
  if (!platformAdmin && !contextIsValid) {
    const membership = O.memberships.find((item) => item.userId === sessionAuthId && item.active
      && O.organizations.some((organization) => organization.id === item.organizationId && organization.status === 'active')
      && (!item.unitId || O.units.some((unit) => unit.id === item.unitId && unit.status === 'active'))
      && (!item.sectorId || O.sectors.some((sector) => sector.id === item.sectorId && sector.status === 'active')));
    const { error } = await backend.rpc('set_active_organizational_context', {
      p_organization_id: membership?.organizationId || null,
      p_unit_id: membership?.unitId || null,
      p_sector_id: membership?.sectorId || null
    });
    if (error) throw new Error(error.message);
    const refreshed = await callRpc('organizational_bootstrap');
    O.context = refreshed.context || O.context;
  }
}
const activeOrganizationRole = () => {
  const { organizationId, unitId, sectorId } = O.context;
  if (!organizationId || !O.organizations.some((organization) =>
    organization.id === organizationId && organization.status === 'active')) return '';
  if (unitId && !O.units.some((unit) => unit.id === unitId && unit.status === 'active')) return '';
  if (sectorId && !O.sectors.some((sector) => sector.id === sectorId && sector.status === 'active')) return '';
  const rolePriority = { organization_admin: 4, unit_admin: 3, sector_manager: 2, collaborator: 1 };
  return O.memberships.filter((membership) =>
    membership.active
    && membership.organizationId === organizationId
    && (!membership.unitId || membership.unitId === unitId)
    && (!membership.sectorId || membership.sectorId === sectorId)
  ).sort((left, right) => rolePriority[right.role] - rolePriority[left.role])[0]?.role || '';
};
function applyRecordScope(query) {
  const { organizationId, unitId, sectorId } = O.context;
  query = organizationId ? query.eq('organization_id', organizationId) : query.is('organization_id', null);
  if (unitId) query = query.or(`unit_id.is.null,unit_id.eq.${unitId}`);
  if (sectorId) query = query.or(`sector_id.is.null,sector_id.eq.${sectorId}`);
  return query;
}
async function changeOrganizationalContext(organizationId, unitId, sectorId) {
  if (LOCAL_MODE || !backend || !sessionAuthId) return;
  clearTimeout(saveTimer);
  await saveQueue;
  await syncRemoteState();
  const { error } = await backend.rpc('set_active_organizational_context', {
    p_organization_id: organizationId || null,
    p_unit_id: unitId || null,
    p_sector_id: sectorId || null
  });
  if (error) throw new Error(error.message);
  remoteReady = false;
  S = DEFAULTS();
  const { data: auth, error: authError } = await backend.auth.getSession();
  if (authError) throw authError;
  if (auth.session?.user) await loadRemoteState(auth.session.user);
}
// Envia o que está pendente, executa a função no servidor e recarrega o estado (saldo, XP, registros).
async function rpc(name, args = {}) {
  clearTimeout(saveTimer); await saveQueue; await syncRemoteState();
  const data = await callRpc(name, args);
  const { data: auth } = await backend.auth.getSession();
  if (auth.session?.user) await loadRemoteState(auth.session.user);
  return data;
}
// Alunos não leem o gabarito: recebem só os dados gerais da prova (nota mínima, pontos, tentativas, nº de perguntas).
async function loadQuizOverview() {
  const rows = (await callRpc('my_quiz_overview')) || [];
  S.quizzes = rows.map((m) => ({
    courseId: Number(m.courseId), passScore: Number(m.passScore) || 70, points: Number(m.points) || 0, maxAttempts: Number(m.maxAttempts) || 0,
    questions: Array.from({ length: Number(m.questionCount) || 0 }, () => ({ q: '', options: [], correct: -1, explain: '' }))
  }));
}
const profileSnapshots = new Map();
const remoteRecordSnapshots = new Map();
const remoteRecordKey = (collection, ownerId, recordId) => `${collection}\u0000${ownerId || ''}\u0000${recordId}`;
function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function profileFromRow(row) {
  return {
    id: Number(row.internal_id), authId: row.id || row.profile_id, name: row.name || '', email: row.email || '',
    role: row.role || 'aluno', dept: row.dept || '', jobTitle: row.job_title || '', active: row.active !== false,
    pending: !!row.pending, points: Number(row.points) || 0, xp: Number(row.xp) || 0,
    badges: row.badges || [], theme: row.theme === 'light' ? 'light' : 'dark', avatar: row.avatar && Object.keys(row.avatar).length ? normalizeAvatar(row.avatar) : null,
    createdAt: Date.parse(row.created_at) || Date.now(),
    lastLogin: row.last_login ? Date.parse(row.last_login) : null, streak: Number(row.streak) || 0,
    lastCheckin: row.last_checkin || null, fails: 0, lockUntil: 0, mustChange: false
  };
}

function profileSnapshot(profile, staff = isStaff()) {
  const snapshot = {
    name: profile.name, dept: profile.dept, jobTitle: profile.jobTitle, theme: profile.theme, avatar: profile.avatar || null,
    points: profile.points, xp: profile.xp, badges: profile.badges, streak: profile.streak, lastCheckin: profile.lastCheckin
  };
  if (staff) Object.assign(snapshot, { role: profile.role, active: profile.active, pending: profile.pending });
  return JSON.stringify(snapshot);
}

function recordId(collection, item, index) {
  if (item.id != null) return String(item.id);
  if (item.code) return String(item.code);
  if (item.courseId != null && ['quizzes', 'enrollments', 'favorites', 'ratings'].includes(collection))
    return collection === 'quizzes' ? String(item.courseId) : `${item.userId}:${item.courseId}`;
  if (collection === 'progress') return `${item.userId}:${item.lessonId}`;
  return `${item.userId || 'shared'}:${item.at || 0}:${index}`;
}

function ownerAuthId(internalId) {
  const profile = S.users.find((x) => x.id === Number(internalId));
  return profile?.authId || (Number(internalId) === sessionId ? sessionAuthId : null);
}

function rowsForCollection(collection) {
  if (collection === 'settings') return [{ record_id: 'platform', owner_id: null, payload: S.settings }];
  if (collection === 'departments') return S.depts.map((name) => ({ record_id: name, owner_id: null, payload: { name } }));
  const scoped = (item) => ({
    organization_id: item._organizationId ?? O.context.organizationId,
    unit_id: item._unitId ?? O.context.unitId,
    sector_id: item._sectorId ?? O.context.sectorId
  });
  if (collection === 'watch' || collection === 'notes') {
    return Object.entries(S[collection]).map(([key, value]) => {
      const internalId = Number(key.split(':')[0]);
      const owner_id = ownerAuthId(internalId);
      return owner_id ? { ...scoped({}), record_id: key, owner_id, payload: { userId: internalId, value } } : null;
    }).filter(Boolean);
  }
  return (S[collection] || []).map((item, index) => {
    const payload = Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('_')));
    if (sharedCollections.includes(collection)) return { ...scoped(item), record_id: recordId(collection, item, index), owner_id: null, payload };
    const owner_id = ownerAuthId(item.userId);
    if (!isStaff() && owner_id !== sessionAuthId) return null;
    return owner_id ? { ...scoped(item), record_id: recordId(collection, item, index), owner_id, payload } : null;
  }).filter(Boolean);
}

function hydrateRecords(records) {
  const mapped = Object.fromEntries(records.map((r) => [r.collection, r.payload]));
  for (const collection of simpleCollections) S[collection] = records.filter((r) => r.collection === collection).map((r) => ({
    ...r.payload,
    _organizationId: r.organization_id,
    _unitId: r.unit_id,
    _sectorId: r.sector_id
  }));
  if (mapped.settings) S.settings = { ...S.settings, ...mapped.settings };
  const departments = records.filter((r) => r.collection === 'departments').map((r) => r.payload.name);
  if (departments.length) S.depts = departments;
  S.watch = Object.fromEntries(records.filter((r) => r.collection === 'watch').map((r) => [r.record_id, r.payload.value]));
  S.notes = Object.fromEntries(records.filter((r) => r.collection === 'notes').map((r) => [r.record_id, r.payload.value]));
}

async function loadRemoteState(authUser) {
  const { data: own, error: ownError } = await backend.from('profiles').select('*').eq('id', authUser.id).single();
  if (ownError || !own) throw new Error('Não foi possível carregar o perfil da conta. Execute supabase/schema.sql no projeto.');
  if (!own.active || own.pending) {
    const message = own.pending ? 'A conta aguarda aprovação.' : 'A conta está desativada. Fale com o administrador.';
    S = DEFAULTS(); sessionId = null; sessionAuthId = null; remoteReady = false;
    await backend.auth.signOut();
    await loadPublicConfig(); toast(message, true); return false;
  }
  sessionAuthId = authUser.id;
  sessionId = Number(own.internal_id);
  profileSnapshots.clear();
  S = DEFAULTS();
  await loadPublicConfig();
  await loadOrganizationalState(own.role === 'admin');
  const { data: directory, error: directoryError } = await backend.from('member_directory').select('*');
  if (directoryError) throw directoryError;
  S.users = (directory || []).map(profileFromRow);
  const ownProfile = profileFromRow(own);
  const ownIndex = S.users.findIndex((x) => x.id === ownProfile.id);
  if (ownIndex < 0) S.users.push(ownProfile); else S.users[ownIndex] = ownProfile;
  if (own.role === 'admin') {
    const { data: profiles, error: profilesError } = await backend.from('profiles').select('*');
    if (profilesError) throw profilesError;
    S.users = (profiles || []).map(profileFromRow);
  }
  S.users.forEach((profile) => profileSnapshots.set(profile.authId, profileSnapshot(profile)));
  let recordsQuery = backend.from('app_records')
    .select('id,collection,record_id,owner_id,payload,organization_id,unit_id,sector_id,created_by,status');
  recordsQuery = applyRecordScope(recordsQuery);
  const { data: records, error: recordsError } = await recordsQuery.range(0, 9999);
  if (recordsError) throw recordsError;
  remoteRecordSnapshots.clear();
  (records || []).forEach((row) => remoteRecordSnapshots.set(remoteRecordKey(row.collection, row.owner_id, row.record_id), { ...row, snapshot: stableJSON(row.payload) }));
  hydrateRecords(records || []);
  if (!isStaff()) await loadQuizOverview();
  remoteReady = true;
  return true;
}

async function loadPublicConfig() {
  S = DEFAULTS();
  const { data, error } = await backend.from('app_records').select('collection,payload')
    .is('owner_id', null).is('organization_id', null)
    .in('collection', ['settings', 'departments']).range(0, 1000);
  if (error?.code === 'PGRST205') throw new Error('Banco ainda não configurado. Execute supabase/schema.sql no SQL Editor do projeto e recarregue esta página.');
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    throw new Error('O banco ainda não possui a estrutura organizacional. Execute as migrações indicadas no README antes de publicar esta versão.');
  }
  if (error) throw error;
  const settings = (data || []).find((row) => row.collection === 'settings')?.payload;
  if (settings) S.settings = { ...S.settings, ...settings };
  const departments = (data || []).filter((row) => row.collection === 'departments').map((row) => row.payload.name);
  if (departments.length) S.depts = departments;
}

async function syncCollection(collection) {
  if (LOCAL_MODE) return;
  const rows = rowsForCollection(collection).map((row) => ({ ...row, collection }));
  const keep = new Set(rows.map((row) => remoteRecordKey(collection, row.owner_id, row.record_id)));
  const changed = rows.filter((row) => remoteRecordSnapshots.get(remoteRecordKey(collection, row.owner_id, row.record_id))?.snapshot !== stableJSON(row.payload));
  if (changed.length) {
    const { data, error } = await backend.from('app_records').upsert(changed, { onConflict: 'collection,record_id,owner_scope' })
      .select('id,collection,record_id,owner_id,payload,organization_id,unit_id,sector_id,created_by,status');
    if (error) throw error;
    (data || []).forEach((row) => remoteRecordSnapshots.set(remoteRecordKey(row.collection, row.owner_id, row.record_id), { ...row, snapshot: stableJSON(row.payload) }));
  }
  const stale = [...remoteRecordSnapshots.entries()].filter(([key, row]) => row.collection === collection
    && (isStaff() || row.owner_id === sessionAuthId) && !keep.has(key));
  const staleIds = stale.map(([, row]) => row.id);
  if (staleIds.length) {
    const { error } = await backend.from('app_records').delete().in('id', staleIds);
    if (error) throw error;
    stale.forEach(([key]) => remoteRecordSnapshots.delete(key));
  }
}

async function refreshAnnouncements() {
  if (!remoteReady || LOCAL_MODE) return;
  const scopedQuery = applyRecordScope(backend.from('app_records')
    .select('id,collection,record_id,owner_id,payload,organization_id,unit_id,sector_id,created_by,status')
    .eq('collection', 'announcements').is('owner_id', null));
  const { data: scopedRows, error: scopedError } = await scopedQuery.range(0, 9999);
  if (scopedError) throw scopedError;
  const rows = scopedRows || [];
  const currentKeys = new Set(rows.map((row) => remoteRecordKey(row.collection, row.owner_id, row.record_id)));
  [...remoteRecordSnapshots.entries()].forEach(([key, row]) => {
    if (row.collection === 'announcements' && !currentKeys.has(key)) remoteRecordSnapshots.delete(key);
  });
  rows.forEach((row) => remoteRecordSnapshots.set(
    remoteRecordKey(row.collection, row.owner_id, row.record_id),
    { ...row, snapshot: stableJSON(row.payload) }
  ));
  S.announcements = rows.map((row) => ({
    ...row.payload, _organizationId: row.organization_id, _unitId: row.unit_id, _sectorId: row.sector_id
  }));
}

async function syncRemoteState() {
  if (!remoteReady || !sessionAuthId) return;
  await syncProfiles();
  if (isAdmin()) {
    for (const collection of ['settings', 'departments']) await syncCollection(collection);
  }
  for (const collection of (isStaff() ? sharedCollections.concat(privateCollections) : studentWritableCollections)) await syncCollection(collection);
}

async function syncProfiles() {
  const staff = isAdmin();
  for (const profile of S.users) {
    if (!profile.authId) continue;
    if (!staff && profile.authId !== sessionAuthId) continue;
    const snapshot = profileSnapshot(profile, staff);
    const previous = profileSnapshots.get(profile.authId);
    if (previous === snapshot) continue;
    const patch = {
      name: profile.name, dept: profile.dept || '', job_title: profile.jobTitle || '', theme: profile.theme === 'light' ? 'light' : 'dark', avatar: profile.avatar || {}
    };
    if (staff) Object.assign(patch, { role: profile.role, active: profile.active, pending: profile.pending });
    // Pontos, XP, conquistas e sequência: só o administrador ajusta direto; os demais são calculados pelo servidor.
    if (isAdmin()) Object.assign(patch, { points: Number(profile.points) || 0, xp: Number(profile.xp) || 0, badges: profile.badges || [], streak: Number(profile.streak) || 0, last_checkin: profile.lastCheckin || null });
    const { error } = await backend.from('profiles').update(patch).eq('id', profile.authId);
    if (error) throw error;
    profileSnapshots.set(profile.authId, snapshot);
  }
}

function scheduleRemoteSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveQueue = saveQueue.then(syncRemoteState).catch((error) => toast(error.message || 'Falha ao salvar no banco remoto.', true));
  }, 350);
}

let backendInitPromise = null;
function initializeBackend() {
  if (backendInitPromise) return backendInitPromise;
  backendInitPromise = (async () => {
    if (LOCAL_MODE) {
      const defaults = DEFAULTS();
      const savedState = localStorage.getItem(LOCAL_STATE_KEY);
      const savedPasswords = localStorage.getItem(LOCAL_PASSWORDS_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        S = { ...defaults, ...parsed, settings: { ...defaults.settings, ...parsed.settings } };
      } else {
        S = defaults;
      }
      localPasswords = savedPasswords ? JSON.parse(savedPasswords) : {};
      for (const [authId, password] of Object.entries(localPasswords)) {
        if (typeof password !== 'string') throw new Error('Os dados locais de senha estão inválidos.');
        if (!/^[0-9a-f]{32}:[0-9a-f]{64}$/i.test(password)) localPasswords[authId] = await hashLocalPassword(password);
      }
      let admin = S.users.find((u) => u.email === 'admin@local.test');
      if (!admin) {
        admin = { id: nid(), authId: 'local-admin', name: 'Administrador de demonstração', email: 'admin@local.test', role: 'admin',
          dept: '', jobTitle: '', active: true, pending: false, points: 0, xp: 0, badges: [], theme: 'dark',
          createdAt: Date.now(), lastLogin: null, streak: 0, lastCheckin: null, fails: 0, lockUntil: 0, mustChange: false };
        S.users.push(admin);
      }
      admin.authId ||= 'local-admin';
      if (!localPasswords[admin.authId]) localPasswords[admin.authId] = await hashLocalPassword('admin123');
      localStorage.setItem(LOCAL_PASSWORDS_KEY, JSON.stringify(localPasswords));
      const savedSession = Number(localStorage.getItem(LOCAL_SESSION_KEY));
      const savedUser = S.users.find((u) => u.id === savedSession && u.active && !u.pending);
      if (savedUser) {
        sessionId = savedUser.id;
        sessionAuthId = savedUser.authId;
      }
      remoteReady = false;
      backendReady = true;
      return;
    }
    if (!backend) throw new Error('O cliente Supabase não está disponível.');
    const { data, error } = await backend.auth.getSession();
    if (error) throw error;
    if (data.session?.user) { const loaded = await loadRemoteState(data.session.user); if (!loaded) await loadPublicConfig(); }
    else { sessionId = null; sessionAuthId = null; remoteReady = false; await loadPublicConfig(); }
    backendReady = true;
    backend.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        S = DEFAULTS(); sessionId = null; sessionAuthId = null; remoteReady = false;
        if (backendReady) { renderChrome(); route(); }
      }
    });
  })().catch((error) => { backendInitPromise = null; throw error; });
  return backendInitPromise;
}
