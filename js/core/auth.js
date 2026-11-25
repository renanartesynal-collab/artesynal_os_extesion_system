// --- js/core/auth.js ---
// Autenticação, sessões e controle de permissões por perfil (compatível com os registros existentes no Firebase)

import { db, ROTAS } from "./config.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const SESSAO_KEY = "artesynal_session";

const ADMIN_PADRAO = {
  email: "wartesynal@gmail.com",
  nome: "warte",
  senhaHash: "d698de9e71d6f74167eeaca437370d1be6cacfcef16f2e61e2eb97b3017747b7",
  categoria: "administracao"
};

export const PERFIS = {
  producao: {
    label: "Produção",
    paginas: [
      "index.html",
      "os.html",
      "medidas-visitas.html",
      "detalhes-visita.html",
      "materiais.html",
      "estoque.html",
      "tarefas.html"
    ]
  },
  instalacao: {
    label: "Instalação",
    paginas: [
      "index.html",
      "medidas-visitas.html",
      "detalhes-visita.html",
      "materiais.html",
      "estimpressao.html",
      "estserralheria.html",
      "estpintura.html",
      "estoque.html",
      "tarefas.html"
    ]
  },
  administracao: {
    label: "Administração",
    paginas: [
      "index.html",
      "os.html",
      "medidas-visitas.html",
      "detalhes-visita.html",
      "materiais.html",
      "estimpressao.html",
      "estserralheria.html",
      "estpintura.html",
      "estoque.html",
      "admin-acessos.html",
      "tarefas.html"
    ]
  }
};

// Chaves mantidas idênticas ao documento system_config/menu_categorias para preservar permissões antigas
export const MODULOS_MENU = [
  { pagina: "os.html", label: "Ordens de Serviço (Gerar & Lista)" },
  { pagina: "medidas-visitas.html", label: "Medidas / Visitas Técnicas" },
  { pagina: "estimpressao.html", label: "Materiais — Aba Impressão" },
  { pagina: "estserralheria.html", label: "Materiais — Aba Serralheria" },
  { pagina: "estoque.html", label: "Materiais — Aba Estoque Geral" },
  { pagina: "estpintura.html", label: "Setor de Pintura" },
  { pagina: "tarefas.html", label: "Painel de Tarefas" },
  { pagina: "admin-acessos.html", label: "Gerenciamento de Acessos" }
];

export function normalizarPerfilCategoria(categoria) {
  const bruto = String(categoria || "").trim().toLowerCase();
  const ascii = bruto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (ascii === "producao") return "producao";
  if (ascii === "instalacao") return "instalacao";
  if (ascii === "administracao" || ascii === "admin") return "administracao";

  return "";
}

const VISIBILIDADE_PADRAO = {
  producao: {
    "os.html": true,
    "lista.html": true,
    "medidas-visitas.html": true,
    "detalhes-visita.html": true,
    "materiais.html": true,
    "estimpressao.html": false,
    "estserralheria.html": false,
    "estpintura.html": false,
    "estoque.html": true,
    "admin-acessos.html": false,
    "tarefas.html": true
  },
  instalacao: {
    "os.html": false,
    "lista.html": false,
    "medidas-visitas.html": true,
    "detalhes-visita.html": true,
    "materiais.html": true,
    "estimpressao.html": true,
    "estserralheria.html": true,
    "estpintura.html": true,
    "estoque.html": true,
    "admin-acessos.html": false,
    "tarefas.html": true
  },
  administracao: {
    "os.html": true,
    "lista.html": true,
    "medidas-visitas.html": true,
    "detalhes-visita.html": true,
    "materiais.html": true,
    "estimpressao.html": true,
    "estserralheria.html": true,
    "estpintura.html": true,
    "estoque.html": true,
    "admin-acessos.html": true,
    "tarefas.html": true
  }
};

function normalizarConfiguracaoCategorias(categorias = {}) {
  const base = structuredClone(VISIBILIDADE_PADRAO);

  for (const perfil of Object.keys(base)) {
    for (const pagina of Object.keys(base[perfil])) {
      if (typeof categorias?.[perfil]?.[pagina] === "boolean") {
        base[perfil][pagina] = categorias[perfil][pagina];
      }
    }
    if (categorias?.[perfil]?.["lista.html"] === true && typeof categorias?.[perfil]?.["os.html"] !== "boolean") {
      base[perfil]["os.html"] = true;
    }
    base[perfil]["lista.html"] = base[perfil]["os.html"];
    base[perfil]["detalhes-visita.html"] = base[perfil]["medidas-visitas.html"];
    base[perfil]["materiais.html"] = Boolean(
      base[perfil]["estimpressao.html"] ||
      base[perfil]["estserralheria.html"] ||
      base[perfil]["estoque.html"]
    );
  }

  return base;
}

export async function obterConfiguracaoCategorias() {
  const ref = doc(db, "system_config", "menu_categorias");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const categorias = normalizarConfiguracaoCategorias({});
    await setDoc(ref, { categorias, created_at: serverTimestamp(), updated_at: serverTimestamp() }, { merge: true });
    return categorias;
  }

  return normalizarConfiguracaoCategorias(snap.data()?.categorias);
}

export async function salvarConfiguracaoCategorias(categorias) {
  const ref = doc(db, "system_config", "menu_categorias");
  const normalizada = normalizarConfiguracaoCategorias(categorias);
  await setDoc(ref, { categorias: normalizada, updated_at: serverTimestamp() }, { merge: true });
  return normalizada;
}

export function emailParaId(email) {
  return btoa(unescape(encodeURIComponent(email.trim().toLowerCase())))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function hashSenha(senha) {
  const bytes = new TextEncoder().encode(senha);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function obterAcessoPorEmail(email) {
  const ref = doc(db, "access_requests", emailParaId(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

function salvarSessao(sessao) {
  localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao));
}

export function lerSessaoLocal() {
  try {
    return JSON.parse(localStorage.getItem(SESSAO_KEY) || "null");
  } catch {
    return null;
  }
}

export async function garantirAdministradorPadrao() {
  const id = emailParaId(ADMIN_PADRAO.email);
  const ref = doc(db, "access_requests", id);
  const snap = await getDoc(ref);
  const atual = snap.exists() ? snap.data() : {};

  if (!snap.exists() || atual.status !== "approved" || atual.blocked) {
    await setDoc(ref, {
      nome: atual.nome || ADMIN_PADRAO.nome,
      email: atual.email || ADMIN_PADRAO.email,
      categoria: normalizarPerfilCategoria(atual.categoria) || ADMIN_PADRAO.categoria,
      senha_hash: atual.senha_hash || ADMIN_PADRAO.senhaHash,
      status: "approved",
      blocked: false,
      created_at: atual.created_at || serverTimestamp(),
      updated_at: serverTimestamp()
    }, { merge: true });
  }
}

export async function registrarTentativa({ email, nome = "", motivo, categoria = "" }) {
  await addDoc(collection(db, "access_attempts"), {
    email: (email || "").trim().toLowerCase(),
    nome,
    categoria,
    motivo,
    created_at: serverTimestamp()
  });
}

export async function realizarLogin(email, senha) {
  await garantirAdministradorPadrao();

  const emailNormalizado = (email || "").trim().toLowerCase();

  if (!emailNormalizado || !senha) {
    return { ok: false, codigo: "dados-invalidos", mensagem: "Informe e-mail e senha para continuar." };
  }

  const acesso = await obterAcessoPorEmail(emailNormalizado);
  const senhaHash = await hashSenha(senha);

  if (!acesso) {
    await registrarTentativa({ email: emailNormalizado, motivo: "email_nao_cadastrado" });
    return { ok: false, codigo: "nao-cadastrado", mensagem: "Usuário não encontrado. Faça o primeiro cadastro." };
  }

  if (acesso.blocked) {
    await registrarTentativa({ email: emailNormalizado, nome: acesso.nome, categoria: acesso.categoria, motivo: "usuario_bloqueado" });
    return { ok: false, codigo: "bloqueado", mensagem: "Seu acesso está bloqueado pela administração." };
  }

  if (acesso.status !== "approved") {
    await registrarTentativa({ email: emailNormalizado, nome: acesso.nome, categoria: acesso.categoria, motivo: "usuario_nao_aprovado" });
    return { ok: false, codigo: "pendente", mensagem: "Cadastro pendente de aprovação." };
  }

  if (acesso.senha_hash !== senhaHash) {
    await registrarTentativa({ email: emailNormalizado, nome: acesso.nome, categoria: acesso.categoria, motivo: "senha_incorreta" });
    return { ok: false, codigo: "senha-incorreta", mensagem: "Senha inválida." };
  }

  const categoriaNormalizada = normalizarPerfilCategoria(acesso.categoria) || acesso.categoria;
  salvarSessao({ email: acesso.email, nome: acesso.nome, categoria: categoriaNormalizada });
  return { ok: true, acesso };
}

export function logout() {
  localStorage.removeItem(SESSAO_KEY);
  window.location.replace(ROTAS.login);
}

export function paginaPermitidaParaPerfil({ perfil, paginaAtual, categoriasConfig }) {
  const chave = (paginaAtual || "").split("/").pop();
  if (!chave || chave === "index.html") {
    return true;
  }

  if (chave === "pintura.html" || chave === "estpintura.html") {
    return Boolean(categoriasConfig?.[perfil]?.["estpintura.html"]);
  }

  if (chave === "materiais.html") {
    return Boolean(
      categoriasConfig?.[perfil]?.["materiais.html"] ||
      categoriasConfig?.[perfil]?.["estimpressao.html"] ||
      categoriasConfig?.[perfil]?.["estserralheria.html"] ||
      categoriasConfig?.[perfil]?.["estoque.html"]
    );
  }

  if (chave === "os.html") {
    return Boolean(
      categoriasConfig?.[perfil]?.["os.html"] ||
      categoriasConfig?.[perfil]?.["lista.html"]
    );
  }

  if (chave === "detalhes-visita.html") {
    return Boolean(
      categoriasConfig?.[perfil]?.["detalhes-visita.html"] ??
      categoriasConfig?.[perfil]?.["medidas-visitas.html"] ??
      true
    );
  }

  const regraCategorias = categoriasConfig?.[perfil]?.[chave];
  if (typeof regraCategorias === "boolean") {
    return regraCategorias;
  }

  return (PERFIS?.[perfil]?.paginas || []).includes(chave);
}

export function renderizarIlhaMobile({ perfil, categoriasConfig, paginaAtual }) {
  if (typeof document === "undefined") return;
  const existente = document.getElementById("artesynal-mobile-dock");
  if (existente) existente.remove();

  const chave = (paginaAtual || "").split("/").pop() || "index.html";
  const can = (p) => perfil === "administracao" || categoriasConfig?.[perfil]?.[p] === true;

  const canImp = can("estimpressao.html");
  const canSerr = can("estserralheria.html");
  const canEst = can("estoque.html");
  const setorMat = canImp ? "impressao" : canSerr ? "serralheria" : "estoque";

  const itens = [
    { id: "painel", label: "Início", icon: "🏠", href: ROTAS.painel, ativo: chave === "index.html", visivel: true },
    { id: "os", label: "O.S.", icon: "📝", href: ROTAS.os, ativo: chave === "os.html", visivel: can("os.html") || can("lista.html") },
    { id: "visitas", label: "Visitas", icon: "📏", href: ROTAS.medidasVisitas, ativo: chave === "medidas-visitas.html" || chave === "detalhes-visita.html", visivel: can("medidas-visitas.html") },
    { id: "materiais", label: "Materiais", icon: "📦", href: `${ROTAS.materiais}?setor=${setorMat}`, ativo: chave === "materiais.html", visivel: canImp || canSerr || canEst },
    { id: "pintura", label: "Pintura", icon: "🎨", href: ROTAS.pintura, ativo: chave === "pintura.html" || chave === "estpintura.html", visivel: can("estpintura.html") },
    { id: "tarefas", label: "Tarefas", icon: "✅", href: ROTAS.tarefas, ativo: chave === "tarefas.html", visivel: can("tarefas.html") },
    { id: "acessos", label: "Acessos", icon: "🔐", href: ROTAS.adminAcessos, ativo: chave === "admin-acessos.html", visivel: can("admin-acessos.html") }
  ].filter((x) => x.visivel);

  const nav = document.createElement("nav");
  nav.id = "artesynal-mobile-dock";
  nav.className = "mobile-pill-dock";
  nav.setAttribute("aria-label", "Navegação rápida entre painéis");
  nav.innerHTML = itens.map((it) => `
    <a href="${it.href}" class="mobile-dock-item ${it.ativo ? "active" : ""}" ${it.ativo ? 'aria-current="page"' : ""}>
      <span class="mobile-dock-icon">${it.icon}</span>
      <span>${it.label}</span>
    </a>
  `).join("");

  document.body.classList.add("has-mobile-dock");
  document.body.appendChild(nav);

  requestAnimationFrame(() => {
    nav.querySelector(".mobile-dock-item.active")?.scrollIntoView({ inline: "center", block: "nearest" });
  });
}

export async function protegerPagina({ paginaAtual, exigirAdmin = false } = {}) {
  const sessao = lerSessaoLocal();
  if (!sessao?.email) {
    window.location.replace(ROTAS.login);
    return null;
  }

  const acesso = await obterAcessoPorEmail(sessao.email);

  if (!acesso || acesso.status !== "approved" || acesso.blocked) {
    logout();
    return null;
  }

  const perfil = normalizarPerfilCategoria(acesso.categoria) || acesso.categoria;
  const admin = perfil === "administracao";
  const categoriasConfig = await obterConfiguracaoCategorias();
  const permitido = paginaPermitidaParaPerfil({ perfil, paginaAtual, categoriasConfig });

  if (exigirAdmin && !admin) {
    window.location.replace(ROTAS.painel);
    return null;
  }

  if (paginaAtual && !permitido && !admin) {
    window.location.replace(ROTAS.painel);
    return null;
  }

  renderizarIlhaMobile({ perfil, categoriasConfig, paginaAtual });

  return {
    user: { email: acesso.email, displayName: acesso.nome },
    acesso: { ...acesso, categoria: perfil },
    categoriasConfig
  };
}
