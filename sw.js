/**
 * ============================================================================
 * ARQUIVO: sw.js (Service Worker)
 * DESCRIÇÃO: Cache/PWA com suporte offline e atualização segura.
 * OBJETIVO DESTA VERSÃO:
 *  - NÃO cachear CDN externo (Tailwind/Google Fonts) para evitar CORS/Failed fetch
 *  - Cache somente de assets do próprio GitHub (mesma origem)
 *  - Estratégias:
 *      * HTML (páginas): Network First (com fallback para cache)
 *      * Assets (js/css/img): Stale While Revalidate
 *  - Atualização automática via SKIP_WAITING
 * ============================================================================
 */

const APP_PREFIX = 'rpps-juridico';
const CACHE_VERSION = 'v5'; // 👈 sempre aumente quando mudar o SW
const CACHE_NAME = `${APP_PREFIX}-${CACHE_VERSION}`;

// ✅ IMPORTANTE:
// NUNCA coloque aqui URLs externas como:
//  - https://cdn.tailwindcss.com
//  - https://fonts.googleapis.com
// Porque o cache.addAll usa fetch() e pode dar CORS/Failed to fetch.
const PRECACHE_URLS = [
  '/', // raiz

  // Páginas (gestor)
  '/index.html',
  '/dashboard.html',
  '/clientes.html',
  '/processos.html',
  '/novo-processo.html',
  '/detalhe-processo.html',

  // PWA
  '/manifest.json',
  '/logo.png',

  // CSS
  '/css/style.css',

  // JS (gestor)
  '/js/config.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/login.js',
  '/js/dashboard.js',
  '/js/clientes.js',
  '/js/processos.js',
  '/js/novo-processo.js',
  '/js/detalhe-processo.js',
  '/js/pwa.js',

  // Área do cliente
  '/cliente/index.html',
  '/cliente/processos.html',
  '/cliente/processo.html',
  '/cliente/verificar.html',
  '/cliente/js/cliente-config.js',
  '/cliente/js/cliente-auth.js',
  '/cliente/js/cliente-api.js'
];

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function isSameOrigin(url) {
  try {
    return new URL(url, self.location.href).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

async function safePrecache() {
  const cache = await caches.open(CACHE_NAME);

  for (const url of PRECACHE_URLS) {
    // Só cacheia se for mesma origem
    if (!isSameOrigin(url)) continue;

    try {
      // cache: 'reload' força buscar versão mais nova ao instalar SW
      const req = new Request(url, { cache: 'reload' });
      const res = await fetch(req);

      // res.ok (200) ou response opaca (em caso raro)
      if (res && (res.ok || res.type === 'opaque')) {
        await cache.put(req, res.clone());
      }
    } catch (err) {
      // Não quebra instalação do SW se 1 arquivo falhar
      // (ex.: arquivo renomeado, ou page ainda não existe)
      // console.warn('[SW] Falha ao precache:', url, err);
    }
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(request);

    // Só cacheia se ok e GET
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // fallback: cache da própria URL
    const cached = await cache.match(request);
    if (cached) return cached;

    // fallback final: index.html
    const fallback = await cache.match('/index.html');
    return fallback || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Atualiza em background quando já tinha cache
  if (cached && event) event.waitUntil(fetchPromise);

  return cached || (await fetchPromise) || new Response('', { status: 504 });
}

// ------------------------------------------------------------
// Install
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await safePrecache();
    await self.skipWaiting(); // ativa o SW mais rápido
  })());
});

// ------------------------------------------------------------
// Activate
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Remove caches antigos
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(APP_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );

    await self.clients.claim();
  })());
});

// ------------------------------------------------------------
// Messages (para atualizar SW rapidamente)
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ------------------------------------------------------------
// Fetch
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ✅ NÃO intercepta cross-origin (Tailwind CDN, Google Fonts, script.google.com etc.)
  // Deixa o navegador resolver direto, evitando CORS e falhas no SW.
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML (páginas): Network First (evita ficar preso em cache velho)
  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Assets: Stale While Revalidate (rápido e atualiza em background)
  event.respondWith(staleWhileRevalidate(req, event));
});
