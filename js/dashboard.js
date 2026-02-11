/**
 * ============================================================================
 * ARQUIVO: js/dashboard.js
 * DESCRIÇÃO: Lógica do Painel de Controle (dashboard.html).
 * ATUALIZAÇÃO: Inclusão do botão de Sincronizar e Cache SWR.
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', function() {

    // 1. Proteção de Rota
    if (!Auth.protectRoute()) return;

    // 2. Atualizar UI com dados do usuário
    Auth.updateUserInfoUI();
    const user = Auth.getUser();
    if (user && user.nome) {
        const initials = user.nome.substring(0, 1).toUpperCase();
        const avatarEl = document.getElementById('user-initials');
        if (avatarEl) avatarEl.textContent = initials;
    }

    // 3. Configurar Botões de Logout
    const btnLogoutMobile = document.getElementById('mobile-logout-btn');
    const btnLogoutDesktop = document.getElementById('desktop-logout-btn');

    if (btnLogoutMobile) {
        btnLogoutMobile.addEventListener('click', () => { if(confirm('Sair?')) Auth.logout(); });
    }
    if (btnLogoutDesktop) {
        btnLogoutDesktop.addEventListener('click', () => { if(confirm('Sair?')) Auth.logout(); });
    }

    // 4. Botão de Sincronizar (NOVO)
    // Permite ao usuário forçar a atualização dos números
    Utils.addSyncButton(async () => {
        // Limpa cache do dashboard para forçar refresh real
        Utils.Cache.clear('getDashboard');
        Utils.showToast("Sincronizando...", "info");
        
        await new Promise(resolve => {
            loadDashboardData(); 
            // Pequeno delay visual para o usuário sentir que processou
            setTimeout(resolve, 1500); 
        });
        
        Utils.showToast("Dashboard atualizado!", "success");
    });

    // 5. Carregar Dados do Dashboard
    loadDashboardData();
});

/**
 * Busca estatísticas e processos.
 * Padrão SWR: Cache Imediato -> Rede Silenciosa.
 */
function loadDashboardData() {
    const tbody = document.getElementById('recent-processes-list');

    // Chama a API passando Callback
    API.processos.dashboard((data, source) => {
        console.log(`[Dashboard] Dados recebidos via: ${source}`);

        // Tratamento para dados nulos
        if (!data) {
            if (source === 'network' && tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Erro ao atualizar dados.</td></tr>`;
            }
            return;
        }

        // Se vier do cache, não anima os números para ser instantâneo
        const shouldAnimate = (source === 'cache'); 
        
        updateCounter('stats-total', data.total, shouldAnimate);
        updateCounter('stats-andamento', data.em_andamento, shouldAnimate);
        updateCounter('stats-julgado', data.julgado, shouldAnimate);
        // Soma Sobrestados + Arquivados no último card
        updateCounter('stats-sobrestado', (data.sobrestado || 0) + (data.arquivado || 0), shouldAnimate);

        renderRecentTable(data.recente);

    }).catch(error => {
        console.error("Erro fatal no dashboard:", error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-4 text-center text-red-500">
                        <p>Falha na conexão.</p>
                        <button onclick="loadDashboardData()" class="mt-2 text-sm text-blue-600 hover:underline">Tentar novamente</button>
                    </td>
                </tr>
            `;
        }
    });
}

/**
 * Efeito de contador animado.
 */
function updateCounter(elementId, value, instant = false) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (!value && value !== 0) { el.textContent = "0"; return; }
    const end = parseInt(value);

    // Se for instantâneo (cache), mostra direto
    if (instant) { el.textContent = end; return; }

    let start = 0;
    // Tenta pegar o valor atual para animar a partir dele (transição suave)
    const currentVal = parseInt(el.textContent) || 0;
    if (currentVal > 0 && currentVal !== end) start = currentVal;

    const diff = Math.abs(end - start);
    // Se a diferença for grande, incrementa mais rápido
    const increment = diff > 50 ? Math.ceil(diff / 20) : 1;
    const isIncreasing = end > start;

    const timer = setInterval(() => {
        if (isIncreasing) {
            start += increment;
            if (start >= end) start = end;
        } else {
            start -= increment;
            if (start <= end) start = end;
        }
        el.textContent = start;
        if (start === end) clearInterval(timer);
    }, 40);
}

/**
 * Renderiza as linhas da tabela de processos recentes.
 */
function renderRecentTable(processos) {
    const tbody = document.getElementById('recent-processes-list');
    if (!tbody) return;

    if (!processos || processos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500">Nenhum processo movimentado recentemente.</td></tr>`;
        return;
    }

    // Fragmento para performance
    const fragment = document.createDocumentFragment();

    processos.forEach(p => {
        const badgeClass = Utils.getStatusClass(p.status);
        // Formata data para DD/MM/AAAA
        const dataEntrada = p.data_entrada ? Utils.formatDate(p.data_entrada).split(' ')[0] : '-';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0";
        
        tr.onclick = function() { 
            Utils.navigateTo(`detalhe-processo.html?id=${p.id}`); 
        };

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="font-bold text-slate-700">${p.numero_processo || 'S/N'}</span>
                    <span class="text-xs text-slate-400 md:hidden">${p.parte_nome}</span>
                </div>
            </td>
            <td class="px-6 py-4 hidden sm:table-cell">
                <div class="text-sm text-slate-900 font-medium">${p.parte_nome}</div>
                <div class="text-xs text-slate-400">${p.tipo}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${badgeClass}">
                    ${p.status}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-slate-500 hidden sm:table-cell">${dataEntrada}</td>
            <td class="px-6 py-4 text-right">
                <button class="text-blue-600 hover:text-blue-900 font-medium text-sm">
                    Ver <span class="hidden md:inline">Detalhes</span> &rarr;
                </button>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.replaceChildren(fragment);
}
