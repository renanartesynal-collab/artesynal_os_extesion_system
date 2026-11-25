// --- js/core/config.js ---
// Conexão central com o Firebase (com cache local persistente IndexedDB), Cloudinary e rotas

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 1. CONFIGURAÇÃO DO FIREBASE (100% compatível com os dados existentes)
export const firebaseConfig = {
  apiKey: "AIzaSyBxG9GNxfJxWiw8hpreTeShrG009svRmPI",
  authDomain: "artesynal-os-system.firebaseapp.com",
  projectId: "artesynal-os-system",
  storageBucket: "artesynal-os-system.firebasestorage.app",
  messagingSenderId: "539958005846",
  appId: "1:539958005846:web:9120505e097b56bf16ebf7"
};

export const app = initializeApp(firebaseConfig);

// Cache persistente em IndexedDB: carregamentos subsequentes abrem instantaneamente
// e sincronizam apenas documentos novos/alterados com o servidor.
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  firestoreInstance = getFirestore(app);
}
export const db = firestoreInstance;
export const storage = getStorage(app);

// 2. SERVIDOR EXTERNO DE VÍDEOS (Cloudinary)
export const CLOUDINARY_VIDEO_UPLOAD_URL = "https://api.cloudinary.com/v1_1/afsnn9df/video/upload";
export const CLOUDINARY_VIDEO_PRESET = "artesynal_videos";

// 3. RESOLVEDOR DE URL ABSOLUTA A PARTIR DA RAIZ DO PROJETO (Funciona em subpastas do GitHub Pages e localhost)
export const APP_ROOT_URL = new URL("../../", import.meta.url).href;

export function appUrl(relativePath = "") {
  return new URL(String(relativePath || "").replace(/^\//, ""), APP_ROOT_URL).href;
}

// 4. MAPA CENTRAL DE ROTAS DO SISTEMA
export const ROTAS = {
  painel: appUrl("index.html"),
  login: appUrl("pages/auth/login.html"),
  adminAcessos: appUrl("pages/auth/admin-acessos.html"),
  os: appUrl("pages/os/os.html"),
  servicosAbertos: appUrl("pages/os/os.html?view=abertos"),
  lista: appUrl("pages/os/os.html?view=lista"),
  medidasVisitas: appUrl("pages/visitas/medidas-visitas.html"),
  detalhesVisita: appUrl("pages/visitas/detalhes-visita.html"),
  materiais: appUrl("pages/materiais/materiais.html"),
  impressao: appUrl("pages/materiais/materiais.html?setor=impressao"),
  serralheria: appUrl("pages/materiais/materiais.html?setor=serralheria"),
  estoque: appUrl("pages/materiais/materiais.html?setor=estoque"),
  pintura: appUrl("pages/pintura/pintura.html"),
  tarefas: appUrl("pages/tarefas/tarefas.html"),
  logo: appUrl("assets/img/logo-artesynal.png")
};
