/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-auth.js
 * DESCRIÇÃO: Gerenciamento de autenticação/sessão da Área do Cliente
 * VERSÃO: 1.0
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

const ClienteAuth = {

    /**
     * Salva CPF temporário entre tela de login e verificação OTP.
     * @param {string} cpf
     */
    saveTempCPF: function(cpf) {
        const cpfLimpo = String(cpf || '').replace(/\D/g, '');
        sessionStorage.setItem(CONFIG_CLIENTE.STORAGE_KEYS.CPF_TEMP, cpfLimpo);
    },

    /**
     * Recupera CPF temporário.
     * @returns {string}
     */
    getTempCPF: function() {
        return sessionStorage.getItem(CONFIG_CLIENTE.STORAGE_KEYS.CPF_TEMP) || '';
    },

    /**
     * Limpa CPF temporário.
     */
    clearTempCPF: function() {
        sessionStorage.removeItem(CONFIG_CLIENTE.STORAGE_KEYS.CPF_TEMP);
    },

    /**
     * Salva sessão do cliente após validar OTP.
     * @param {{token:string, cliente:Object}} data
     */
    saveSession: function(data) {
        if (!data || !data.token || !data.cliente) {
            throw new Error('Dados de sessão inválidos.');
        }

        sessionStorage.setItem(CONFIG_CLIENTE.STORAGE_KEYS.TOKEN, data.token);
        sessionStorage.setItem(CONFIG_CLIENTE.STORAGE_KEYS.CLIENTE_DATA, JSON.stringify({
            ...data.cliente,
            login_at: Date.now()
        }));
    },

    /**
     * Retorna cliente da sessão.
     * @returns {Object|null}
     */
    getCliente: function() {
        const raw = sessionStorage.getItem(CONFIG_CLIENTE.STORAGE_KEYS.CLIENTE_DATA);
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    },

    /**
     * Retorna token da sessão.
     * @returns {string}
     */
    getToken: function() {
        return sessionStorage.getItem(CONFIG_CLIENTE.STORAGE_KEYS.TOKEN) || '';
    },

    /**
     * Verifica se há sessão válida no frontend.
     * @returns {boolean}
     */
    isAuthenticated: function() {
        const token = this.getToken();
        const cliente = this.getCliente();

        if (!token || !cliente) return false;

        // Timeout no front para reduzir sessão antiga inválida
        const loginAt = Number(cliente.login_at || 0);
        if (!loginAt) return false;

        if ((Date.now() - loginAt) > CONFIG_CLIENTE.SESSION_TIMEOUT) {
            this.logout(false);
            return false;
        }

        return true;
    },

    /**
     * Protege páginas internas da área do cliente.
     * @returns {boolean}
     */
    protectRoute: function() {
        if (this.isAuthenticated()) {
            return true;
        }

        this.logout(false);
        if (typeof ClienteUI !== 'undefined' && ClienteUI.showToast) {
            ClienteUI.showToast('Faça login para acessar seus processos.', 'warning');
            setTimeout(() => {
                ClienteUI.navigateTo(CONFIG_CLIENTE.PAGES.LOGIN);
            }, 800);
        } else {
            window.location.href = CONFIG_CLIENTE.PAGES.LOGIN;
        }

        return false;
    },

    /**
     * Se já estiver logado, evita voltar para a tela de CPF.
     */
    redirectIfAuthenticated: function() {
        if (this.isAuthenticated()) {
            if (typeof ClienteUI !== 'undefined' && ClienteUI.navigateTo) {
                ClienteUI.navigateTo(CONFIG_CLIENTE.PAGES.PROCESSOS);
            } else {
                window.location.href = CONFIG_CLIENTE.PAGES.PROCESSOS;
            }
        }
    },

    /**
     * Atualiza cabeçalho com dados do cliente.
     */
    updateClienteUI: function() {
        const cliente = this.getCliente();
        if (!cliente) return;

        const nome = String(cliente.nome || 'Cliente').trim();
        const iniciais = nome ? nome.charAt(0).toUpperCase() : 'C';

        document.querySelectorAll('[data-cliente-nome]').forEach(el => {
            el.textContent = nome;
        });

        document.querySelectorAll('[data-cliente-iniciais]').forEach(el => {
            el.textContent = iniciais;
        });
    },

    /**
     * Encerra sessão do cliente.
     * @param {boolean} redirect
     */
    logout: function(redirect = true) {
        sessionStorage.removeItem(CONFIG_CLIENTE.STORAGE_KEYS.TOKEN);
        sessionStorage.removeItem(CONFIG_CLIENTE.STORAGE_KEYS.CLIENTE_DATA);
        sessionStorage.removeItem(CONFIG_CLIENTE.STORAGE_KEYS.CPF_TEMP);

        if (redirect) {
            if (typeof ClienteUI !== 'undefined' && ClienteUI.navigateTo) {
                ClienteUI.navigateTo(CONFIG_CLIENTE.PAGES.LOGIN);
            } else {
                window.location.href = CONFIG_CLIENTE.PAGES.LOGIN;
            }
        }
    }
};
