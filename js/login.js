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

    // 3. Envio do Formulário de Login
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const email = emailInput.value.trim();
            const senha = senhaInput.value;

            if (!email || !senha) {
                Utils.showToast("Por favor, preencha todos os campos.", "warning");
                return;
            }

            try {
                // 1. TELA DE SINCRONIZAÇÃO (Loader Principal Personalizado)
                Utils.showLoading("Sincronizando banco de dados...", "database");

                // 2. Autenticação (Modo Silencioso)
                const response = await API.call('login', { email, senha }, 'POST', true);

                // Se chegou aqui, login ok
                Auth.saveSession(response);

                // 3. PRELOAD REAL (Cache Warming)
                await Promise.all([
                    new Promise(resolve => {
                        API.processos.dashboard((data, source) => {
                            if (source === 'network') resolve();
                        }, true).catch(resolve);
                    }),

                    new Promise(resolve => {
                        API.processos.listar({}, (data, source) => {
                            if (source === 'network') resolve();
                        }, true).catch(resolve);
                    }),

                    // Pré-carrega clientes para acelerar Novo Processo e aba Clientes
                    new Promise(resolve => {
                        API.clientes.listar((data, source) => {
                            if (source === 'network') resolve();
                        }, true).catch(resolve);
                    })
                ]);

                // 4. Sucesso
                Utils.hideLoading();

                setTimeout(() => {
                    Utils.showToast(`Login realizado com sucesso!`, "success");

                    // Redireciona
                    setTimeout(() => {
                        Utils.navigateTo(CONFIG.PAGES.DASHBOARD);
                    }, 1000);
                }, 100);

            } catch (error) {
                console.error("Falha no login:", error);
                Utils.hideLoading();

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
