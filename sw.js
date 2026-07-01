const CACHE_NAME = 'artesynal-os-v1';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './config.js',
  './auth.js',
  './task-shortcut.js'
];

// Instala o Service Worker e cacheia a casca do app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Aviso: Alguns arquivos estáticos não foram cacheados no install (sem problemas):', err);
      });
    })
  );
  self.skipWaiting();
});

// Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia Network-First com Fallback do Cache (ideal para app integrado ao Firebase)
self.addEventListener('fetch', (event) => {
  // Ignora requisições de APIs externas (como Firestore, Analytics) para evitar problemas no cache local
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a resposta for válida, clona e atualiza no cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se estiver offline ou falhar na rede, tenta o cache local
        return caches.match(event.request);
      })
  );
});
