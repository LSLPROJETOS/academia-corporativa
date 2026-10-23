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
const avatar = (u, size = '') => `<span class="avatar ${size}" style="background:hsl(${hue(u.id)} 45% 38%)">${esc(initials(u.name))}</span>`;
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
