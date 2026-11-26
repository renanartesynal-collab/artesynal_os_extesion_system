// ============================================================================
// IMPORTADOR DE PDF MUBI -> AUTO-PREENCHIMENTO DA ORDEM DE SERVIÇO (ARTE SYNAL)
// Carrega PDF.js sob demanda (sem impactar o tempo de abertura da página) e usa
// coordenadas (x, y) para extrair com precisão os 8 campos mapeados do Mubi.
// ============================================================================

const PDFJS_SOURCES = [
  {
    lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs'
  },
  {
    lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'
  }
];

let pdfjsLibPromise = null;

async function carregarPdfJs() {
  if (pdfjsLibPromise) return pdfjsLibPromise;

  pdfjsLibPromise = (async () => {
    let ultimoErro = null;
    for (const src of PDFJS_SOURCES) {
      try {
        const mod = await import(src.lib);
        if (mod && mod.GlobalWorkerOptions) {
          mod.GlobalWorkerOptions.workerSrc = src.worker;
        }
        return mod;
      } catch (err) {
        ultimoErro = err;
      }
    }
    pdfjsLibPromise = null;
    throw ultimoErro || new Error('Não foi possível carregar o leitor de PDF.');
  })();

  return pdfjsLibPromise;
}

/**
 * Agrupa itens de texto de uma página por linha visual (coordenada Y)
 * ordenando de cima para baixo (Y decrescente) e da esquerda para a direita (X crescente).
 */
function agruparEmLinhas(itens, toleranciaY = 3.5) {
  const validos = itens
    .map((it) => {
      const str = String(it.str || '').replace(/\s+/g, ' ').trim();
      const x = Number(it.transform?.[4] || 0);
      const y = Number(it.transform?.[5] || 0);
      const w = Number(it.width || 0);
      const h = Math.abs(Number(it.transform?.[3] || it.height || 10));
      return { str, x, y, w, h };
    })
    .filter((it) => it.str.length > 0)
    .sort((a, b) => (Math.abs(b.y - a.y) > toleranciaY ? b.y - a.y : a.x - b.x));

  const linhas = [];
  for (const item of validos) {
    let linha = linhas.find((l) => Math.abs(l.y - item.y) <= toleranciaY);
    if (!linha) {
      linha = { y: item.y, items: [] };
      linhas.push(linha);
    }
    linha.items.push(item);
  }

  for (const l of linhas) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }

  return linhas;
}

function juntarItens(items) {
  return items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarDataCurta(dia, mes, ano) {
  const dd = String(dia || '').padStart(2, '0').slice(0, 2);
  const mm = String(mes || '').padStart(2, '0').slice(0, 2);
  const yy = String(ano || '').slice(-2).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
}

function normalizarTelefoneBrasil(raw) {
  if (!raw) return '';
  let texto = String(raw).trim();
  // Remove DDI +55 ou 55 antes de (DDD) (ex: +55 (41) 99916-2164 ou 55 (41) 99916-2164)
  texto = texto.replace(/^\+?\s*55\s*(?=\(\d{2}\))/, '');
  texto = texto.replace(/^\+\s*55[\s.-]*/, '');

  let digitos = texto.replace(/\D/g, '');
  // Remove DDI 55 sem "+" quando houver 12 ou 13 dígitos (55 + DDD + 8/9 dígitos)
  if (digitos.length >= 12 && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  digitos = digitos.slice(0, 11);
  if (!digitos) return '';
  if (digitos.length <= 2) return `(${digitos}`;
  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  if (numero.length <= 4) return `(${ddd}) ${numero}`;
  const corte = numero.length > 8 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/**
 * Extrai a seção de descrição dos itens ("Descrição cliente") de todas as páginas.
 */
function extrairDescricaoCliente(paginasLinhas) {
  const blocos = [];

  for (const linhas of paginasLinhas) {
    let i = 0;
    while (i < linhas.length) {
      const linha = linhas[i];
      const ehCabecalhoDesc = /descri[çc][ãa]o\s+cliente/i.test(linha.text);
      const itemDescHeader = ehCabecalhoDesc
        ? linha.items.find((it) => /descri[çc][ãa]o/i.test(it.str))
        : null;
      if (!itemDescHeader) {
        i++;
        continue;
      }

      const itemObsHeader = linha.items.find((it) => /observa[çc][õo]es/i.test(it.str));
      const itemQtdHeader = linha.items.find((it) => /^quantidade$/i.test(it.str));

      const xMin = itemDescHeader.x - 8;
      const xMax = itemObsHeader
        ? itemObsHeader.x - 8
        : itemQtdHeader
          ? itemQtdHeader.x - 12
          : Infinity;

      const linhasBloco = [];
      let j = i + 1;
      while (j < linhas.length) {
        const l = linhas[j];
        // Para ao encontrar a subtabela de produto, questionário, rodapé ou novo cabeçalho
        const ehParada =
          (l.items.some((it) => /^produto$/i.test(it.str)) && l.items.some((it) => /^modelo$/i.test(it.str))) ||
          /^question[áa]rio$/i.test(l.text) ||
          /^autorizado\s+por\s*:/i.test(l.text) ||
          /descri[çc][ãa]o\s+cliente/i.test(l.text);

        if (ehParada) break;

        const itensColuna = l.items.filter((it) => it.x >= xMin && it.x < xMax);
        const textoLinha = juntarItens(itensColuna);
        if (textoLinha) {
          linhasBloco.push(textoLinha);
        }
        j++;
      }

      if (linhasBloco.length) {
        blocos.push(linhasBloco.join('\n'));
      }
      i = j;
    }
  }

  return blocos.join('\n\n').trim();
}

/**
 * Lê um arquivo PDF do Mubi (File/Blob) e retorna os 8 campos mapeados:
 * 1: empresa (Cliente)
 * 2: cliente (Contato)
 * 3: telefone (Telefone)
 * 4: osNumero (Ordem de serviço nº)
 * 5: dataAprovacao (Aprovação -> DD/MM/AA)
 * 6: dataEntrega (Entrega -> DD/MM/AA)
 * 7: servico (Ref.)
 * 8: descricao (Descrição cliente)
 */
export async function extrairDadosPdfMubi(file) {
  const pdfjsLib = await carregarPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const paginasLinhas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    paginasLinhas.push(agruparEmLinhas(content.items));
  }

  const linhasP1 = paginasLinhas[0] || [];
  const textoP1 = linhasP1.map((l) => l.text).join('\n');

  const resultado = {
    empresa: '',
    cliente: '',
    telefone: '',
    osNumero: '',
    dataAprovacao: '',
    dataEntrega: '',
    servico: '',
    descricao: ''
  };

  // --- 4. Nº da O.S. (Ordem de serviço nº XXXX) ---
  const mOs = textoP1.match(/ordem\s+de\s+servi[çc]o\s*n[º°o.]*\s*(\d+)/i);
  if (mOs) resultado.osNumero = mOs[1].trim();

  // --- 5. Data de Aprovação (Aprovação: DD/MM/AAAA ...) ---
  const mAprov = textoP1.match(/aprova[çc][ãa]o\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (mAprov) resultado.dataAprovacao = normalizarDataCurta(mAprov[1], mAprov[2], mAprov[3]);

  // --- 6. Data de Entrega (Entrega: DD/MM/AAAA) ---
  const mEnt = textoP1.match(/entrega\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (mEnt) resultado.dataEntrega = normalizarDataCurta(mEnt[1], mEnt[2], mEnt[3]);

  // --- 7. Nome do Serviço (Ref. ...) ---
  for (const l of linhasP1) {
    const idxRef = l.items.findIndex((it) => /^ref\.?(\s|$)/i.test(it.str));
    if (idxRef !== -1) {
      const textoRef = juntarItens(l.items.slice(idxRef)).replace(/^ref\.?\s*/i, '').trim();
      if (textoRef) {
        resultado.servico = textoRef;
        break;
      }
    }
  }
  if (!resultado.servico) {
    const mRef = textoP1.match(/\bref\.?\s*([^\n]+)/i);
    if (mRef) resultado.servico = mRef[1].trim();
  }

  // --- 1, 2, 3. Bloco de colunas: Cliente (Empresa) | Contato (Cliente) | Telefone ---
  const linhaLabels = linhasP1.find(
    (l) =>
      l.items.some((it) => /^cliente$/i.test(it.str)) &&
      (l.items.some((it) => /^contato$/i.test(it.str)) || l.items.some((it) => /^telefone$/i.test(it.str)))
  );

  if (linhaLabels) {
    const lblCliente = linhaLabels.items.find((it) => /^cliente$/i.test(it.str));
    const lblContato = linhaLabels.items.find((it) => /^contato$/i.test(it.str));
    const lblTelefone = linhaLabels.items.find((it) => /^telefone$/i.test(it.str));

    const yTopo = linhaLabels.y;
    // Encontra o limite inferior desse bloco (linha CNPJ/CPF ou Endereço, ou até 38pt abaixo)
    const linhaInferior = linhasP1.find(
      (l) =>
        l.y < yTopo - 4 &&
        l.items.some((it) => /^(cnpj|cpf|endere[çc]o|entrega\s*:)/i.test(it.str))
    );
    const yBase = linhaInferior ? linhaInferior.y + 2 : yTopo - 38;

    const linhasValores = linhasP1.filter((l) => l.y < yTopo - 2 && l.y > yBase);

    const xContato = lblContato ? lblContato.x - 10 : Infinity;
    const xTelefone = lblTelefone ? lblTelefone.x - 10 : Infinity;

    const partesEmpresa = [];
    const partesContato = [];
    const partesTelefone = [];

    for (const lv of linhasValores) {
      if (lblCliente) {
        const tEmp = juntarItens(lv.items.filter((it) => it.x < Math.min(xContato, xTelefone)));
        if (tEmp) partesEmpresa.push(tEmp);
      }
      if (lblContato) {
        const tCont = juntarItens(lv.items.filter((it) => it.x >= xContato && it.x < xTelefone));
        if (tCont) partesContato.push(tCont);
      }
      if (lblTelefone) {
        const tTel = juntarItens(lv.items.filter((it) => it.x >= xTelefone));
        if (tTel) partesTelefone.push(tTel);
      }
    }

    resultado.empresa = partesEmpresa.join(' ').trim();
    resultado.cliente = partesContato.join(' ').trim();
    resultado.telefone = normalizarTelefoneBrasil(partesTelefone.join(' '));
  }

  // Fallback de telefone caso o cabeçalho esteja diferente
  if (!resultado.telefone) {
    const mTel = textoP1.match(/(?:\+55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/);
    if (mTel) resultado.telefone = normalizarTelefoneBrasil(mTel[0]);
  }

  // --- 8. Descrição Técnica / Observações (Descrição cliente) ---
  resultado.descricao = extrairDescricaoCliente(paginasLinhas);

  return resultado;
}
