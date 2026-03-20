(function () {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const setores = {
    'estimpressao.html': 'impressao',
    'estserralheria.html': 'serralheria',
    'orcamentos.html': 'orcamento'
  };

  const setor = setores[page];
  if (!setor) return;

  const getResumoFromCard = (card) => {
    const sel = ['.prod-name', '.orc-cliente', '.orc-empresa', '.prod-cat'];
    for (const s of sel) {
      const el = card.querySelector(s);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return 'Card sem título';
  };

  const openTarefaUrl = (resumo) => {
    const url = new URL('tarefas.html', window.location.href);
    url.searchParams.set('action', 'nova');
    url.searchParams.set('setor', setor);
    if (resumo) url.searchParams.set('resumo', resumo);
    return url;
  };

  const buildCardRef = (card) => {
    if (!card) return null;
    const cardIdFromAttr = card.dataset.itemId || '';
    const cardIdFromId = (card.id || '').replace(/^card-/, '');
    const cardId = cardIdFromAttr || cardIdFromId;
    if (!cardId) return null;
    return { id: cardId, resumo: getResumoFromCard(card) };
  };

  const abrirTarefaDoCard = (card) => {
    const ref = buildCardRef(card);
    const url = openTarefaUrl(ref?.resumo || '');
    if (ref?.id) url.searchParams.set('cardId', ref.id);
    if (ref?.resumo) url.searchParams.set('cardRef', ref.resumo);
    window.open(url.toString(), '_blank');
  };

  const addCardButtons = () => {
    const cards = document.querySelectorAll('.card-prod, .card-orc');
    cards.forEach((card) => {
      if (card.querySelector('.btn-add-task-card')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-add-task-card';
      btn.textContent = '📌 Tarefa';
      btn.style.cssText = 'margin-top:8px;background:#1f2937;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 8px;font-size:11px;cursor:pointer;font-weight:700;';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        abrirTarefaDoCard(card);
      });
      card.appendChild(btn);
    });
  };

  const abrirCardPorLink = () => {
    const params = new URLSearchParams(window.location.search);
    const target = (params.get('focusCard') || '').trim();
    if (!target) return;

    const byId = document.getElementById(`card-${target}`);
    const byData = document.querySelector(`[data-item-id="${target}"]`);
    const card = byId || byData;
    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prevOutline = card.style.outline;
    const prevShadow = card.style.boxShadow;
    card.style.outline = '2px solid #22c55e';
    card.style.boxShadow = '0 0 0 4px rgba(34,197,94,.25)';
    setTimeout(() => {
      card.style.outline = prevOutline;
      card.style.boxShadow = prevShadow;
    }, 3500);
  };

  addCardButtons();
  abrirCardPorLink();
  const mo = new MutationObserver(addCardButtons);
  mo.observe(document.body, { childList: true, subtree: true });
})();
