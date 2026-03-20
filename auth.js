import { db } from "./config.js";
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
    paginas: ["index.html", "os.html", "lista.html", "orcamentos.html", "tarefas.html"]
  },
  instalacao: {
    label: "Instalação",
    paginas: ["index.html", "estimpressao.html", "estserralheria.html", "estpintura.html", "tarefas.html"]
  },
  administracao: {
    label: "Administração",
    paginas: [
      "index.html",
      "os.html",
      "lista.html",
      "orcamentos.html",
      "estimpressao.html",
      "estserralheria.html",
      "estpintura.html",
      "admin-acessos.html",
      "tarefas.html"
    ]
  }
};


export const MODULOS_MENU = [
  { pagina: "os.html", label: "Gerar O.S." },
  { pagina: "lista.html", label: "Lista de O.S." },
  { pagina: "orcamentos.html", label: "Orçamentos" },
  { pagina: "estimpressao.html", label: "Impressão" },
  { pagina: "estserralheria.html", label: "Serralheria" },
  { pagina: "estpintura.html", label: "Pintura" },
  { pagina: "admin-acessos.html", label: "Gerenciamento de Acessos" },
  { pagina: "tarefas.html", label: "Tarefas" }
];

const VISIBILIDADE_PADRAO = {
  producao: {
    "os.html": true,
    "lista.html": true,
    "orcamentos.html": true,
    "estimpressao.html": false,
    "estserralheria.html": false,
    "estpintura.html": false,
    "admin-acessos.html": false,
    "tarefas.html": true
  },
  instalacao: {
    "os.html": false,
    "lista.html": false,
    "orcamentos.html": false,
    "estimpressao.html": true,
    "estserralheria.html": true,
    "estpintura.html": true,
    "admin-acessos.html": false,
    "tarefas.html": true
  },
  administracao: {
    "os.html": true,
    "lista.html": true,
    "orcamentos.html": true,
    "estimpressao.html": true,
    "estserralheria.html": true,
    "estpintura.html": true,
    "admin-acessos.html": true,
    "tarefas.html": true
  }
};

function normalizarConfiguracaoCategorias(categorias = {}) {
  const base = structuredClone(VISIBILIDADE_PADRAO);

  for (const categoria of Object.keys(base)) {
    for (const pagina of Object.keys(base[categoria])) {
      if (typeof categorias?.[categoria]?.[pagina] === "boolean") {
        base[categoria][pagina] = categorias[categoria][pagina];
      }
    }
  }

  return base;
}

export async function obterConfiguracaoCategorias() {
  const ref = doc(db, "system_config", "menu_categorias");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const categorias = structuredClone(VISIBILIDADE_PADRAO);
    await setDoc(ref, { categorias, created_at: serverTimestamp(), updated_at: serverTimestamp() }, { merge: true });
    return categorias;
  }

  const categorias = normalizarConfiguracaoCategorias(snap.data()?.categorias);
  await setDoc(ref, { categorias, updated_at: serverTimestamp() }, { merge: true });
  return categorias;
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

function lerSessao() {
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

  await setDoc(ref, {
    nome: atual.nome || ADMIN_PADRAO.nome,
    email: atual.email || ADMIN_PADRAO.email,
    categoria: atual.categoria || ADMIN_PADRAO.categoria,
    senha_hash: atual.senha_hash || ADMIN_PADRAO.senhaHash,
    status: "approved",
    blocked: false,
    created_at: atual.created_at || serverTimestamp(),
    updated_at: serverTimestamp()
  }, { merge: true });
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

  salvarSessao({ email: acesso.email, nome: acesso.nome, categoria: acesso.categoria });
  return { ok: true, acesso };
}

export function logout() {
  localStorage.removeItem(SESSAO_KEY);
  window.location.replace("login.html");
}

function paginaPermitidaParaPerfil({ perfil, paginaAtual, categoriasConfig }) {
  if (!paginaAtual || paginaAtual === "index.html") {
    return true;
  }

  const regraCategorias = categoriasConfig?.[perfil]?.[paginaAtual];
  if (typeof regraCategorias === "boolean") {
    return regraCategorias;
  }

  const paginasPadrao = PERFIS?.[perfil]?.paginas || [];
  return paginasPadrao.includes(paginaAtual);
}

export async function protegerPagina({ paginaAtual, exigirAdmin = false } = {}) {
  const sessao = lerSessao();
  if (!sessao?.email) {
    window.location.replace("login.html");
    return null;
  }

  const acesso = await obterAcessoPorEmail(sessao.email);

  if (!acesso || acesso.status !== "approved") {
    logout();
    return null;
  }

  if (acesso.blocked) {
    logout();
    return null;
  }

  const perfil = acesso.categoria;
  const admin = perfil === "administracao";
  const categoriasConfig = await obterConfiguracaoCategorias();
  const permitido = paginaPermitidaParaPerfil({ perfil, paginaAtual, categoriasConfig });

  if (exigirAdmin && !admin) {
    window.location.replace("index.html");
    return null;
  }

  if (paginaAtual && !permitido && !admin) {
    window.location.replace("index.html");
    return null;
  }

  return { user: { email: acesso.email, displayName: acesso.nome }, acesso };
}
