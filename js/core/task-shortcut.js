// --- js/core/task-shortcut.js ---
(function () {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  if (page !== 'materiais.html') return;

  const abrirCardPorLink = () => {
    const params = new URLSearchParams(window.location.search);
    const target = (params.get('focusCard') || '').trim();
    const openDetail = params.get('openDetail') === '1';
    if (!target) return;

    const tentarEncontrar = (tentativas = 0) => {
      const byId = document.getElementById(`card-${target}`);
      const byData = document.querySelector(`[data-item-id="${target}"]`);
      const card = byId || byData;
      if (!card) {
        if (tentativas < 12) setTimeout(() => tentarEncontrar(tentativas + 1), 300);
        return;
      }

      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const prevOutline = card.style.outline;
      const prevShadow = card.style.boxShadow;
      card.style.outline = '2px solid #10b981';
      card.style.boxShadow = '0 0 0 4px rgba(16,185,129,.25)';
      setTimeout(() => {
        card.style.outline = prevOutline;
        card.style.boxShadow = prevShadow;
      }, 3500);

      if (openDetail && typeof window.abrirModalDetalhes === 'function') {
        setTimeout(() => {
          try { window.abrirModalDetalhes(target); } catch {}
        }, 350);
      }
    };

    tentarEncontrar();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', abrirCardPorLink);
  } else {
    abrirCardPorLink();
  }
})();
