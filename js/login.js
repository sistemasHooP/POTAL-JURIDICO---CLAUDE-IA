/**
 * ============================================================================
 * ARQUIVO: js/login.js
 * DESCRIÇÃO: Lógica da página de Login (index.html).
 * ATUALIZAÇÃO: Sistema de "Warm-up" (Acordar servidor ao abrir a tela).
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', function() {

    // 1. Verificar se já está logado
    Auth.redirectIfAuthenticated();

    // --- WARM-UP (ACORDAR SERVIDOR) ---
    // Dispara um 'ping' silencioso assim que a tela carrega.
    // Isso tira o Google Apps Script do modo de suspensão enquanto o usuário digita a senha.
    console.log("Iniciando aquecimento do servidor...");
    API.call('ping', {}, 'POST', true).then(() => {
        console.log("Servidor pronto e aquecido.");
    }).catch(e => {
        console.log("Tentativa de aquecimento falhou (sem problemas, o login tentará novamente).");
    });

    // Referências aos elementos do DOM
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const senhaInput = document.getElementById('senha');
    const togglePasswordBtn = document.getElementById('toggle-password');

    // 2. Manipulação do Botão "Ver Senha"
    if (togglePasswordBtn && senhaInput) {
        togglePasswordBtn.addEventListener('click', function() {
            const type = senhaInput.getAttribute('type') === 'password' ? 'text' : 'password';
            senhaInput.setAttribute('type', type);

            // Alterna o estilo do ícone
            this.classList.toggle('text-slate-600');
            this.classList.toggle('text-slate-400');
        });
    }

    // 3. Envio do Formulário de Login (com proteção contra double-submit)
    let loginEmAndamento = false;
    const btnSubmit = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Bloqueia múltiplos cliques
            if (loginEmAndamento) return;

            const email = emailInput.value.trim();
            const senha = senhaInput.value;

            if (!email || !senha) {
                Utils.showToast("Por favor, preencha todos os campos.", "warning");
                return;
            }

            // Trava o formulário imediatamente
            loginEmAndamento = true;
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.classList.add('opacity-60', 'cursor-not-allowed');
            }
            emailInput.readOnly = true;
            senhaInput.readOnly = true;

            try {
                // 1. TELA DE SINCRONIZAÇÃO (Loader Principal Personalizado)
                Utils.showLoading("Sincronizando banco de dados...", "database");

                // 2. Autenticação (Modo Silencioso)
                const response = await API.call('login', { email, senha }, 'POST', true);

                // Se chegou aqui, login ok - salva sessão ANTES de redirecionar
                Auth.saveSession(response);
                Utils.hideLoading();
                Utils.showToast("Login realizado com sucesso!", "success");

                // Redireciona após breve delay para garantir que a sessão foi salva
                setTimeout(function() {
                    Utils.navigateTo(CONFIG.PAGES.DASHBOARD);
                }, 150);

            } catch (error) {
                console.error("Falha no login:", error);
                Utils.hideLoading();

                // Destrava o formulário para nova tentativa
                loginEmAndamento = false;
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
                }
                emailInput.readOnly = false;
                senhaInput.readOnly = false;

                emailInput.classList.add('border-red-500');
                senhaInput.classList.add('border-red-500');

                setTimeout(() => {
                    emailInput.classList.remove('border-red-500');
                    senhaInput.classList.remove('border-red-500');
                }, 2000);

                Utils.showToast(error.message || "Email ou senha incorretos.", "error");
                senhaInput.value = "";
                senhaInput.focus();
            }
        });
    }
});
