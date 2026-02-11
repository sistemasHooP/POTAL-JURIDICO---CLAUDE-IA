/**
 * ============================================================================
 * ARQUIVO: js/pwa.js
 * DESCRIÇÃO: Lógica de instalação do Progressive Web App (PWA).
 * FUNÇÃO: Registrar Service Worker e controlar o botão de instalação.
 * DEPENDÊNCIAS: sw.js (na raiz)
 * ============================================================================
 */

let deferredPrompt; // Armazena o evento de instalação para usar depois

// 1. Registro do Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => {
                console.log('[PWA] Service Worker registrado com sucesso:', reg.scope);
            })
            .catch((err) => {
                console.error('[PWA] Falha ao registrar Service Worker:', err);
            });
    });
}

// 2. Captura do evento de instalação (Chrome/Android/Desktop)
window.addEventListener('beforeinstallprompt', (e) => {
    // Impede o navegador de mostrar o banner padrão feio imediatamente
    e.preventDefault();
    
    // Salva o evento para dispararmos quando o usuário clicar no botão
    deferredPrompt = e;
    
    // Mostra o botão de instalação (se ele existir na página)
    showInstallButton();
});

// 3. Função para mostrar o botão na tela
function showInstallButton() {
    const btnInstall = document.getElementById('btn-install-pwa');
    if (btnInstall) {
        btnInstall.classList.remove('hidden');
        btnInstall.addEventListener('click', installApp);
    }
}

// 4. Lógica do Clique em "Instalar"
async function installApp() {
    if (!deferredPrompt) return;

    // Mostra o prompt nativo do sistema
    deferredPrompt.prompt();

    // Espera a escolha do usuário
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Usuário escolheu: ${outcome}`);

    // Limpa o evento (só pode ser usado uma vez)
    deferredPrompt = null;
    
    // Esconde o botão novamente
    const btnInstall = document.getElementById('btn-install-pwa');
    if (btnInstall) {
        btnInstall.classList.add('hidden');
    }
}

// 5. Detecta se o app já foi instalado com sucesso
window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicativo instalado com sucesso!');
    const btnInstall = document.getElementById('btn-install-pwa');
    if (btnInstall) {
        btnInstall.classList.add('hidden');
    }
});