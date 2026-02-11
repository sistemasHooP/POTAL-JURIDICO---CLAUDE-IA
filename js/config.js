/**
 * ============================================================================
 * ARQUIVO: js/config.js
 * DESCRIÇÃO: Configurações globais do Front-End.
 * FUNÇÃO: Centralizar a URL da API e constantes do sistema.
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

const CONFIG = {
    // URL de produção do Google Apps Script (Web App)
    // Gerada em: Implantar > Nova implantação > App da Web
    API_URL: "https://script.google.com/macros/s/AKfycbwi-M_wVyhadUQEySSFyQRxD66Xv6pACGQUcArMJLwxGt0aGlAACBGCJDTp4_HX7Lpj/exec",

    // Nome da aplicação para exibição em títulos e rodapés
    APP_NAME: "Sistema Jurídico RPPS",

    // Versão atual
    VERSION: "1.0.0",

    // Chaves para armazenamento local (SessionStorage/LocalStorage)
    STORAGE_KEYS: {
        TOKEN: "rpps_auth_token",
        USER_DATA: "rpps_user_data"
    },

    // Rotas (Nomes dos arquivos HTML)
    // Útil se precisar mudar a estrutura de pastas no futuro
    PAGES: {
        LOGIN: "index.html",
        DASHBOARD: "dashboard.html",
        PROCESSOS: "processos.html",
        NOVO_PROCESSO: "novo-processo.html",
        CLIENTES: "clientes.html",
        DETALHE_PROCESSO: "detalhe-processo.html"
    }
};

// Evita edições acidentais nas configurações em tempo de execução

Object.freeze(CONFIG);

