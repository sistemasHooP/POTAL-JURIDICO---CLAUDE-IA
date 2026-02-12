/**
 * ============================================================================
 * ARQUIVO: js/dashboard.js
 * DESCRIÇÃO: Lógica do Painel de Controle (dashboard.html).
 * VERSÃO: 2.0 - Sistema de notificações de prazos + SWR.
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

    // 6. Carregar Notificações de Prazos
    loadNotificacoesPrazos();
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

// =============================================================================
// SISTEMA DE NOTIFICAÇÕES DE PRAZOS
// =============================================================================
function loadNotificacoesPrazos() {
    // Busca todos os processos para encontrar prazos
    API.processos.listar({}, function(data, source) {
        if (!data || !Array.isArray(data)) return;

        var prazos = [];
        var hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        data.forEach(function(proc) {
            if (!proc.data_prazo) return;
            // Ignora processos arquivados/cancelados
            var status = String(proc.status || '').toUpperCase();
            if (status === 'ARQUIVADO' || status === 'CANCELADO') return;

            var dataPrazo;
            try {
                dataPrazo = new Date(proc.data_prazo);
                if (isNaN(dataPrazo.getTime())) return;
            } catch(e) { return; }

            dataPrazo.setHours(0, 0, 0, 0);

            var diffMs = dataPrazo.getTime() - hoje.getTime();
            var diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            // Mostrar prazos: vencidos (até -30 dias) e próximos (até 30 dias)
            if (diffDias < -30 || diffDias > 30) return;

            var urgencia = 'normal';
            if (diffDias < 0) urgencia = 'vencido';
            else if (diffDias === 0) urgencia = 'hoje';
            else if (diffDias <= 3) urgencia = 'urgente';
            else if (diffDias <= 7) urgencia = 'proximo';

            prazos.push({
                id: proc.id,
                numero: proc.numero_processo || 'S/N',
                parte: proc.parte_nome || '-',
                tipo: proc.tipo || '-',
                status: proc.status || '-',
                data_prazo: dataPrazo,
                diffDias: diffDias,
                urgencia: urgencia
            });
        });

        // Ordena: vencidos primeiro, depois por proximidade
        prazos.sort(function(a, b) { return a.diffDias - b.diffDias; });

        renderNotificacoes(prazos);
    }, true); // silent
}

function renderNotificacoes(prazos) {
    var panel = document.getElementById('notificacoes-panel');
    var list = document.getElementById('notificacoes-list');
    var countBadge = document.getElementById('notif-count');
    if (!panel || !list) return;

    if (!prazos || prazos.length === 0) {
        // Esconde painel se não há prazos
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    if (countBadge) countBadge.textContent = prazos.length;

    var html = '';
    prazos.forEach(function(p) {
        var corBg = '', corText = '', corBorda = '', icone = '', label = '';

        switch(p.urgencia) {
            case 'vencido':
                corBg = 'bg-red-50'; corText = 'text-red-700'; corBorda = 'border-l-red-500';
                icone = '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                label = 'Vencido há ' + Math.abs(p.diffDias) + ' dia' + (Math.abs(p.diffDias) > 1 ? 's' : '');
                break;
            case 'hoje':
                corBg = 'bg-orange-50'; corText = 'text-orange-700'; corBorda = 'border-l-orange-500';
                icone = '<svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                label = 'Vence HOJE';
                break;
            case 'urgente':
                corBg = 'bg-amber-50'; corText = 'text-amber-700'; corBorda = 'border-l-amber-500';
                icone = '<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>';
                label = 'Em ' + p.diffDias + ' dia' + (p.diffDias > 1 ? 's' : '');
                break;
            case 'proximo':
                corBg = 'bg-blue-50'; corText = 'text-blue-700'; corBorda = 'border-l-blue-500';
                icone = '<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                label = 'Em ' + p.diffDias + ' dias';
                break;
            default:
                corBg = 'bg-slate-50'; corText = 'text-slate-600'; corBorda = 'border-l-slate-300';
                icone = '<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                label = 'Em ' + p.diffDias + ' dias';
        }

        var dataFormatada = Utils.formatDate(p.data_prazo);

        html += '<a href="detalhe-processo.html?id=' + Utils.escapeHtml(p.id) + '&parte=' + encodeURIComponent(p.parte) + '" class="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer border-l-4 ' + corBorda + ' ' + corBg + '">' +
            '<div class="shrink-0">' + icone + '</div>' +
            '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center gap-2 mb-0.5">' +
                    '<span class="text-sm font-bold text-slate-800 truncate">' + Utils.escapeHtml(p.numero) + '</span>' +
                    '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + corText + ' ' + corBg + ' border ' + corBorda.replace('border-l-', 'border-') + '">' + label + '</span>' +
                '</div>' +
                '<p class="text-xs text-slate-500 truncate">' + Utils.escapeHtml(p.parte) + ' &middot; ' + Utils.escapeHtml(p.tipo) + '</p>' +
            '</div>' +
            '<div class="text-right shrink-0">' +
                '<p class="text-xs font-mono font-bold ' + corText + '">' + dataFormatada + '</p>' +
                '<p class="text-[10px] text-slate-400">' + Utils.escapeHtml(p.status) + '</p>' +
            '</div>' +
            '<svg class="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>' +
        '</a>';
    });

    list.innerHTML = html;
}

window.toggleNotificacoes = function() {
    var list = document.getElementById('notificacoes-list');
    var chevron = document.getElementById('notif-chevron');
    if (!list) return;

    if (list.style.display === 'none') {
        list.style.display = '';
        if (chevron) chevron.style.transform = '';
    } else {
        list.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
};
