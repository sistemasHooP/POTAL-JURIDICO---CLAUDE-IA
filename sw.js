/**
 * ============================================================================
 * ARQUIVO: sw.js (Service Worker)
 * DESCRIÇÃO: Script responsável por permitir a instalação (PWA) e cache.
 * LOCALIZAÇÃO: Deve ficar na RAIZ do projeto (mesma pasta do index.html).
 * ============================================================================
 */

const CACHE_NAME = 'rpps-juridico-v4';

// Lista de arquivos para salvar no celular (Cache)
// Isso faz o app carregar instantaneamente nas próximas vezes
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard.html',
  './processos.html',
  './novo-processo.html',
  './detalhe-processo.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/api.js',
  './js/auth.js',
  './js/login.js',
  './js/dashboard.js',
  './js/processos.js',
  './js/novo-processo.js',
  './js/detalhe-processo.js',
  './logo.png',
  'https://cdn.tailwindcss.com', // Cache do Tailwind
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap' // Cache das Fontes
];

// 1. Instalação: Baixa e salva os arquivos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Instalando e Cacheando arquivos...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Ativação: Limpa caches antigos se houver atualização
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. Interceptação de Rede (Fetch)
// Estratégia: Cache First, Network Fallback (Para arquivos estáticos)
// Para API (script.google.com), sempre vai na rede.
self.addEventListener('fetch', (event) => {
  
  // Ignora requisições para a API do Google (sempre rede)
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Se está no cache, retorna do cache
      return response || fetch(event.request);
    })
  );
});