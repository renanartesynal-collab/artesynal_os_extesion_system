(function () {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const setores = {
    'estimpressao.html': true,
    'estserralheria.html': true,
    'orcamentos.html': true
  };

  if (!setores[page]) return;

  const abrirCardPorLink = () => {
    const params = new URLSearchParams(window.location.search);
    const target = (params.get('focusCard') || '').trim();
    const openDetail = params.get('openDetail') === '1';
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

    if (openDetail && typeof window.abrirModalDetalhes === 'function') {
      setTimeout(() => {
        try {
          window.abrirModalDetalhes(target);
        } catch (e) {
          console.warn('Não foi possível abrir detalhes do card automaticamente:', e);
        }
      }, 350);
    }
  };

  abrirCardPorLink();
})();
