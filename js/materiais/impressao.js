// --- js/materiais/impressao.js ---
// Submódulo de Impressão (Mídias, Lonas, Adesivos, Insumos CMYK/Solvente/Laca e Etiquetas 4,8x2,8cm)

import { showToast } from '../core/theme.js';
import { db, ROTAS } from '../core/config.js';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  setDoc,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const CATS_IMP = ['Adesivo', 'Lona', 'Adesivo de Recorte', 'Tinta', 'Outros'];
const CORES_TINTAS = [
  { id: 'ciano', nome: 'Ciano', bg: '#00aeef', fg: '#ffffff', corTexto: '#38bdf8', tipo: 'medida' },
  { id: 'magenta', nome: 'Magenta', bg: '#ec008c', fg: '#ffffff', corTexto: '#f472b6', tipo: 'medida' },
  { id: 'amarelo', nome: 'Amarelo', bg: '#facc15', fg: '#090d16', corTexto: '#facc15', tipo: 'medida' },
  { id: 'preto', nome: 'Preto', bg: '#1e293b', fg: '#ffffff', corTexto: '#94a3b8', tipo: 'medida' },
  { id: 'solvente', nome: 'Solvente', bg: 'rgba(148,163,184,0.38)', fg: '#ffffff', corTexto: '#cbd5e1', tipo: 'medida' },
  { id: 'laca', nome: 'Laca', bg: 'rgba(226,232,240,0.55)', fg: '#090d16', corTexto: '#e2e8f0', tipo: 'fixa' }
];

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

export function initImpressaoModule({ userMe, getUsuariosAprovados, onItemReadyForDeepLink }) {
  let initialized = false;
  let produtos = [];
  let modelosMidia = [];
  let idsModelosSelecionados = new Set();
  let midiaEditandoId = null;
  let categoriasDinamicas = [];
  let idParaAjuste = null;
  let itemParaDetalhes = null;
  const warteEmail = 'wartesynal@gmail.com';

  function qrDeepLink(itemId) {
    return `${ROTAS.materiais}?setor=impressao#item-${itemId}`;
  }

  function formatarDataFirestore(dataRef) {
    if (!dataRef) return '—';
    const d = dataRef?.toDate ? dataRef.toDate() : (dataRef?.seconds ? new Date(dataRef.seconds * 1000) : new Date(dataRef));
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  function montarLayoutTintas() {
    const container = document.getElementById('imp-tintas-grid');
    if (!container) return;
    container.innerHTML = CORES_TINTAS.map((t) => {
      if (t.tipo === 'medida') {
        return `
          <div class="ink-bottle-card" id="imp-tinta-card-${t.id}">
            <div class="ink-title">${t.nome}</div>
            <div class="ink-vessel">
              <div class="ink-liquid" id="imp-liq-${t.id}" style="height:0%; background:${t.bg}; color:${t.fg};"></div>
            </div>
            <div class="ink-controls">
              <label><span>Nível (cm)</span><input type="number" id="imp-cm-${t.id}" min="0" max="20" step="0.5" data-cor="${t.id}" /></label>
              <div class="ink-ml" id="imp-ml-${t.id}" style="color:${t.corTexto};">~0 ml</div>
              <label><span>Extras (un)</span><input type="number" id="imp-ex-${t.id}" min="0" step="1" data-cor="${t.id}" /></label>
            </div>
          </div>
        `;
      }
      return `
        <div class="ink-bottle-card" id="imp-tinta-card-${t.id}">
          <div class="ink-title">${t.nome}</div>
          <div class="ink-vessel">
            <div class="ink-liquid" id="imp-liq-${t.id}" style="height:100%; background:${t.bg}; color:${t.fg};"><span>EM USO</span></div>
          </div>
          <div class="ink-controls">
            <div class="ink-ml" style="color:var(--green); text-align:center;">Frasco Ativo</div>
            <label><span>Extras (un)</span><input type="number" id="imp-ex-${t.id}" min="0" step="1" data-cor="${t.id}" /></label>
            <input type="hidden" id="imp-cm-${t.id}" value="20" />
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('input[data-cor]').forEach((inp) => {
      inp.addEventListener('change', () => atualizarTintaDB(inp.dataset.cor));
    });
  }

  async function atualizarTintaDB(corId) {
    const cfg = CORES_TINTAS.find((t) => t.id === corId);
    let cmValue = 20;
    if (cfg?.tipo === 'medida') {
      cmValue = Math.min(20, Math.max(0, parseFloat(document.getElementById(`imp-cm-${corId}`).value) || 0));
      document.getElementById(`imp-cm-${corId}`).value = cmValue;
    }
    const extraValue = Math.max(0, parseInt(document.getElementById(`imp-ex-${corId}`).value, 10) || 0);
    document.getElementById(`imp-ex-${corId}`).value = extraValue;

    try {
      await setDoc(doc(db, 'estoque', 'TINTAS_SISTEMA'), { [corId]: { cm: cmValue, extra: extraValue } }, { merge: true });
      showToast(`Insumo ${cfg?.nome || corId} atualizado.`, 'success');
    } catch {
      showToast('Erro ao salvar nível de tinta.', 'error');
    }
  }

  function renderizarCardsImpressao() {
    const termo = (document.getElementById('imp-busca')?.value || '').trim().toLowerCase();
    const cols = {
      ADESIVO: document.getElementById('imp-col-ADESIVO'),
      LONA: document.getElementById('imp-col-LONA'),
      RECORTE: document.getElementById('imp-col-RECORTE'),
      OUTROS: document.getElementById('imp-col-OUTROS')
    };
    const counts = { ADESIVO: 0, LONA: 0, RECORTE: 0, OUTROS: 0 };
    Object.values(cols).forEach((el) => { if (el) el.innerHTML = ''; });

    produtos.forEach((p) => {
      if (termo) {
        const match = [p.nome, p.categoria, p.tamanho, p.anotacoes].some((x) => String(x || '').toLowerCase().includes(termo));
        if (!match) return;
      }

      const catNorm = String(p.categoria || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace('ADESIVO DE RECORTE', 'RECORTE');
      const key = cols[catNorm] ? catNorm : 'OUTROS';
      counts[key]++;

      const alerta = Number(p.margem_alerta || 0);
      const emAlerta = alerta > 0 && Number(p.qtd || 0) <= alerta;

      const card = document.createElement('article');
      card.className = `mat-item-card ${emAlerta ? 'is-low-stock' : ''}`;
      card.dataset.itemId = p.id;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="display:flex; flex-wrap:wrap; gap:5px;">
            <span class="ui-badge ui-badge-purple">${esc(p.categoria || 'Mídia')}</span>
            ${emAlerta ? '<span class="ui-badge ui-badge-red">⚠ Repor</span>' : ''}
            ${p.anotacoes ? '<span class="ui-badge">📝 Histórico</span>' : ''}
          </div>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-ghost" style="padding:2px 6px;" data-imp-del="${p.id}" title="Excluir do estoque">✖</button>
        </div>
        <div style="font-family:var(--font-display); font-weight:800; font-size:15px; margin:8px 0 4px;">${esc(p.nome || p.categoria)}</div>
        ${p.tamanho ? `<div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">Medida: ${esc(p.tamanho)}</div>` : ''}
        <div class="mat-qty-bar">
          <div>
            <span style="font-family:var(--font-display); font-size:22px; font-weight:900;">${Number(p.qtd || 0)}</span>
            <span style="font-size:12px; color:var(--text-muted); font-weight:600;">${esc(p.unidade || 'un')}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="ui-btn ui-btn-sm" data-imp-qr="${p.id}" title="Etiqueta QR 4,8x2,8cm">🏷️</button>
            <button type="button" class="ui-btn ui-btn-sm" data-imp-info="${p.id}" title="Detalhes, Histórico e Tarefas">📋</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" data-imp-mov="${p.id}">Movimentar</button>
          </div>
        </div>
      `;
      cols[key]?.appendChild(card);
    });

    Object.entries(counts).forEach(([k, v]) => {
      const badge = document.getElementById(`imp-count-${k}`);
      if (badge) badge.textContent = String(v);
      if (v === 0 && cols[k]) {
        cols[k].innerHTML = '<div style="padding:22px 12px; text-align:center; color:var(--text-muted); font-size:12.5px; border:1px dashed var(--border-subtle); border-radius:10px;">Sem mídias nesta coluna</div>';
      }
    });

    document.querySelectorAll('[data-imp-del]').forEach((b) => b.addEventListener('click', () => deletarMidiaEstoque(b.dataset.impDel)));
    document.querySelectorAll('[data-imp-mov]').forEach((b) => b.addEventListener('click', () => abrirModalMovimentacao(b.dataset.impMov)));
    document.querySelectorAll('[data-imp-info]').forEach((b) => b.addEventListener('click', () => abrirDetalhesImpressao(b.dataset.impInfo)));
    document.querySelectorAll('[data-imp-qr]').forEach((b) => b.addEventListener('click', () => abrirEtiquetaImpressao(b.dataset.impQr)));

    onItemReadyForDeepLink?.('impressao', produtos);
  }

  async function deletarMidiaEstoque(id) {
    const p = produtos.find((x) => x.id === id);
    if (!confirm(`Remover "${p?.nome || 'mídia'}" do estoque ativo de impressão?`)) return;
    await deleteDoc(doc(db, 'estoque', id));
    showToast('Mídia removida do estoque.', 'info');
  }

  function renderBancoMidias() {
    const grid = document.getElementById('imp-banco-grid');
    if (!grid) return;
    const grupos = [
      { titulo: 'Adesivos', cat: 'Adesivo' },
      { titulo: 'Lonas', cat: 'Lona' },
      { titulo: 'Recorte', cat: 'Adesivo de Recorte' },
      { titulo: 'Outros', cat: 'Outros' }
    ];

    grid.innerHTML = grupos.map((g) => {
      const itens = modelosMidia.filter((m) =>
        g.cat === 'Outros'
          ? !['Adesivo', 'Lona', 'Adesivo de Recorte'].includes(m.categoria)
          : m.categoria === g.cat
      );
      return `
        <div style="background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:12px; padding:12px;">
          <div style="font-weight:800; font-size:12px; text-transform:uppercase; color:var(--purple); margin-bottom:10px;">${g.titulo} (${itens.length})</div>
          <div style="display:flex; flex-direction:column; gap:8px; max-height:320px; overflow-y:auto;">
            ${itens.map((m) => `
              <div class="catalog-pick-item ${idsModelosSelecionados.has(m.id) ? 'selected' : ''}" data-pick-midia="${m.id}">
                <div style="font-weight:700; font-size:13px;">${esc(m.nome)}</div>
                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">Padrão: ${Number(m.qtd || 1)} ${esc(m.unidade || 'un')} • Alerta: ${Number(m.margem_alerta || 0)}</div>
              </div>
            `).join('') || '<div style="font-size:12px; color:var(--text-muted);">Nenhum modelo cadastrado</div>'}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-pick-midia]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.pickMidia;
        if (idsModelosSelecionados.has(id)) idsModelosSelecionados.delete(id);
        else idsModelosSelecionados.add(id);
        renderBancoMidias();
      });
    });
  }

  function preencherCatsMidia() {
    const todas = [...new Set([...CATS_IMP, ...categoriasDinamicas])].sort();
    const sel = document.getElementById('imp-reg-cat');
    if (sel) sel.innerHTML = todas.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const selExist = document.getElementById('imp-reg-existente');
    if (selExist) {
      selExist.innerHTML = `<option value="">-- Criar novo modelo de mídia --</option>` +
        modelosMidia.map((m) => `<option value="${m.id}">${esc(m.nome)} (${esc(m.categoria || '-')})</option>`).join('');
    }
  }

  async function verificarAlertaECriarTarefa(item, qtdAtual) {
    const margem = Number(item?.margem_alerta || 0);
    if (margem <= 0 || qtdAtual > margem) return;
    const qExiste = query(
      collection(db, 'tarefas'),
      where('destinatarioEmail', '==', warteEmail),
      where('status', '==', 'pendente'),
      where('origem', '==', 'estoque-impressao'),
      where('itemId', '==', item.id)
    );
    const existe = await getDocs(qExiste);
    if (!existe.empty) return;

    await addDoc(collection(db, 'tarefas'), {
      setor: 'impressao',
      tipo: 'Compras',
      resumo: `Reposição de mídia: ${item.nome || item.categoria}`,
      descricao: `A mídia atingiu a margem de alerta.\nItem: ${item.nome || item.categoria}\nQtd atual: ${qtdAtual} ${item.unidade}\nAlerta: ${margem}`,
      extras: { comprarMidia: true },
      status: 'pendente',
      destinatarioEmail: warteEmail,
      destinatarioNome: 'warte',
      solicitanteEmail: userMe.email,
      solicitanteNome: userMe.nome || 'Sistema',
      origem: 'estoque-impressao',
      itemId: item.id,
      listaId: '',
      cardAlvo: {
        id: item.id,
        setor: 'impressao',
        label: `${item.nome || item.categoria} (${item.id})`,
        link: qrDeepLink(item.id)
      },
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
  }

  async function atualizarTarefasRelacionadasAoCard(cardId, qtdAtual, unidade) {
    const snap = await getDocs(query(collection(db, 'tarefas'), where('status', '==', 'pendente')));
    const updates = [];
    snap.forEach((d) => {
      const t = d.data() || {};
      if (t?.cardAlvo?.id !== cardId || t?.cardAlvo?.setor !== 'impressao') return;
      const base = String(t.descricao || '').replace(/\n\nEstoque atual:[\s\S]*$/g, '');
      updates.push(updateDoc(doc(db, 'tarefas', d.id), {
        descricao: `${base}\n\nEstoque atual: ${qtdAtual} ${unidade}`,
        updated_at: serverTimestamp()
      }));
    });
    await Promise.all(updates);
  }

  function abrirModalMovimentacao(id) {
    idParaAjuste = id;
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    document.getElementById('imp-mov-nome').textContent = p.nome || p.categoria;
    document.getElementById('imp-mov-atual').textContent = `${p.qtd} ${p.unidade}`;
    document.getElementById('imp-mov-tipo').value = 'saida';
    document.getElementById('imp-mov-qtd').value = '';
    document.getElementById('imp-mov-os').value = '';
    document.getElementById('modal-imp-mov').classList.add('open');
  }

  function abrirDetalhesImpressao(id) {
    itemParaDetalhes = produtos.find((x) => x.id === id);
    if (!itemParaDetalhes) return;
    document.getElementById('imp-det-nome').textContent = itemParaDetalhes.nome || itemParaDetalhes.categoria;
    document.getElementById('imp-det-resumo').textContent =
      `Setor: IMPRESSÃO • Categoria: ${itemParaDetalhes.categoria || '-'} • Estoque atual: ${itemParaDetalhes.qtd} ${itemParaDetalhes.unidade} • Alerta mínimo: ${Number(itemParaDetalhes.margem_alerta || 0)}`;
    document.getElementById('imp-det-anotacoes').value = itemParaDetalhes.anotacoes || '';
    document.getElementById('imp-task-box').style.display = 'none';
    document.getElementById('imp-task-title').value = `Impressão: ${itemParaDetalhes.nome || itemParaDetalhes.categoria}`;
    document.getElementById('imp-task-desc').value = '';
    document.getElementById('modal-imp-detalhes').classList.add('open');
  }

  async function abrirEtiquetaImpressao(id) {
    const item = produtos.find((p) => p.id === id);
    if (!item) return;
    const dataRegistro = formatarDataFirestore(item.data_atualizacao || item.data_criacao);
    const payloadQr = qrDeepLink(item.id);
    let qrSrc = '';
    try {
      if (window.QRCode?.toDataURL) {
        qrSrc = await window.QRCode.toDataURL(payloadQr, { margin: 0, width: 420 });
      } else {
        qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=520x520&data=${encodeURIComponent(payloadQr)}`;
      }
    } catch {
      qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=520x520&data=${encodeURIComponent(payloadQr)}`;
    }

    const alvo = document.getElementById('imp-etiqueta-card');
    alvo.innerHTML = `
      <div style="background:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:2px;">
        <img src="${qrSrc}" alt="QR Mídia" style="width:100%; height:100%; object-fit:contain;" />
      </div>
      <div style="display:flex; flex-direction:column; justify-content:space-between; padding:2px 4px; min-width:0;">
        <div id="imp-etq-nome-fit" style="font-weight:900; font-size:11px; line-height:1.1; text-transform:uppercase; word-break:break-word; color:#111;">${esc(item.nome || item.categoria || 'MÍDIA')}</div>
        <div style="font-size:11px; font-weight:800; color:#111;">${esc(dataRegistro)}</div>
      </div>
    `;
    document.getElementById('modal-imp-etiqueta').classList.add('open');
  }

  async function exportarEtiquetaImp(tipo) {
    const alvo = document.getElementById('imp-etiqueta-card');
    if (!alvo || !window.html2canvas) return;
    const clone = alvo.cloneNode(true);
    clone.style.width = '4.8cm';
    clone.style.height = '2.8cm';
    clone.style.position = 'fixed';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    document.body.appendChild(clone);
    try {
      const canvas = await window.html2canvas(clone, { backgroundColor: '#ffffff', scale: 3, useCORS: true });
      if (tipo === 'png') {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `etiqueta-impressao-${Date.now()}.png`;
        a.click();
      } else if (window.jspdf) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'cm', format: [4.8, 2.8] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 4.8, 2.8, undefined, 'FAST');
        pdf.save(`etiqueta-impressao-${Date.now()}.pdf`);
      }
      showToast('Etiqueta exportada!', 'success');
    } finally {
      clone.remove();
    }
  }

  function bindEventsOnce() {
    if (initialized) return;
    initialized = true;

    montarLayoutTintas();

    document.getElementById('imp-busca')?.addEventListener('input', renderizarCardsImpressao);

    document.getElementById('btn-imp-abrir-banco')?.addEventListener('click', () => {
      idsModelosSelecionados = new Set();
      renderBancoMidias();
      document.getElementById('modal-imp-banco').classList.add('open');
    });

    document.getElementById('btn-imp-abrir-catalogo')?.addEventListener('click', () => {
      midiaEditandoId = null;
      preencherCatsMidia();
      document.getElementById('imp-reg-nome').value = '';
      document.getElementById('imp-reg-qtd').value = '1';
      document.getElementById('imp-reg-unidade').value = 'un';
      document.getElementById('imp-reg-alerta').value = '0';
      document.getElementById('imp-reg-add-direto').checked = true;
      document.getElementById('modal-imp-catalogo').classList.add('open');
    });

    document.getElementById('imp-reg-existente')?.addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) {
        midiaEditandoId = null;
        document.getElementById('imp-reg-nome').value = '';
        return;
      }
      const m = modelosMidia.find((x) => x.id === id);
      if (!m) return;
      midiaEditandoId = id;
      document.getElementById('imp-reg-cat').value = m.categoria || 'Adesivo';
      document.getElementById('imp-reg-nome').value = m.nome || '';
      document.getElementById('imp-reg-qtd').value = String(Number(m.qtd || 1));
      document.getElementById('imp-reg-unidade').value = m.unidade || 'un';
      document.getElementById('imp-reg-alerta').value = String(Number(m.margem_alerta || 0));
      document.getElementById('imp-reg-add-direto').checked = false;
    });

    document.getElementById('btn-imp-excluir-modelo')?.addEventListener('click', async () => {
      if (!midiaEditandoId) return showToast('Selecione um modelo existente para excluir.', 'error');
      const m = modelosMidia.find((x) => x.id === midiaEditandoId);
      if (!confirm(`Excluir o modelo "${m?.nome || ''}" do catálogo?`)) return;
      await deleteDoc(doc(db, 'midias_sistema', midiaEditandoId));
      midiaEditandoId = null;
      document.getElementById('modal-imp-catalogo').classList.remove('open');
      showToast('Modelo excluído do catálogo.', 'info');
    });

    document.getElementById('btn-imp-salvar-catalogo')?.addEventListener('click', async () => {
      const cat = document.getElementById('imp-reg-cat').value;
      const nome = document.getElementById('imp-reg-nome').value.trim();
      const qtd = parseFloat(document.getElementById('imp-reg-qtd').value) || 1;
      const unidade = document.getElementById('imp-reg-unidade').value;
      const margem = parseFloat(document.getElementById('imp-reg-alerta').value) || 0;
      const addDireto = document.getElementById('imp-reg-add-direto').checked;

      if (!nome) return showToast('Informe o nome/descrição da mídia.', 'error');
      const tamanho = (nome.match(/(\d+[.,]?\d*\s?m\s?x\s?\d+[.,]?\d*\s?m)/i) || [])[0] || '';

      const payload = {
        setor: 'impressao',
        categoria: cat,
        nome,
        qtd,
        qtd_max: qtd,
        unidade,
        tamanho,
        margem_alerta: margem,
        data_atualizacao: serverTimestamp()
      };

      let modelId = midiaEditandoId;
      if (midiaEditandoId) {
        await updateDoc(doc(db, 'midias_sistema', midiaEditandoId), payload);
      } else {
        const ref = await addDoc(collection(db, 'midias_sistema'), { ...payload, data_criacao: serverTimestamp() });
        modelId = ref.id;
      }

      if (addDireto) {
        const refEst = await addDoc(collection(db, 'estoque'), {
          ...payload,
          modelo_id: modelId,
          data_criacao: serverTimestamp()
        });
        await verificarAlertaECriarTarefa({ id: refEst.id, ...payload }, qtd);
      }

      document.getElementById('modal-imp-catalogo').classList.remove('open');
      showToast(addDireto ? 'Modelo salvo e adicionado ao estoque!' : 'Modelo atualizado no catálogo!', 'success');
    });

    document.getElementById('btn-imp-confirmar-banco')?.addEventListener('click', async () => {
      if (!idsModelosSelecionados.size) return showToast('Selecione ao menos um modelo de mídia.', 'error');
      const qtdCustom = parseFloat(document.getElementById('imp-banco-qtd-override').value);
      for (const modelId of idsModelosSelecionados) {
        const m = modelosMidia.find((x) => x.id === modelId);
        if (!m) continue;
        const qtdFinal = Number.isFinite(qtdCustom) && qtdCustom > 0 ? qtdCustom : (Number(m.qtd) || 1);
        const docNovo = await addDoc(collection(db, 'estoque'), {
          setor: 'impressao',
          categoria: m.categoria,
          nome: m.nome,
          qtd: qtdFinal,
          qtd_max: m.qtd_max || m.qtd || qtdFinal,
          unidade: m.unidade || 'un',
          tamanho: m.tamanho || '',
          margem_alerta: Number(m.margem_alerta || 0),
          modelo_id: m.id,
          data_criacao: serverTimestamp(),
          data_atualizacao: serverTimestamp()
        });
        await verificarAlertaECriarTarefa({ id: docNovo.id, ...m }, qtdFinal);
      }
      document.getElementById('modal-imp-banco').classList.remove('open');
      showToast('Mídia(s) adicionada(s) ao estoque ativo!', 'success');
    });

    document.getElementById('btn-imp-salvar-mov')?.addEventListener('click', async () => {
      const p = produtos.find((x) => x.id === idParaAjuste);
      if (!p) return;
      const tipo = document.getElementById('imp-mov-tipo').value;
      const qtdInf = parseFloat(document.getElementById('imp-mov-qtd').value);
      const refOS = document.getElementById('imp-mov-os').value.trim();

      if (!Number.isFinite(qtdInf) || qtdInf <= 0) return showToast('Informe uma quantidade válida.', 'error');
      if (tipo === 'saida' && qtdInf > Number(p.qtd || 0)) return showToast('A baixa não pode exceder o estoque atual!', 'error');

      const novaQtd = Number(((tipo === 'saida' ? Number(p.qtd) - qtdInf : Number(p.qtd) + qtdInf)).toFixed(2));
      const dataStr = new Date().toLocaleDateString('pt-BR');
      const sinal = tipo === 'saida' ? '🔻 BAIXA: -' : '🟢 ENTRADA: +';
      const log = `\n[${dataStr}] ${sinal}${qtdInf}${p.unidade || ''}${refOS ? ' | Ref/O.S: ' + refOS : ''} (${userMe.nome || 'Usuário'})`;
      const payload = {
        qtd: novaQtd,
        anotacoes: (p.anotacoes || '') + log
      };
      if (tipo === 'entrada') payload.data_atualizacao = serverTimestamp();

      await updateDoc(doc(db, 'estoque', idParaAjuste), payload);
      await atualizarTarefasRelacionadasAoCard(idParaAjuste, novaQtd, p.unidade || 'un');
      await verificarAlertaECriarTarefa(p, novaQtd);
      document.getElementById('modal-imp-mov').classList.remove('open');
      showToast('Movimentação registrada!', 'success');
    });

    document.getElementById('btn-imp-salvar-anotacoes')?.addEventListener('click', async () => {
      if (!itemParaDetalhes) return;
      await updateDoc(doc(db, 'estoque', itemParaDetalhes.id), {
        anotacoes: document.getElementById('imp-det-anotacoes').value
      });
      document.getElementById('modal-imp-detalhes').classList.remove('open');
      showToast('Anotações salvas!', 'success');
    });

    document.getElementById('btn-imp-det-baixa')?.addEventListener('click', () => {
      if (!itemParaDetalhes) return;
      document.getElementById('modal-imp-detalhes').classList.remove('open');
      abrirModalMovimentacao(itemParaDetalhes.id);
    });

    document.getElementById('btn-imp-toggle-task')?.addEventListener('click', async () => {
      const box = document.getElementById('imp-task-box');
      const usuarios = await getUsuariosAprovados();
      document.getElementById('imp-task-user').innerHTML = usuarios.map((u) => `<option value="${esc(u.email)}">${esc(u.nome)} (${esc(u.email)})</option>`).join('');
      box.style.display = box.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('btn-imp-send-task')?.addEventListener('click', async () => {
      if (!itemParaDetalhes) return;
      const titulo = document.getElementById('imp-task-title').value.trim();
      const desc = document.getElementById('imp-task-desc').value.trim();
      const email = document.getElementById('imp-task-user').value;
      const usuarios = await getUsuariosAprovados();
      const dest = usuarios.find((u) => u.email === email);
      if (!titulo || !dest) return showToast('Preencha título e destinatário da tarefa.', 'error');

      await addDoc(collection(db, 'tarefas'), {
        setor: 'impressao',
        tipo: 'Card',
        resumo: titulo,
        descricao: `${desc}\n\nEstoque atual: ${itemParaDetalhes.qtd} ${itemParaDetalhes.unidade}`.trim(),
        extras: {},
        status: 'pendente',
        destinatarioEmail: dest.email,
        destinatarioNome: dest.nome,
        solicitanteEmail: userMe.email,
        solicitanteNome: userMe.nome,
        cardAlvo: {
          id: itemParaDetalhes.id,
          setor: 'impressao',
          label: `${itemParaDetalhes.nome || itemParaDetalhes.categoria} (${itemParaDetalhes.id})`,
          link: qrDeepLink(itemParaDetalhes.id)
        },
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        concluida_em: null,
        concluida_por: null
      });
      document.getElementById('imp-task-box').style.display = 'none';
      showToast('Tarefa enviada com sucesso!', 'success');
    });

    document.getElementById('btn-imp-etq-pdf')?.addEventListener('click', () => exportarEtiquetaImp('pdf'));
    document.getElementById('btn-imp-etq-png')?.addEventListener('click', () => exportarEtiquetaImp('png'));

    onSnapshot(query(collection(db, 'estoque'), where('setor', '==', 'impressao')), (snap) => {
      produtos = [];
      snap.forEach((d) => {
        if (d.id !== 'TINTAS_SISTEMA') produtos.push({ id: d.id, ...d.data() });
      });
      categoriasDinamicas = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))];
      renderizarCardsImpressao();
    });

    onSnapshot(query(collection(db, 'midias_sistema'), where('setor', '==', 'impressao')), (snap) => {
      modelosMidia = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      modelosMidia.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
      preencherCatsMidia();
      renderBancoMidias();
    });

    onSnapshot(doc(db, 'estoque', 'TINTAS_SISTEMA'), async (docSnap) => {
      if (!docSnap.exists()) {
        const initObj = {};
        CORES_TINTAS.forEach((t) => { initObj[t.id] = { cm: 20, extra: 0 }; });
        await setDoc(doc(db, 'estoque', 'TINTAS_SISTEMA'), initObj);
        return;
      }
      const data = docSnap.data() || {};
      CORES_TINTAS.forEach((t) => {
        const d = data[t.id] || { cm: 20, extra: 0 };
        const exEl = document.getElementById(`imp-ex-${t.id}`);
        const cardEl = document.getElementById(`imp-tinta-card-${t.id}`);
        if (exEl) exEl.value = d.extra ?? 0;
        if (t.tipo === 'medida') {
          const cmEl = document.getElementById(`imp-cm-${t.id}`);
          const liqEl = document.getElementById(`imp-liq-${t.id}`);
          const mlEl = document.getElementById(`imp-ml-${t.id}`);
          if (cmEl) cmEl.value = d.cm ?? 20;
          const pct = Math.min(100, Math.max(0, ((d.cm ?? 20) / 20) * 100));
          const ml = Math.round(((d.cm ?? 20) / 20) * 900);
          if (liqEl) {
            liqEl.style.height = `${pct}%`;
            liqEl.innerHTML = (d.cm ?? 20) > 2 ? `<span>${d.cm}cm</span>` : '';
          }
          if (mlEl) mlEl.textContent = `~${ml} ml`;
          cardEl?.classList.toggle('low-ink', (d.cm ?? 20) <= 3 && (parseInt(d.extra, 10) || 0) <= 0);
        } else {
          cardEl?.classList.toggle('low-ink', (parseInt(d.extra, 10) || 0) <= 0 && (d.cm ?? 20) <= 0);
        }
      });
    });
  }

  return {
    activate: bindEventsOnce,
    openItemById: (itemId) => {
      const found = produtos.find((x) => x.id === itemId);
      if (!found) return false;
      abrirDetalhesImpressao(itemId);
      return true;
    }
  };
}
