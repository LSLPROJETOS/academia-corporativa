// ============================================================================
// 3. AUXILIARES
// ============================================================================
const $ = (id) => document.getElementById(id);
function fail(msg) { throw new Error(msg); }                         // interrompe com mensagem de erro
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); // evita injeção de código
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const fmtDate = (t) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const fmtISO = (s) => (s ? s.split('-').reverse().join('/') : '');   // '2026-10-31' -> '31/10/2026'
const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m || 0} min`);
const isoOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayISO = () => isoOf(new Date());
const initials = (n) => (n || '?').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const hue = (id) => (id * 47) % 360;                                 // cor própria de cada usuário/curso
const AVATAR_DEFAULT = { skin: 'warm', hair: 'dark', hairStyle: 'short', outfit: 'violet', expression: 'smile', background: 'lavender' };
const AVATAR_OPTIONS = {
  skin: [['light', 'Claro', '#f4c9a8'], ['warm', 'Moreno claro', '#d99b72'], ['tan', 'Moreno', '#ae7050'], ['deep', 'Escuro', '#764832']],
  hair: [['dark', 'Castanho escuro', '#342c39'], ['brown', 'Castanho', '#65432f'], ['gold', 'Loiro', '#e3b960'], ['copper', 'Acobreado', '#c95f4c'], ['rose', 'Rosa', '#bd5d87']],
  hairStyle: [['short', 'Curto', '◠'], ['curly', 'Cacheado', '✿'], ['long', 'Longo', '⌣']],
  outfit: [['violet', 'Violeta', '#7357d8'], ['ocean', 'Azul', '#3186b8'], ['mint', 'Verde', '#349779'], ['coral', 'Coral', '#e77662'], ['sun', 'Amarelo', '#d4a62f']],
  expression: [['smile', 'Sorridente', '☺'], ['calm', 'Tranquilo', '◡'], ['wink', 'Confiante', '😉']],
  background: [['lavender', 'Lavanda', '#e8e1ff'], ['sky', 'Azul céu', '#d9effa'], ['mint', 'Verde claro', '#dcf3e8'], ['peach', 'Pêssego', '#ffeadb'], ['sun', 'Amarelo claro', '#f8efc9']]
};
function normalizeAvatar(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([key, options]) => [
    key, options.some(([id]) => id === raw[key]) ? raw[key] : AVATAR_DEFAULT[key]
  ]));
}
function avatarSVG(value) {
  const v = normalizeAvatar(value);
  const color = (key) => AVATAR_OPTIONS[key].find(([id]) => id === v[key])[2];
  const hair = {
    short: '<path d="M37 44c-3-17 7-29 23-29 17 0 27 12 23 30-4-8-11-12-19-13-7 7-16 10-27 12z"/>',
    curly: '<path d="M33 44c-6-4-5-13 1-16-2-8 5-13 12-12 3-8 13-9 18-3 8-4 16 1 16 9 8 3 10 12 4 18-4-8-11-12-20-13-8 7-18 12-31 17z"/>',
    long: '<path d="M34 46c-5-21 7-33 26-33 18 0 29 15 24 36l-5 41H40l-5-38z"/>'
  }[v.hairStyle];
  const curls = v.hairStyle === 'curly'
    ? '<g><circle cx="37" cy="30" r="7"/><circle cx="47" cy="20" r="7"/><circle cx="61" cy="18" r="8"/><circle cx="74" cy="26" r="7"/></g>'
    : '';
  const eyes = v.expression === 'wink'
    ? '<path d="M47 48h7"/><circle cx="69" cy="48" r="2.5" fill="#352a2a" stroke="none"/>'
    : '<circle cx="49" cy="48" r="2.5" fill="#352a2a" stroke="none"/><circle cx="69" cy="48" r="2.5" fill="#352a2a" stroke="none"/>';
  const mouth = v.expression === 'calm' ? 'M53 60q6 4 12 0' : 'M51 58q8 11 16 0';
  return `<svg viewBox="0 0 120 140" role="img" aria-label="Personagem personalizado" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="140" rx="60" fill="${color('background')}"/>
    <circle cx="60" cy="64" r="51" fill="white" opacity=".28"/>
    <path d="M39 106 34 134h18l8-21 8 21h18l-5-28" fill="#f3f1f5"/>
    <path d="M43 101h34l8 34H35z" fill="${color('outfit')}"/>
    <path d="M42 105 27 119M78 105l15 14" fill="none" stroke="${color('skin')}" stroke-width="9" stroke-linecap="round"/>
    <path d="M51 77h18v17H51z" fill="${color('skin')}"/>
    <ellipse cx="60" cy="47" rx="25" ry="29" fill="${color('skin')}"/>
    <g fill="${color('hair')}" stroke="${color('hair')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${hair}${curls}</g>
    ${v.hairStyle === 'long' ? `<path d="M36 40q-3 22 3 43M83 40q4 21-1 43" fill="none" stroke="${color('hair')}" stroke-width="9" stroke-linecap="round"/>` : ''}
    <g fill="none" stroke="#352a2a" stroke-width="2.5" stroke-linecap="round">${eyes}</g>
    <path d="${mouth}" fill="none" stroke="#99554f" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="40" cy="57" r="3" fill="#ef8f85" opacity=".6"/><circle cx="80" cy="57" r="3" fill="#ef8f85" opacity=".6"/>
  </svg>`;
}
function avatar(u, size = '') {
  return `<span class="avatar ${size} ${u.avatar ? 'character-avatar' : ''}" ${u.avatar ? `aria-label="Personagem de ${esc(u.name)}"` : `style="background:hsl(${hue(u.id)} 45% 38%)"`}>${u.avatar ? avatarSVG(u.avatar) : esc(initials(u.name))}</span>`;
}
function avatarBuilderHTML(value = AVATAR_DEFAULT) {
  const config = normalizeAvatar(value);
  const group = (key, title, type = 'swatches') => `<fieldset class="avatar-choice-group"><legend>${title}</legend><div class="avatar-choices ${type}">${AVATAR_OPTIONS[key].map(([id, label, swatch]) => {
    const active = config[key] === id;
    return `<button type="button" class="avatar-choice ${type === 'swatches' ? 'avatar-swatch' : 'avatar-symbol'} ${active ? 'selected' : ''}" data-action="avatar-pick" data-key="${key}" data-value="${id}" aria-label="${label}" aria-pressed="${active}" ${type === 'swatches' ? `style="--choice-color:${swatch}"` : ''}>${type === 'swatches' ? '' : swatch}<span>${label}</span></button>`;
  }).join('')}</div></fieldset>`;
  return `<section class="avatar-builder"><div class="avatar-preview"><div class="avatar-preview-art">${avatarSVG(config)}</div><strong>Seu personagem</strong><span>Uma pequena versão de você</span></div><div class="avatar-builder-options">
    ${group('hairStyle', 'Cabelo', 'symbols')}${group('expression', 'Expressão', 'symbols')}${group('skin', 'Tom de pele')}${group('hair', 'Cor do cabelo')}${group('outfit', 'Sua roupa')}${group('background', 'Fundo')}
    </div>${Object.entries(config).map(([key, val]) => `<input type="hidden" name="avatar_${key}" value="${val}">`).join('')}</section>`;
}
function avatarFromForm(form) {
  return normalizeAvatar(Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((key) => [key, form.elements[`avatar_${key}`]?.value])));
}
const genCode = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const tag = (t, cls = '') => `<span class="tag ${cls}">${t}</span>`;
const panel = (h, cls = '') => `<section class="panel ${cls}">${h}</section>`;
const CAT = { curso: 'Curso', padrao_servico: 'Padrão de serviço' };
const LEVELS = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
const LEVEL_TITLES = ['Iniciante', 'Aprendiz', 'Praticante', 'Profissional', 'Especialista', 'Mestre', 'Lenda'];

// Busca rápida de registros.
const user = (id) => S.users.find((u) => u.id === Number(id));
const course = (id) => S.courses.find((c) => c.id === Number(id));
const lesson = (id) => S.lessons.find((l) => l.id === Number(id));
const product = (id) => S.products.find((p) => p.id === Number(id));
const quizOf = (cid) => S.quizzes.find((q) => q.courseId === cid);
const lessonsOf = (cid) => S.lessons.filter((l) => l.courseId === cid).sort((a, b) => a.position - b.position);
const enrollment = (uid, cid) => S.enrollments.find((e) => e.userId === uid && e.courseId === cid);
const isEnrolled = (uid, cid) => !!enrollment(uid, cid);
const isDone = (uid, lid) => S.progress.some((p) => p.userId === uid && p.lessonId === lid);
const certOf = (uid, cid) => S.certificates.find((c) => c.userId === uid && c.courseId === cid);
const isFav = (uid, cid) => S.favorites.some((f) => f.userId === uid && f.courseId === cid);
const courseHours = (cid) => lessonsOf(cid).reduce((s, l) => s + (Number(l.duration) || 0), 0);
const avgRating = (cid) => { const r = S.ratings.filter((x) => x.courseId === cid); return { avg: r.length ? r.reduce((s, x) => s + x.stars, 0) / r.length : 0, n: r.length }; };
const dueOf = (e, c) => (e && e.dueDate) || (c && c.deadline) || '';

// Etiqueta de prazo: vermelha se atrasado, laranja se faltam até 3 dias.
function dueTag(iso, complete) {
  if (!iso || complete) return '';
  const days = Math.ceil((new Date(iso + 'T23:59:59') - Date.now()) / 864e5);
  if (days < 0) return tag(`Atrasado desde ${fmtISO(iso)}`, 'bad');
  if (days <= 3) return tag(`Vence ${fmtISO(iso)}`, 'warn');
  return tag(`Prazo ${fmtISO(iso)}`);
}

// Aviso rápido embaixo da tela.
let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4200);
}
// Janela (modal) para formulários de criar/editar.
function openModal(title, html, wide = false) {
  const d = $('modal'); $('modal-title').textContent = title; $('modal-body').innerHTML = html;
  d.classList.toggle('wide', wide); if (!d.open) d.showModal();
}
function closeModal() { const d = $('modal'); if (d.open) d.close(); }

// Montadores de campos de formulário (deixam o código dos formulários mais curto).
const fld = (label, name, val = '', attrs = '') => `<label>${label}<input name="${name}" value="${esc(val)}" ${attrs}></label>`;
const area = (label, name, val = '', attrs = '') => `<label>${label}<textarea name="${name}" ${attrs}>${esc(val)}</textarea></label>`;
const sel = (label, name, opts, val) => `<label>${label}<select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const chk = (label, name, on) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
const formJSON = (f) => Object.fromEntries(new FormData(f).entries());

// Texto simples das aulas: parágrafos, "# título", listas com "- " e **negrito**.
function renderText(t) {
  return esc(t).split(/\n{2,}/).map((p) => {
    if (/^# /.test(p)) return `<h3>${p.slice(2)}</h3>`;
    if (/^(- .*(\n|$))+$/.test(p)) return `<ul>${p.split('\n').map((l) => `<li>${l.slice(2)}</li>`).join('')}</ul>`;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Download de arquivos gerados pelo navegador (CSV e backup).
function downloadBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// CSV com ';' e acentos corretos para abrir direto no Excel brasileiro.
function downloadCSV(name, rows) {
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
// Reduz imagem de produto para caber no armazenamento (240px, JPEG).
function imageToDataURL(file, max = 240) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => rej(new Error('Imagem inválida.')); img.src = URL.createObjectURL(file);
  });
}
// Descobre a duração (em minutos) de um vídeo enviado.
function probeDuration(file) {
  return new Promise((res) => {
    const v = document.createElement('video'), url = URL.createObjectURL(file); let done = false;
    const end = (m) => { if (done) return; done = true; URL.revokeObjectURL(url); res(m); };
    v.preload = 'metadata'; v.onloadedmetadata = () => end(Math.max(1, Math.round(v.duration / 60))); v.onerror = () => end(0);
    setTimeout(() => end(0), 4000); v.src = url;
  });
}

// Registro de atividades (auditoria) e notificações para os usuários.
function audit(action) { S.audit.push({ at: Date.now(), userId: sessionId, action }); if (S.audit.length > 500) S.audit.shift(); }
function notify(userId, text, link = '') { S.notifications.push({ id: nid(), userId, text, link, at: Date.now(), read: false }); }

// Trechos de vídeo já assistidos: junta intervalos [início, fim] em segundos.
function addRange(r, a, b) {
  if (b <= a) return; r.push([a, b]); r.sort((x, y) => x[0] - y[0]);
  const m = [r[0].slice()];
  for (const x of r.slice(1)) { const l = m[m.length - 1]; if (x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else m.push(x.slice()); }
  r.length = 0; m.forEach((x) => r.push(x));
}
const covered = (r) => r.reduce((s, x) => s + x[1] - x[0], 0);

// Apaga um curso, aulas, arquivos, prova e tudo ligado a ele.
async function purgeCourse(cid) {
  const c = course(cid); const ids = lessonsOf(cid).map((l) => l.id);
  for (const l of lessonsOf(cid)) if (l.fileId) await idbDel(l.fileId);
  const videoPaths = lessonsOf(cid).map((l) => l.filePath).filter(Boolean);
  if (!LOCAL_MODE && videoPaths.length) { const { error } = await backend.storage.from('course-videos').remove(videoPaths); if (error) throw error; }
  for (const m of c.materials || []) await idbDel(m.fileId);
  const materialPaths = (c.materials || []).map((m) => m.filePath).filter(Boolean);
  if (!LOCAL_MODE && materialPaths.length) { const { error } = await backend.storage.from('course-materials').remove(materialPaths); if (error) throw error; }
  S.lessons = S.lessons.filter((l) => l.courseId !== cid); S.quizzes = S.quizzes.filter((q) => q.courseId !== cid);
  ['enrollments', 'attempts', 'certificates', 'ratings', 'comments', 'favorites'].forEach((k) => (S[k] = S[k].filter((r) => r.courseId !== cid)));
  S.progress = S.progress.filter((p) => !ids.includes(p.lessonId));
  Object.keys(S.watch).forEach((k) => ids.includes(Number(k.split(':')[1])) && delete S.watch[k]);
  S.courses = S.courses.filter((x) => x.id !== cid);
}
