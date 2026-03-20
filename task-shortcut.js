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

  const openTarefa = (resumo) => {
    const url = new URL('tarefas.html', window.location.href);
    url.searchParams.set('action', 'nova');
    url.searchParams.set('setor', setor);
    if (resumo) url.searchParams.set('resumo', resumo);
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
        openTarefa(getResumoFromCard(card));
      });
      card.appendChild(btn);
    });
  };

  const addSectionButton = () => {
    if (document.getElementById('btn-task-section')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-task-section';
    btn.textContent = '📌 Anexar tarefa deste setor';
    btn.style.cssText = 'position:fixed;right:20px;top:20px;z-index:2200;background:#ff6b00;color:white;border:none;border-radius:8px;padding:10px 12px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);';
    btn.addEventListener('click', () => {
      const resumo = prompt('Resumo rápido da tarefa para este setor:') || '';
      openTarefa(resumo);
    });
    document.body.appendChild(btn);
  };

  addSectionButton();
  addCardButtons();
  const mo = new MutationObserver(addCardButtons);
  mo.observe(document.body, { childList: true, subtree: true });
})();
