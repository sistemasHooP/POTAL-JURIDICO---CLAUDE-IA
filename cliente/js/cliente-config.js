/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-config.js
 * DESCRIÇÃO: Configurações do módulo Cliente
 * ============================================================================
 */

const CONFIG_CLIENTE = {
    // URL da API (mesma do sistema principal)
    // IMPORTANTE: Substitua pela URL da sua implantação do Google Apps Script
    API_URL: "https://script.google.com/macros/s/AKfycbwi-M_wVyhadUQEySSFyQRxD66Xv6pACGQUcArMJLwxGt0aGlAACBGCJDTp4_HX7Lpj/exec",

    // Nome do aplicativo
    APP_NAME: "Acompanhamento Processual",
    
    // Versão
    VERSION: "1.0.0",

    // Chaves para armazenamento (SessionStorage)
    STORAGE_KEYS: {
        TOKEN: "rpps_cliente_token",
        CLIENTE_DATA: "rpps_cliente_data",
        CPF_TEMP: "rpps_cliente_cpf_temp"
    },

    // Páginas do módulo cliente
    PAGES: {
        LOGIN: "index.html",
        VERIFICAR: "verificar.html",
        PROCESSOS: "processos.html",
        PROCESSO: "processo.html"
    },

    // Tempo para expirar sessão no front (em ms) - 4 horas
    SESSION_TIMEOUT: 4 * 60 * 60 * 1000
};

// Congela para evitar modificações acidentais
Object.freeze(CONFIG_CLIENTE);
Object.freeze(CONFIG_CLIENTE.STORAGE_KEYS);
Object.freeze(CONFIG_CLIENTE.PAGES);