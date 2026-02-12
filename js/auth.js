/**
 * ============================================================================
 * ARQUIVO: js/auth.js
 * DESCRIÇÃO: Gerenciamento de sessão e controle de acesso no Front-End.
 * FUNÇÃO: Login, Logout, Proteção de Rotas e Verificação de Perfil.
 * DEPENDÊNCIAS: js/config.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

const Auth = {

    /**
     * Verifica se existe uma sessão válida.
     * Deve ser chamada no início de todos os arquivos JS de páginas internas.
     * Se não houver token, redireciona para o login.
     */
    protectRoute: function() {
        const token = sessionStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        const userData = sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER_DATA);

        // Se não tem dados de sessão, limpa tudo e manda pro login
        if (!token || !userData) {
            console.warn("Acesso não autorizado. Redirecionando para login...");
            this.logout(); 
            return false;
        }
        return true;
    },

    /**
     * Verifica se o usuário JÁ está logado ao acessar a tela de login.
     * Se sim, manda direto pro Dashboard.
     */
    redirectIfAuthenticated: function() {
        const token = sessionStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        if (token) {
            Utils.navigateTo(CONFIG.PAGES.DASHBOARD);
        }
    },

    /**
     * Salva a sessão no navegador após a API confirmar o login.
     * @param {Object} data - Objeto retornado pela API { token, user }
     */
    saveSession: function(data) {
        if (!data || !data.token || !data.user) {
            console.error("Tentativa de salvar sessão inválida", data);
            return;
        }
        sessionStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, data.token);
        sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(data.user));
    },

    /**
     * Encerra a sessão e volta para a tela inicial.
     */
    logout: function() {
        sessionStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
        sessionStorage.removeItem(CONFIG.STORAGE_KEYS.USER_DATA);
        Utils.navigateTo(CONFIG.PAGES.LOGIN);
    },

    /**
     * Retorna os dados do usuário logado (Nome, Email, Perfil).
     * @returns {Object|null}
     */
    getUser: function() {
        const data = sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER_DATA);
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error("Erro ao ler dados do usuário", e);
            return null;
        }
    },

    /**
     * Verifica se o usuário logado tem permissão de "ADMIN" ou "PRESIDENTE".
     * Útil para renderização condicional de elementos na tela.
     */
    isAdminOrPresident: function() {
        const user = this.getUser();
        if (!user) return false;
        const perfil = user.perfil.toUpperCase();
        return perfil === 'ADMIN' || perfil === 'PRESIDENTE';
    },

    /**
     * Atualiza a interface com o nome do usuário logado.
     * Procura por elementos com ID 'user-name-display' e 'user-profile-display'.
     */
    updateUserInfoUI: function() {
        const user = this.getUser();
        if (user) {
            const nameEl = document.getElementById('user-name-display');
            const profileEl = document.getElementById('user-profile-display');

            if (nameEl) nameEl.textContent = user.nome;
            if (profileEl) profileEl.textContent = user.perfil;

            // Exibe/oculta itens de menu exclusivos para admin
            const perfil = (user.perfil || '').toUpperCase();
            const isAdmin = perfil === 'ADMIN' || perfil === 'PRESIDENTE';
            document.querySelectorAll('[data-admin-only]').forEach(function(el) {
                if (isAdmin) {
                    el.classList.remove('hidden');
                    el.classList.add('flex');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('flex');
                }
            });
        }
    }
};