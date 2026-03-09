import { auth, db } from "./config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const PERFIS = {
  producao: {
    label: "Produção",
    paginas: ["os.html", "lista.html", "orcamentos.html"]
  },
  instalacao: {
    label: "Instalação",
    paginas: ["estimpressao.html", "estserralheria.html"]
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

export async function obterAcessoUsuario(uid) {
  const ref = doc(db, "access_requests", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

export function protegerPagina({ paginaAtual, exigirAdmin = false } = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "login.html";
        resolve(null);
        return;
      }

      const acesso = await obterAcessoUsuario(user.uid);

      if (!acesso || acesso.status !== "approved") {
        window.location.href = "login.html?status=pending";
        resolve(null);
        return;
      }

      if (acesso.blocked) {
        window.location.href = "login.html?status=blocked";
        resolve(null);
        return;
      }

      const perfil = acesso.categoria;
      const permitido = PERFIS[perfil]?.paginas?.includes(paginaAtual);
      const admin = perfil === "administracao";

      if (exigirAdmin && !admin) {
        window.location.href = "index.html";
        resolve(null);
        return;
      }

      if (paginaAtual && !permitido && !admin) {
        alert("Você não tem acesso a esta área.");
        window.location.href = "index.html";
        resolve(null);
        return;
      }

      resolve({ user, acesso });
    });
  });
}

export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}
