// --- config.js ---
// Este arquivo centraliza a conexão com o banco de dados e as rotas do sistema.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. CONFIGURAÇÃO CENTRAL DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBxG9GNxfJxWiw8hpreTeShrG009svRmPI",
    authDomain: "artesynal-os-system.firebaseapp.com",
    projectId: "artesynal-os-system",
    storageBucket: "artesynal-os-system.firebasestorage.app",
    messagingSenderId: "539958005846",
    appId: "1:539958005846:web:9120505e097b56bf16ebf7"
};

// Inicializa o Firebase apenas uma vez aqui
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 2. NOMES DAS PÁGINAS (ROTAS)
// Se precisar mudar o nome de alguma página no futuro, mude apenas aqui!
export const ROTAS = {
    painel: "index.html",
    os: "os.html",
    lista: "lista.html",
    estoque: "estoque.html",
    orcamentos: "orcamentos.html",
    solicitacao: "solicitacao.html"
};
