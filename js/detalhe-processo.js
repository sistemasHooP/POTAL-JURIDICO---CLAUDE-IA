/**
 * ============================================================================
 * ARQUIVO: js/detalhe-processo.js
 * DESCRIÇÃO: Lógica da tela de detalhes, timeline, stepper, prazos inteligentes,
 *            notas internas e exportação de relatório.
 * VERSÃO: 3.0
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * ============================================================================
 */

let currentProcessId = null;
let currentProcessData = null; // Cache dos dados do processo para exportação

document.addEventListener('DOMContentLoaded', function() {

    // 1. Proteção de Rota
    if (!Auth.protectRoute()) return;

    // 2. UI do Usuário
    Auth.updateUserInfoUI();
    const user = Auth.getUser();
    if (user && user.nome) {
        const initialsEl = document.getElementById('user-initials');
        if (initialsEl) initialsEl.textContent = user.nome.substring(0, 1).toUpperCase();
    }

    // 3. Logout Desktop
    const btnLogout = document.getElementById('desktop-logout-btn');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => { if (confirm('Sair?')) Auth.logout(); });
    }

    // 4. Captura ID da URL
    const params = new URLSearchParams(window.location.search);
    currentProcessId = params.get('id');
    const nomeParte = params.get('parte');

    if (!currentProcessId) {
        Utils.showToast("Processo não identificado.", "error");
        setTimeout(() => Utils.navigateTo('processos.html'), 2000);
        return;
    }

    // 5. Configurações de UI
    setupFileInput();
    setupNotasInternas();

    const formMov = document.getElementById('form-movimentacao');
    if (formMov) {
        formMov.addEventListener('submit', handleMovimentacaoSubmit);
    }

    // 6. Carregar Dados com Loader Personalizado
    const msgLoader = nomeParte
        ? "Abrindo autos de " + decodeURIComponent(nomeParte) + "..."
        : "Abrindo processo jurídico...";

    Utils.showLoading(msgLoader, "database");

    // Chama o carregamento forçando a rede (sem SWR visual para evitar dados velhos)
    loadProcessoDetalhe(currentProcessId);
});

// =============================================================================
// VISUALIZADOR DE ARQUIVOS IN-APP (Modal)
// =============================================================================
window.viewFile = async function(url, nome) {
    if (!url) return;

    const btn = document.activeElement;
    const originalText = btn ? btn.innerText : '';
    if(btn && btn.tagName === 'BUTTON') {
        btn.innerText = "Baixando...";
        btn.disabled = true;
    }

    const modal = document.getElementById('file-viewer-modal');
    const loader = document.getElementById('file-loader');
    const frame = document.getElementById('file-viewer-frame');
    const img = document.getElementById('file-viewer-image');
    const title = document.getElementById('file-viewer-title');
    const btnExternal = document.getElementById('btn-open-external');

    modal.classList.remove('hidden');
    loader.classList.remove('hidden');
    frame.classList.add('hidden');
    img.classList.add('hidden');
    title.textContent = nome || "Visualizando Arquivo";

    if (btnExternal) {
        btnExternal.href = "#";
        btnExternal.classList.add('opacity-50', 'pointer-events-none');
    }

    try {
        const data = await API.drive.download({ fileUrl: url });

        const byteCharacters = atob(data.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.mimeType });
        const blobUrl = URL.createObjectURL(blob);

        if (btnExternal) {
            btnExternal.href = blobUrl;
            btnExternal.download = data.nome || nome || 'arquivo';
            btnExternal.classList.remove('opacity-50', 'pointer-events-none');
        }

        if (data.mimeType.includes('pdf')) {
             frame.src = blobUrl;
             frame.classList.remove('hidden');
             loader.classList.add('hidden');
        } else if (data.mimeType.includes('image')) {
             img.src = blobUrl;
             img.classList.remove('hidden');
             loader.classList.add('hidden');
        } else {
             const link = document.createElement('a');
             link.href = blobUrl;
             link.download = data.nome || nome || 'arquivo';
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);

             closeFileViewer();
             Utils.showToast("Download iniciado.", "success");
        }

    } catch (error) {
        console.error("Erro download:", error);
        closeFileViewer();
        Utils.showToast("Erro ao abrir arquivo.", "error");
    } finally {
        if(btn && btn.tagName === 'BUTTON') {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
};

window.closeFileViewer = function() {
    const modal = document.getElementById('file-viewer-modal');
    const frame = document.getElementById('file-viewer-frame');
    const img = document.getElementById('file-viewer-image');

    modal.classList.add('hidden');

    setTimeout(() => {
        frame.src = "";
        img.src = "";
    }, 300);
};

// =============================================================================
// CARREGAR DADOS DO PROCESSO
// =============================================================================
function loadProcessoDetalhe(id) {
    const timelineContainer = document.getElementById('timeline-container');

    API.call('getProcessoDetalhe', { id_processo: id }, 'POST', true)
    .then(data => {
        if (!data) {
            Utils.hideLoading();
            Utils.showToast("Erro ao carregar.", "error");
            return;
        }

        const p = data.processo;
        const movs = data.movimentacoes;

        // Salva para exportação
        currentProcessData = data;

        const cacheKey = `getProcessoDetalhe_${JSON.stringify({ id_processo: id })}`;
        Utils.Cache.set(cacheKey, data);

        // --- Renderização ---
        const elNumero = document.getElementById('proc-numero');
        if (elNumero) elNumero.textContent = p.numero_processo || 'S/N';

        const elParte = document.getElementById('proc-parte');
        if (elParte) elParte.textContent = p.parte_nome;

        const elTipo = document.getElementById('proc-tipo');
        if (elTipo) elTipo.textContent = p.tipo || 'Não Informado';

        const elDescricao = document.getElementById('proc-descricao');
        if (elDescricao) {
            elDescricao.textContent = p.descricao || "Nenhuma observação inicial registrada.";
        }

        updateStatusUI(p.status);

        const elData = document.getElementById('proc-data');
        if (elData) elData.textContent = Utils.formatDate(p.data_entrada);

        const elCriador = document.getElementById('proc-criador');
        if (elCriador) elCriador.textContent = p.criado_por ? p.criado_por.split('@')[0] : '-';

        // Info do cliente vinculado
        renderClienteInfo(p);

        const btnDrive = document.getElementById('btn-drive');
        if (btnDrive) {
            if (p.link_pasta) {
                btnDrive.href = p.link_pasta;
                btnDrive.classList.remove('hidden');
                btnDrive.classList.add('inline-flex');
            } else {
                btnDrive.classList.add('hidden');
            }
        }

        renderStepper(p.status);
        renderTimeline(movs);
        renderPrazosPanel(movs);

        // Contador de movimentações
        const countBadge = document.getElementById('mov-count-badge');
        if (countBadge) countBadge.textContent = movs ? movs.length : 0;

        // Mostrar/esconder checkbox "concluir prazo"
        toggleConcluirPrazoUI(movs);

        Utils.hideLoading();

    }).catch(error => {
        console.error("Erro detalhes:", error);
        Utils.hideLoading();
        if (timelineContainer) timelineContainer.innerHTML = `<p class="text-red-500 pl-8">Falha ao carregar histórico.</p>`;
    });
}

// =============================================================================
// INFO DO CLIENTE VINCULADO
// =============================================================================
function renderClienteInfo(processo) {
    const panel = document.getElementById('proc-cliente-info');
    if (!panel) return;

    // Tenta pegar o nome e email do cliente a partir dos dados disponíveis
    const clienteId = processo.cliente_id;
    if (!clienteId) {
        panel.classList.add('hidden');
        return;
    }

    // Busca na API em background
    API.call('buscarClientePorIdGestor', { cliente_id: clienteId }, 'POST', true)
    .then(cliente => {
        if (cliente && cliente.nome_completo) {
            document.getElementById('proc-cliente-nome').textContent = cliente.nome_completo;
            document.getElementById('proc-cliente-email').textContent = (cliente.email || '') + (cliente.telefone ? ' | ' + cliente.telefone : '');
            panel.classList.remove('hidden');
        }
    }).catch(() => {
        // Fallback: usa parte_nome como nome do cliente
        if (processo.parte_nome) {
            document.getElementById('proc-cliente-nome').textContent = processo.parte_nome;
            document.getElementById('proc-cliente-email').textContent = processo.email_interessado || '';
            panel.classList.remove('hidden');
        }
    });
}

// =============================================================================
// PAINEL DE PRAZOS ATIVOS (Flutuante acima da timeline)
// =============================================================================
function renderPrazosPanel(movimentacoes) {
    const panel = document.getElementById('prazos-panel');
    if (!panel) return;

    if (!movimentacoes || movimentacoes.length === 0) {
        panel.classList.add('hidden');
        return;
    }

    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    // Filtra movimentações que TÊM prazo definido
    const comPrazo = movimentacoes.filter(m => m.data_prazo);

    if (comPrazo.length === 0) {
        panel.classList.add('hidden');
        return;
    }

    // Separa em vencidos, urgentes (<=3 dias), e futuros
    const vencidos = [];
    const urgentes = [];
    const futuros = [];

    comPrazo.forEach(m => {
        const prazo = new Date(m.data_prazo);
        prazo.setHours(0,0,0,0);
        const diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));

        const item = {
            tipo: m.tipo,
            descricao: m.descricao,
            data_prazo: m.data_prazo,
            prazoFmt: Utils.formatDate(m.data_prazo).split(' ')[0],
            diffDays: diffDays
        };

        if (diffDays < 0) vencidos.push(item);
        else if (diffDays <= 3) urgentes.push(item);
        else futuros.push(item);
    });

    // Se não tem nenhum prazo ativo (apenas históricos passados já respondidos), esconde
    const totalAtivos = vencidos.length + urgentes.length + futuros.length;
    if (totalAtivos === 0) {
        panel.classList.add('hidden');
        return;
    }

    let html = '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">';
    html += '<div class="flex items-center gap-2 mb-1">';
    html += '<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    html += '<h3 class="text-sm font-bold text-slate-800">Prazos Ativos</h3>';
    html += '<span class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">' + totalAtivos + '</span>';
    html += '</div>';

    // Vencidos (vermelho)
    vencidos.forEach(item => {
        html += `
            <div class="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl animate-pulse">
                <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-red-800 uppercase">${Utils.escapeHtml(item.tipo)} - VENCIDO ${Math.abs(item.diffDays)} dia(s)</p>
                    <p class="text-[11px] text-red-700 truncate">${Utils.escapeHtml(item.descricao.substring(0, 80))}${item.descricao.length > 80 ? '...' : ''}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-xs font-bold text-red-800">${item.prazoFmt}</p>
                    <button onclick="scrollToForm()" class="text-[10px] text-red-600 hover:text-red-800 font-bold underline">Responder</button>
                </div>
            </div>`;
    });

    // Urgentes (laranja/amber)
    urgentes.forEach(item => {
        const label = item.diffDays === 0 ? 'HOJE' : 'em ' + item.diffDays + ' dia(s)';
        html += `
            <div class="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-amber-800 uppercase">${Utils.escapeHtml(item.tipo)} - Vence ${label}</p>
                    <p class="text-[11px] text-amber-700 truncate">${Utils.escapeHtml(item.descricao.substring(0, 80))}${item.descricao.length > 80 ? '...' : ''}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-xs font-bold text-amber-800">${item.prazoFmt}</p>
                    <button onclick="scrollToForm()" class="text-[10px] text-amber-600 hover:text-amber-800 font-bold underline">Responder</button>
                </div>
            </div>`;
    });

    // Futuros (azul, mais discreto)
    futuros.forEach(item => {
        html += `
            <div class="flex items-center gap-3 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg">
                <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <svg class="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-semibold text-blue-800">${Utils.escapeHtml(item.tipo)} - em ${item.diffDays} dia(s)</p>
                </div>
                <p class="text-[11px] font-bold text-blue-700 shrink-0">${item.prazoFmt}</p>
            </div>`;
    });

    html += '</div>';
    panel.innerHTML = html;
    panel.classList.remove('hidden');
}

// Scroll suave até o formulário de movimentação
window.scrollToForm = function() {
    const form = document.getElementById('form-movimentacao');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Foca no campo descrição
        setTimeout(() => {
            const desc = document.getElementById('mov-descricao');
            if (desc) desc.focus();
        }, 500);
    }
};

// Mostra/esconde checkbox "Concluir prazo pendente" baseado se há prazos ativos
function toggleConcluirPrazoUI(movimentacoes) {
    const wrap = document.getElementById('concluir-prazo-wrap');
    if (!wrap) return;

    if (!movimentacoes) { wrap.classList.add('hidden'); return; }

    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    const temPrazoPendente = movimentacoes.some(m => {
        if (!m.data_prazo) return false;
        const prazo = new Date(m.data_prazo);
        prazo.setHours(0,0,0,0);
        return true; // Qualquer prazo conta
    });

    if (temPrazoPendente) {
        wrap.classList.remove('hidden');
    } else {
        wrap.classList.add('hidden');
    }
}

// =============================================================================
// STATUS UI
// =============================================================================
function updateStatusUI(status) {
    const statusEl = document.getElementById('proc-status');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = `px-4 py-2 text-base font-bold rounded-lg border shadow-sm flex items-center gap-2 uppercase tracking-wide ${Utils.getStatusClass(status)}`;
    }
    const statusDescEl = document.getElementById('proc-status-desc');
    if (statusDescEl) statusDescEl.textContent = Utils.getStatusLabel(status);
}

// =============================================================================
// STEPPER
// =============================================================================
function renderStepper(status) {
    const bar = document.getElementById('stepper-bar');
    const container = document.getElementById('stepper-container');
    if (!bar || !container) return;

    const steps = [
        { label: 'Início', active: true },
        { label: 'Análise', active: false },
        { label: 'Decisão', active: false },
        { label: 'Conclusão', active: false }
    ];

    let progress = 0;
    const s = status ? status.toUpperCase() : '';

    if (s === 'EM ANDAMENTO') {
        progress = 33; steps[1].active = true;
    } else if (s === 'SOBRESTADO' || s === 'JULGADO') {
        progress = 66; steps[1].active = true; steps[2].active = true;
    } else if (s === 'ARQUIVADO' || s === 'CANCELADO') {
        progress = 100; steps.forEach(step => step.active = true);
    } else {
        progress = 5;
    }

    bar.style.width = `${progress}%`;

    container.innerHTML = steps.map((step, index) => {
        const colorClass = step.active ? 'bg-blue-600 border-blue-600 text-blue-600' : 'bg-white border-slate-300 text-slate-400';
        let justify = 'justify-center';
        if (index === 0) justify = 'justify-start';
        if (index === steps.length - 1) justify = 'justify-end';

        return `
            <div class="flex ${justify} w-8 relative">
                <div class="w-4 h-4 rounded-full border-2 ${colorClass} z-20 bg-white"></div>
                <span class="absolute top-6 text-[10px] font-bold uppercase tracking-wider ${step.active ? 'text-blue-600' : 'text-slate-400'} whitespace-nowrap -ml-2">${step.label}</span>
            </div>
        `;
    }).join('');
}

// =============================================================================
// TIMELINE
// =============================================================================
function renderTimeline(movimentacoes) {
    const container = document.getElementById('timeline-container');

    if (!movimentacoes || movimentacoes.length === 0) {
        if(container.childElementCount === 0) {
             container.innerHTML = `<p class="text-slate-400 italic pl-12 pt-4" id="empty-msg">Nenhuma movimentação registrada.</p>`;
        }
        return;
    }

    const emptyMsg = document.getElementById('empty-msg');
    if (emptyMsg) emptyMsg.remove();

    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    movimentacoes.forEach((mov) => {
        fragment.appendChild(createTimelineItem(mov));
    });

    container.appendChild(fragment);
}

function createTimelineItem(mov) {
    const tipo = mov.tipo.toUpperCase();
    let iconHtml = `<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
    let bgIcon = "bg-blue-100";
    let borderIcon = "border-white";

    if (tipo.includes("DECISÃO") || tipo.includes("SENTENÇA")) {
        bgIcon = "bg-green-100";
        iconHtml = `<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else if (tipo.includes("AUDIÊNCIA")) {
        bgIcon = "bg-purple-100";
        iconHtml = `<svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`;
    } else if (tipo.includes("INICIAL")) {
        bgIcon = "bg-slate-200";
        iconHtml = `<svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM8 11V7a4 4 0 118 0v4M12 11h.01"></path></svg>`;
    }

    let prazoHtml = "";
    if (mov.data_prazo) {
        const prazoFmt = Utils.formatDate(mov.data_prazo).split(' ')[0];

        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const prazo = new Date(mov.data_prazo);
        prazo.setHours(0,0,0,0);

        let colorClass = "bg-amber-50 border-amber-200 text-amber-800";
        let iconPulse = "";
        let statusLabel = "Vence hoje";

        const diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            colorClass = "bg-red-50 border-red-200 text-red-800";
            iconPulse = "animate-pulse";
            statusLabel = "VENCIDO " + Math.abs(diffDays) + " dia(s)";
        } else if (diffDays === 0) {
            colorClass = "bg-amber-50 border-amber-200 text-amber-800";
            statusLabel = "Vence HOJE";
        } else if (diffDays <= 3) {
            colorClass = "bg-amber-50 border-amber-200 text-amber-800";
            statusLabel = "Vence em " + diffDays + " dia(s)";
        } else {
            colorClass = "bg-blue-50 border-blue-200 text-blue-800";
            statusLabel = "Vence em " + diffDays + " dia(s)";
        }

        prazoHtml = `
            <div class="mt-3 px-3 py-2 ${colorClass} border rounded-lg flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide">
                <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 flex-shrink-0 ${iconPulse}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>${prazoFmt} - ${statusLabel}</span>
                </div>
                <button onclick="scrollToForm()" class="text-[10px] underline hover:no-underline opacity-80 hover:opacity-100 normal-case font-semibold">Responder</button>
            </div>
        `;
    }

    let anexoHtml = "";
    if (mov.anexo_link) {
        const safeUrl = mov.anexo_link.replace(/'/g, "\\'");
        const safeNome = (mov.anexo_nome || 'Documento').replace(/'/g, "\\'");
        anexoHtml = `
            <div class="mt-3 pt-3 border-t border-slate-100">
                <button onclick="viewFile('${safeUrl}', '${safeNome}')" class="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors w-full sm:w-auto justify-center sm:justify-start group/btn">
                    <svg class="w-4 h-4 mr-2 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                    ${mov.anexo_nome || 'Visualizar Anexo'}
                </button>
            </div>
        `;
    }

    const autor = mov.usuario_responsavel ? mov.usuario_responsavel.substring(0, 2).toUpperCase() : '??';
    const emailAutor = mov.usuario_responsavel ? mov.usuario_responsavel.split('@')[0] : 'Usuário';

    const item = document.createElement('div');
    item.className = "relative pl-12 group animate-fade-in";

    item.innerHTML = `
        <div class="absolute left-0 top-0 w-12 h-12 rounded-full border-4 ${borderIcon} shadow-sm z-10 flex items-center justify-center ${bgIcon}">
            ${iconHtml}
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-200 transition-colors relative">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h4 class="font-bold text-slate-800 text-base">${mov.tipo}</h4>
                    <span class="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1">
                        <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold border border-slate-200" title="${mov.usuario_responsavel}">
                            ${autor}
                        </span>
                        ${emailAutor}
                    </span>
                </div>
                <span class="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">${Utils.formatDate(mov.data_movimentacao)}</span>
            </div>

            ${prazoHtml}

            <div class="text-sm text-slate-600 leading-relaxed break-words mt-2">
                ${Utils.escapeHtml(mov.descricao).replace(/\n/g, '<br>')}
            </div>

            ${anexoHtml}
        </div>
    `;
    return item;
}

// =============================================================================
// SUBMIT MOVIMENTAÇÃO (com suporte a concluir prazo)
// =============================================================================
async function handleMovimentacaoSubmit(e) {
    e.preventDefault();

    const tipo = document.getElementById('mov-tipo').value;
    const descricao = document.getElementById('mov-descricao').value.trim();
    const novoStatus = document.getElementById('mov-novo-status').value;
    const fileInput = document.getElementById('mov-arquivo');
    const dataPrazo = document.getElementById('mov-prazo').value;
    const concluirPrazo = document.getElementById('mov-concluir-prazo');

    if (!tipo || !descricao) {
        Utils.showToast("Preencha tipo e descrição.", "warning");
        return;
    }

    // Se o advogado marcou "concluir prazo", envia data_prazo vazia para limpar
    let prazoFinal = dataPrazo || null;
    if (concluirPrazo && concluirPrazo.checked && !dataPrazo) {
        prazoFinal = ''; // String vazia limpa o prazo no backend
    }

    const payload = {
        id_processo: currentProcessId,
        tipo: tipo,
        descricao: descricao,
        novo_status: novoStatus || null,
        data_prazo: prazoFinal
    };

    // --- CENÁRIO 1: UPLOAD (Loading Normal) ---
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        try {
            if (file.type.startsWith('image/')) {
                Utils.showToast("Otimizando imagem...", "info");
                const compressed = await Utils.Compressor.compressImage(file);
                payload.arquivo = { nome: compressed.nome, mimeType: compressed.mimeType, dadosBase64: compressed.base64 };
            } else {
                if (file.size > 5 * 1024 * 1024) {
                    Utils.showToast("PDF maior que 5MB.", "error");
                    return;
                }
                Utils.showToast("Anexando arquivo...", "info");
                const base64 = await fileToBase64(file);
                payload.arquivo = { nome: file.name, mimeType: file.type, dadosBase64: base64 };
            }

            await API.movimentacoes.nova(payload);
            if (novoStatus) Utils.Cache.clear('listarProcessos');
            Utils.Cache.clear('getProcessoDetalhe');
            Utils.showToast("Movimentação salva!", "success");

            resetForm();
            loadProcessoDetalhe(currentProcessId);

        } catch (err) {
            console.error(err);
            Utils.showToast("Erro ao salvar.", "error");
        }
        return;
    }

    // --- CENÁRIO 2: SEM ARQUIVO (Optimistic UI) ---
    const currentUser = Auth.getUser();
    const optimisticMov = {
        tipo: tipo,
        descricao: descricao,
        data_movimentacao: new Date().toISOString(),
        usuario_responsavel: currentUser ? currentUser.email : "Eu",
        anexo_link: null,
        anexo_nome: null,
        data_prazo: dataPrazo || null
    };

    const container = document.getElementById('timeline-container');
    const emptyMsg = document.getElementById('empty-msg');
    if (emptyMsg) emptyMsg.remove();

    const newItem = createTimelineItem(optimisticMov);
    if (container.firstChild) container.insertBefore(newItem, container.firstChild);
    else container.appendChild(newItem);

    if (novoStatus) updateStatusUI(novoStatus);

    Utils.showToast("Registrado!", "success");
    resetForm();

    try {
        await API.call('novaMovimentacao', payload, 'POST', true);
        if (novoStatus) Utils.Cache.clear('listarProcessos');

        const freshData = await API.call('getProcessoDetalhe', { id_processo: currentProcessId }, 'POST', true);
        const cacheKey = `getProcessoDetalhe_${JSON.stringify({ id_processo: currentProcessId })}`;
        Utils.Cache.set(cacheKey, freshData);
        currentProcessData = freshData;

        const p = freshData.processo;
        const movs = freshData.movimentacoes;

        updateStatusUI(p.status);
        renderTimeline(movs);
        renderPrazosPanel(movs);
        toggleConcluirPrazoUI(movs);

        const countBadge = document.getElementById('mov-count-badge');
        if (countBadge) countBadge.textContent = movs ? movs.length : 0;

    } catch (error) {
        console.error("Erro background:", error);
        Utils.showToast("Falha na sincronização.", "error");
    }
}

// =============================================================================
// NOTAS INTERNAS (localStorage por processo)
// =============================================================================
function setupNotasInternas() {
    const textarea = document.getElementById('notas-internas');
    const statusEl = document.getElementById('notas-status');
    if (!textarea) return;

    const params = new URLSearchParams(window.location.search);
    const procId = params.get('id');
    if (!procId) return;

    const storageKey = 'notas_processo_' + procId;

    // Carrega notas salvas
    const saved = localStorage.getItem(storageKey);
    if (saved) textarea.value = saved;

    // Salva automaticamente ao digitar (debounce)
    let timer = null;
    textarea.addEventListener('input', function() {
        if (statusEl) statusEl.textContent = 'Salvando...';
        clearTimeout(timer);
        timer = setTimeout(function() {
            localStorage.setItem(storageKey, textarea.value);
            if (statusEl) statusEl.textContent = 'Salvo';
            setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 2000);
        }, 500);
    });
}

// =============================================================================
// EXPORTAR RELATÓRIO COMPLETO
// =============================================================================
window.exportarRelatorio = function() {
    if (!currentProcessData) {
        Utils.showToast("Aguarde o carregamento dos dados.", "warning");
        return;
    }

    const p = currentProcessData.processo;
    const movs = currentProcessData.movimentacoes || [];
    const user = Auth.getUser();
    const agora = new Date();

    // Monta o HTML do relatório
    let movsHtml = '';
    // Inverte para ordem cronológica (mais antigo primeiro)
    const movsOrdenadas = [...movs].reverse();

    movsOrdenadas.forEach((mov, idx) => {
        let prazoStr = '';
        if (mov.data_prazo) {
            prazoStr = '<br><strong style="color:#d97706;">Prazo: ' + Utils.formatDate(mov.data_prazo) + '</strong>';
        }
        let anexoStr = '';
        if (mov.anexo_nome) {
            anexoStr = '<br><em style="color:#2563eb;">Anexo: ' + Utils.escapeHtml(mov.anexo_nome) + '</em>';
        }

        movsHtml += `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px;vertical-align:top;width:30px;color:#94a3b8;font-weight:bold;">${idx + 1}</td>
                <td style="padding:10px;vertical-align:top;width:100px;">
                    <span style="font-size:12px;color:#64748b;">${Utils.formatDate(mov.data_movimentacao)}</span>
                </td>
                <td style="padding:10px;vertical-align:top;width:140px;">
                    <strong style="color:#1e293b;">${Utils.escapeHtml(mov.tipo)}</strong><br>
                    <span style="font-size:11px;color:#94a3b8;">${mov.usuario_responsavel ? mov.usuario_responsavel.split('@')[0] : '-'}</span>
                </td>
                <td style="padding:10px;vertical-align:top;">
                    ${Utils.escapeHtml(mov.descricao).replace(/\n/g, '<br>')}
                    ${prazoStr}
                    ${anexoStr}
                </td>
            </tr>`;
    });

    // Notas internas (se existirem)
    const notasKey = 'notas_processo_' + currentProcessId;
    const notas = localStorage.getItem(notasKey) || '';
    let notasSection = '';
    if (notas.trim()) {
        notasSection = `
            <div style="margin-top:30px;padding:15px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
                <h3 style="margin:0 0 8px 0;font-size:14px;color:#92400e;">Notas Internas do Advogado</h3>
                <p style="margin:0;font-size:13px;color:#78350f;white-space:pre-wrap;">${Utils.escapeHtml(notas)}</p>
            </div>`;
    }

    const relatorioHtml = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Relatório - ${Utils.escapeHtml(p.numero_processo || 'Processo')}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; max-width: 900px; margin: 0 auto; }
        @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
        }
        h1 { font-size: 22px; margin-bottom: 4px; }
        h2 { font-size: 16px; color: #475569; margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #1e293b; }
        .header p { color: #64748b; font-size: 13px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 30px; }
        .info-item { padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
        .info-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; }
        .info-value { font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; padding: 10px; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
        td { font-size: 13px; line-height: 1.5; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
        .btn-print { display: inline-block; padding: 10px 24px; background: #1e293b; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; margin-bottom: 20px; }
        .btn-print:hover { background: #0f172a; }
    </style>
</head>
<body>
    <div class="no-print" style="text-align:center;margin-bottom:20px;">
        <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
    </div>

    <div class="header">
        <h1>RPPS Juridico - Relatorio do Processo</h1>
        <p>Gerado em ${agora.toLocaleDateString('pt-BR')} as ${agora.toLocaleTimeString('pt-BR').substring(0,5)}${user ? ' por ' + (user.nome || user.email) : ''}</p>
    </div>

    <h2>Dados do Processo</h2>
    <div class="info-grid">
        <div class="info-item">
            <div class="info-label">Numero do Processo</div>
            <div class="info-value">${Utils.escapeHtml(p.numero_processo || 'S/N')}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Tipo / Natureza</div>
            <div class="info-value">${Utils.escapeHtml(p.tipo || '-')}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Parte / Interessado</div>
            <div class="info-value">${Utils.escapeHtml(p.parte_nome || '-')}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Status Atual</div>
            <div class="info-value">${Utils.escapeHtml(p.status || '-')}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Data de Entrada</div>
            <div class="info-value">${Utils.formatDate(p.data_entrada)}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Email Notificacoes</div>
            <div class="info-value">${Utils.escapeHtml(p.email_interessado || '-')}</div>
        </div>
        <div class="info-item" style="grid-column: 1 / -1;">
            <div class="info-label">Observacoes Iniciais</div>
            <div class="info-value" style="font-weight:normal;font-size:13px;">${Utils.escapeHtml(p.descricao || 'Nenhuma')}</div>
        </div>
    </div>

    <h2>Historico de Movimentacoes (${movs.length})</h2>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Data</th>
                <th>Tipo / Autor</th>
                <th>Descricao</th>
            </tr>
        </thead>
        <tbody>
            ${movsHtml || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Nenhuma movimentacao registrada.</td></tr>'}
        </tbody>
    </table>

    ${notasSection}

    <div class="footer">
        <p>Sistema Juridico RPPS - Documento gerado automaticamente</p>
        <p>Este relatorio contempla todas as movimentacoes registradas ate a data de geracao.</p>
    </div>
</body>
</html>`;

    // Abre em nova janela para impressão
    const win = window.open('', '_blank');
    if (win) {
        win.document.write(relatorioHtml);
        win.document.close();
    } else {
        Utils.showToast("Popup bloqueado. Permita popups para exportar.", "warning");
    }
};

// =============================================================================
// FORM HELPERS
// =============================================================================
function resetForm() {
    document.getElementById('form-movimentacao').reset();
    const fileName = document.getElementById('file-name');
    const icon = document.getElementById('icon-upload');
    if(fileName) fileName.textContent = "Clique para anexar PDF ou Imagem";
    if(icon) icon.classList.remove('text-blue-500');

    // Reset checkbox concluir prazo
    const checkPrazo = document.getElementById('mov-concluir-prazo');
    if (checkPrazo) checkPrazo.checked = false;
}

function setupFileInput() {
    const fileInput = document.getElementById('mov-arquivo');
    const fileName = document.getElementById('file-name');
    const icon = document.getElementById('icon-upload');

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                fileName.textContent = this.files[0].name;
                fileName.classList.add('text-blue-600', 'font-medium');
                icon.classList.add('text-blue-500');
            } else {
                fileName.textContent = "Clique para anexar PDF ou Imagem";
                fileName.classList.remove('text-blue-600', 'font-medium');
                icon.classList.remove('text-blue-500');
            }
        });
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}
