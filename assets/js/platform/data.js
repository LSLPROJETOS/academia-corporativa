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
  settings: { platformName: 'Academia Corporativa', accent: '#0b6e5f', openSignup: true, requireApproval: false,
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
    badges: row.badges || [], theme: row.theme || 'auto', createdAt: Date.parse(row.created_at) || Date.now(),
    lastLogin: row.last_login ? Date.parse(row.last_login) : null, streak: Number(row.streak) || 0,
    lastCheckin: row.last_checkin || null, fails: 0, lockUntil: 0, mustChange: false
  };
}

function profileSnapshot(profile, staff = isStaff()) {
  const snapshot = {
    name: profile.name, dept: profile.dept, jobTitle: profile.jobTitle, theme: profile.theme,
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
  if (collection === 'watch' || collection === 'notes') {
    return Object.entries(S[collection]).map(([key, value]) => {
      const internalId = Number(key.split(':')[0]);
      const owner_id = ownerAuthId(internalId);
      return owner_id ? { record_id: key, owner_id, payload: { userId: internalId, value } } : null;
    }).filter(Boolean);
  }
  return (S[collection] || []).map((item, index) => {
    if (sharedCollections.includes(collection)) return { record_id: recordId(collection, item, index), owner_id: null, payload: item };
    const owner_id = ownerAuthId(item.userId);
    if (!isStaff() && owner_id !== sessionAuthId) return null;
    return owner_id ? { record_id: recordId(collection, item, index), owner_id, payload: item } : null;
  }).filter(Boolean);
}

function hydrateRecords(records) {
  const mapped = Object.fromEntries(records.map((r) => [r.collection, r.payload]));
  for (const collection of simpleCollections) S[collection] = records.filter((r) => r.collection === collection).map((r) => r.payload);
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
  const { data: directory, error: directoryError } = await backend.from('member_directory').select('*');
  if (directoryError) throw directoryError;
  S.users = (directory || []).map(profileFromRow);
  const ownProfile = profileFromRow(own);
  const ownIndex = S.users.findIndex((x) => x.id === ownProfile.id);
  if (ownIndex < 0) S.users.push(ownProfile); else S.users[ownIndex] = ownProfile;
  if (['admin', 'instrutor'].includes(own.role)) {
    const { data: profiles, error: profilesError } = await backend.from('profiles').select('*');
    if (profilesError) throw profilesError;
    S.users = (profiles || []).map(profileFromRow);
  }
  S.users.forEach((profile) => profileSnapshots.set(profile.authId, profileSnapshot(profile)));
  const { data: records, error: recordsError } = await backend.from('app_records').select('id,collection,record_id,owner_id,payload').range(0, 9999);
  if (recordsError) throw recordsError;
  remoteRecordSnapshots.clear();
  (records || []).forEach((row) => remoteRecordSnapshots.set(remoteRecordKey(row.collection, row.owner_id, row.record_id), { ...row, snapshot: stableJSON(row.payload) }));
  hydrateRecords(records || []);
  remoteReady = true;
  return true;
}

async function loadPublicConfig() {
  S = DEFAULTS();
  const { data, error } = await backend.from('app_records').select('collection,payload')
    .is('owner_id', null).in('collection', ['settings', 'departments']).range(0, 1000);
  if (error?.code === 'PGRST205') throw new Error('Banco ainda não configurado. Execute supabase/schema.sql no SQL Editor do projeto e recarregue esta página.');
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
      .select('id,collection,record_id,owner_id,payload');
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

async function syncRemoteState() {
  if (!remoteReady || !sessionAuthId) return;
  await syncProfiles();
  if (isStaff()) {
    for (const collection of ['settings', 'departments', ...sharedCollections]) await syncCollection(collection);
  }
  for (const collection of privateCollections) await syncCollection(collection);
}

async function syncProfiles() {
  const staff = isStaff();
  for (const profile of S.users) {
    if (!profile.authId) continue;
    if (!staff && profile.authId !== sessionAuthId) continue;
    const snapshot = profileSnapshot(profile, staff);
    const previous = profileSnapshots.get(profile.authId);
    if (previous === snapshot) continue;
    const patch = {
      name: profile.name, dept: profile.dept || '', job_title: profile.jobTitle || '', theme: profile.theme || 'auto',
      points: Number(profile.points) || 0, xp: Number(profile.xp) || 0, badges: profile.badges || [],
      streak: Number(profile.streak) || 0, last_checkin: profile.lastCheckin || null
    };
    if (staff) Object.assign(patch, { role: profile.role, active: profile.active, pending: profile.pending });
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
          dept: '', jobTitle: '', active: true, pending: false, points: 0, xp: 0, badges: [], theme: 'auto',
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
