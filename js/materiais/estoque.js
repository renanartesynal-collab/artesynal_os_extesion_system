// --- js/materiais/estoque.js ---
// Submódulo de Estoque Geral (Coleção estoque_app em tempo real + Arquivo de Baixas persistido no Firebase + Etiqueta QR 44x24mm)

import { showToast } from '../core/theme.js';
import { db, ROTAS } from '../core/config.js';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const STORAGE_KEY = 'artesynal_estoque_v2';
const DEFAULT_CATEGORIES = ['Ferragens', 'Tintas', 'Parafusos', 'Elétrica', 'Insumos'];
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

export function initEstoqueModule({ userMe, onItemReadyForDeepLink }) {
  let initialized = false;
  let itens = [];
  let categorias = [...DEFAULT_CATEGORIES];
  let arquivoBaixas = [];
  let catFiltro = 'TODAS';
  let apenasMinimo = false;
  let itemAtualId = null;
  let itemRascunhoId = '';
  const warteEmail = 'wartesynal@gmail.com';
  const metaRef = doc(db, 'system_config', 'estoque_geral_meta');

  try {
    const loc = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (loc) {
      if (Array.isArray(loc.categorias)) categorias = [...new Set([...DEFAULT_CATEGORIES, ...loc.categorias])];
      if (Array.isArray(loc.arquivo)) arquivoBaixas = loc.arquivo;
    }
  } catch {}

  function salvarBackupLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ categorias, itens, arquivo: arquivoBaixas }));
    } catch {}
  }

  async function sincronizarMetaFirebase() {
    salvarBackupLocal();
    try {
      await setDoc(metaRef, {
        categorias,
        arquivo: arquivoBaixas.slice(0, 80),
        updated_at: serverTimestamp()
      }, { merge: true });
    } catch {}
  }

  function qrDeepLink(itemId) {
    return `${ROTAS.materiais}?setor=estoque#item-${encodeURIComponent(itemId || 'novo')}`;
  }

  function qrImgUrl(itemId) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=1&data=${encodeURIComponent(qrDeepLink(itemId))}`;
  }

  function formatarData(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function criarNotificacaoCompras(item) {
    const min = Number(item.minimo || 0);
    const qtd = Number(item.quantidade || 0);
    if (min <= 0 || qtd > min) return;

    const q = query(
      collection(db, 'tarefas'),
      where('destinatarioEmail', '==', warteEmail),
      where('status', '==', 'pendente'),
      where('origem', '==', 'estoque'),
      where('itemId', '==', item.id)
    );
    const jaExiste = await getDocs(q);
    if (!jaExiste.empty) return;

    await addDoc(collection(db, 'tarefas'), {
      setor: 'estoque',
      tipo: 'Compras',
      resumo: `Reposição de estoque: ${item.nome}`,
      descricao: `Item ${item.nome} atingiu o mínimo (${qtd} ${item.unidade}).\nCategoria: ${item.categoria || '-'}\nMínimo: ${min}`,
      status: 'pendente',
      destinatarioEmail: warteEmail,
      destinatarioNome: 'warte',
      solicitanteEmail: userMe.email,
      solicitanteNome: userMe.nome || 'Sistema',
      origem: 'estoque',
      itemId: item.id,
      listaId: '',
      cardAlvo: {
        id: item.id,
        setor: 'estoque',
        label: `${item.nome} (${item.id})`,
        link: qrDeepLink(item.id)
      },
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
  }

  function renderPillsCategorias() {
    const wrap = document.getElementById('est-pills-cats');
    if (!wrap) return;
    const todas = [...new Set([...categorias, ...itens.map((i) => i.categoria).filter(Boolean)])];
    wrap.innerHTML = [
      `<button type="button" class="ui-pill ${catFiltro === 'TODAS' ? 'active' : ''}" data-est-cat="TODAS">Todas (${itens.length})</button>`,
      ...todas.map((c) => {
        const count = itens.filter((i) => i.categoria === c).length;
        return `<button type="button" class="ui-pill ${catFiltro === c ? 'active' : ''}" data-est-cat="${esc(c)}">${esc(c)} (${count})</button>`;
      })
    ].join('');

    wrap.querySelectorAll('[data-est-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        catFiltro = b.dataset.estCat;
        renderPillsCategorias();
        renderTabelaEstoque();
      });
    });

    const sel = document.getElementById('est-item-cat');
    if (sel) {
      const atual = sel.value;
      sel.innerHTML = todas.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if (atual && todas.includes(atual)) sel.value = atual;
    }
  }

  function renderTabelaEstoque() {
    const termo = (document.getElementById('est-busca')?.value || '').trim().toLowerCase();
    const tbody = document.getElementById('est-tbody');
    if (!tbody) return;

    const totalAbaixo = itens.filter((it) => Number(it.minimo || 0) > 0 && Number(it.quantidade || 0) <= Number(it.minimo || 0)).length;
    document.getElementById('est-kpi-total').textContent = String(itens.length);
    document.getElementById('est-kpi-minimo').textContent = String(totalAbaixo);
    document.getElementById('est-kpi-arquivo').textContent = String(arquivoBaixas.length);

    const filtrados = itens.filter((it) => {
      if (catFiltro !== 'TODAS' && it.categoria !== catFiltro) return false;
      const abaixo = Number(it.minimo || 0) > 0 && Number(it.quantidade || 0) <= Number(it.minimo || 0);
      if (apenasMinimo && !abaixo) return false;
      if (!termo) return true;
      return [it.nome, it.categoria, it.detalhes].some((x) => String(x || '').toLowerCase().includes(termo));
    });

    if (!filtrados.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:28px;">Nenhum item encontrado neste filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = filtrados.map((it) => {
      const mov = it.historico?.[0];
      const movTxt = mov
        ? `${mov.tipo === 'entrada' ? '🟢 +' : '🔻 -'}${mov.quantidade} por ${mov.responsavel || '-'} (${formatarData(mov.data)})`
        : 'Sem movimentação';
      const dims = [it.tamanho?.largura, it.tamanho?.altura, it.tamanho?.espessura].filter(Boolean).join(' × ') || '—';
      const emMin = Number(it.minimo || 0) > 0 && Number(it.quantidade || 0) <= Number(it.minimo || 0);

      return `
        <tr data-item-id="${esc(it.id)}">
          <td>
            <div style="font-weight:800;">${esc(it.nome)}</div>
            <span class="ui-badge" style="margin-top:3px;">${esc(it.categoria || 'Geral')}</span>
          </td>
          <td style="color:var(--text-secondary); font-size:13px;">${esc(dims)}</td>
          <td>
            <span class="ui-badge ${emMin ? 'ui-badge-red' : 'ui-badge-green'}" style="font-size:12.5px;">
              ${Number(it.quantidade || 0)} ${esc(it.unidade || 'Unidade')}
            </span>
          </td>
          <td>
            ${Number(it.minimo || 0)}
            ${emMin ? '<span class="ui-badge ui-badge-red" style="margin-left:4px;">Repor</span>' : ''}
          </td>
          <td style="font-size:12px; color:var(--text-muted); max-width:250px;">${esc(movTxt)}</td>
          <td style="text-align:right;">
            <div style="display:flex; justify-content:flex-end; gap:6px;">
              <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" data-est-edit="${esc(it.id)}">Movimentar / Editar</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" data-est-del="${esc(it.id)}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-est-edit]').forEach((b) => b.addEventListener('click', () => abrirModalItem(b.dataset.estEdit)));
    tbody.querySelectorAll('[data-est-del]').forEach((b) => b.addEventListener('click', () => excluirItem(b.dataset.estDel)));

    onItemReadyForDeepLink?.('estoque', itens);
  }

  function atualizarPreviewQRModal() {
    const id = itemAtualId || itemRascunhoId || 'novo';
    const nome = document.getElementById('est-item-nome').value.trim() || 'Novo Item';
    const qtd = Number(document.getElementById('est-item-qtd').value || 0);
    const un = document.getElementById('est-item-unidade').value || 'Unidade';
    const qr = qrImgUrl(id);
    document.getElementById('est-qr-img').src = qr;
    document.getElementById('est-print-qr').src = qr;
    document.getElementById('est-qr-title').textContent = nome;
    document.getElementById('est-print-info').textContent = `${nome} • ${qtd} ${un}`;
  }

  function abrirModalItem(id = null) {
    itemAtualId = id;
    renderPillsCategorias();
    const histBox = document.getElementById('est-hist-list');

    if (!id) {
      itemRascunhoId = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      document.getElementById('est-modal-title').textContent = 'Cadastrar Novo Item de Estoque';
      document.getElementById('est-item-nome').value = '';
      document.getElementById('est-tam-l').value = '';
      document.getElementById('est-tam-a').value = '';
      document.getElementById('est-tam-e').value = '';
      document.getElementById('est-item-unidade').value = 'Unidade';
      document.getElementById('est-item-qtd').value = '0';
      document.getElementById('est-item-min').value = '0';
      document.getElementById('est-item-detalhes').value = '';
      document.getElementById('est-mov-section').style.display = 'none';
      histBox.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">O histórico aparecerá após o cadastro.</div>';
    } else {
      const it = itens.find((x) => x.id === id);
      if (!it) return;
      document.getElementById('est-modal-title').textContent = `Item: ${it.nome}`;
      document.getElementById('est-item-nome').value = it.nome || '';
      if (it.categoria) document.getElementById('est-item-cat').value = it.categoria;
      document.getElementById('est-tam-l').value = it.tamanho?.largura || '';
      document.getElementById('est-tam-a').value = it.tamanho?.altura || '';
      document.getElementById('est-tam-e').value = it.tamanho?.espessura || '';
      document.getElementById('est-item-unidade').value = it.unidade || 'Unidade';
      document.getElementById('est-item-qtd').value = String(Number(it.quantidade || 0));
      document.getElementById('est-item-min').value = String(Number(it.minimo || 0));
      document.getElementById('est-item-detalhes').value = it.detalhes || '';
      document.getElementById('est-mov-section').style.display = 'block';
      document.getElementById('est-mov-tipo').value = 'saida';
      document.getElementById('est-mov-qtd').value = '';
      document.getElementById('est-mov-obs').value = '';

      const hist = Array.isArray(it.historico) ? it.historico : [];
      histBox.innerHTML = hist.length
        ? hist.slice(0, 10).map((h) => `
            <div style="font-size:12px; padding:6px 8px; border-bottom:1px solid var(--border-subtle);">
              <strong>${h.tipo === 'entrada' ? '🟢 Entrada' : '🔻 Saída'} (${h.quantidade})</strong> — ${esc(h.responsavel || '-')} em ${formatarData(h.data)}
              ${h.obs ? `<div style="color:var(--text-muted);">${esc(h.obs)}</div>` : ''}
            </div>
          `).join('')
        : '<div style="font-size:12px; color:var(--text-muted);">Sem movimentações anteriores.</div>';
    }

    atualizarPreviewQRModal();
    document.getElementById('modal-est-item').classList.add('open');
  }

  async function excluirItem(id) {
    const it = itens.find((x) => x.id === id);
    if (!it || !confirm(`Excluir permanentemente o item "${it.nome}"?`)) return;
    await deleteDoc(doc(db, 'estoque_app', id));
    showToast('Item removido do estoque.', 'info');
  }

  function renderArquivoBaixas() {
    const box = document.getElementById('est-arquivo-lista');
    if (!box) return;
    box.innerHTML = arquivoBaixas.length
      ? arquivoBaixas.map((r) => `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:10px;">
            <div>
              <div style="font-weight:800; font-size:13px;">${esc(r.itemNome)} — baixa de ${r.qtdMov} ${esc(r.unidade || '')}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">Antes: ${r.qtdAntes} → Depois: ${r.qtdDepois} • ${formatarData(r.data)} • ${esc(r.responsavel || '-')}</div>
            </div>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-blue" data-est-restore="${r.id}">↩️ Desfazer Baixa</button>
          </div>
        `).join('')
      : '<div style="text-align:center; color:var(--text-muted); padding:24px;">Nenhuma baixa registrada no arquivo.</div>';

    box.querySelectorAll('[data-est-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reg = arquivoBaixas.find((a) => a.id === btn.dataset.estRestore);
        if (!reg) return;
        const alvo = itens.find((it) => it.id === reg.itemId);
        if (!alvo) return showToast('Item original não encontrado.', 'error');

        const novaQtd = Number(alvo.quantidade || 0) + Number(reg.qtdMov || 0);
        const atualizado = {
          ...alvo,
          quantidade: novaQtd,
          historico: [{
            tipo: 'entrada',
            quantidade: reg.qtdMov,
            responsavel: userMe.nome || 'Sistema',
            obs: 'Estorno via Arquivo de Baixas',
            data: new Date().toISOString()
          }, ...(alvo.historico || [])].slice(0, 30),
          atualizadoEm: new Date().toISOString()
        };

        await setDoc(doc(db, 'estoque_app', alvo.id), atualizado);
        arquivoBaixas = arquivoBaixas.filter((a) => a.id !== reg.id);
        await sincronizarMetaFirebase();
        renderArquivoBaixas();
        showToast('Baixa estornada e saldo atualizado no Firebase!', 'success');
      });
    });
  }

  async function gerarEtiquetaEstoque() {
    if (!itemAtualId) return showToast('Salve o item antes de imprimir a etiqueta QR.', 'error');
    atualizarPreviewQRModal();
    const fmt = document.getElementById('est-etq-formato').value;
    if (fmt === 'pdf') {
      document.body.classList.add('printing-est-label');
      window.print();
      setTimeout(() => document.body.classList.remove('printing-est-label'), 500);
      return;
    }

    const cv = document.createElement('canvas');
    cv.width = 440;
    cv.height = 240;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 440, 240);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 438, 238);

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.src = document.getElementById('est-print-qr').src;
    await new Promise((res, rej) => { qrImg.onload = res; qrImg.onerror = rej; });
    ctx.drawImage(qrImg, 10, 10, 220, 220);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(document.getElementById('est-item-nome').value.trim() || 'Item', 242, 95, 186);
    ctx.font = 'bold 26px Arial';
    ctx.fillText(`${document.getElementById('est-item-qtd').value} ${document.getElementById('est-item-unidade').value}`, 242, 145, 186);

    const a = document.createElement('a');
    a.href = cv.toDataURL('image/jpeg', 0.95);
    a.download = `etiqueta-estoque-${itemAtualId}.jpg`;
    a.click();
    showToast('Etiqueta JPG gerada!', 'success');
  }

  function bindEventsOnce() {
    if (initialized) return;
    initialized = true;

    document.getElementById('est-busca')?.addEventListener('input', renderTabelaEstoque);
    document.getElementById('btn-est-minimo-toggle')?.addEventListener('click', (e) => {
      apenasMinimo = !apenasMinimo;
      e.currentTarget.classList.toggle('ui-btn-danger', apenasMinimo);
      renderTabelaEstoque();
    });

    document.getElementById('btn-est-novo')?.addEventListener('click', () => abrirModalItem(null));
    document.getElementById('btn-est-arquivo')?.addEventListener('click', () => {
      renderArquivoBaixas();
      document.getElementById('modal-est-arquivo').classList.add('open');
    });

    document.getElementById('btn-est-exportar')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ categorias, itens, arquivo: arquivoBaixas }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estoque-artesynal-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-est-add-cat')?.addEventListener('click', async () => {
      const n = prompt('Nome da nova categoria de estoque:');
      if (!n?.trim()) return;
      const cat = n.trim();
      if (!categorias.includes(cat)) categorias.push(cat);
      await sincronizarMetaFirebase();
      renderPillsCategorias();
      document.getElementById('est-item-cat').value = cat;
      showToast(`Categoria "${cat}" adicionada.`, 'success');
    });

    ['est-item-nome', 'est-item-qtd', 'est-item-unidade'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', atualizarPreviewQRModal);
      document.getElementById(id)?.addEventListener('change', atualizarPreviewQRModal);
    });

    document.getElementById('btn-est-gerar-etq')?.addEventListener('click', gerarEtiquetaEstoque);

    document.getElementById('btn-est-salvar')?.addEventListener('click', async () => {
      const nome = document.getElementById('est-item-nome').value.trim();
      const categoria = document.getElementById('est-item-cat').value;
      const unidade = document.getElementById('est-item-unidade').value;
      const qtdCampo = Math.max(0, Number(document.getElementById('est-item-qtd').value || 0));
      const minimo = Math.max(0, Number(document.getElementById('est-item-min').value || 0));
      const detalhes = document.getElementById('est-item-detalhes').value.trim();
      const tamanho = {
        largura: document.getElementById('est-tam-l').value.trim(),
        altura: document.getElementById('est-tam-a').value.trim(),
        espessura: document.getElementById('est-tam-e').value.trim()
      };

      if (!nome) return showToast('Informe o nome do item.', 'error');

      if (!itemAtualId) {
        const novo = {
          id: itemRascunhoId,
          nome,
          categoria,
          tamanho,
          unidade,
          quantidade: qtdCampo,
          minimo,
          detalhes,
          historico: [{
            tipo: 'entrada',
            quantidade: qtdCampo,
            responsavel: userMe.nome || 'Usuário',
            obs: 'Cadastro inicial',
            data: new Date().toISOString()
          }],
          criadoEm: new Date().toISOString()
        };
        await setDoc(doc(db, 'estoque_app', novo.id), novo);
        await criarNotificacaoCompras(novo);
        document.getElementById('modal-est-item').classList.remove('open');
        showToast('Item cadastrado no estoque!', 'success');
        return;
      }

      const atual = itens.find((x) => x.id === itemAtualId);
      if (!atual) return;

      const movTipo = document.getElementById('est-mov-tipo').value;
      const movQtd = Number(document.getElementById('est-mov-qtd').value || 0);
      const movObs = document.getElementById('est-mov-obs').value.trim();

      let novaQtd = qtdCampo;
      const novoHist = [...(atual.historico || [])];

      if (movQtd > 0) {
        const baseQtd = Number(atual.quantidade || 0);
        if (movTipo === 'saida') {
          if (movQtd > baseQtd) return showToast('A baixa é maior que o saldo disponível!', 'error');
          novaQtd = baseQtd - movQtd;
          arquivoBaixas.unshift({
            id: `arq_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            itemId: atual.id,
            itemNome: nome,
            qtdMov: movQtd,
            unidade,
            qtdAntes: baseQtd,
            qtdDepois: novaQtd,
            responsavel: userMe.nome || 'Usuário',
            data: new Date().toISOString()
          });
          arquivoBaixas = arquivoBaixas.slice(0, 80);
          await sincronizarMetaFirebase();
        } else {
          novaQtd = baseQtd + movQtd;
        }
        novoHist.unshift({
          tipo: movTipo,
          quantidade: movQtd,
          responsavel: userMe.nome || 'Usuário',
          obs: movObs,
          data: new Date().toISOString()
        });
      } else if (qtdCampo !== Number(atual.quantidade || 0)) {
        const diff = qtdCampo - Number(atual.quantidade || 0);
        novoHist.unshift({
          tipo: diff >= 0 ? 'entrada' : 'saida',
          quantidade: Math.abs(diff),
          responsavel: userMe.nome || 'Usuário',
          obs: movObs || 'Ajuste direto de inventário',
          data: new Date().toISOString()
        });
      }

      const salvo = {
        ...atual,
        nome,
        categoria,
        tamanho,
        unidade,
        quantidade: novaQtd,
        minimo,
        detalhes,
        historico: novoHist.slice(0, 30),
        atualizadoEm: new Date().toISOString()
      };

      await setDoc(doc(db, 'estoque_app', salvo.id), salvo);
      await criarNotificacaoCompras(salvo);
      document.getElementById('modal-est-item').classList.remove('open');
      showToast('Estoque atualizado com sucesso!', 'success');
    });

    onSnapshot(metaRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() || {};
      if (Array.isArray(d.categorias) && d.categorias.length) {
        categorias = [...new Set([...DEFAULT_CATEGORIES, ...d.categorias])];
      }
      if (Array.isArray(d.arquivo)) {
        arquivoBaixas = d.arquivo;
      }
      renderPillsCategorias();
      renderTabelaEstoque();
    });

    onSnapshot(collection(db, 'estoque_app'), (snap) => {
      itens = snap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        historico: Array.isArray(d.data()?.historico) ? d.data().historico : []
      }));
      itens.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
      salvarBackupLocal();
      renderPillsCategorias();
      renderTabelaEstoque();
    });
  }

  return {
    activate: bindEventsOnce,
    openItemById: (itemId) => {
      const found = itens.find((x) => x.id === itemId);
      if (!found) return false;
      abrirModalItem(itemId);
      return true;
    }
  };
}
