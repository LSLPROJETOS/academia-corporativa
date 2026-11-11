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
const AVATAR_DEFAULT = { skin: 'warm', hair: 'dark', hairStyle: 'wavy', outfit: 'violet', outfitStyle: 'tee', expression: 'smile', accessory: 'none', background: 'lavender' };
const AVATAR_OPTIONS = {
  skin: [['light', 'Claro', '#f4c9a8'], ['warm', 'Moreno claro', '#d99b72'], ['tan', 'Moreno', '#ae7050'], ['deep', 'Escuro', '#764832']],
  hair: [['dark', 'Castanho escuro', '#342c39'], ['brown', 'Castanho', '#65432f'], ['gold', 'Loiro', '#e3b960'], ['copper', 'Acobreado', '#c95f4c'], ['rose', 'Rosa', '#bd5d87']],
  hairStyle: [['short', 'Curto', '◠'], ['curly', 'Cacheado', '✿'], ['long', 'Longo', '⌣'], ['wavy', 'Ondulado', '〰'], ['afro', 'Black power', '✹'], ['bob', 'Bob', '◒']],
  outfit: [['violet', 'Violeta', '#7357d8'], ['ocean', 'Azul', '#3186b8'], ['mint', 'Verde', '#349779'], ['coral', 'Coral', '#e77662'], ['sun', 'Amarelo', '#d4a62f']],
  outfitStyle: [['tee', 'Camiseta', '◒'], ['hoodie', 'Moletom', '⌂'], ['collar', 'Gola', '◇'], ['sweater', 'Suéter', '≋'], ['jacket', 'Jaqueta', '⌑']],
  expression: [['smile', 'Sorridente', '☺'], ['calm', 'Tranquilo', '◡'], ['wink', 'Confiante', '😉'], ['joy', 'Animado', '✦'], ['surprise', 'Surpreso', '○'], ['focused', 'Focado', '⌁']],
  accessory: [['none', 'Sem acessório', '—'], ['round', 'Óculos redondos', '◉'], ['bold', 'Óculos marcantes', '▣'], ['sun', 'Óculos escuros', '◐']],
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
  const hairBack = {
    short: '<path d="M38 79c-10-37 4-64 36-66 37-3 53 24 39 66l-8 28H42z"/>',
    curly: '<path d="M41 86c-17-3-20-18-10-29-8-14 2-28 15-29 5-16 23-20 34-9 16-8 33 2 32 18 15 8 17 24 5 35l-6 33H43z"/>',
    long: '<path d="M40 77c-12-38 5-64 36-65 38-1 51 27 39 69l-4 64H44l-5-42z"/>',
    wavy: '<path d="M40 76c-12-39 6-64 37-64 36 0 51 27 37 68 10 16 5 30-7 38l-1 27H45l-1-31c-12-9-13-24-3-38z"/>',
    afro: '<path d="M42 89c-18-8-20-31-7-43-4-19 10-34 27-32 13-13 34-9 40 6 19 1 31 20 21 37 11 15 5 32-8 39l-2 48H46z"/>',
    bob: '<path d="M40 76c-12-39 6-64 37-64 36 0 51 26 38 69l-4 44H44z"/>'
  }[v.hairStyle];
  const curls = v.hairStyle === 'curly'
    ? '<g><circle cx="43" cy="43" r="10"/><circle cx="56" cy="28" r="11"/><circle cx="74" cy="23" r="12"/><circle cx="93" cy="31" r="11"/><circle cx="104" cy="47" r="9"/></g>'
    : '';
  const frontHair = {
    short: '<path d="M40 67c0-34 14-51 36-51 26 0 39 21 32 47-8-9-17-15-28-16-10 11-22 17-40 20z"/>',
    curly: '<path d="M40 66c-9-9-4-22 7-28 6-14 22-17 32-8 13-5 24 4 23 17 10 8 10 18 1 25-8-11-17-16-27-16-11 11-22 15-36 10z"/>',
    long: '<path d="M41 67c-3-35 11-52 36-52 27 0 40 22 33 50-8-12-18-18-29-19-11 13-24 19-40 21z"/>',
    wavy: '<path d="M40 67c-4-34 10-51 36-51 27 0 40 22 33 49-7-7-13-11-20-12 7 12 4 22-5 29 0-13-5-21-13-26-9 12-19 18-31 20z"/>',
    afro: '<path d="M40 69c-12-9-10-24 1-31-1-14 11-23 23-19 12-11 29-5 31 8 13 2 20 14 12 25 4 7 2 14-3 19-8-12-18-18-30-18-10 11-21 16-34 16z"/>',
    bob: '<path d="M40 66c-3-34 11-51 37-51 27 0 40 22 33 51-3 15-10 25-17 31V67c-16 2-29-4-41-14l-2 46c-8-9-13-20-10-33z"/>'
  }[v.hairStyle];
  const eyes = {
    smile: '<path d="M50 74q7-3 13 0M83 74q7-3 13 0"/><ellipse cx="57" cy="83" rx="6" ry="7" fill="#fff" stroke="none"/><ellipse cx="89" cy="83" rx="6" ry="7" fill="#fff" stroke="none"/><circle cx="58" cy="84" r="2.8" fill="#493b4b" stroke="none"/><circle cx="90" cy="84" r="2.8" fill="#493b4b" stroke="none"/><circle cx="59" cy="83" r="1" fill="#fff" stroke="none"/><circle cx="91" cy="83" r="1" fill="#fff" stroke="none"/>',
    calm: '<path d="M50 75q7-3 13 0M83 75q7-3 13 0M51 84q6-3 12 0M83 84q6-3 12 0"/>',
    wink: '<path d="M50 74q7-3 13 0M83 74q7-3 13 0"/><ellipse cx="57" cy="83" rx="6" ry="7" fill="#fff" stroke="none"/><circle cx="58" cy="84" r="2.8" fill="#493b4b" stroke="none"/><path d="M83 84q6-4 12 0"/>',
    joy: '<path d="M50 75q7-4 13 0M83 75q7-4 13 0M51 84q6-5 12 0M84 84q6-5 12 0"/>',
    surprise: '<path d="M50 72q7-4 13-1M83 71q7-3 13 0"/><ellipse cx="57" cy="83" rx="6.5" ry="8" fill="#fff" stroke="none"/><ellipse cx="89" cy="83" rx="6.5" ry="8" fill="#fff" stroke="none"/><circle cx="58" cy="84" r="2.8" fill="#493b4b" stroke="none"/><circle cx="90" cy="84" r="2.8" fill="#493b4b" stroke="none"/>',
    focused: '<path d="m50 74 13 2M96 74l-13 2"/><ellipse cx="57" cy="83" rx="6" ry="6.5" fill="#fff" stroke="none"/><ellipse cx="89" cy="83" rx="6" ry="6.5" fill="#fff" stroke="none"/><circle cx="59" cy="84" r="2.7" fill="#493b4b" stroke="none"/><circle cx="87" cy="84" r="2.7" fill="#493b4b" stroke="none"/>'
  }[v.expression];
  const mouth = {
    smile: '<path d="M66 104q7 6 14 0"/>',
    calm: '<path d="M67 105h12"/>',
    wink: '<path d="M65 103q8 8 17-1"/>',
    joy: '<path d="M65 103q8 11 16 0"/>',
    surprise: '<ellipse cx="73" cy="105" rx="3" ry="3.5"/>',
    focused: '<path d="M67 105q6-2 12 0"/>'
  }[v.expression];
  const glasses = {
    none: '',
    round: '<g fill="none" stroke="#493b4b" stroke-width="3"><circle cx="57" cy="82" r="11"/><circle cx="87" cy="82" r="11"/><path d="M68 81q4-3 8 0M46 80l-6-3M98 80l6-3"/></g>',
    bold: '<g fill="rgba(255,255,255,.16)" stroke="#493b4b" stroke-width="5"><rect x="44" y="72" width="27" height="21" rx="8"/><rect x="76" y="72" width="27" height="21" rx="8"/><path d="M71 80h6M44 79l-6-3M103 79l6-3"/></g>',
    sun: '<g fill="#3e3948" stroke="#3e3948" stroke-width="4"><path d="M44 74h27l-2 14q-2 7-11 7t-12-7z"/><path d="M76 74h27l-2 14q-2 7-11 7t-12-7z"/><path d="M71 79h6M44 78l-6-3M103 78l6-3"/></g>'
  }[v.accessory];
  const clothing = {
    tee: `<path d="M28 178c3-29 17-40 38-44l7 12 7-12c21 4 35 15 38 44z" fill="${color('outfit')}"/><path d="m64 136 9 10 9-10" fill="none" stroke="rgba(255,255,255,.82)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    hoodie: `<path d="M51 142q-2-15 9-22h26q11 7 9 22c18 6 29 17 32 36H28c3-19 14-30 23-36z" fill="${color('outfit')}"/><path d="M58 123q15 19 30 0M73 144v34M59 139l8 9M87 139l-8 9" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    collar: `<path d="M28 178c3-29 17-40 38-44l7 12 7-12c21 4 35 15 38 44z" fill="${color('outfit')}"/><path d="m58 135 15 15 15-15-7-4-8 8-8-8z" fill="#fff"/><path d="m73 150-5 8 5 13 5-13z" fill="#e36b63"/>`,
    sweater: `<path d="M28 178c3-29 17-40 38-44l7 12 7-12c21 4 35 15 38 44z" fill="${color('outfit')}"/><path d="m64 136 9 10 9-10M31 162h84M29 169h88" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="3" stroke-linecap="round"/>`,
    jacket: `<path d="M28 178c3-29 17-40 38-44l7 12 7-12c21 4 35 15 38 44z" fill="${color('outfit')}"/><path d="m58 135 15 17 15-17-8-4-7 9-7-9zM73 152v26" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="80" cy="161" r="1.7" fill="#fff"/><circle cx="80" cy="170" r="1.7" fill="#fff"/>`
  }[v.outfitStyle];
  const neckShadow = '<path d="M63 121h20v19q-10 8-20 0z" fill="rgba(101,58,50,.12)"/>';
  const hairStrands = v.hairStyle === 'curly'
    ? '<g fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"><path d="M48 38q6-10 12-6M69 27q7-6 13-1M91 39q6-1 8 5"/></g>'
    : v.hairStyle === 'afro'
      ? '<g fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"><path d="M49 34q5-7 10-4M70 25q6-5 11 0M91 34q6-3 9 3"/></g>'
      : '<path d="M52 34q12-9 24-7" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 146 178" role="img" aria-label="Personagem personalizado" xmlns="http://www.w3.org/2000/svg">
    <rect width="146" height="178" rx="28" fill="${color('background')}"/>
    <path d="M0 151q35-25 73-16 39-9 73 16v27H0z" fill="#fff" opacity=".16"/>
    ${clothing}
    ${hairBack.replace('<path ', `<path fill="${color('hair')}" `)}
    <path d="M39 79c-8-4-13 2-11 10 1 7 6 11 13 10M107 79c8-4 13 2 11 10-1 7-6 11-13 10" fill="${color('skin')}"/>
    <path d="M42 85q-8 5-2 10M104 85q8 5 2 10" fill="none" stroke="rgba(123,69,55,.35)" stroke-width="2" stroke-linecap="round"/>
    <path d="M63 116h20v27q-10 8-20 0z" fill="${color('skin')}"/>
    ${neckShadow}
    <ellipse cx="73" cy="82" rx="34" ry="42" fill="${color('skin')}"/>
    <ellipse cx="61" cy="91" rx="15" ry="20" fill="#fff" opacity=".055"/>
    ${frontHair.replace('<path ', `<path fill="${color('hair')}" `)}
    ${hairStrands}
    <g fill="none" stroke="#66545a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${eyes}</g>
    ${glasses}
    <path d="M73 87q-2 5 1 7" fill="none" stroke="#a86857" stroke-width="1.8" stroke-linecap="round" opacity=".75"/>
    <g fill="none" stroke="#a34f58" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${mouth}</g>
    <ellipse cx="48" cy="101" rx="6" ry="3" fill="#ef8f85" opacity=".24"/><ellipse cx="98" cy="101" rx="6" ry="3" fill="#ef8f85" opacity=".24"/>
    <circle cx="30" cy="34" r="3" fill="#fff" opacity=".9"/><path d="M116 36v9m-4-4h8" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>
  </svg>`;
}
function avatar(u, size = '') {
  return `<span class="avatar ${size} ${u.avatar ? 'character-avatar' : ''}" ${u.avatar ? `aria-label="Personagem de ${esc(u.name)}"` : `style="background:hsl(${hue(u.id)} 45% 38%)"`}>${u.avatar ? avatarSVG(u.avatar) : esc(initials(u.name))}</span>`;
}
function avatarBuilderHTML(value = AVATAR_DEFAULT) {
  const config = normalizeAvatar(value);
  const group = (key, title, type = 'swatches') => `<fieldset class="avatar-choice-group avatar-group-${key}"><legend>${title}</legend><div class="avatar-choices ${type}">${AVATAR_OPTIONS[key].map(([id, label, swatch]) => {
    const active = config[key] === id;
    const sample = type === 'samples';
    const preview = sample ? `<span class="avatar-option-art">${avatarSVG({ ...config, [key]: id })}</span>` : '';
    return `<button type="button" class="avatar-choice ${sample ? 'avatar-sample' : 'avatar-swatch'} ${active ? 'selected' : ''}" data-action="avatar-pick" data-key="${key}" data-value="${id}" aria-label="${label}" aria-pressed="${active}" ${sample ? '' : `style="--choice-color:${swatch}" title="${label}"`}>${sample ? `${preview}<span class="avatar-sample-label">${label}</span>` : '<span class="avatar-swatch-label">' + label + '</span>'}</button>`;
  }).join('')}</div></fieldset>`;
  return `<section class="avatar-builder"><div class="avatar-preview"><div class="avatar-preview-art">${avatarSVG(config)}</div><span class="avatar-preview-kicker">SUA PRÓXIMA VERSÃO</span><strong>Seu personagem</strong><span>Uma versão com a sua cara.</span><button type="button" class="avatar-randomize" data-action="avatar-randomize">✦ Sortear visual</button></div><div class="avatar-builder-options">
    ${group('hairStyle', 'Penteado', 'samples')}${group('expression', 'Expressão', 'samples')}${group('accessory', 'Acessórios', 'samples')}${group('outfitStyle', 'Modelo da roupa', 'samples')}${group('skin', 'Tom de pele')}${group('hair', 'Cor do cabelo')}${group('outfit', 'Cor da roupa')}${group('background', 'Fundo')}
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
function imageToDataURL(file, max = 240, quality = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => rej(new Error('Imagem inválida.')); img.src = URL.createObjectURL(file);
  });
}
async function announcementImageURLs(items) {
  const urls = new Map(), paths = [];
  items.forEach((item) => {
    if (item.imageData) urls.set(String(item.id), item.imageData);
    else if (item.imagePath && !LOCAL_MODE) paths.push(item);
  });
  if (!paths.length) return urls;
  const { data, error } = await backend.storage.from('announcement-images')
    .createSignedUrls(paths.map((item) => item.imagePath), 3600);
  if (error) fail(error.message);
  (data || []).forEach((entry) => {
    if (entry.error) fail(entry.error.message || 'Não foi possível carregar uma imagem do mural.');
    const item = paths.find((candidate) => candidate.imagePath === entry.path);
    if (item && entry.signedUrl) urls.set(String(item.id), entry.signedUrl);
  });
  return urls;
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
