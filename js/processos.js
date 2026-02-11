/**
 * ============================================================================
 * ARQUIVO: js/processos.js
 * DESCRIÇÃO: Lógica da página de Listagem de Processos (processos.html).
 * ATUALIZAÇÃO: Versão Completa (Prazos Visuais + Busca Robusta + Link com Nome).
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

// Armazena a lista completa na memória para filtragem instantânea
let todosProcessos = [];

document.addEventListener('DOMContentLoaded', function() {

    // 1. Proteção de Rota
    if (!Auth.protectRoute()) return;

    // 2. UI do Usuário
    Auth.updateUserInfoUI();
    const user = Auth.getUser();
    if (user && user.nome) {
        document.getElementById('user-initials').textContent = user.nome.substring(0, 1).toUpperCase();
    }

    // 3. Logout Desktop
    const btnLogoutDesktop = document.getElementById('desktop-logout-btn');
    if (btnLogoutDesktop) {
        btnLogoutDesktop.addEventListener('click', () => { if(confirm('Sair?')) Auth.logout(); });
    }

    // 4. Configurar Filtros em Tempo Real (Smart Search)
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

    // 5. Botão de Sincronizar
    // Cria o botão flutuante para forçar a atualização da lista
    Utils.addSyncButton(async () => {
        // Limpa cache específico desta lista e recarrega
        Utils.Cache.clear('listarProcessos');
        Utils.showToast("Sincronizando...", "info");
        
        await new Promise(resolve => {
            loadAllProcessos(); 
            setTimeout(resolve, 1500); 
        });
        
        Utils.showToast("Lista atualizada!", "success");
    });

    // 6. Carregamento Inicial
    loadAllProcessos();
});

/**
 * Busca a lista completa de processos.
 * Usa Cache Inteligente (SWR).
 */
function loadAllProcessos() {
    const tbody = document.getElementById('processos-list');
    
    // Chama API com filtro vazio para pegar TUDO
    API.processos.listar({}, (data, source) => {
        console.log(`[Processos] Lista carregada via: ${source}`);

        if (!data) {
            if (source === 'network') {
                tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500">Erro ao carregar lista.</td></tr>`;
            }
            return;
        }

        // Atualiza memória
        todosProcessos = data;
        
        // Aplica filtros (renderiza a tabela)
        applyLocalFilters();

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
                    <p>Falha de conexão.</p>
                    <button onclick="loadAllProcessos()" class="mt-2 text-sm text-blue-600 hover:underline">Tentar novamente</button>
                </td>
            </tr>
        `;
    });
}

/**
 * Filtra a lista 'todosProcessos' com base nos inputs da tela.
 */
function applyLocalFilters() {
    const termo = document.getElementById('filter-busca').value.toLowerCase().trim();
    const statusFiltro = document.getElementById('filter-status').value;
    const resultsCount = document.getElementById('results-count');

    const filtrados = todosProcessos.filter(p => {
        // 1. Filtro de Status
        const matchStatus = statusFiltro === "" || p.status === statusFiltro;

        // 2. Filtro de Texto (Nome, Número, Tipo)
        let matchTexto = true;
        if (termo) {
            // Converte tudo para String explicitamente para evitar erro se for null/undefined
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
 * Renderiza a tabela.
 */
function renderTable(lista) {
    const tbody = document.getElementById('processos-list');
    const emptyState = document.getElementById('empty-state');
    
    // Fragmento para performance
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

        // --- LÓGICA DE PRAZO VISUAL ---
        let prazoHtml = '';

        if (p.data_prazo) {
            // Calcula diferença em dias
            const hoje = new Date();
            hoje.setHours(0,0,0,0);
            const prazo = new Date(p.data_prazo);
            prazo.setHours(0,0,0,0);
            
            const diffTime = prazo - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            let corPrazo = 'text-slate-500 bg-slate-100 border-slate-200'; // Normal
            let icone = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';

            if (diffDays < 0) {
                // Vencido
                corPrazo = 'text-red-700 bg-red-50 border-red-200 font-bold';
                icone = '<svg class="w-3 h-3 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            } else if (diffDays <= 3) {
                // Urgente (0 a 3 dias)
                corPrazo = 'text-amber-700 bg-amber-50 border-amber-200 font-bold';
                icone = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            }

            const dataFmt = Utils.formatDate(p.data_prazo).split(' ')[0];
            
            // Badge que aparece na coluna
            prazoHtml = `
                <div class="mt-1.5 flex items-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${corPrazo}">
                        ${icone}
                        <span class="ml-1">${diffDays < 0 ? 'Vencido: ' : 'Vence: '}${dataFmt}</span>
                    </span>
                </div>
            `;
        }

        // ATUALIZAÇÃO: Passando o nome da parte na URL para o Loader personalizado
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
                    <!-- PRAZO MOBILE -->
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
                    <!-- PRAZO DESKTOP -->
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
