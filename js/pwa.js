/**
 * ============================================================================
 * ARQUIVO: js/pwa.js
 * DESCRIÇÃO: Registro do Service Worker + controle do botão de instalação.
 * OBJETIVO DESTA VERSÃO:
 *  - Registrar SW SEM depender de caminho relativo (funciona em /cliente também)
 *  - Forçar update automático quando houver nova versão (SKIP_WAITING)
 *  - Recarregar página após SW atualizar (controllerchange)
 * ============================================================================
 */

let deferredPrompt;
let swRegistration = null;
let refreshing = false;

// 1) Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Usa caminhos relativos - funciona em qualquer subdiretório (GitHub Pages etc.)
      // Se estiver em /cliente/, sobe um nível para achar o sw.js na raiz do projeto
      const isClienteArea = window.location.pathname.includes('/cliente/');
      const swPath = isClienteArea ? '../sw.js' : './sw.js';
      const swScope = isClienteArea ? '../' : './';
      swRegistration = await navigator.serviceWorker.register(swPath, { scope: swScope });
      console.log('[PWA] Service Worker registrado com sucesso:', swRegistration.scope);

      // Se já existir um SW esperando, força ativação (evita usuário preso no cache antigo)
      if (swRegistration.waiting) {
        console.log('[PWA] SW aguardando ativação. Aplicando update...');
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Detecta updates
      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // installed + já existe controller => é update (não é primeira instalação)
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] Nova versão detectada. Atualizando agora...');
            if (swRegistration.waiting) {
              swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        });
      });

    } catch (err) {
      console.error('[PWA] Falha ao registrar Service Worker:', err);
    }
  });

  // Quando o SW muda o controller, recarrega a página uma vez para aplicar update
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    console.log('[PWA] Controller alterado. Recarregando para aplicar update...');
    window.location.reload();
  });
}

// 2) Captura do evento de instalação (Chrome/Android/Desktop)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

// 3) Exibe botão de instalação se existir
function showInstallButton() {
  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.classList.remove('hidden');
    btnInstall.addEventListener('click', installApp);
  }
}

// 4) Clique em "Instalar"
async function installApp() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  console.log(`[PWA] Usuário escolheu: ${outcome}`);

  deferredPrompt = null;

  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.classList.add('hidden');
  }
}

// 5) Evento: app instalado
window.addEventListener('appinstalled', () => {
  console.log('[PWA] Aplicativo instalado com sucesso!');
  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.classList.add('hidden');
  }
});

// (Opcional) Função manual para forçar update quando você quiser
window.forceAppUpdate = async () => {
  try {
    if (swRegistration) {
      await swRegistration.update();
      console.log('[PWA] Update manual solicitado.');
    }
  } catch (e) {
    console.warn('[PWA] Falha ao forçar update manual:', e);
  }
};
