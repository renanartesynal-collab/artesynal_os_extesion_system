const CACHE_NAME = 'artesynal-pcp-v2.8';
const ASSETS = [
  './',
  './index.html',
  './404.html',
  './manifest.json',
  './assets/css/theme.css',
  './assets/img/logo-artesynal.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
  './assets/img/icon-192-maskable.png',
  './assets/img/icon-512-maskable.png',
  './js/core/config.js',
  './js/core/auth.js',
  './js/core/theme.js',
  './js/core/task-shortcut.js',
  './js/os/mubi-pdf-importer.js',
  './js/materiais/impressao.js',
  './js/materiais/serralheria.js',
  './js/materiais/estoque.js',
  './js/tarefas/cards.js',
  './pages/auth/login.html',
  './pages/auth/admin-acessos.html',
  './pages/os/os.html',
  './pages/visitas/medidas-visitas.html',
  './pages/visitas/detalhes-visita.html',
  './pages/materiais/materiais.html',
  './pages/pintura/pintura.html',
  './pages/tarefas/tarefas.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS).catch((err) => console.warn('Aviso no cache inicial:', err))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)))
    )
  );
  self.clients.claim();
});

// Stale-While-Revalidate: entrega imediatamente do cache (0ms) e atualiza em segundo plano
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      return cached || (await networkFetch) || Response.error();
    })
  );
});
