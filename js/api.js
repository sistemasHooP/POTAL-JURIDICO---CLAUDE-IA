/**
 * ============================================================================
 * ARQUIVO: js/api.js
 * DESCRIÇÃO: Camada de comunicação com a API (Google Apps Script).
 * VERSÃO: Completa (Com Cache Inteligente, Proxy de Download e Modo Silencioso).
 * DEPENDÊNCIAS: js/config.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

const API = {

    // =========================================================================
    // CONFIGURAÇÃO DE CACHE (TTL POR AÇÃO)
    // =========================================================================
    CACHE_TTL_MINUTES: {
        default: 5,
        getDashboard: 5,
        listarProcessos: 10,
        getProcessoDetalhe: 10,
        listarClientes: 60,
        buscarClientePorId: 30
    },

    // =========================================================================
    // PRELOAD: Pré-carrega dados de páginas adjacentes em background
    // =========================================================================
    preloadAdjacentPages: function() {
        // Não precarrega se não estiver logado (evita erro "Sessão expirada" no login)
        var token = sessionStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        if (!token) return;

        var currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

        // Preload silencioso - não bloqueia UI, não mostra loading
        setTimeout(function() {
            if (currentPage === 'dashboard.html') {
                // Quem está no dashboard provavelmente vai para processos ou clientes
                API.fetchWithCache('listarProcessos', {}, function() {}, true).catch(function(){});
                API.fetchWithCache('listarClientes', {}, function() {}, true).catch(function(){});
            } else if (currentPage === 'processos.html') {
                API.fetchWithCache('getDashboard', {}, function() {}, true).catch(function(){});
                API.fetchWithCache('listarClientes', {}, function() {}, true).catch(function(){});
            } else if (currentPage === 'clientes.html') {
                API.fetchWithCache('listarProcessos', {}, function() {}, true).catch(function(){});
            } else if (currentPage === 'novo-processo.html') {
                API.fetchWithCache('listarClientes', {}, function() {}, true).catch(function(){});
            }
        }, 2000); // Espera 2s após carregar a página atual
    },

    // =========================================================================
    // INVALIDAÇÃO DE CACHE APÓS ESCRITA (segurança multi-usuário)
    // =========================================================================
    invalidateRelatedCache: function(action) {
        // Após qualquer escrita, limpa caches relacionados para forçar dados frescos
        if (action === 'novaMovimentacao' || action === 'criarProcesso') {
            Utils.Cache.clear('listarProcessos');
            Utils.Cache.clear('getProcessoDetalhe');
            Utils.Cache.clear('getDashboard');
        } else if (action === 'cadastrarCliente' || action === 'atualizarCliente') {
            Utils.Cache.clear('listarClientes');
            Utils.Cache.clear('buscarClientePorId');
        } else if (action === 'listarAdvogados' || action === 'atualizarAdvogados') {
            Utils.Cache.clear('listarAdvogados');
        } else if (action === 'atribuirProcesso') {
            Utils.Cache.clear('listarProcessos');
            Utils.Cache.clear('listarProcessosAdvogado');
            Utils.Cache.clear('listarProcessosAtribuicao');
        }
    },

    /**
     * Retorna o TTL em minutos para uma action específica.
     */
    getCacheTTL: function(action) {
        if (!action) return this.CACHE_TTL_MINUTES.default;
        return this.CACHE_TTL_MINUTES[action] || this.CACHE_TTL_MINUTES.default;
    },

    /**
     * Gera uma chave única e consistente para cache.
     */
    makeCacheKey: function(action, params) {
        const safeParams = params || {};
        return `${action}_${JSON.stringify(safeParams)}`;
    },

    /**
     * Função genérica para enviar requisições ao Google Apps Script.
     * Gerencia Loading, Autenticação, CORS e tratamento de Erros.
     * * @param {string} action - Nome da ação definida no switch do Code.gs (ex: 'login').
     * @param {Object} data - Objeto com os dados a serem enviados.
     * @param {string} method - 'GET' ou 'POST' (Padrão: POST).
     * @param {boolean} isSilent - Se TRUE, não exibe o Loading na tela (usado para background).
     */
    call: async function(action, data = {}, method = 'POST', isSilent = false) {
        // 1. Inicia UI de carregamento (apenas se não for silencioso)
        if (!isSilent) {
            Utils.showLoading();
        }

        try {
            // 2. Recupera token salvo (se houver) para autenticação
            const token = sessionStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);

            // 3. Prepara o payload (dados)
            // Adiciona a 'action' e o 'token' automaticamente no corpo da requisição
            const payload = {
                action: action,
                token: token,
                origem: window.location.origin,
                ...data
            };

            // 4. Configuração da Requisição Fetch
            let fetchOptions = {
                method: method,
                redirect: "follow", // Importante para redirecionamentos do Google
            };

            let url = CONFIG.API_URL;

            if (method === 'POST') {
                // TRUQUE CORS: Usamos text/plain para evitar Preflight OPTIONS request (CORS).
                // O Apps Script (Code.gs) faz o JSON.parse manualmente.
                fetchOptions.headers = {
                    "Content-Type": "text/plain;charset=utf-8",
                };
                fetchOptions.body = JSON.stringify(payload);
            } else {
                // Se for GET, converte objeto em Query String
                const params = new URLSearchParams();
                for (const key in payload) {
                    params.append(key, payload[key]);
                }
                url += "?" + params.toString();
            }

            // 5. Executa a chamada de rede
            const response = await fetch(url, fetchOptions);

            // 6. Verifica se a rede respondeu (HTTP 200)
            if (!response.ok) {
                throw new Error(`Erro de Rede: ${response.status} ${response.statusText}`);
            }

            // 7. Parse da resposta JSON do Apps Script
            const result = await response.json();

            // 8. Verifica se o Back-end retornou erro lógico (status: 'error')
            if (result.status === 'error') {
                // Tratamento especial para sessão expirada
                if (result.message && (result.message.includes("Sessão expirada") || result.message.includes("Token inválido"))) {
                    sessionStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
                    sessionStorage.removeItem(CONFIG.STORAGE_KEYS.USER_DATA);

                    // Só redireciona visualmente se não estivermos em background
                    if (!isSilent) {
                        Utils.showToast("Sessão expirada. Faça login novamente.", "warning");
                        setTimeout(() => Utils.navigateTo(CONFIG.PAGES.LOGIN), 2000);
                    }
                    throw new Error("Sessão expirada"); // Interrompe fluxo
                }
                throw new Error(result.message);
            }

            // 9. Sucesso! Retorna apenas os dados úteis
            return result.data;

        } catch (error) {
            console.error("API Error:", error);

            // Evita mostrar toast se for erro de redirecionamento de sessão (já tratado)
            // ou se for uma chamada silenciosa que falhou (o caller trata se quiser)
            if (!isSilent && error.message !== "Sessão expirada") {
                Utils.showToast(error.message || "Erro desconhecido ao comunicar com servidor.", "error");
            }
            throw error; // Repassa o erro para quem chamou poder tratar

        } finally {
            // 10. Remove bloqueio de tela
            if (!isSilent) {
                Utils.hideLoading();
            }
        }
    },

    /**
     * Cache Inteligente (Stale-While-Revalidate).
     * Padrão SWR:
     * 1. Retorna Cache imediatamente (callback com source='cache').
     * 2. Busca na rede em background.
     * 3. Retorna Rede atualizada (callback com source='network').
     * * @param {string} action - Ação da API.
     * @param {Object} params - Parâmetros da busca.
     * @param {Function} onResult - Callback (data, source) => void.
     * @param {boolean} forceSilent - Se true, força a chamada de rede a ser silenciosa (útil para preload).
     */
    fetchWithCache: async function(action, params, onResult, forceSilent = false) {

        // Gera uma chave única para este pedido baseada nos parâmetros
        const cacheKey = API.makeCacheKey(action, params);

        // 1. Tenta pegar do Cache Local
        const cachedData = Utils.Cache.get(cacheKey);
        const hasCache = !!cachedData;

        if (hasCache) {
            console.log(`[API] Usando cache para: ${action}`);
            // Retorna dados do cache para a tela desenhar RÁPIDO
            onResult(cachedData, 'cache');
        }

        try {
            // 2. Busca dados frescos na rede
            // Se forceSilent for true, respeita. Se não, decide baseado no cache (se tem cache, é silent).
            const isSilent = forceSilent || hasCache;

            const networkData = await API.call(action, params, 'POST', isSilent);

            // 3. Salva no cache para a próxima vez (com TTL por action)
            const ttl = API.getCacheTTL(action);
            Utils.Cache.set(cacheKey, networkData, ttl);

            // Retorna dados novos para a tela atualizar
            onResult(networkData, 'network');

        } catch (err) {
            console.warn(`[API] Falha ao atualizar ${action} via rede. Mantendo cache se existir.`);
            // Se falhar a rede e não tinha cache (e não foi forçado silent), o erro sobe para avisar o usuário
            if (!hasCache && !forceSilent) throw err;
        }
    },

    // --- MÉTODOS ESPECÍFICOS (Wrappers) ---
    // Facilitam a chamada nos arquivos de página

    auth: {
        login: (email, senha) => API.call('login', { email, senha }),

        verificar: () => API.call('verificarToken', {}, 'POST') // Verificação sempre bate na rede
    },

    processos: {
        dashboard: (onResult, silent = false) => API.fetchWithCache('getDashboard', {}, onResult, silent),
        listar: (filtros, onResult, silent = false) => API.fetchWithCache('listarProcessos', filtros, onResult, silent),
        detalhar: (idProcesso, onResult) => API.fetchWithCache('getProcessoDetalhe', { id_processo: idProcesso }, onResult),

        // Escrita: invalida caches relacionados após sucesso
        criar: (dadosProcesso) => API.call('criarProcesso', dadosProcesso).then(function(result) {
            API.invalidateRelatedCache('criarProcesso');
            return result;
        }),
    },

    clientes: {
        listar: (onResult = null, silent = false) => {
            if (typeof onResult === 'function') {
                return API.fetchWithCache('listarClientes', {}, onResult, silent);
            }
            return API.call('listarClientes', {}, 'POST', true);
        },
        buscarPorId: (cliente_id) => API.call('buscarClientePorId', { cliente_id }, 'POST', true),

        // Escrita: invalida caches relacionados após sucesso
        cadastrar: (dadosCliente) => API.call('cadastrarCliente', dadosCliente).then(function(result) {
            API.invalidateRelatedCache('cadastrarCliente');
            return result;
        }),
        atualizar: (dadosCliente) => API.call('atualizarCliente', dadosCliente).then(function(result) {
            API.invalidateRelatedCache('atualizarCliente');
            return result;
        })
    },

    movimentacoes: {
        // Escrita: invalida caches de processos e dashboard
        nova: (dadosMov) => API.call('novaMovimentacao', dadosMov).then(function(result) {
            API.invalidateRelatedCache('novaMovimentacao');
            return result;
        })
    },

    advogados: {
        listar: () => API.call('listarAdvogados', {}, 'POST', true),
        cadastrar: (dados) => API.call('cadastrarAdvogado', dados).then(function(result) {
            API.invalidateRelatedCache('listarAdvogados');
            return result;
        }),
        atualizar: (dados) => API.call('atualizarAdvogado', dados).then(function(result) {
            API.invalidateRelatedCache('atualizarAdvogados');
            return result;
        }),
        atribuirProcesso: (dados) => API.call('atribuirProcesso', dados, 'POST', true).then(function(result) {
            API.invalidateRelatedCache('atribuirProcesso');
            return result;
        }),
        listarProcessos: (advogadoId) => API.call('listarProcessosAdvogado', { advogado_id: advogadoId }, 'POST', true),
        listarProcessosAtribuicao: () => API.call('listarProcessosAtribuicao', {}, 'POST', true)
    },

    drive: {
        upload: (dadosArquivo) => API.call('uploadArquivo', dadosArquivo),
        download: (fileData) => API.call('downloadArquivo', fileData)
    }
};

// Inicia preload de páginas adjacentes quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    API.preloadAdjacentPages();
});
