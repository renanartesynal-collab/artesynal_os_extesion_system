import { db } from "./config.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const SESSAO_KEY = "artesynal_session";

export const PERFIS = {
  producao: {
    label: "Produção",
    paginas: ["index.html", "os.html", "lista.html", "orcamentos.html"]
  },
  instalacao: {
    label: "Instalação",
    paginas: ["index.html", "estimpressao.html", "estserralheria.html"]
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
      "admin-acessos.html"
    ]
  }
};

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
    await registrarTentativa({ email, nome: acesso.nome, categoria: acesso.categoria, motivo: "usuario_bloqueado" });
    return { ok: false, codigo: "bloqueado", mensagem: "Seu acesso está bloqueado pela administração." };
  }

  if (acesso.status !== "approved") {
    await registrarTentativa({ email, nome: acesso.nome, categoria: acesso.categoria, motivo: "usuario_nao_aprovado" });
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
  const permitido = PERFIS[perfil]?.paginas?.includes(paginaAtual);
  const admin = perfil === "administracao";

  if (exigirAdmin && !admin) {
    window.location.replace("index.html");
    return null;
  }

  if (paginaAtual && !permitido && !admin) {
    alert("Você não tem acesso a esta área.");
    window.location.replace("index.html");
    return null;
  }

  return { user: { email: acesso.email, displayName: acesso.nome }, acesso };
}
