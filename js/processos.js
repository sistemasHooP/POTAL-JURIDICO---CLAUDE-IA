/**
 * ============================================================================
 * ARQUIVO: js/processos.js
 * DESCRICAO: Listagem de Processos com sub-abas (Todos + Consolidados).
 * VERSAO: 2.0 (Fase 2 - Processos Consolidados por Cliente)
 * DEPENDENCIAS: js/api.js, js/auth.js, js/utils.js
 * ============================================================================
 */

// =========================================================================
// ESTADO GLOBAL
// =========================================================================
let todosProcessos = [];
let abaAtiva = 'todos'; // 'todos' ou 'consolidados'
let clientesExpandidos = {}; // { nomeCliente: true/false }

document.addEventListener('DOMContentLoaded', function () {

    // 1. Protecao de Rota
    if (!Auth.protectRoute()) return;

    // 2. UI do Usuario
    Auth.updateUserInfoUI();
    const user = Auth.getUser();
    if (user && user.nome) {
        document.getElementById('user-initials').textContent = user.nome.substring(0, 1).toUpperCase();
    }

    // 3. Logout Desktop
    const btnLogoutDesktop = document.getElementById('desktop-logout-btn');
    if (btnLogoutDesktop) {
        btnLogoutDesktop.addEventListener('click', () => { if (confirm('Sair?')) Auth.logout(); });
    }

    // 4. Configurar Filtros da aba Todos (Smart Search)
    const inputBusca = document.getElementById('filter-busca');
    const inputStatus = document.getElementById('filter-status');
    const formBusca = document.getElementById('search-form');

    if (inputBusca) inputBusca.addEventListener('input', applyLocalFilters);
    if (inputStatus) inputStatus.addEventListener('change', applyLocalFilters);

    if (formBusca) {
        formBusca.addEventListener('submit', (e) => {
            e.preventDefault();
            applyLocalFilters();
        });
    }

    // 5. Configurar busca da aba Consolidados
    const inputBuscaConsolidados = document.getElementById('consolidados-busca');
    if (inputBuscaConsolidados) {
        inputBuscaConsolidados.addEventListener('input', renderConsolidados);
    }

    // 6. Configurar sub-abas
    setupTabs();

    // 7. Botao de Sincronizar
    Utils.addSyncButton(async () => {
        Utils.Cache.clear('listarProcessos');
        Utils.showToast("Sincronizando...", "info");

        await new Promise(resolve => {
            loadAllProcessos();
            setTimeout(resolve, 1500);
        });

        Utils.showToast("Lista atualizada!", "success");
    });

    // 8. Carregamento Inicial
    loadAllProcessos();
});

// =========================================================================
// SUB-ABAS
// =========================================================================
function setupTabs() {
    var tabTodos = document.getElementById('tab-todos');
    var tabConsolidados = document.getElementById('tab-consolidados');

    if (tabTodos) {
        tabTodos.addEventListener('click', function () {
            switchTab('todos');
        });
    }

    if (tabConsolidados) {
        tabConsolidados.addEventListener('click', function () {
            switchTab('consolidados');
        });
    }
}

function switchTab(tab) {
    abaAtiva = tab;

    var viewTodos = document.getElementById('view-todos');
    var viewConsolidados = document.getElementById('view-consolidados');
    var tabTodos = document.getElementById('tab-todos');
    var tabConsolidados = document.getElementById('tab-consolidados');

    // Classes de aba ativa e inativa
    var ativaClasses = 'bg-blue-600 text-white shadow-sm';
    var inativaClasses = 'text-slate-600 hover:bg-slate-50';

    if (tab === 'todos') {
        viewTodos.classList.remove('hidden');
        viewConsolidados.classList.add('hidden');

        tabTodos.className = 'tab-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ' + ativaClasses;
        tabConsolidados.className = 'tab-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ' + inativaClasses;

        // Atualiza badge count
        var countSpan = document.getElementById('tab-todos-count');
        if (countSpan) countSpan.className = 'text-xs bg-white/20 px-2 py-0.5 rounded-full';
        var countSpan2 = document.getElementById('tab-consolidados-count');
        if (countSpan2) countSpan2.className = 'text-xs bg-slate-200 px-2 py-0.5 rounded-full';
    } else {
        viewTodos.classList.add('hidden');
        viewConsolidados.classList.remove('hidden');

        tabConsolidados.className = 'tab-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ' + ativaClasses;
        tabTodos.className = 'tab-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ' + inativaClasses;

        var countSpan = document.getElementById('tab-consolidados-count');
        if (countSpan) countSpan.className = 'text-xs bg-white/20 px-2 py-0.5 rounded-full';
        var countSpan2 = document.getElementById('tab-todos-count');
        if (countSpan2) countSpan2.className = 'text-xs bg-slate-200 px-2 py-0.5 rounded-full';

        // Renderizar consolidados quando trocar para a aba
        renderConsolidados();
    }
}

// =========================================================================
// CARREGAR PROCESSOS (FUNCAO ORIGINAL - mantida intacta)
// =========================================================================
function loadAllProcessos() {
    const tbody = document.getElementById('processos-list');

    API.processos.listar({}, (data, source) => {
        console.log(`[Processos] Lista carregada via: ${source}`);

        if (!data) {
            if (source === 'network') {
                tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500">Erro ao carregar lista.</td></tr>`;
            }
            return;
        }

        // Atualiza memoria
        todosProcessos = data;

        // Atualiza contadores das abas
        updateTabCounts();

        // Aplica filtros (renderiza a tabela da aba Todos)
        applyLocalFilters();

        // Se a aba consolidados estiver ativa, renderiza tambem
        if (abaAtiva === 'consolidados') {
            renderConsolidados();
        }

        // Feedback visual discreto se veio da rede
        if (source === 'network') {
            const countEl = document.getElementById('results-count');
            if (countEl) {
                countEl.classList.add('text-blue-600');
                setTimeout(() => countEl.classList.remove('text-blue-600'), 500);
            }
        }

    }).catch(error => {
        console.error("Erro ao listar processos:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-red-500">
                    <p>Falha de conexao.</p>
                    <button onclick="loadAllProcessos()" class="mt-2 text-sm text-blue-600 hover:underline">Tentar novamente</button>
                </td>
            </tr>
        `;
    });
}

// =========================================================================
// ATUALIZAR CONTADORES DAS ABAS
// =========================================================================
function updateTabCounts() {
    var totalCount = todosProcessos.length;
    var clientesUnicos = getClientesComProcessos();

    var tabTodosCount = document.getElementById('tab-todos-count');
    var tabConsolidadosCount = document.getElementById('tab-consolidados-count');

    if (tabTodosCount) tabTodosCount.textContent = totalCount;
    if (tabConsolidadosCount) tabConsolidadosCount.textContent = clientesUnicos.length;
}

// =========================================================================
// FILTROS DA ABA "TODOS" (FUNCOES ORIGINAIS - mantidas intactas)
// =========================================================================
function applyLocalFilters() {
    const termo = document.getElementById('filter-busca').value.toLowerCase().trim();
    const statusFiltro = document.getElementById('filter-status').value;
    const resultsCount = document.getElementById('results-count');

    const filtrados = todosProcessos.filter(p => {
        const matchStatus = statusFiltro === "" || p.status === statusFiltro;

        let matchTexto = true;
        if (termo) {
            const num = String(p.numero_processo || "").toLowerCase();
            const parte = String(p.parte_nome || "").toLowerCase();
            const tipo = String(p.tipo || "").toLowerCase();

            matchTexto = num.includes(termo) || parte.includes(termo) || tipo.includes(termo);
        }

        return matchStatus && matchTexto;
    });

    if (resultsCount) resultsCount.textContent = filtrados.length;
    renderTable(filtrados);
}

/**
 * Renderiza a tabela da aba "Todos" (FUNCAO ORIGINAL - mantida intacta)
 */
function renderTable(lista) {
    const tbody = document.getElementById('processos-list');
    const emptyState = document.getElementById('empty-state');

    const fragment = document.createDocumentFragment();

    if (!lista || lista.length === 0) {
        tbody.innerHTML = "";
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
        return;
    }

    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');

    lista.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors cursor-pointer group border-b border-slate-100 last:border-b-0";

        const badgeClass = Utils.getStatusClass(p.status);
        const dataCriacao = Utils.formatDate(p.created_at).split(' ')[0];
        const dataEntrada = p.data_entrada ? Utils.formatDate(p.data_entrada).split(' ')[0] : dataCriacao;
        const statusDesc = Utils.getStatusLabel(p.status);

        // --- LOGICA DE PRAZO VISUAL ---
        let prazoHtml = '';

        if (p.data_prazo) {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const prazo = new Date(p.data_prazo);
            prazo.setHours(0, 0, 0, 0);

            const diffTime = prazo - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let corPrazo = 'text-slate-500 bg-slate-100 border-slate-200';
            let icone = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';

            if (diffDays < 0) {
                corPrazo = 'text-red-700 bg-red-50 border-red-200 font-bold';
                icone = '<svg class="w-3 h-3 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            } else if (diffDays <= 3) {
                corPrazo = 'text-amber-700 bg-amber-50 border-amber-200 font-bold';
                icone = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            }

            const dataFmt = Utils.formatDate(p.data_prazo).split(' ')[0];

            prazoHtml = `
                <div class="mt-1.5 flex items-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${corPrazo}">
                        ${icone}
                        <span class="ml-1">${diffDays < 0 ? 'Vencido: ' : 'Vence: '}${dataFmt}</span>
                    </span>
                </div>
            `;
        }

        tr.onclick = () => {
            const safeName = encodeURIComponent(p.parte_nome || 'Processo');
            Utils.navigateTo(`detalhe-processo.html?id=${p.id}&parte=${safeName}`);
        };

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="font-bold text-slate-800 group-hover:text-blue-600 transition-colors text-base">
                        ${p.numero_processo || 'S/N'}
                    </span>
                    <span class="text-xs text-slate-500 md:hidden mt-1 font-medium uppercase tracking-wide">
                        ${p.parte_nome}
                    </span>
                    <div class="md:hidden">${prazoHtml}</div>
                </div>
            </td>
            <td class="px-6 py-4 hidden sm:table-cell">
                <div class="flex flex-col">
                    <span class="text-sm font-medium text-slate-900">${p.parte_nome}</span>
                    <span class="text-xs text-slate-500">${p.tipo}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-col items-start">
                    <span title="${statusDesc}" class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border shadow-sm ${badgeClass}">
                        ${p.status}
                    </span>
                    <div class="hidden md:block">${prazoHtml}</div>
                </div>
            </td>
            <td class="px-6 py-4 hidden md:table-cell text-sm text-slate-500">
                ${dataEntrada}
            </td>
            <td class="px-6 py-4 text-right">
                <div class="text-slate-400 group-hover:text-blue-600 transition-colors bg-slate-50 rounded-full w-8 h-8 flex items-center justify-center ml-auto group-hover:bg-blue-50">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.replaceChildren(fragment);
}

// =========================================================================
// ABA CONSOLIDADOS: AGRUPAR PROCESSOS POR CLIENTE
// =========================================================================

/**
 * Retorna array de objetos { nome, processos: [...] } agrupados por parte_nome
 */
function getClientesComProcessos() {
    var mapa = {};

    todosProcessos.forEach(function (p) {
        var nome = String(p.parte_nome || 'Sem nome').trim();
        var chave = nome.toLowerCase();

        if (!mapa[chave]) {
            mapa[chave] = {
                nome: nome,
                processos: []
            };
        }
        mapa[chave].processos.push(p);
    });

    // Converter para array e ordenar por nome
    var lista = Object.values(mapa);
    lista.sort(function (a, b) {
        return a.nome.toLowerCase().localeCompare(b.nome.toLowerCase());
    });

    return lista;
}

/**
 * Renderiza a lista de clientes consolidados
 */
function renderConsolidados() {
    var container = document.getElementById('consolidados-lista');
    var countEl = document.getElementById('consolidados-count');
    if (!container) return;

    var clientesComProcessos = getClientesComProcessos();

    // Aplicar filtro de busca
    var termo = (document.getElementById('consolidados-busca')?.value || '').trim().toLowerCase();
    if (termo) {
        clientesComProcessos = clientesComProcessos.filter(function (c) {
            return c.nome.toLowerCase().includes(termo);
        });
    }

    if (countEl) countEl.textContent = clientesComProcessos.length;

    if (!clientesComProcessos.length) {
        container.innerHTML =
            '<div class="text-center py-12 text-slate-400">' +
            '<svg class="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5-2.83M9 20H4v-2a3 3 0 015-2.83M9 20h6M9 20v-2a3 3 0 016 0v2M12 7a3 3 0 110 6 3 3 0 010-6z"></path></svg>' +
            '<p class="text-sm">Nenhum cliente com processos encontrado.</p>' +
            '</div>';
        return;
    }

    var fragment = document.createDocumentFragment();

    clientesComProcessos.forEach(function (clienteGrupo) {
        var chave = clienteGrupo.nome.toLowerCase();
        var isExpanded = !!clientesExpandidos[chave];
        var iniciais = getIniciais(clienteGrupo.nome);
        var qtd = clienteGrupo.processos.length;

        // Resumo de status
        var statusResumo = getStatusResumo(clienteGrupo.processos);

        // Card do cliente
        var card = document.createElement('div');
        card.className = 'bg-white rounded-xl border border-slate-200 overflow-hidden transition-all';
        if (isExpanded) card.classList.add('ring-2', 'ring-blue-500/20');

        // Header (sempre visivel)
        var header = document.createElement('div');
        header.className = 'flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors';
        header.innerHTML =
            '<div class="flex items-center gap-3 min-w-0 flex-1">' +
                '<div class="w-11 h-11 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">' + Utils.escapeHtml(iniciais) + '</div>' +
                '<div class="min-w-0 flex-1">' +
                    '<p class="font-semibold text-slate-800 truncate">' + Utils.escapeHtml(clienteGrupo.nome) + '</p>' +
                    '<div class="flex items-center gap-2 mt-1 flex-wrap">' +
                        '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">' + qtd + (qtd === 1 ? ' processo' : ' processos') + '</span>' +
                        statusResumo +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2 ml-3 shrink-0">' +
                '<svg class="w-5 h-5 text-slate-400 transition-transform ' + (isExpanded ? 'rotate-180' : '') + '" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' +
            '</div>';

        header.addEventListener('click', function () {
            clientesExpandidos[chave] = !clientesExpandidos[chave];
            renderConsolidados();
        });

        card.appendChild(header);

        // Lista de processos (se expandido)
        if (isExpanded) {
            var processosDiv = document.createElement('div');
            processosDiv.className = 'border-t border-slate-100 p-3 space-y-2 animate-fade-in bg-slate-50/50';

            clienteGrupo.processos.forEach(function (p) {
                var link = document.createElement('a');
                link.href = 'detalhe-processo.html?id=' + encodeURIComponent(p.id) + '&parte=' + encodeURIComponent(p.parte_nome || '');
                link.className = 'block p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group';

                var badgeClass = Utils.getStatusClass(p.status);
                var data = p.data_entrada ? Utils.formatDate(p.data_entrada) : Utils.formatDate(p.created_at);

                // Prazo badge inline
                var prazoBadge = '';
                if (p.data_prazo) {
                    var hoje = new Date();
                    hoje.setHours(0, 0, 0, 0);
                    var prazo = new Date(p.data_prazo);
                    prazo.setHours(0, 0, 0, 0);
                    var diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));

                    if (diffDays < 0) {
                        prazoBadge = '<span class="text-[10px] text-red-600 font-bold ml-2">Vencido</span>';
                    } else if (diffDays <= 3) {
                        prazoBadge = '<span class="text-[10px] text-amber-600 font-bold ml-2">Urgente</span>';
                    }
                }

                link.innerHTML =
                    '<div class="flex items-center justify-between">' +
                        '<div class="min-w-0 flex-1">' +
                            '<div class="flex items-center gap-2">' +
                                '<p class="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors text-sm">' + Utils.escapeHtml(p.numero_processo || 'S/N') + '</p>' +
                                prazoBadge +
                            '</div>' +
                            '<p class="text-xs text-slate-500 mt-0.5">' + Utils.escapeHtml(p.tipo || '-') + ' &middot; Entrada: ' + Utils.escapeHtml(data) + '</p>' +
                        '</div>' +
                        '<div class="flex items-center gap-2 ml-3 shrink-0">' +
                            '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ' + badgeClass + '">' + Utils.escapeHtml(p.status || '-') + '</span>' +
                            '<svg class="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>' +
                        '</div>' +
                    '</div>';

                processosDiv.appendChild(link);
            });

            card.appendChild(processosDiv);
        }

        fragment.appendChild(card);
    });

    container.replaceChildren(fragment);
}

// =========================================================================
// HELPERS CONSOLIDADOS
// =========================================================================

function getIniciais(nome) {
    var parts = String(nome || 'C').trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return parts[0].charAt(0).toUpperCase();
}

/**
 * Retorna HTML com badges de resumo de status dos processos
 */
function getStatusResumo(processos) {
    var statusCount = {};

    processos.forEach(function (p) {
        var s = String(p.status || 'DESCONHECIDO');
        statusCount[s] = (statusCount[s] || 0) + 1;
    });

    var html = '';
    var keys = Object.keys(statusCount);

    keys.forEach(function (s) {
        var cls = '';
        switch (s.toUpperCase()) {
            case 'EM ANDAMENTO':
                cls = 'bg-blue-50 text-blue-600 border-blue-200';
                break;
            case 'JULGADO':
                cls = 'bg-emerald-50 text-emerald-600 border-emerald-200';
                break;
            case 'ARQUIVADO':
                cls = 'bg-slate-50 text-slate-500 border-slate-200';
                break;
            case 'SOBRESTADO':
                cls = 'bg-amber-50 text-amber-600 border-amber-200';
                break;
            case 'CANCELADO':
                cls = 'bg-red-50 text-red-600 border-red-200';
                break;
            default:
                cls = 'bg-slate-50 text-slate-500 border-slate-200';
        }
        html += '<span class="text-[10px] px-1.5 py-0.5 rounded-full border font-medium ' + cls + '">' + statusCount[s] + ' ' + Utils.escapeHtml(s.toLowerCase()) + '</span>';
    });

    return html;
}
