// ============================================================================
// 9. EVENTOS (o que acontece em cada clique, formulário e digitação)
// ============================================================================
// Envio de QUALQUER formulário: o atributo data-form diz qual é e FORMS[nome] trata.
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault(); const fn = FORMS[form.dataset.form]; if (!fn) return;
  const btn = form.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
  try { await fn(formJSON(form), form); } catch (err) { toast(err.message, true); } finally { if (btn) btn.disabled = false; }
});

// Clique em QUALQUER elemento com data-action: ACTIONS[nome] trata. Clicar no fundo escuro fecha a janela.
document.addEventListener('click', async (e) => {
  if (e.target === $('modal')) { closeModal(); return; }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const fn = ACTIONS[el.dataset.action]; if (!fn) return;
  try { await fn(el.dataset, el, e); } catch (err) { toast(err.message, true); }
});
ACTIONS.close = () => closeModal();
ACTIONS.menu = () => $('topbar').classList.toggle('open');

// Digitação e filtros: atualiza listas na hora (data-filter="Nome.campo"), mostra campos da aula e muda a velocidade do vídeo.
function onInput(e) {
  const el = e.target;
  if (el.dataset && el.dataset.filter) { const [ns, key] = el.dataset.filter.split('.'); FILTERS[ns][key] = el.type === 'checkbox' ? el.checked : el.value; if (REFRESH[ns]) REFRESH[ns](); return; }
  if (el.name === 'type' && el.form && el.form.dataset.form === 'lesson') syncLessonForm(el.form);
  if (el.dataset && el.dataset.speed !== undefined) { const v = $('player'); if (v) v.playbackRate = Number(el.value); }
  if (el.dataset && el.dataset.note) { S.notes[me().id + ':' + el.dataset.note] = el.value; if (e.type === 'change') save(); } // anotações da aula
}
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);

// Erros inesperados aparecem como aviso em vez de falhar em silêncio.
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Algo deu errado.', true));
window.addEventListener('hashchange', () => { $('topbar').classList.remove('open'); route(true); });

// INÍCIO: ao abrir a página, mostra a tela correta (login, início...).
route();
