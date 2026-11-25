// --- js/tarefas/cards.js ---
// Componente de cartões e formulários dinâmicos do Painel de Tarefas (sem módulo de Orçamento)

export function createCardsTarefasModule({
  refs,
  escapeHtml,
  labelSetor,
  resolverLinkTarefa,
  getTaskById,
  onEditTask,
  onToggleIndicator,
  onConcluirTask,
  onResetTask
}) {
  function classNameSinalizacao(status = '') {
    if (status === 'green') return 'is-green';
    if (status === 'yellow') return 'is-yellow';
    if (status === 'red') return 'is-red';
    return '';
  }

  function preencherExtrasFormulario(extras = {}) {
    const setor = refs.setor.value;
    if (setor === 'impressao') {
      const comprarMidia = document.getElementById('opt-comprar-midia');
      const urgente = document.getElementById('opt-urgente');
      if (comprarMidia) comprarMidia.checked = !!extras.comprarMidia;
      if (urgente) urgente.checked = !!extras.urgente;
    } else if (setor === 'serralheria') {
      const precisaCorte = document.getElementById('opt-corte');
      const medida = document.getElementById('opt-medida');
      const localExterno = document.getElementById('opt-local-externo');
      const destino = extras.destinoCorte === 'externo' ? 'externo' : 'local';
      if (precisaCorte) precisaCorte.checked = !!extras.precisaCorte;
      if (medida) medida.value = extras.medidas || '';
      if (localExterno) localExterno.value = extras.localExterno || '';
      const radio = document.querySelector(`input[name="destino-corte"][value="${destino}"]`);
      if (radio) radio.checked = true;
    } else {
      const urgente = document.getElementById('opt-urgente-geral');
      if (urgente) urgente.checked = !!extras.urgente;
    }
  }

  function coletarExtras() {
    const setor = refs.setor.value;
    const extras = {};
    if (setor === 'impressao') {
      extras.comprarMidia = !!document.getElementById('opt-comprar-midia')?.checked;
      extras.urgente = !!document.getElementById('opt-urgente')?.checked;
    } else if (setor === 'serralheria') {
      extras.precisaCorte = !!document.getElementById('opt-corte')?.checked;
      extras.medidas = document.getElementById('opt-medida')?.value?.trim() || '';
      extras.destinoCorte = document.querySelector('input[name="destino-corte"]:checked')?.value || 'local';
      extras.localExterno = document.getElementById('opt-local-externo')?.value?.trim() || '';
    } else {
      extras.urgente = !!document.getElementById('opt-urgente-geral')?.checked;
    }
    return extras;
  }

  function extrasToBadges(extras = {}) {
    const tags = [];
    if (extras.urgente) tags.push('<span class="ui-badge ui-badge-red">🔥 Urgente</span>');
    if (extras.comprarMidia) tags.push('<span class="ui-badge ui-badge-brand">🛒 Comprar Mídia</span>');
    if (extras.precisaCorte) tags.push(`<span class="ui-badge ui-badge-orange">✂️ Corte ${extras.medidas ? escapeHtml(extras.medidas) : ''}</span>`);
    return tags.length ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">${tags.join('')}</div>` : '';
  }

  function getTaskModalLabels(isEditing = false) {
    return isEditing
      ? { title: 'Editar Tarefa', saveLabel: 'Salvar Alterações' }
      : { title: 'Nova Tarefa', saveLabel: 'Criar Tarefa' };
  }

  function renderCardTarefa(t = {}) {
    const done = t.status === 'concluida';
    const badgeCls =
      t.setor === 'impressao' ? 'ui-badge-purple' :
      t.setor === 'serralheria' ? 'ui-badge-orange' :
      t.setor === 'pintura' ? 'ui-badge-red' :
      t.setor === 'estoque' ? 'ui-badge-green' : 'ui-badge-blue';

    const sinalizacaoClass = classNameSinalizacao(t.sinalizacao);
    const isCompra = String(t.origem || '').startsWith('estoque') || t.tipo === 'Compras';
    const link = resolverLinkTarefa(t);

    return `
      <article class="task-card ${done ? 'done' : ''}" draggable="true" data-task-id="${t.id}">
        <div class="task-card-header">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <button
              class="task-card-indicator ${sinalizacaoClass}"
              type="button"
              draggable="false"
              data-toggle-indicator="${t.id}"
              title="Alternar sinalização de cor"
            ></button>
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
              <span class="ui-badge ${badgeCls}">${labelSetor(t.setor)}</span>
              ${isCompra ? '<span class="ui-badge ui-badge-brand">🛒 Compra</span>' : ''}
            </div>
          </div>
          <button
            class="ui-btn ui-btn-sm ui-btn-ghost"
            style="padding:3px 7px;"
            type="button"
            draggable="false"
            data-edit-task="${t.id}"
            title="Editar tarefa"
          >✏️</button>
        </div>

        <div class="task-title">${escapeHtml(t.resumo || 'Sem resumo')}</div>
        ${t.descricao ? `<div class="task-desc">${escapeHtml(t.descricao)}</div>` : ''}
        ${extrasToBadges(t.extras)}

        <div class="task-footer">
          <button type="button" class="ui-btn ui-btn-sm ${done ? '' : 'ui-btn-green'}" data-concluir="${t.id}">
            ${done ? '✅ Concluída' : '✓ Concluir'}
          </button>
          ${link ? `<a class="ui-btn ui-btn-sm" href="${link}">📍 Abrir Card</a>` : ''}
          ${done ? `<button type="button" class="ui-btn ui-btn-sm" data-reset-task="${t.id}" title="Reabrir tarefa">↩️</button>` : ''}
        </div>
      </article>
    `;
  }

  function bindCardInteractions(root) {
    root.querySelectorAll('[data-concluir]').forEach((btn) => {
      btn.addEventListener('click', () => onConcluirTask(btn.dataset.concluir));
    });

    root.querySelectorAll('[data-reset-task]').forEach((btn) => {
      btn.addEventListener('click', () => onResetTask(btn.dataset.resetTask));
    });

    root.querySelectorAll('[data-edit-task]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tarefa = getTaskById(btn.dataset.editTask);
        if (tarefa) onEditTask(tarefa);
      });
    });

    root.querySelectorAll('[data-toggle-indicator]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await onToggleIndicator(btn.dataset.toggleIndicator);
      });
    });
  }

  return {
    preencherExtrasFormulario,
    coletarExtras,
    getTaskModalLabels,
    renderCardTarefa,
    bindCardInteractions
  };
}
