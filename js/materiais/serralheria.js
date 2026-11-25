// --- js/materiais/serralheria.js ---
// Submódulo de Serralheria (Chapas, Agrupamento, Sistema de Corte 2D, Descarte A/B/C/D, Separar/Unir, Arquivo Morto e Etiquetas Lote)

import { showToast } from '../core/theme.js';
import { db, ROTAS } from '../core/config.js';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const CATS_SERR = ['ACM', 'PVC', 'PS', 'Acrilico', 'MDF', 'Galvanizada', 'Policarbonato'];
const CORES_BASE = [
  'Branco', 'Preto', 'Amarelo', 'Laranja', 'Azul', 'Vermelho', 'Verde', 'Verde Escuro',
  'Azul Marinho', 'Bege', 'Rosa', 'Azul Royal', 'Grafite', 'Cinza RAL 7037', 'Bronze 1003',
  'Bordo', 'Roxo', 'Dourado', 'Espelhado Prata', 'Espelhado Dourado', 'Champagne Dourado',
  'Cinza IP', 'Azul IP', 'Amarelo IP', 'Prata', 'Prata Ral9006', 'Prata Aço', 'Bright Bronze',
  'Cinza Anthracite', 'Dark Grey', 'Smoke Silver', 'Azul GM', 'Azul Cobalto', 'Verde Turquesa',
  'Verde Sicredi', 'Verde Sicoob', 'Marrom Café', 'Madeira Mogno (Clara)', 'Madeira IMBUIA (Escura)',
  'Madeira Sucupira', 'Madeira Castanha', 'Madeira Nogueira', 'Aço Corten Oxidado', 'Aço Corten Enferrujado'
];

const CONFIG_FABRICA = {
  acm: { medidas: [{ w: 122, h: 500 }, { w: 150, h: 500 }], espessuras: ['3mm', '4mm'] },
  pvc: { medidas: [{ w: 122, h: 244 }], espessuras: ['5mm', '10mm', '20mm'] },
  ps: { medidas: [{ w: 100, h: 200 }, { w: 120, h: 240 }], espessuras: ['1mm', '2mm', '3mm', '4mm', '5mm', '6mm', '8mm', '10mm'] },
  acrilico: { medidas: [{ w: 100, h: 200 }, { w: 120, h: 240 }], espessuras: ['2mm', '3mm', '4mm', '5mm', '6mm', '8mm', '10mm'] },
  mdf: { medidas: [{ w: 183, h: 275 }], espessuras: ['3mm', '6mm', '15mm', '18mm'] },
  galvanizada: { medidas: [{ w: 120, h: 200 }, { w: 120, h: 300 }], espessuras: ['#28', '#26', '#24', '#22', '#20'] },
  policarbonato: { medidas: [{ w: 105, h: 600 }, { w: 210, h: 600 }], espessuras: ['4mm', '6mm', '10mm'] }
};

const ALIAS_CATEGORIA_FABRICA = {
  acrilico: 'acrilico', acrilicos: 'acrilico',
  galvanizada: 'galvanizada', galvanizadas: 'galvanizada', galvanzada: 'galvanizada', galvanzadas: 'galvanizada',
  policarbonato: 'policarbonato', policarbonatos: 'policarbonato',
  pvc: 'pvc', ps: 'ps', mdf: 'mdf', acm: 'acm'
};

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function normalizarCategoria(cat = '') {
  return String(cat || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getConfigFabricaCategoria(categoria = '') {
  const norm = normalizarCategoria(categoria).toLowerCase();
  return CONFIG_FABRICA[ALIAS_CATEGORIA_FABRICA[norm] || norm] || null;
}

function normalizarDimensoesChapa(w, h) {
  const largura = parseFloat(w) || 0;
  const altura = parseFloat(h) || 0;
  if (largura <= 0 || altura <= 0) return { w: largura, h: altura };
  return { w: Math.max(largura, altura), h: Math.min(largura, altura) };
}

function getDimensoesBase(peca) {
  return normalizarDimensoesChapa(peca.baseDimW || peca.dimW, peca.baseDimH || peca.dimH);
}

function identificarTipoMedida(peca) {
  if (peca.tipoMedida === 'corte' || peca.tipoMedida === 'fabrica') return peca.tipoMedida;
  const cfg = getConfigFabricaCategoria(peca.categoria || '');
  const base = getDimensoesBase(peca);
  if (Array.isArray(peca.recortes) && peca.recortes.length > 0) return 'corte';
  const isPadrao = (cfg?.medidas || []).some((m) => Number(m.w) === Number(base.w) && Number(m.h) === Number(base.h));
  return isPadrao ? 'fabrica' : 'corte';
}

function montarChaveAgrupamento(peca) {
  const base = getDimensoesBase(peca);
  return [
    normalizarCategoria(peca.categoria || ''),
    (peca.espessura || '').toUpperCase(),
    (peca.cor || '').toUpperCase(),
    Number(base.w) || 0,
    Number(base.h) || 0,
    identificarTipoMedida(peca),
    peca.separacaoLoteId || ''
  ].join('|');
}

function montarChaveBaseUniao(peca) {
  const base = getDimensoesBase(peca);
  return [
    normalizarCategoria(peca.categoria || ''),
    (peca.espessura || '').toUpperCase(),
    (peca.cor || '').toUpperCase(),
    Number(base.w) || 0,
    Number(base.h) || 0,
    identificarTipoMedida(peca)
  ].join('|');
}

export function initSerralheriaModule({ userMe, getUsuariosAprovados, onItemReadyForDeepLink }) {
  let initialized = false;
  let produtos = [];
  let itensArquivoMorto = [];
  let categoriasDinamicas = [];
  let coresDinamicas = [];
  let espessurasDinamicasMap = {};
  let materialFiltro = 'TODOS';
  let statusFiltro = 'todos';
  let selecaoCardsBaixa = new Set();
  let gruposVisiveis = new Map();
  let mapaCoresMateriais = {};
  let indiceMedidaPadrao = 0;
  let materialNovoStatus = 'Novo';

  let itemParaDetalhes = null;
  let itensDetalhesGrupo = [];
  let unidadesSelecionadasDetalhes = new Set();
  let unidadeAtivaDetalhes = null;
  let loteEtiquetasAtual = [];

  let pecaParaCorte = null;
  let sequenciaLinhaCorte = 1;
  let posicoesCortePorLinha = {};
  let contextoDivisaoMaterial = null;
  let ajustesMarcadoresDivisao = [{ id: 1, marcador: '', medida: '' }];
  let aplicarAjusteDescarteNoCorte = null;

  const coresConfigRef = doc(db, 'configuracoes', 'serralheria_cores_preview');

  function qrDeepLink(itemId) {
    return `${ROTAS.materiais}?setor=serralheria#item-${itemId}`;
  }

  async function proximoRegistroSerralheria() {
    const contadorRef = doc(db, 'contadores', 'serralheria_chapas');
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(contadorRef);
      const atual = snap.exists() ? Number(snap.data().ultimoRegistro || 0) : 0;
      const novo = atual + 1;
      tx.set(contadorRef, { ultimoRegistro: novo }, { merge: true });
      return String(novo).padStart(4, '0');
    });
  }

  function chaveMaterialCor(item) {
    return `${(item.categoria || '').trim()}|${(item.cor || '').trim()}`;
  }

  function corPreviewChapa(item) {
    return mapaCoresMateriais[chaveMaterialCor(item)] || '#f97316';
  }

  function gerarPreviewCard(peca) {
    const base = getDimensoesBase(peca);
    if (base.w <= 0 || base.h <= 0) return '';
    const escala = Math.min(180 / base.w, 72 / base.h);
    const largura = Math.max(58, Math.round(base.w * escala));
    const altura = Math.max(34, Math.round(base.h * escala));
    const recortes = Array.isArray(peca.recortes) ? peca.recortes : [];
    const recortesHtml = recortes.map((r) => {
      const rx = (r.x / base.w) * largura;
      const ry = (r.y / base.h) * altura;
      const rw = (r.w / base.w) * largura;
      const rh = (r.h / base.h) * altura;
      return `<div style="position:absolute; left:${rx}px; top:${ry}px; width:${rw}px; height:${rh}px; background:rgba(9,13,22,0.88); border:1px dashed #94a3b8;"></div>`;
    }).join('');
    return `
      <div style="height:84px; background:var(--bg-app); border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-subtle); margin:6px 0;">
        <div style="position:relative; width:${largura}px; height:${altura}px; background:${corPreviewChapa(peca)}; border:1.5px solid rgba(255,255,255,0.55); border-radius:3px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.35);">
          ${recortesHtml}
        </div>
      </div>
    `;
  }

  function renderPillsMateriais() {
    const wrap = document.getElementById('serr-pills-materiais');
    if (!wrap) return;
    const ativos = produtos.filter((p) => !p.arquivado);
    const todasCats = [...new Set([...CATS_SERR, ...categoriasDinamicas])];

    const contagemPorCat = (cat) => ativos
      .filter((p) => normalizarCategoria(p.categoria) === normalizarCategoria(cat))
      .reduce((acc, p) => acc + (Number(p.qtd) || 1), 0);

    const totalGeral = ativos.reduce((acc, p) => acc + (Number(p.qtd) || 1), 0);

    wrap.innerHTML = [
      `<button type="button" class="ui-pill ${materialFiltro === 'TODOS' ? 'active' : ''}" data-serr-mat="TODOS">Todos (${totalGeral})</button>`,
      ...todasCats.map((c) => {
        const qtd = contagemPorCat(c);
        return `<button type="button" class="ui-pill ${normalizarCategoria(materialFiltro) === normalizarCategoria(c) ? 'active' : ''}" data-serr-mat="${esc(c)}">${esc(c)} (${qtd})</button>`;
      })
    ].join('');

    wrap.querySelectorAll('[data-serr-mat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        materialFiltro = btn.dataset.serrMat;
        renderPillsMateriais();
        renderCardsSerralheria();
      });
    });

    const badgeMorto = document.getElementById('serr-count-morto');
    if (badgeMorto) badgeMorto.textContent = String(itensArquivoMorto.length);
  }

  function atualizarBotoesSelecao() {
    const total = selecaoCardsBaixa.size;
    const btnBaixa = document.getElementById('btn-serr-baixa-sel');
    if (btnBaixa) {
      btnBaixa.disabled = total === 0;
      btnBaixa.textContent = `🗑️ Baixar (${total})`;
    }

    const btnUnir = document.getElementById('btn-serr-unir-sel');
    if (btnUnir) {
      if (total < 2) {
        btnUnir.disabled = true;
        btnUnir.textContent = '🔗 Unir';
      } else {
        const gs = [...selecaoCardsBaixa].map((k) => gruposVisiveis.get(k)).filter(Boolean);
        const chaves = new Set(gs.map(montarChaveBaseUniao));
        const podeUnir = chaves.size === 1 && gs.some((g) => !!g.separacaoLoteId);
        btnUnir.disabled = !podeUnir;
        btnUnir.textContent = podeUnir ? `🔗 Unir (${total})` : '🔗 Unir';
      }
    }
  }

  function renderCardsSerralheria() {
    const grid = document.getElementById('serr-cards-grid');
    if (!grid) return;
    const termo = (document.getElementById('serr-busca')?.value || '').trim().toLowerCase();

    const filtrados = produtos.filter((p) => {
      if (p.arquivado) return false;
      if (materialFiltro !== 'TODOS' && normalizarCategoria(p.categoria) !== normalizarCategoria(materialFiltro)) return false;
      if (statusFiltro === 'novo' && p.status !== 'Novo') return false;
      if (statusFiltro === 'usado' && p.status === 'Novo') return false;
      if (!termo) return true;
      return [p.categoria, p.espessura, p.cor, p.acabamento, p.registroSerial, p.osNumero, p.anotacoes]
        .some((x) => String(x || '').toLowerCase().includes(termo));
    });

    const grupos = new Map();
    filtrados.forEach((p) => {
      const chave = montarChaveAgrupamento(p);
      if (!grupos.has(chave)) {
        grupos.set(chave, { ...p, groupKey: chave, qtd: Number(p.qtd) || 1, ids: [p.id] });
      } else {
        const g = grupos.get(chave);
        g.qtd += Number(p.qtd) || 1;
        g.ids.push(p.id);
      }
    });

    gruposVisiveis = grupos;
    selecaoCardsBaixa = new Set([...selecaoCardsBaixa].filter((k) => gruposVisiveis.has(k)));

    if (!grupos.size) {
      grid.innerHTML = '<div class="ui-card" style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:36px;">Nenhuma chapa encontrada para este filtro.</div>';
      atualizarBotoesSelecao();
      return;
    }

    grid.innerHTML = [...grupos.values()].map((p) => {
      const dims = getDimensoesBase(p);
      const marcado = selecaoCardsBaixa.has(p.groupKey);
      const isNovo = p.status === 'Novo';
      return `
        <article class="mat-item-card ${marcado ? 'is-selected' : ''}" data-item-id="${p.id}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
              <span class="ui-badge ui-badge-orange">${esc(p.categoria)}</span>
              <span class="ui-badge ${isNovo ? 'ui-badge-green' : 'ui-badge-blue'}">${esc(p.status || 'Novo')}</span>
              ${p.anotacoes ? '<span class="ui-badge">📝</span>' : ''}
            </div>
            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:11px; color:var(--text-muted);">
              <input type="checkbox" data-serr-sel="${esc(p.groupKey)}" ${marcado ? 'checked' : ''} style="accent-color:var(--brand); width:16px; height:16px;" />
            </label>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:8px;">
            <div>
              <div style="font-family:var(--font-display); font-weight:800; font-size:16px;">${esc(p.categoria)} ${esc(p.espessura || '')}</div>
              <div style="font-size:12.5px; color:var(--text-secondary); font-weight:600;">${dims.w} × ${dims.h} cm</div>
              <div style="font-size:12px; color:var(--text-muted);">Cor: ${esc(p.cor || 'N/A')}${p.acabamento ? ' • ' + esc(p.acabamento) : ''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Unid.</div>
              <div style="font-family:var(--font-display); font-size:22px; font-weight:900; color:var(--brand);">${p.qtd}</div>
            </div>
          </div>

          ${gerarPreviewCard(p)}

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;">
            <button type="button" class="ui-btn ui-btn-sm" data-serr-cut="${p.id}">✂️ Cortar</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" data-serr-info="${esc(p.groupKey)}">📋 Detalhes / QR</button>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('[data-serr-sel]').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) selecaoCardsBaixa.add(chk.dataset.serrSel);
        else selecaoCardsBaixa.delete(chk.dataset.serrSel);
        renderCardsSerralheria();
      });
    });
    grid.querySelectorAll('[data-serr-cut]').forEach((b) => b.addEventListener('click', () => abrirModalCorte(b.dataset.serrCut)));
    grid.querySelectorAll('[data-serr-info]').forEach((b) => b.addEventListener('click', () => abrirModalDetalhesSerr(b.dataset.serrInfo)));

    atualizarBotoesSelecao();
    onItemReadyForDeepLink?.('serralheria', produtos);
  }

  function popularFormNovaChapa() {
    const todasCats = [...new Set([...CATS_SERR, ...categoriasDinamicas])];
    const selCat = document.getElementById('serr-prod-cat');
    selCat.innerHTML = `<option value="">Selecione a matéria-prima...</option>` + todasCats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    const todasCores = [...new Set([...CORES_BASE, ...coresDinamicas])];
    const selCor = document.getElementById('serr-prod-cor');
    selCor.innerHTML = `<option value="">Selecione a cor...</option>` + todasCores.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    atualizarEspessurasEMedidasForm();
  }

  function atualizarEspessurasEMedidasForm() {
    const cat = document.getElementById('serr-prod-cat').value;
    const cfg = getConfigFabricaCategoria(cat);
    indiceMedidaPadrao = 0;

    const customEsps = [...new Set(produtos.filter((p) => p.categoria === cat && p.espessura).map((p) => p.espessura))];
    const locais = espessurasDinamicasMap[cat] || [];
    const todasEsps = [...new Set([...(cfg?.espessuras || []), ...customEsps, ...locais])];

    const selEsp = document.getElementById('serr-prod-esp');
    selEsp.innerHTML = `<option value="">Selecione...</option>` + todasEsps.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');

    const canon = ALIAS_CATEGORIA_FABRICA[normalizarCategoria(cat).toLowerCase()] || normalizarCategoria(cat).toLowerCase();
    if (materialNovoStatus === 'Novo' && canon === 'acm' && todasEsps.includes('3mm')) {
      selEsp.value = '3mm';
    }

    if (cfg && materialNovoStatus === 'Novo') {
      const m = cfg.medidas[0];
      document.getElementById('serr-prod-w').value = m.w;
      document.getElementById('serr-prod-h').value = m.h;
    }
    document.getElementById('btn-serr-alt-medida').style.display = (cfg && cfg.medidas.length > 1) ? 'inline-flex' : 'none';
  }

  function normalizarRecortes(recortes) {
    if (!Array.isArray(recortes)) return [];
    return recortes.map((r) => ({
      x: parseFloat(r.x) || 0, y: parseFloat(r.y) || 0,
      w: parseFloat(r.w) || 0, h: parseFloat(r.h) || 0
    })).filter((r) => r.w > 0 && r.h > 0);
  }

  function rectSobrepoe(a, b) {
    return !((a.x + a.w) <= b.x || a.x >= (b.x + b.w) || (a.y + a.h) <= b.y || a.y >= (b.y + b.h));
  }

  function posicaoValidaComBloqueios(base, x, y, w, h, recortesBase = [], recortesExtras = []) {
    if (x < 0 || y < 0 || (x + w) > base.w || (y + h) > base.h) return false;
    const atual = { x, y, w, h };
    if (recortesBase.some((r) => rectSobrepoe(atual, r))) return false;
    return !recortesExtras.some((r) => rectSobrepoe(atual, r));
  }

  function encontrarPrimeiraPosicaoLivre(base, w, h, bloqueios = []) {
    const maxX = Math.floor(base.w - w);
    const maxY = Math.floor(base.h - h);
    if (maxX < 0 || maxY < 0) return null;
    for (let y = 0; y <= maxY; y += 1) {
      for (let x = 0; x <= maxX; x += 1) {
        if (posicaoValidaComBloqueios(base, x, y, w, h, bloqueios, [])) return { x, y };
      }
    }
    return null;
  }

  function obterLinhasCorte() {
    return [...document.querySelectorAll('#serr-linhas-corte .serr-linha-corte')].map((row) => ({
      id: row.dataset.linhaId,
      w: parseFloat(row.querySelector('.c-w')?.value) || 0,
      h: parseFloat(row.querySelector('.c-h')?.value) || 0,
      qtd: Math.max(1, parseInt(row.querySelector('.c-q')?.value, 10) || 1)
    }));
  }

  function gerarPlanoCortes(base, linhas, recortesAtuais) {
    const extras = [];
    const planos = [];
    for (const linha of linhas) {
      if (linha.w <= 0 || linha.h <= 0) continue;
      if (linha.w > base.w || linha.h > base.h) return null;
      const preferidas = posicoesCortePorLinha[linha.id] || [];
      const posicoes = [];
      for (let i = 0; i < linha.qtd; i++) {
        const pref = preferidas[i];
        if (pref && posicaoValidaComBloqueios(base, pref.x, pref.y, linha.w, linha.h, recortesAtuais, extras)) {
          posicoes.push({ x: pref.x, y: pref.y });
          extras.push({ x: pref.x, y: pref.y, w: linha.w, h: linha.h });
        } else {
          const livre = encontrarPrimeiraPosicaoLivre(base, linha.w, linha.h, [...recortesAtuais, ...extras]);
          if (!livre) return null;
          posicoes.push(livre);
          extras.push({ x: livre.x, y: livre.y, w: linha.w, h: linha.h });
        }
      }
      posicoesCortePorLinha[linha.id] = posicoes;
      posicoes.forEach((pos, idx) => planos.push({ linhaId: linha.id, index: idx, w: linha.w, h: linha.h, x: pos.x, y: pos.y }));
    }
    return planos;
  }

  function atualizarPreviewCorte() {
    if (!pecaParaCorte) return;
    const base = getDimensoesBase(pecaParaCorte);
    const recortesAtuais = normalizarRecortes(pecaParaCorte.recortes);
    const linhas = obterLinhasCorte();
    const msgEl = document.getElementById('serr-corte-msg');
    msgEl.textContent = '';

    const stage = document.getElementById('serr-corte-stage');
    const maxStageW = Math.max(210, Math.min(340, (window.innerWidth || 420) - 72));
    const escala = Math.min(maxStageW / base.w, 200 / base.h);
    const finalW = Math.max(40, Math.round(base.w * escala));
    const finalH = Math.max(40, Math.round(base.h * escala));
    stage.style.width = `${finalW}px`;
    stage.style.height = `${finalH}px`;
    stage.style.background = corPreviewChapa(pecaParaCorte);
    stage.innerHTML = '';

    document.getElementById('serr-corte-cota').textContent = `Chapa Base: ${base.w} cm × ${base.h} cm`;

    recortesAtuais.forEach((r) => {
      const div = document.createElement('div');
      div.style.cssText = `position:absolute; left:${(r.x / base.w) * finalW}px; top:${(r.y / base.h) * finalH}px; width:${(r.w / base.w) * finalW}px; height:${(r.h / base.h) * finalH}px; background:rgba(8,12,20,0.9); border:1px dashed #38bdf8; pointer-events:none;`;
      stage.appendChild(div);
    });

    const planos = gerarPlanoCortes(base, linhas, recortesAtuais);
    if (!planos) {
      msgEl.textContent = '⚠ Uma ou mais medidas não cabem na área livre da chapa.';
      return;
    }

    planos.forEach((plano) => {
      const box = document.createElement('div');
      box.style.cssText = `position:absolute; left:${(plano.x / base.w) * finalW}px; top:${(plano.y / base.h) * finalH}px; width:${(plano.w / base.w) * finalW}px; height:${(plano.h / base.h) * finalH}px; background:rgba(239,68,68,0.85); border:1.5px dashed #fff; color:#fff; font-size:10px; font-weight:800; display:flex; align-items:center; justify-content:center; cursor:grab; touch-action:none; user-select:none;`;
      box.textContent = `${plano.w}×${plano.h}`;
      stage.appendChild(box);

      let dragging = false, ox = 0, oy = 0;
      box.onpointerdown = (e) => {
        dragging = true;
        ox = e.clientX - box.offsetLeft;
        oy = e.clientY - box.offsetTop;
        box.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      };
      box.onpointermove = (e) => {
        if (!dragging) return;
        const nx = Math.max(0, Math.min(finalW - box.offsetWidth, e.clientX - ox));
        const ny = Math.max(0, Math.min(finalH - box.offsetHeight, e.clientY - oy));
        const cx = Number(((nx / finalW) * base.w).toFixed(2));
        const cy = Number(((ny / finalH) * base.h).toFixed(2));
        const outros = planos.filter((p) => !(p.linhaId === plano.linhaId && p.index === plano.index));
        if (!posicaoValidaComBloqueios(base, cx, cy, plano.w, plano.h, recortesAtuais, outros)) {
          box.style.background = 'rgba(185,28,28,0.95)';
          return;
        }
        box.style.left = `${nx}px`;
        box.style.top = `${ny}px`;
        box.style.background = 'rgba(239,68,68,0.85)';
        plano.x = cx;
        plano.y = cy;
        posicoesCortePorLinha[plano.linhaId][plano.index] = { x: cx, y: cy };
      };
      box.onpointerup = () => { dragging = false; };
    });
  }

  function adicionarLinhaCorteUI(limpar = false) {
    const wrap = document.getElementById('serr-linhas-corte');
    if (limpar) {
      wrap.innerHTML = '';
      sequenciaLinhaCorte = 0;
      posicoesCortePorLinha = {};
    }
    sequenciaLinhaCorte++;
    const id = String(sequenciaLinhaCorte);
    posicoesCortePorLinha[id] = [{ x: 0, y: 0 }];

    const row = document.createElement('div');
    row.className = 'serr-linha-corte serr-cut-row-grid';
    row.dataset.linhaId = id;
    row.innerHTML = `
      <input type="number" class="ui-input c-w" placeholder="Largura (cm)" min="1" step="0.5" />
      <input type="number" class="ui-input c-h" placeholder="Altura (cm)" min="1" step="0.5" />
      <input type="number" class="ui-input c-q" value="1" min="1" step="1" title="Quantidade" />
      <button type="button" class="ui-btn ui-btn-sm btn-inv" title="Inverter L/A">🔁</button>
      ${sequenciaLinhaCorte > 1 ? '<button type="button" class="ui-btn ui-btn-sm ui-btn-danger btn-rem">✖</button>' : '<span></span>'}
    `;
    row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', atualizarPreviewCorte));
    row.querySelector('.btn-inv').addEventListener('click', () => {
      const iw = row.querySelector('.c-w'), ih = row.querySelector('.c-h');
      const tmp = iw.value; iw.value = ih.value; ih.value = tmp;
      atualizarPreviewCorte();
    });
    row.querySelector('.btn-rem')?.addEventListener('click', () => {
      delete posicoesCortePorLinha[id];
      row.remove();
      atualizarPreviewCorte();
    });
    wrap.appendChild(row);
  }

  function abrirModalCorte(id) {
    pecaParaCorte = produtos.find((x) => x.id === id);
    if (!pecaParaCorte) return;
    document.getElementById('serr-corte-titulo').textContent = `${pecaParaCorte.categoria} ${pecaParaCorte.espessura || ''} • ${pecaParaCorte.cor || ''}`;
    adicionarLinhaCorteUI(true);
    document.getElementById('modal-serr-corte').classList.add('open');
    atualizarPreviewCorte();
  }

  function montarHistoricoCorte(linhas, dataRef = new Date()) {
    const data = dataRef.toLocaleDateString('pt-BR');
    const hora = dataRef.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return linhas.map((l) => `${userMe.nome || 'Usuário'} cortou ${l.qtd} unidade(s) ${l.w}cm X ${l.h}cm dia ${data} às ${hora}h`).join('\n');
  }

  function devePerguntarAjusteDescarte(base, planos, recortesAtuais) {
    if (recortesAtuais.length > 0 || !planos.length) return false;
    const xMin = Math.min(...planos.map((p) => p.x));
    const yMin = Math.min(...planos.map((p) => p.y));
    const xMax = Math.max(...planos.map((p) => p.x + p.w));
    const yMax = Math.max(...planos.map((p) => p.y + p.h));
    const linearH = Math.abs((yMax - yMin) - base.h) < 0.01 && Math.abs(yMin) < 0.01;
    const linearV = Math.abs((xMax - xMin) - base.w) < 0.01 && Math.abs(xMin) < 0.01;
    return !(linearH || linearV);
  }

  function calcularDescarteAtual() {
    if (!contextoDivisaoMaterial) return null;
    const { base } = contextoDivisaoMaterial;
    const totais = { A: 0, B: 0, C: 0, D: 0 };
    const descartes = ajustesMarcadoresDivisao
      .map((l) => ({ marcador: l.marcador, medida: Number(l.medida) || 0 }))
      .filter((l) => l.marcador && l.medida > 0);
    descartes.forEach((d) => { if (totais[d.marcador] != null) totais[d.marcador] += d.medida; });
    const finalW = Math.max(0, Number((base.w - (totais.A + totais.D)).toFixed(2)));
    const finalH = Math.max(0, Number((base.h - (totais.B + totais.C)).toFixed(2)));
    return { descartes, finalW, finalH };
  }

  function renderModalDescarteUI() {
    const wrap = document.getElementById('serr-descarte-rows');
    if (!wrap) return;
    wrap.innerHTML = ajustesMarcadoresDivisao.map((l) => `
      <div class="serr-desc-row-grid">
        <select class="ui-select desc-m" data-id="${l.id}">
          <option value="">Marcador...</option>
          <option value="A" ${l.marcador === 'A' ? 'selected' : ''}>Lado A (Esquerda → Direita)</option>
          <option value="B" ${l.marcador === 'B' ? 'selected' : ''}>Lado B (Baixo → Cima)</option>
          <option value="C" ${l.marcador === 'C' ? 'selected' : ''}>Lado C (Direita → Esquerda)</option>
          <option value="D" ${l.marcador === 'D' ? 'selected' : ''}>Lado D (Cima → Baixo)</option>
        </select>
        <input type="number" class="ui-input desc-v" data-id="${l.id}" placeholder="Descarte (cm)" min="0" value="${l.medida}" />
        <button type="button" class="ui-btn ui-btn-sm ui-btn-danger desc-del" data-id="${l.id}">✖</button>
      </div>
    `).join('');

    const res = calcularDescarteAtual();
    document.getElementById('serr-descarte-resumo').textContent = res
      ? `Nova medida restante da chapa após descarte: ${res.finalW} cm × ${res.finalH} cm`
      : '';

    wrap.querySelectorAll('.desc-m').forEach((el) => {
      el.addEventListener('change', () => {
        ajustesMarcadoresDivisao = ajustesMarcadoresDivisao.map((x) => x.id === Number(el.dataset.id) ? { ...x, marcador: el.value } : x);
        renderModalDescarteUI();
      });
    });
    wrap.querySelectorAll('.desc-v').forEach((el) => {
      el.addEventListener('input', () => {
        ajustesMarcadoresDivisao = ajustesMarcadoresDivisao.map((x) => x.id === Number(el.dataset.id) ? { ...x, medida: el.value } : x);
        const r = calcularDescarteAtual();
        document.getElementById('serr-descarte-resumo').textContent = r ? `Nova medida restante da chapa após descarte: ${r.finalW} cm × ${r.finalH} cm` : '';
      });
    });
    wrap.querySelectorAll('.desc-del').forEach((el) => {
      el.addEventListener('click', () => {
        if (ajustesMarcadoresDivisao.length <= 1) return;
        ajustesMarcadoresDivisao = ajustesMarcadoresDivisao.filter((x) => x.id !== Number(el.dataset.id));
        renderModalDescarteUI();
      });
    });
  }

  async function executarCorteSerralheria(ignorarPergunta = false) {
    if (!pecaParaCorte) return;
    const base = getDimensoesBase(pecaParaCorte);
    const recortesAtuais = normalizarRecortes(pecaParaCorte.recortes);
    const linhas = obterLinhasCorte().filter((l) => l.w > 0 && l.h > 0 && l.qtd > 0);
    if (!linhas.length) return showToast('Preencha ao menos uma medida de corte válida.', 'error');

    const planos = gerarPlanoCortes(base, linhas, recortesAtuais);
    if (!planos || !planos.length) return showToast('Os cortes informados não cabem na chapa.', 'error');

    if (!ignorarPergunta && devePerguntarAjusteDescarte(base, planos, recortesAtuais)) {
      contextoDivisaoMaterial = { base, linhas, planos };
      aplicarAjusteDescarteNoCorte = null;
      document.getElementById('modal-serr-pergunta-descarte').classList.add('open');
      return;
    }

    const btn = document.getElementById('btn-serr-confirmar-corte');
    btn.disabled = true;
    btn.textContent = 'Processando corte...';

    try {
      const nomeBase = String(pecaParaCorte.nome || pecaParaCorte.categoria || '').replace(' (Sobra)', '');
      const agora = new Date();
      let anotacoes = [String(pecaParaCorte.anotacoes || '').trim(), montarHistoricoCorte(linhas, agora)].filter(Boolean).join('\n');

      if (aplicarAjusteDescarteNoCorte?.descartes?.length) {
        const d0 = aplicarAjusteDescarteNoCorte.descartes[0];
        anotacoes += `\n${userMe.nome || 'Usuário'} ajustou descarte (${d0.marcador}: ${d0.medida}cm) em ${agora.toLocaleDateString('pt-BR')}`;
      }

      const quaseIgual = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.01;
      const obterSobraLinear = () => {
        if (recortesAtuais.length > 0 || !planos.length) return null;
        const pH = [...planos].sort((a, b) => a.x - b.x);
        if (pH.every((p) => quaseIgual(p.h, base.h) && quaseIgual(p.y, 0))) {
          const semGap = pH.every((p, idx) => idx === 0 || quaseIgual(pH[idx - 1].x + pH[idx - 1].w, p.x));
          const tocaBorda = quaseIgual(pH[0].x, 0) || quaseIgual(pH[pH.length - 1].x + pH[pH.length - 1].w, base.w);
          const largRem = pH.reduce((a, p) => a + p.w, 0);
          if (semGap && tocaBorda && (base.w - largRem) > 0) return { w: Number((base.w - largRem).toFixed(2)), h: base.h };
        }
        const pV = [...planos].sort((a, b) => a.y - b.y);
        if (pV.every((p) => quaseIgual(p.w, base.w) && quaseIgual(p.x, 0))) {
          const semGap = pV.every((p, idx) => idx === 0 || quaseIgual(pV[idx - 1].y + pV[idx - 1].h, p.y));
          const tocaBorda = quaseIgual(pV[0].y, 0) || quaseIgual(pV[pV.length - 1].y + pV[pV.length - 1].h, base.h);
          const altRem = pV.reduce((a, p) => a + p.h, 0);
          if (semGap && tocaBorda && (base.h - altRem) > 0) return { w: base.w, h: Number((base.h - altRem).toFixed(2)) };
        }
        return null;
      };

      const sobraLinear = obterSobraLinear();
      let atualizacaoSobra;
      if (aplicarAjusteDescarteNoCorte) {
        const sn = normalizarDimensoesChapa(aplicarAjusteDescarteNoCorte.finalW, aplicarAjusteDescarteNoCorte.finalH);
        atualizacaoSobra = {
          dimW: sn.w, dimH: sn.h, baseDimW: sn.w, baseDimH: sn.h,
          recortes: [], tipoMedida: 'corte', status: 'Usado', nome: `${nomeBase} (Sobra)`, qtd: 1, anotacoes
        };
      } else if (sobraLinear) {
        const sn = normalizarDimensoesChapa(sobraLinear.w, sobraLinear.h);
        atualizacaoSobra = {
          dimW: sn.w, dimH: sn.h, baseDimW: sn.w, baseDimH: sn.h,
          recortes: [], tipoMedida: 'corte', status: 'Usado', nome: `${nomeBase} (Sobra)`, qtd: 1, anotacoes
        };
      } else {
        atualizacaoSobra = {
          dimW: base.w, dimH: base.h, baseDimW: base.w, baseDimH: base.h,
          recortes: [...recortesAtuais, ...planos.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }))],
          tipoMedida: 'corte', status: 'Usado', nome: `${nomeBase} (Sobra)`, qtd: 1, anotacoes
        };
      }

      const refOrigem = doc(db, 'estoque', pecaParaCorte.id);
      const resultadoTx = await runTransaction(db, async (tx) => {
        const snap = await tx.get(refOrigem);
        if (!snap.exists()) throw new Error('Chapa original não encontrada.');
        const qtdBanco = Number(snap.data().qtd) || 1;
        if (qtdBanco > 1) {
          tx.update(refOrigem, { qtd: qtdBanco - 1 });
          return 'decrementou';
        }
        tx.update(refOrigem, atualizacaoSobra);
        return 'atualizou';
      });

      if (resultadoTx === 'decrementou') {
        const sobraDoc = { ...pecaParaCorte, ...atualizacaoSobra, data_criacao: serverTimestamp() };
        delete sobraDoc.id;
        await addDoc(collection(db, 'estoque'), sobraDoc);
      }

      for (const linha of linhas) {
        const dimCorte = normalizarDimensoesChapa(linha.w, linha.h);
        const novaPeca = { ...pecaParaCorte };
        delete novaPeca.id;
        Object.assign(novaPeca, {
          dimW: dimCorte.w, dimH: dimCorte.h, baseDimW: dimCorte.w, baseDimH: dimCorte.h,
          recortes: [], status: 'Usado', tipoMedida: 'corte', qtd: linha.qtd,
          nome: `${nomeBase} (Corte)`, data_criacao: serverTimestamp(),
          anotacoes: [String(novaPeca.anotacoes || '').trim(), montarHistoricoCorte([linha], agora)].filter(Boolean).join('\n')
        });
        await addDoc(collection(db, 'estoque'), novaPeca);
      }

      document.getElementById('modal-serr-corte').classList.remove('open');
      showToast('Corte executado e sobra registrada!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao executar corte na chapa.', 'error');
    } finally {
      aplicarAjusteDescarteNoCorte = null;
      contextoDivisaoMaterial = null;
      btn.disabled = false;
      btn.textContent = '✂️ Confirmar Corte';
    }
  }

  function construirUnidadesGrupo() {
    const lista = [];
    let idxGlobal = 1;
    itensDetalhesGrupo.forEach((item) => {
      const q = Math.max(1, Number(item.qtd) || 1);
      for (let i = 1; i <= q; i++) {
        lista.push({ chave: `${item.id}::${i}`, itemId: item.id, indiceRegistro: i, indiceGlobal: idxGlobal++, item });
      }
    });
    return lista;
  }

  function renderListaUnidadesDetalhes() {
    const wrap = document.getElementById('serr-det-unidades-wrap');
    const listaEl = document.getElementById('serr-det-unidades-lista');
    const unidades = construirUnidadesGrupo();
    wrap.style.display = unidades.length > 1 ? 'block' : 'none';

    listaEl.innerHTML = unidades.map((u) => {
      const ativo = unidadeAtivaDetalhes === u.chave;
      const sel = unidadesSelecionadasDetalhes.has(u.chave);
      const dims = getDimensoesBase(u.item);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:7px 10px; border-bottom:1px solid var(--border-subtle); background:${ativo ? 'var(--brand-soft)' : 'transparent'};">
          <button type="button" data-unit-focus="${u.chave}" style="background:none; border:none; color:var(--text-primary); font-weight:600; font-size:12.5px; cursor:pointer; text-align:left; flex:1;">
            Registro #${esc(u.item.registroSerial || '---')} • ${dims.w}×${dims.h} cm (${String(u.indiceGlobal).padStart(2, '0')})
          </button>
          <input type="checkbox" data-unit-chk="${u.chave}" ${sel ? 'checked' : ''} style="accent-color:var(--brand); width:16px; height:16px;" title="Selecionar p/ separar ou etiqueta em lote" />
        </div>
      `;
    }).join('');

    const btnSep = document.getElementById('btn-serr-separar');
    if (btnSep) {
      btnSep.disabled = unidadesSelecionadasDetalhes.size === 0;
      btnSep.textContent = unidadesSelecionadasDetalhes.size > 0
        ? `Separar (${unidadesSelecionadasDetalhes.size})`
        : 'Separar Selecionadas';
    }

    const btnEtq = document.getElementById('btn-serr-abrir-etiqueta');
    if (btnEtq) {
      btnEtq.textContent = unidadesSelecionadasDetalhes.size > 1
        ? `🏷️ Gerar ${unidadesSelecionadasDetalhes.size} Etiquetas`
        : '🏷️ Gerar Etiqueta QR';
    }

    listaEl.querySelectorAll('[data-unit-focus]').forEach((b) => {
      b.addEventListener('click', () => {
        unidadeAtivaDetalhes = b.dataset.unitFocus;
        const [docId] = unidadeAtivaDetalhes.split('::');
        const alvo = itensDetalhesGrupo.find((x) => x.id === docId);
        if (alvo) preencherDetalhesUnidade(alvo);
        renderListaUnidadesDetalhes();
      });
    });

    listaEl.querySelectorAll('[data-unit-chk]').forEach((c) => {
      c.addEventListener('change', () => {
        if (c.checked) unidadesSelecionadasDetalhes.add(c.dataset.unitChk);
        else unidadesSelecionadasDetalhes.delete(c.dataset.unitChk);
        renderListaUnidadesDetalhes();
      });
    });
  }

  function preencherDetalhesUnidade(item) {
    itemParaDetalhes = item;
    const dims = getDimensoesBase(item);
    document.getElementById('serr-det-titulo').textContent = `${item.categoria} ${item.espessura || ''}`;
    document.getElementById('serr-det-preview').innerHTML = gerarPreviewCard(item);
    document.getElementById('serr-det-resumo').textContent =
      `Registro: #${item.registroSerial || '---'} • Status: ${item.status || 'Novo'} • Medida: ${dims.w} × ${dims.h} cm • Cor: ${item.cor || 'N/A'} ${item.acabamento || ''}`;
    document.getElementById('serr-det-os').value = String(item.osNumero || '');
    document.getElementById('serr-det-anotacoes').value = item.anotacoes || '';
  }

  function abrirModalDetalhesSerr(groupKeyOrId) {
    if (gruposVisiveis.has(groupKeyOrId)) {
      const g = gruposVisiveis.get(groupKeyOrId);
      itensDetalhesGrupo = (g.ids || []).map((id) => produtos.find((x) => x.id === id)).filter(Boolean);
    } else {
      const unico = produtos.find((x) => x.id === groupKeyOrId);
      itensDetalhesGrupo = unico ? [unico] : [];
    }
    if (!itensDetalhesGrupo.length) return;
    itensDetalhesGrupo.sort((a, b) => Number(a.registroSerial || 0) - Number(b.registroSerial || 0));

    unidadesSelecionadasDetalhes = new Set();
    unidadeAtivaDetalhes = `${itensDetalhesGrupo[0].id}::1`;
    preencherDetalhesUnidade(itensDetalhesGrupo[0]);
    renderListaUnidadesDetalhes();
    document.getElementById('serr-task-box').style.display = 'none';
    document.getElementById('serr-task-title').value = `Serralheria: ${itensDetalhesGrupo[0].categoria} ${itensDetalhesGrupo[0].espessura || ''}`;
    document.getElementById('serr-task-desc').value = '';
    document.getElementById('modal-serr-detalhes').classList.add('open');
  }

  function abrirModalEtiquetasLote() {
    const unidades = construirUnidadesGrupo();
    const sel = unidades.filter((u) => unidadesSelecionadasDetalhes.has(u.chave));
    loteEtiquetasAtual = sel.length ? sel : unidades.filter((u) => u.chave === unidadeAtivaDetalhes).slice(0, 1);
    if (!loteEtiquetasAtual.length && itemParaDetalhes) loteEtiquetasAtual = [{ item: itemParaDetalhes }];

    const wrap = document.getElementById('serr-etiquetas-preview-list');
    wrap.innerHTML = loteEtiquetasAtual.map((u) => {
      const it = u.item;
      const dims = getDimensoesBase(it);
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(qrDeepLink(it.id))}`;
      return `
        <div class="serr-label-sheet" style="width:4.8cm; height:2.8cm; background:#fff; color:#111; border-radius:6px; padding:0.1cm; display:grid; grid-template-columns:1fr 1.15fr; gap:0.1cm; align-items:center; border:1px solid #cbd5e1;">
          <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
            <img src="${qrSrc}" crossorigin="anonymous" alt="QR" style="width:100%; height:100%; object-fit:contain;" />
          </div>
          <div style="display:flex; flex-direction:column; gap:2px; font-family:Arial,sans-serif; overflow:hidden;">
            <div style="font-size:11px; font-weight:900; line-height:1.1;">${esc(it.categoria)} ${esc(it.espessura || '')}</div>
            <div style="font-size:9.5px; font-weight:700;">${esc(it.cor || '')} ${esc(it.acabamento || '')}</div>
            <div style="font-size:9.5px; font-weight:800;">${dims.w} cm X ${dims.h} cm</div>
            <div style="font-size:9px; font-weight:700; color:#444;">Reg: ${esc(it.registroSerial || '---')}</div>
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('modal-serr-etiqueta').classList.add('open');
  }

  async function exportarEtiquetasSerr(formato) {
    const sheets = [...document.querySelectorAll('#serr-etiquetas-preview-list .serr-label-sheet')];
    if (!sheets.length || !window.html2canvas) return;
    const canvases = [];
    for (const sh of sheets) {
      const clone = sh.cloneNode(true);
      clone.style.position = 'fixed';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      document.body.appendChild(clone);
      try {
        canvases.push(await window.html2canvas(clone, { backgroundColor: '#ffffff', scale: 3, useCORS: true }));
      } finally {
        clone.remove();
      }
    }

    if (formato === 'png') {
      canvases.forEach((cv, i) => {
        const a = document.createElement('a');
        a.href = cv.toDataURL('image/png');
        a.download = `etiqueta-chapa-${loteEtiquetasAtual[i]?.item?.registroSerial || i + 1}.png`;
        a.click();
      });
    } else if (window.jspdf) {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'cm', format: [4.8, 2.8] });
      canvases.forEach((cv, i) => {
        if (i > 0) pdf.addPage([4.8, 2.8], 'landscape');
        pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 4.8, 2.8, undefined, 'FAST');
      });
      pdf.save(`etiquetas-serralheria-${Date.now()}.pdf`);
    }
    showToast('Etiqueta(s) gerada(s) com sucesso!', 'success');
  }

  function renderArquivoMorto() {
    const listEl = document.getElementById('serr-arquivo-morto-list');
    if (!listEl) return;
    const ord = [...itensArquivoMorto].sort((a, b) => (b.arquivado_em?.seconds || 0) - (a.arquivado_em?.seconds || 0));
    listEl.innerHTML = ord.length
      ? ord.map((it) => {
          const d = getDimensoesBase(it);
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:10px;">
              <div>
                <div style="font-weight:800; font-size:13.5px;">${esc(it.categoria)} ${esc(it.espessura || '')} • ${esc(it.cor || '')}</div>
                <div style="font-size:12px; color:var(--text-muted);">${d.w}×${d.h} cm • Reg #${esc(it.registroSerial || '---')}</div>
              </div>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-blue" data-serr-restore="${it.id}">↩️ Restaurar</button>
            </div>
          `;
        }).join('')
      : '<div style="text-align:center; color:var(--text-muted); padding:24px;">Nenhuma chapa no arquivo morto.</div>';

    listEl.querySelectorAll('[data-serr-restore]').forEach((b) => {
      b.addEventListener('click', async () => {
        await updateDoc(doc(db, 'estoque', b.dataset.serrRestore), {
          arquivado: false,
          restaurado_em: serverTimestamp(),
          restaurado_por: userMe.nome || 'Usuário'
        });
        showToast('Chapa devolvida ao estoque ativo!', 'success');
      });
    });
  }

  function bindEventsOnce() {
    if (initialized) return;
    initialized = true;

    document.getElementById('serr-busca')?.addEventListener('input', renderCardsSerralheria);
    document.getElementById('serr-filtro-status')?.addEventListener('change', (e) => {
      statusFiltro = e.target.value;
      renderCardsSerralheria();
    });

    document.getElementById('btn-serr-nova-chapa')?.addEventListener('click', () => {
      materialNovoStatus = 'Novo';
      document.getElementById('btn-serr-status-toggle').textContent = 'Status: NOVO';
      document.getElementById('serr-prod-qtd').value = '1';
      popularFormNovaChapa();
      if (materialFiltro !== 'TODOS') {
        document.getElementById('serr-prod-cat').value = materialFiltro;
        atualizarEspessurasEMedidasForm();
      }
      document.getElementById('modal-serr-prod').classList.add('open');
    });

    document.getElementById('btn-serr-status-toggle')?.addEventListener('click', (e) => {
      materialNovoStatus = materialNovoStatus === 'Novo' ? 'Usado' : 'Novo';
      e.target.textContent = `Status: ${materialNovoStatus.toUpperCase()}`;
      if (materialNovoStatus === 'Novo') atualizarEspessurasEMedidasForm();
    });

    document.getElementById('serr-prod-cat')?.addEventListener('change', atualizarEspessurasEMedidasForm);

    document.getElementById('btn-serr-alt-medida')?.addEventListener('click', () => {
      const cfg = getConfigFabricaCategoria(document.getElementById('serr-prod-cat').value);
      if (!cfg) return;
      indiceMedidaPadrao = (indiceMedidaPadrao + 1) % cfg.medidas.length;
      document.getElementById('serr-prod-w').value = cfg.medidas[indiceMedidaPadrao].w;
      document.getElementById('serr-prod-h').value = cfg.medidas[indiceMedidaPadrao].h;
    });

    document.getElementById('btn-serr-add-cat')?.addEventListener('click', () => {
      const n = prompt('Nome da nova Matéria-Prima:');
      if (!n?.trim()) return;
      categoriasDinamicas.push(n.trim());
      popularFormNovaChapa();
      document.getElementById('serr-prod-cat').value = n.trim();
      atualizarEspessurasEMedidasForm();
    });

    document.getElementById('btn-serr-add-esp')?.addEventListener('click', () => {
      const cat = document.getElementById('serr-prod-cat').value;
      if (!cat) return showToast('Selecione a matéria-prima primeiro.', 'error');
      const e = prompt(`Nova espessura para ${cat} (ex: 12mm):`);
      if (!e?.trim()) return;
      if (!espessurasDinamicasMap[cat]) espessurasDinamicasMap[cat] = [];
      espessurasDinamicasMap[cat].push(e.trim());
      atualizarEspessurasEMedidasForm();
      document.getElementById('serr-prod-esp').value = e.trim();
    });

    document.getElementById('btn-serr-add-cor')?.addEventListener('click', () => {
      const c = prompt('Nome da nova Cor:');
      if (!c?.trim()) return;
      coresDinamicas.push(c.trim());
      popularFormNovaChapa();
      document.getElementById('serr-prod-cor').value = c.trim();
    });

    document.getElementById('btn-serr-salvar-chapa')?.addEventListener('click', async () => {
      const cat = document.getElementById('serr-prod-cat').value;
      const esp = document.getElementById('serr-prod-esp').value;
      const cor = document.getElementById('serr-prod-cor').value;
      const acab = document.getElementById('serr-prod-acabamento').value;
      const dims = normalizarDimensoesChapa(document.getElementById('serr-prod-w').value, document.getElementById('serr-prod-h').value);
      const qtd = Math.max(1, parseInt(document.getElementById('serr-prod-qtd').value, 10) || 1);

      if (!cat || dims.w <= 0 || dims.h <= 0) return showToast('Preencha matéria-prima e dimensões válidas.', 'error');

      const btn = document.getElementById('btn-serr-salvar-chapa');
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        for (let i = 0; i < qtd; i++) {
          const serial = await proximoRegistroSerralheria();
          await addDoc(collection(db, 'estoque'), {
            setor: 'serralheria',
            categoria: cat,
            espessura: esp,
            cor,
            acabamento: acab,
            dimW: dims.w,
            dimH: dims.h,
            baseDimW: dims.w,
            baseDimH: dims.h,
            status: materialNovoStatus,
            qtd: 1,
            recortes: [],
            tipoMedida: materialNovoStatus === 'Novo' ? 'fabrica' : 'corte',
            nome: `${cat} ${esp}`.trim(),
            registroSerial: serial,
            data_criacao: serverTimestamp()
          });
        }
        document.getElementById('modal-serr-prod').classList.remove('open');
        showToast(`${qtd} chapa(s) registrada(s) no estoque!`, 'success');
      } catch {
        showToast('Erro ao registrar chapa.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar no Estoque';
      }
    });

    document.getElementById('btn-serr-baixa-sel')?.addEventListener('click', async () => {
      if (!selecaoCardsBaixa.size) return;
      if (!confirm(`Enviar ${selecaoCardsBaixa.size} grupo(s) selecionado(s) para o Arquivo Morto?`)) return;
      const ids = [];
      selecaoCardsBaixa.forEach((k) => {
        const g = gruposVisiveis.get(k);
        (g?.ids || []).forEach((id) => ids.push(id));
      });
      for (const id of ids) {
        await updateDoc(doc(db, 'estoque', id), {
          arquivado: true,
          arquivado_em: serverTimestamp(),
          arquivado_por: userMe.nome || 'Usuário'
        });
      }
      selecaoCardsBaixa.clear();
      showToast('Chapas enviadas para o Arquivo Morto.', 'info');
    });

    document.getElementById('btn-serr-unir-sel')?.addEventListener('click', async () => {
      const gs = [...selecaoCardsBaixa].map((k) => gruposVisiveis.get(k)).filter(Boolean);
      const ids = [...new Set(gs.flatMap((g) => g.ids || []))];
      if (!ids.length || !confirm(`Unir ${ids.length} registros em um único card agrupado?`)) return;
      for (const id of ids) {
        await updateDoc(doc(db, 'estoque', id), { separacaoLoteId: null });
      }
      selecaoCardsBaixa.clear();
      showToast('Registros unidos com sucesso!', 'success');
    });

    document.getElementById('btn-serr-arquivo-morto')?.addEventListener('click', () => {
      renderArquivoMorto();
      document.getElementById('modal-serr-morto').classList.add('open');
    });

    document.getElementById('btn-serr-cores')?.addEventListener('click', () => {
      const sel = document.getElementById('serr-cor-cfg-select');
      const chaves = [...new Set(produtos.filter((p) => !p.arquivado).map(chaveMaterialCor).filter((c) => c !== '|'))];
      sel.innerHTML = chaves.length
        ? chaves.map((ch) => `<option value="${esc(ch)}">${esc(ch.replace('|', ' • '))}</option>`).join('')
        : '<option value="">Cadastre chapas primeiro</option>';
      if (sel.value && mapaCoresMateriais[sel.value]) {
        document.getElementById('serr-cor-cfg-hex').value = mapaCoresMateriais[sel.value];
      }
      document.getElementById('modal-serr-cores').classList.add('open');
    });

    document.getElementById('serr-cor-cfg-select')?.addEventListener('change', (e) => {
      if (mapaCoresMateriais[e.target.value]) {
        document.getElementById('serr-cor-cfg-hex').value = mapaCoresMateriais[e.target.value];
      }
    });

    document.getElementById('btn-serr-salvar-cor-cfg')?.addEventListener('click', async () => {
      const ch = document.getElementById('serr-cor-cfg-select').value;
      const hex = document.getElementById('serr-cor-cfg-hex').value;
      if (!ch) return;
      mapaCoresMateriais[ch] = hex;
      await setDoc(coresConfigRef, { mapa: mapaCoresMateriais, atualizadoEm: serverTimestamp() }, { merge: true });
      document.getElementById('modal-serr-cores').classList.remove('open');
      showToast('Cor visual salva para todos os dispositivos!', 'success');
    });

    document.getElementById('btn-serr-add-linha-corte')?.addEventListener('click', () => adicionarLinhaCorteUI(false));
    document.getElementById('btn-serr-confirmar-corte')?.addEventListener('click', () => executarCorteSerralheria(false));

    document.getElementById('btn-serr-desc-nao')?.addEventListener('click', () => {
      document.getElementById('modal-serr-pergunta-descarte').classList.remove('open');
      aplicarAjusteDescarteNoCorte = null;
      executarCorteSerralheria(true);
    });

    document.getElementById('btn-serr-desc-sim')?.addEventListener('click', () => {
      document.getElementById('modal-serr-pergunta-descarte').classList.remove('open');
      ajustesMarcadoresDivisao = [{ id: Date.now(), marcador: 'A', medida: '' }];
      renderModalDescarteUI();
      document.getElementById('modal-serr-descarte').classList.add('open');
    });

    document.getElementById('btn-serr-add-marcador')?.addEventListener('click', () => {
      ajustesMarcadoresDivisao.push({ id: Date.now(), marcador: '', medida: '' });
      renderModalDescarteUI();
    });

    document.getElementById('btn-serr-aplicar-descarte')?.addEventListener('click', () => {
      const payload = calcularDescarteAtual();
      if (!payload || !payload.descartes.length || payload.finalW <= 0 || payload.finalH <= 0) {
        return showToast('Informe medidas de descarte válidas menores que a chapa.', 'error');
      }
      aplicarAjusteDescarteNoCorte = payload;
      document.getElementById('modal-serr-descarte').classList.remove('open');
      executarCorteSerralheria(true);
    });

    document.getElementById('btn-serr-separar')?.addEventListener('click', async () => {
      const chaves = [...unidadesSelecionadasDetalhes];
      if (!chaves.length) return;
      if (!confirm(`Separar ${chaves.length} unidade(s) em um card independente?`)) return;

      const loteId = `SEP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const qtdPorDoc = new Map();
      chaves.forEach((ch) => {
        const [docId] = ch.split('::');
        qtdPorDoc.set(docId, (qtdPorDoc.get(docId) || 0) + 1);
      });

      const novos = [];
      for (let i = 0; i < chaves.length; i++) {
        novos.push({ ref: doc(collection(db, 'estoque')), serial: await proximoRegistroSerralheria() });
      }

      await runTransaction(db, async (tx) => {
        const dadosMap = new Map();
        for (const [docId] of qtdPorDoc.entries()) {
          const snap = await tx.get(doc(db, 'estoque', docId));
          if (!snap.exists()) throw new Error('Registro não encontrado.');
          dadosMap.set(docId, snap.data());
        }
        for (const [docId, qSel] of qtdPorDoc.entries()) {
          const at = dadosMap.get(docId);
          const rest = (Number(at.qtd) || 1) - qSel;
          if (rest <= 0) tx.delete(doc(db, 'estoque', docId));
          else tx.update(doc(db, 'estoque', docId), { qtd: rest });
        }
        let idx = 0;
        for (const [docId, qSel] of qtdPorDoc.entries()) {
          const at = dadosMap.get(docId);
          for (let i = 0; i < qSel; i++) {
            const nv = novos[idx++];
            tx.set(nv.ref, {
              ...at,
              qtd: 1,
              registroSerial: nv.serial,
              separacaoLoteId: loteId,
              data_criacao: serverTimestamp()
            });
          }
        }
      });

      document.getElementById('modal-serr-detalhes').classList.remove('open');
      showToast('Unidades separadas com sucesso!', 'success');
    });

    document.getElementById('btn-serr-salvar-det')?.addEventListener('click', async () => {
      if (!itemParaDetalhes) return;
      const osNumero = document.getElementById('serr-det-os').value.replace(/\D/g, '').slice(0, 5);
      const anotacoes = document.getElementById('serr-det-anotacoes').value;
      await updateDoc(doc(db, 'estoque', itemParaDetalhes.id), { osNumero, anotacoes });
      document.getElementById('modal-serr-detalhes').classList.remove('open');
      showToast('Informações da chapa atualizadas!', 'success');
    });

    document.getElementById('btn-serr-ir-corte')?.addEventListener('click', () => {
      if (!itemParaDetalhes) return;
      document.getElementById('modal-serr-detalhes').classList.remove('open');
      abrirModalCorte(itemParaDetalhes.id);
    });

    document.getElementById('btn-serr-abrir-etiqueta')?.addEventListener('click', abrirModalEtiquetasLote);
    document.getElementById('btn-serr-etq-pdf')?.addEventListener('click', () => exportarEtiquetasSerr('pdf'));
    document.getElementById('btn-serr-etq-png')?.addEventListener('click', () => exportarEtiquetasSerr('png'));

    document.getElementById('btn-serr-toggle-task')?.addEventListener('click', async () => {
      const box = document.getElementById('serr-task-box');
      const usuarios = await getUsuariosAprovados();
      document.getElementById('serr-task-user').innerHTML = usuarios.map((u) => `<option value="${esc(u.email)}">${esc(u.nome)} (${esc(u.email)})</option>`).join('');
      box.style.display = box.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('btn-serr-send-task')?.addEventListener('click', async () => {
      if (!itemParaDetalhes) return;
      const titulo = document.getElementById('serr-task-title').value.trim();
      const desc = document.getElementById('serr-task-desc').value.trim();
      const email = document.getElementById('serr-task-user').value;
      const usuarios = await getUsuariosAprovados();
      const dest = usuarios.find((u) => u.email === email);
      if (!titulo || !dest) return showToast('Informe título e usuário da tarefa.', 'error');

      await addDoc(collection(db, 'tarefas'), {
        setor: 'serralheria',
        tipo: 'Card',
        resumo: titulo,
        descricao: desc,
        extras: {},
        status: 'pendente',
        destinatarioEmail: dest.email,
        destinatarioNome: dest.nome,
        solicitanteEmail: userMe.email,
        solicitanteNome: userMe.nome,
        cardAlvo: {
          id: itemParaDetalhes.id,
          setor: 'serralheria',
          label: `${itemParaDetalhes.categoria} (${itemParaDetalhes.id})`,
          link: qrDeepLink(itemParaDetalhes.id)
        },
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        concluida_em: null,
        concluida_por: null
      });
      document.getElementById('serr-task-box').style.display = 'none';
      showToast('Tarefa vinculada à chapa!', 'success');
    });

    onSnapshot(coresConfigRef, (snap) => {
      const d = snap.exists() ? snap.data() : {};
      mapaCoresMateriais = d?.mapa && typeof d.mapa === 'object' ? d.mapa : {};
      renderCardsSerralheria();
    });

    onSnapshot(query(collection(db, 'estoque'), where('setor', '==', 'serralheria')), (snap) => {
      produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const ativos = produtos.filter((p) => !p.arquivado);
      itensArquivoMorto = produtos.filter((p) => !!p.arquivado);
      categoriasDinamicas = [...new Set(ativos.map((p) => p.categoria).filter(Boolean))];
      coresDinamicas = [...new Set(ativos.map((p) => p.cor).filter(Boolean))];
      renderPillsMateriais();
      renderCardsSerralheria();
      renderArquivoMorto();
    });
  }

  return {
    activate: bindEventsOnce,
    openItemById: (itemId) => {
      const found = produtos.find((x) => x.id === itemId);
      if (!found) return false;
      abrirModalDetalhesSerr(itemId);
      return true;
    }
  };
}
