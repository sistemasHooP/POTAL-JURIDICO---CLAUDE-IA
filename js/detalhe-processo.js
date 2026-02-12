/**
 * ============================================================================
 * ARQUIVO: js/detalhe-processo.js
 * DESCRIÇÃO: Lógica da tela de detalhes, timeline, stepper, prazos inteligentes
 *            com sistema de referências (vinculação entre movimentações),
 *            notas internas e exportação de relatório.
 * VERSÃO: 6.0 - Header profissional, floating button, Drive iframe, notificações
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * ============================================================================
 */

let currentProcessId = null;
let currentProcessData = null;
let currentMovimentacoes = []; // Lista de movimentações para popular dropdown
let localReferences = {}; // Fallback temporário p/ UI otimista (2s). Dados reais vêm da API/banco.

document.addEventListener('DOMContentLoaded', function() {

    if (!Auth.protectRoute()) return;

    Auth.updateUserInfoUI();
    const user = Auth.getUser();
    if (user && user.nome) {
        const initialsEl = document.getElementById('user-initials');
        if (initialsEl) initialsEl.textContent = user.nome.substring(0, 1).toUpperCase();
    }

    const btnLogout = document.getElementById('desktop-logout-btn');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => { if (confirm('Sair?')) Auth.logout(); });
    }

    const params = new URLSearchParams(window.location.search);
    currentProcessId = params.get('id');
    const nomeParte = params.get('parte');

    if (!currentProcessId) {
        Utils.showToast("Processo não identificado.", "error");
        setTimeout(() => Utils.navigateTo('processos.html'), 2000);
        return;
    }

    setupFileInput();
    setupNotasInternas();
    setupFloatingButton();

    const formMov = document.getElementById('form-movimentacao');
    if (formMov) {
        formMov.addEventListener('submit', handleMovimentacaoSubmit);
    }

    const msgLoader = nomeParte
        ? "Abrindo autos de " + decodeURIComponent(nomeParte) + "..."
        : "Abrindo processo jurídico...";

    Utils.showLoading(msgLoader, "database");
    loadProcessoDetalhe(currentProcessId);
});

// =============================================================================
// MAPA DE REFERÊNCIAS - Coração do sistema inteligente
// =============================================================================
// Dado um array de movimentações, retorna:
// - respondidoPor: { movId: { respostaId, respostaData, respostaTipo } }
//   (quais movimentações já foram respondidas e por quem)
// - idsRespondidos: Set de IDs que já foram respondidos
function buildReferenceMap(movimentacoes) {
    const respondidoPor = {};
    const idsRespondidos = new Set();

    if (!movimentacoes) return { respondidoPor, idsRespondidos };

    movimentacoes.forEach(mov => {
        const refId = mov.mov_referencia_id;
        if (refId) {
            respondidoPor[String(refId)] = {
                respostaId: mov.id,
                respostaData: mov.data_movimentacao,
                respostaTipo: mov.tipo
            };
            idsRespondidos.add(String(refId));
        }
    });

    // Merge com referências locais da sessão (garante persistência imediata)
    Object.keys(localReferences).forEach(refId => {
        if (!respondidoPor[String(refId)]) {
            respondidoPor[String(refId)] = localReferences[refId];
            idsRespondidos.add(String(refId));
        }
    });

    return { respondidoPor, idsRespondidos };
}

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
    setTimeout(() => { frame.src = ""; img.src = ""; }, 300);
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

        currentProcessData = data;
        currentMovimentacoes = movs || [];

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

        renderClienteInfo(p);

        // Drive link
        const btnDrive = document.getElementById('btn-drive');
        if (btnDrive) {
            if (p.link_pasta) {
                btnDrive.href = p.link_pasta;
                btnDrive.classList.remove('hidden');
                btnDrive.classList.add('inline-flex');
            } else {
                btnDrive.classList.add('hidden');
                btnDrive.classList.remove('inline-flex');
            }
        }

        // Mostrar observações se existirem
        var descWrap = document.getElementById('proc-descricao-wrap');
        if (descWrap && p.descricao && String(p.descricao).trim()) {
            descWrap.classList.remove('hidden');
        }

        // Data de entrada duplicada no info grid
        const elDataInfo = document.getElementById('proc-data-info');
        if (elDataInfo) elDataInfo.textContent = Utils.formatDate(p.data_entrada).split(' ')[0];

        // Build reference map para saber quais prazos já foram respondidos
        const refMap = buildReferenceMap(movs);

        renderStepper(p.status);
        renderTimeline(movs, refMap);
        renderPrazosPanel(movs, refMap);
        populateReferenciaDropdown(movs, refMap);
        renderDocumentos(movs, p.link_pasta);
        loadNotasFromAPI(p);

        // Contador de movimentações
        const countBadge = document.getElementById('mov-count-badge');
        if (countBadge) countBadge.textContent = movs ? movs.length : 0;

        Utils.hideLoading();
        startAutoRefresh();

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
    const noneLabel = document.getElementById('proc-cliente-none');
    if (!panel) return;

    function showCliente(nome, extra) {
        document.getElementById('proc-cliente-nome').textContent = nome;
        document.getElementById('proc-cliente-email').textContent = extra || '';
        panel.classList.remove('hidden');
        if (noneLabel) noneLabel.classList.add('hidden');
    }

    const clienteId = processo.cliente_id;
    if (!clienteId) {
        if (processo.parte_nome && processo.email_interessado) {
            showCliente(processo.parte_nome, processo.email_interessado);
        } else {
            panel.classList.add('hidden');
            if (noneLabel) noneLabel.classList.remove('hidden');
        }
        return;
    }

    API.clientes.buscarPorId(clienteId)
    .then(cliente => {
        if (cliente && cliente.nome_completo) {
            showCliente(cliente.nome_completo, (cliente.email || '') + (cliente.telefone ? ' | ' + cliente.telefone : ''));
        }
    }).catch(() => {
        if (processo.parte_nome) {
            showCliente(processo.parte_nome, processo.email_interessado || '');
        }
    });
}

// =============================================================================
// DROPDOWN "EM RESPOSTA A" - Popula com movimentações pendentes
// =============================================================================
function populateReferenciaDropdown(movimentacoes, refMap) {
    const select = document.getElementById('mov-referencia');
    const wrap = document.getElementById('mov-referencia-wrap');
    const infoEl = document.getElementById('mov-referencia-info');
    if (!select || !wrap) return;

    // Limpa opções anteriores
    select.innerHTML = '<option value="">Nenhuma (nova movimentação independente)</option>';

    // Limpa info de seleção
    if (infoEl) infoEl.innerHTML = '';

    if (!movimentacoes || movimentacoes.length === 0) {
        wrap.classList.add('hidden');
        return;
    }

    // Filtra: movimentações que têm prazo E que NÃO foram respondidas
    const pendentes = movimentacoes.filter(m => {
        if (!m.data_prazo || !m.id) return false;
        return !refMap.idsRespondidos.has(String(m.id));
    });

    if (pendentes.length === 0) {
        wrap.classList.add('hidden');
        return;
    }

    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    // Categoriza e ordena por urgência (vencidos primeiro)
    const categorizados = pendentes.map(m => {
        const prazo = new Date(m.data_prazo);
        prazo.setHours(0,0,0,0);
        const diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
        return { ...m, diffDays };
    }).sort((a, b) => a.diffDays - b.diffDays);

    categorizados.forEach(m => {
        let statusTag = '';
        let urgencyPrefix = '';
        if (m.diffDays < 0) {
            statusTag = ' VENCIDO ' + Math.abs(m.diffDays) + 'd';
            urgencyPrefix = '🔴 ';
        } else if (m.diffDays === 0) {
            statusTag = ' HOJE';
            urgencyPrefix = '🟡 ';
        } else if (m.diffDays <= 3) {
            statusTag = ' em ' + m.diffDays + 'd';
            urgencyPrefix = '🟡 ';
        } else {
            statusTag = ' ' + Utils.formatDate(m.data_prazo).split(' ')[0];
            urgencyPrefix = '🔵 ';
        }

        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = urgencyPrefix + m.tipo + ' [' + statusTag.trim() + '] - ' + (m.descricao || '').substring(0, 60);
        opt.dataset.tipo = m.tipo;
        opt.dataset.prazo = m.data_prazo;
        opt.dataset.descricao = (m.descricao || '').substring(0, 100);
        select.appendChild(opt);
    });

    // Evento de mudança - mostra preview do caminho
    select.onchange = function() {
        if (!infoEl) return;
        const selectedOpt = select.options[select.selectedIndex];
        if (!select.value || !selectedOpt.dataset.tipo) {
            infoEl.innerHTML = '';
            return;
        }
        const tipo = selectedOpt.dataset.tipo;
        const prazo = selectedOpt.dataset.prazo ? Utils.formatDate(selectedOpt.dataset.prazo).split(' ')[0] : '';
        const descricao = selectedOpt.dataset.descricao || '';
        const tipoResposta = document.getElementById('mov-tipo').value || '(selecione o tipo)';

        infoEl.innerHTML = `
            <div class="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5">Caminho da Resposta:</p>
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">${Utils.escapeHtml(tipo)}</span>
                    <span class="text-[10px] text-slate-400">${prazo ? '(' + prazo + ')' : ''}</span>
                    <svg class="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                    <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">${Utils.escapeHtml(tipoResposta)}</span>
                    <span class="text-[10px] text-emerald-600">(esta resposta)</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-1 truncate">Ref: ${Utils.escapeHtml(descricao)}</p>
            </div>`;
    };

    // Também escuta mudanças no tipo para atualizar o preview
    const tipoSelect = document.getElementById('mov-tipo');
    if (tipoSelect) {
        const originalOnChange = tipoSelect.onchange;
        tipoSelect.onchange = function(e) {
            if (originalOnChange) originalOnChange.call(this, e);
            if (select.value) select.onchange();
        };
    }

    wrap.classList.remove('hidden');
}

// =============================================================================
// PAINEL DE PRAZOS ATIVOS (só mostra pendentes NÃO respondidos)
// =============================================================================
function renderPrazosPanel(movimentacoes, refMap) {
    const panel = document.getElementById('prazos-panel');
    if (!panel) return;

    if (!movimentacoes || movimentacoes.length === 0) {
        panel.classList.add('hidden');
        return;
    }

    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    // Filtra: tem prazo + NÃO foi respondido
    const pendentes = movimentacoes.filter(m => {
        if (!m.data_prazo) return false;
        if (m.id && refMap.idsRespondidos.has(String(m.id))) return false;
        return true;
    });

    // Respondidos para mostrar como concluídos
    const respondidos = movimentacoes.filter(m => {
        if (!m.data_prazo) return false;
        if (m.id && refMap.idsRespondidos.has(String(m.id))) return true;
        return false;
    });

    if (pendentes.length === 0 && respondidos.length === 0) {
        panel.classList.add('hidden');
        return;
    }

    // Categoriza pendentes
    const vencidos = [];
    const urgentes = [];
    const futuros = [];

    pendentes.forEach(m => {
        const prazo = new Date(m.data_prazo);
        prazo.setHours(0,0,0,0);
        const diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));

        const item = {
            id: m.id,
            tipo: m.tipo,
            descricao: m.descricao,
            data_prazo: m.data_prazo,
            data_movimentacao: m.data_movimentacao,
            prazoFmt: Utils.formatDate(m.data_prazo).split(' ')[0],
            diffDays: diffDays
        };

        if (diffDays < 0) vencidos.push(item);
        else if (diffDays <= 3) urgentes.push(item);
        else futuros.push(item);
    });

    const totalPendentes = vencidos.length + urgentes.length + futuros.length;

    // Se não tem pendentes, mostra só resumo de concluídos
    if (totalPendentes === 0 && respondidos.length > 0) {
        let concHtml = '<div class="bg-white rounded-2xl shadow-sm border border-green-200 p-4 space-y-2">';
        concHtml += '<div class="flex items-center gap-2">';
        concHtml += '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        concHtml += '<span class="text-sm font-bold text-green-800">Todos os prazos foram atendidos</span>';
        concHtml += '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">' + respondidos.length + ' concluído(s)</span>';
        concHtml += '</div>';
        respondidos.forEach(m => {
            const resp = refMap.respondidoPor[String(m.id)];
            const prazoFmt = Utils.formatDate(m.data_prazo).split(' ')[0];
            concHtml += `
                <div class="flex items-center gap-2 pl-7 py-1 border-l-2 border-green-200 ml-2">
                    <span class="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">${Utils.escapeHtml(m.tipo)}</span>
                    <span class="text-[10px] text-green-600">Prazo ${prazoFmt}</span>
                    ${resp ? '<span class="text-[10px] text-green-500">- respondido via ' + Utils.escapeHtml(resp.respostaTipo) + '</span>' : ''}
                </div>`;
        });
        concHtml += '</div>';
        panel.innerHTML = concHtml;
        panel.classList.remove('hidden');
        return;
    }

    let html = '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">';
    html += '<div class="flex items-center flex-wrap gap-2 mb-1">';
    html += '<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    html += '<h3 class="text-sm font-bold text-slate-800">Prazos Pendentes</h3>';
    html += '<span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">' + totalPendentes + ' pendente(s)</span>';
    if (respondidos.length > 0) {
        html += '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">' + respondidos.length + ' concluído(s)</span>';
    }
    html += '</div>';

    // Vencidos
    vencidos.forEach(item => {
        html += `
            <div class="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl animate-pulse">
                <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded">${Utils.escapeHtml(item.tipo)}</span>
                        <span class="text-[10px] font-bold text-red-800">VENCIDO ${Math.abs(item.diffDays)} dia(s)</span>
                    </div>
                    <p class="text-[11px] text-red-700 mt-1 line-clamp-2">${Utils.escapeHtml(item.descricao.substring(0, 120))}</p>
                    <p class="text-[10px] text-red-500 mt-0.5">Prazo: ${item.prazoFmt} | Criado em: ${Utils.formatDate(item.data_movimentacao).split(' ')[0]}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-xs font-bold text-red-800">${item.prazoFmt}</p>
                    <button onclick="responderPrazo('${item.id}')" class="mt-1 text-[10px] text-white bg-red-600 hover:bg-red-700 font-bold px-2.5 py-1 rounded-lg transition-colors">Responder</button>
                </div>
            </div>`;
    });

    // Urgentes
    urgentes.forEach(item => {
        const label = item.diffDays === 0 ? 'HOJE' : 'em ' + item.diffDays + ' dia(s)';
        html += `
            <div class="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-bold text-white bg-amber-600 px-1.5 py-0.5 rounded">${Utils.escapeHtml(item.tipo)}</span>
                        <span class="text-[10px] font-bold text-amber-800">Vence ${label}</span>
                    </div>
                    <p class="text-[11px] text-amber-700 mt-1 line-clamp-2">${Utils.escapeHtml(item.descricao.substring(0, 120))}</p>
                    <p class="text-[10px] text-amber-500 mt-0.5">Prazo: ${item.prazoFmt} | Criado em: ${Utils.formatDate(item.data_movimentacao).split(' ')[0]}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-xs font-bold text-amber-800">${item.prazoFmt}</p>
                    <button onclick="responderPrazo('${item.id}')" class="mt-1 text-[10px] text-white bg-amber-600 hover:bg-amber-700 font-bold px-2.5 py-1 rounded-lg transition-colors">Responder</button>
                </div>
            </div>`;
    });

    // Futuros
    futuros.forEach(item => {
        html += `
            <div class="flex items-start gap-3 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg">
                <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg class="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">${Utils.escapeHtml(item.tipo)}</span>
                        <span class="text-[11px] font-semibold text-blue-800">em ${item.diffDays} dia(s)</span>
                    </div>
                    <p class="text-[10px] text-blue-600 mt-0.5">${Utils.escapeHtml(item.descricao.substring(0, 80))}</p>
                </div>
                <p class="text-[11px] font-bold text-blue-700 shrink-0">${item.prazoFmt}</p>
            </div>`;
    });

    // Concluídos - seção compacta no final
    if (respondidos.length > 0) {
        html += '<div class="mt-2 pt-3 border-t border-slate-100">';
        html += '<p class="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1">';
        html += '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"></path></svg>';
        html += 'Prazos Concluídos (' + respondidos.length + ')</p>';
        respondidos.forEach(m => {
            const resp = refMap.respondidoPor[String(m.id)];
            const prazoFmt = Utils.formatDate(m.data_prazo).split(' ')[0];
            html += `
                <div class="flex items-center gap-2 py-1 pl-3 border-l-2 border-green-200 mb-1">
                    <span class="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">${Utils.escapeHtml(m.tipo)}</span>
                    <span class="text-[10px] text-green-600 line-through">${prazoFmt}</span>
                    ${resp ? '<span class="text-[10px] text-green-500">via ' + Utils.escapeHtml(resp.respostaTipo) + ' em ' + Utils.formatDate(resp.respostaData).split(' ')[0] + '</span>' : '<span class="text-[10px] text-green-500">respondido</span>'}
                </div>`;
        });
        html += '</div>';
    }

    html += '</div>';
    panel.innerHTML = html;
    panel.classList.remove('hidden');
}

// Botão "Responder" no painel de prazos - pré-seleciona a referência e mostra caminho
window.responderPrazo = function(movId) {
    const form = document.getElementById('form-movimentacao');
    const select = document.getElementById('mov-referencia');

    if (select && movId) {
        select.value = movId;
        // Dispara o evento change para mostrar o preview do caminho
        if (select.onchange) select.onchange();
    }

    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            const desc = document.getElementById('mov-descricao');
            if (desc) desc.focus();
        }, 500);
    }
};

// Scroll simples ao formulário
window.scrollToForm = function() {
    const form = document.getElementById('form-movimentacao');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            const desc = document.getElementById('mov-descricao');
            if (desc) desc.focus();
        }, 500);
    }
};

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
// TIMELINE (com referências visuais)
// =============================================================================
function renderTimeline(movimentacoes, refMap) {
    const container = document.getElementById('timeline-container');

    if (!movimentacoes || movimentacoes.length === 0) {
        if(container.childElementCount === 0) {
             container.innerHTML = `<p class="text-slate-400 italic pl-12 pt-4" id="empty-msg">Nenhuma movimentação registrada.</p>`;
        }
        return;
    }

    const emptyMsg = document.getElementById('empty-msg');
    if (emptyMsg) emptyMsg.remove();

    // Cria um lookup rápido por ID para encontrar a movimentação referenciada
    const movsById = {};
    movimentacoes.forEach(m => { if (m.id) movsById[String(m.id)] = m; });

    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    movimentacoes.forEach((mov) => {
        fragment.appendChild(createTimelineItem(mov, refMap, movsById));
    });

    container.appendChild(fragment);
}

function createTimelineItem(mov, refMap, movsById) {
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

    // ---- PRAZO BADGE ----
    let prazoHtml = "";
    if (mov.data_prazo) {
        const prazoFmt = Utils.formatDate(mov.data_prazo).split(' ')[0];
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const prazo = new Date(mov.data_prazo);
        prazo.setHours(0,0,0,0);
        const diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));

        // Verifica se este prazo foi respondido
        const foiRespondido = mov.id && refMap.idsRespondidos.has(String(mov.id));
        const resposta = foiRespondido ? refMap.respondidoPor[String(mov.id)] : null;

        if (foiRespondido && resposta) {
            // PRAZO CONCLUÍDO (verde) - badge permanente e destacado
            prazoHtml = `
                <div class="mt-3 px-3 py-2.5 bg-green-50 border-2 border-green-300 text-green-800 rounded-xl shadow-sm">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <svg class="w-5 h-5 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span class="text-xs font-bold uppercase tracking-wide">Prazo ${prazoFmt} - CONCLUÍDO</span>
                        </div>
                        <span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">Atendido</span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-1.5 pl-7 flex-wrap">
                        <span class="text-[10px] font-semibold text-green-700">Respondido via</span>
                        <span class="text-[10px] font-bold text-green-800 bg-green-100 px-1.5 py-0.5 rounded border border-green-200">${Utils.escapeHtml(resposta.respostaTipo)}</span>
                        <span class="text-[10px] text-green-600">em ${Utils.formatDate(resposta.respostaData).split(' ')[0]}</span>
                    </div>
                </div>`;
        } else {
            // PRAZO PENDENTE (vermelho/amarelo/azul)
            let colorClass = "bg-amber-50 border-amber-200 text-amber-800";
            let iconPulse = "";
            let statusLabel = "Vence hoje";

            if (diffDays < 0) {
                colorClass = "bg-red-50 border-red-200 text-red-800";
                iconPulse = "animate-pulse";
                statusLabel = "VENCIDO " + Math.abs(diffDays) + " dia(s)";
            } else if (diffDays === 0) {
                statusLabel = "Vence HOJE";
            } else if (diffDays <= 3) {
                statusLabel = "Vence em " + diffDays + " dia(s)";
            } else {
                colorClass = "bg-blue-50 border-blue-200 text-blue-800";
                statusLabel = "Vence em " + diffDays + " dia(s)";
            }

            prazoHtml = `
                <div class="mt-3 px-3 py-2.5 ${colorClass} border-2 rounded-xl shadow-sm">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <svg class="w-5 h-5 flex-shrink-0 ${iconPulse}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <div>
                                <span class="text-xs font-bold uppercase tracking-wide block">${prazoFmt} - ${statusLabel}</span>
                                <span class="text-[10px] font-medium normal-case opacity-80">${Utils.escapeHtml(mov.tipo)}</span>
                            </div>
                        </div>
                        <button onclick="responderPrazo('${mov.id || ''}')" class="text-[10px] bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg font-bold border border-current/20 transition-colors">Responder</button>
                    </div>
                </div>`;
        }
    }

    // ---- BADGE "EM RESPOSTA A" (se esta movimentação referencia outra) ----
    let referenciaHtml = "";
    if (mov.mov_referencia_id && movsById) {
        const movOriginal = movsById[String(mov.mov_referencia_id)];
        if (movOriginal) {
            const prazoOriginal = movOriginal.data_prazo ? Utils.formatDate(movOriginal.data_prazo).split(' ')[0] : '';
            const dataOriginal = movOriginal.data_movimentacao ? Utils.formatDate(movOriginal.data_movimentacao).split(' ')[0] : '';
            referenciaHtml = `
                <div class="mt-2 mb-1 px-3 py-2 bg-emerald-50 border-2 border-emerald-300 rounded-xl shadow-sm" style="min-height:auto;">
                    <div class="flex items-center gap-2 text-[11px] text-emerald-800 mb-1">
                        <svg class="w-4 h-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
                        <span class="font-bold uppercase tracking-wide text-emerald-700">Em Resposta A:</span>
                    </div>
                    <div class="flex items-center gap-1.5 flex-wrap pl-6">
                        <span class="text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">${Utils.escapeHtml(movOriginal.tipo)}</span>
                        ${prazoOriginal ? '<span class="text-[10px] text-slate-500">(prazo ' + prazoOriginal + ')</span>' : ''}
                        ${dataOriginal ? '<span class="text-[10px] text-slate-400">de ' + dataOriginal + '</span>' : ''}
                        <svg class="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                        <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">${Utils.escapeHtml(mov.tipo)}</span>
                    </div>
                </div>`;
        }
    }

    // ---- ANEXO ----
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

            ${referenciaHtml}
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
// SUBMIT MOVIMENTAÇÃO (com referência)
// =============================================================================
async function handleMovimentacaoSubmit(e) {
    e.preventDefault();

    const tipo = document.getElementById('mov-tipo').value;
    const descricao = document.getElementById('mov-descricao').value.trim();
    const novoStatus = document.getElementById('mov-novo-status').value;
    const fileInput = document.getElementById('mov-arquivo');
    const dataPrazo = document.getElementById('mov-prazo').value;
    const referenciaSelect = document.getElementById('mov-referencia');
    const referenciaId = referenciaSelect ? referenciaSelect.value : '';

    if (!tipo || !descricao) {
        Utils.showToast("Preencha tipo e descrição.", "warning");
        return;
    }

    const payload = {
        id_processo: currentProcessId,
        tipo: tipo,
        descricao: descricao,
        novo_status: novoStatus || null,
        data_prazo: dataPrazo || null,
        mov_referencia_id: referenciaId || null
    };

    // Se selecionou uma referência e não definiu novo prazo, limpa o prazo do processo
    if (referenciaId && !dataPrazo) {
        payload.data_prazo = '';
    }

    // --- CENÁRIO 1: UPLOAD ---
    if (fileInput.files.length > 0) {
        // Salva referência local para o cenário de upload também
        if (referenciaId) {
            localReferences[String(referenciaId)] = {
                respostaId: 'local_' + Date.now(),
                respostaData: new Date().toISOString(),
                respostaTipo: tipo
            };
        }
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
        data_prazo: dataPrazo || null,
        mov_referencia_id: referenciaId || null
    };

    // Salva referência local para persistir imediatamente na sessão
    if (referenciaId) {
        localReferences[String(referenciaId)] = {
            respostaId: 'local_' + Date.now(),
            respostaData: new Date().toISOString(),
            respostaTipo: tipo
        };
    }

    const container = document.getElementById('timeline-container');
    const emptyMsg = document.getElementById('empty-msg');
    if (emptyMsg) emptyMsg.remove();

    // Para UI otimista, precisamos do refMap atualizado
    const tempRefMap = buildReferenceMap([...currentMovimentacoes, optimisticMov]);
    const tempMovsById = {};
    currentMovimentacoes.forEach(m => { if (m.id) tempMovsById[String(m.id)] = m; });

    const newItem = createTimelineItem(optimisticMov, tempRefMap, tempMovsById);
    if (container.firstChild) container.insertBefore(newItem, container.firstChild);
    else container.appendChild(newItem);

    if (novoStatus) updateStatusUI(novoStatus);

    // Re-renderiza imediatamente o painel de prazos e dropdown com a referência local
    renderPrazosPanel(currentMovimentacoes, tempRefMap);
    populateReferenciaDropdown(currentMovimentacoes, tempRefMap);

    Utils.showToast("Registrado!", "success");
    resetForm();

    try {
        await API.call('novaMovimentacao', payload, 'POST', true);
        if (novoStatus) Utils.Cache.clear('listarProcessos');

        const freshData = await API.call('getProcessoDetalhe', { id_processo: currentProcessId }, 'POST', true);
        const cacheKey = `getProcessoDetalhe_${JSON.stringify({ id_processo: currentProcessId })}`;
        Utils.Cache.set(cacheKey, freshData);
        currentProcessData = freshData;
        currentMovimentacoes = freshData.movimentacoes || [];

        const p = freshData.processo;
        const movs = freshData.movimentacoes;
        const freshRefMap = buildReferenceMap(movs);

        updateStatusUI(p.status);
        renderTimeline(movs, freshRefMap);
        renderPrazosPanel(movs, freshRefMap);
        populateReferenciaDropdown(movs, freshRefMap);

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

    // Carrega do localStorage como fallback imediato
    const savedLocal = localStorage.getItem(storageKey);
    if (savedLocal) textarea.value = savedLocal;

    let timer = null;
    textarea.addEventListener('input', function() {
        if (statusEl) statusEl.textContent = 'Salvando...';
        clearTimeout(timer);
        timer = setTimeout(function() {
            var texto = textarea.value;
            // Salva localmente sempre (backup)
            localStorage.setItem(storageKey, texto);

            // Sincroniza com o backend (para outros usuários verem)
            API.call('salvarNotasProcesso', { id_processo: procId, notas_internas: texto }, 'POST', true)
                .then(function() {
                    if (statusEl) { statusEl.textContent = 'Salvo na nuvem'; statusEl.className = 'text-[10px] text-green-600'; }
                    setTimeout(function() { if (statusEl) { statusEl.textContent = ''; statusEl.className = 'text-[10px] text-slate-400'; } }, 2500);
                })
                .catch(function() {
                    // Backend ainda não suporta - salvo só local
                    if (statusEl) { statusEl.textContent = 'Salvo localmente'; statusEl.className = 'text-[10px] text-amber-500'; }
                    setTimeout(function() { if (statusEl) { statusEl.textContent = ''; statusEl.className = 'text-[10px] text-slate-400'; } }, 2500);
                });
        }, 800);
    });
}

// Carrega notas do backend quando o processo é carregado
function loadNotasFromAPI(processo) {
    if (!processo) return;
    var textarea = document.getElementById('notas-internas');
    if (!textarea) return;

    // Se o backend retornou notas_internas, usa essas (prioridade sobre localStorage)
    if (processo.notas_internas) {
        textarea.value = processo.notas_internas;
        // Atualiza localStorage com o dado do servidor
        var storageKey = 'notas_processo_' + processo.id;
        localStorage.setItem(storageKey, processo.notas_internas);
    }
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

    const refMap = buildReferenceMap(movs);

    // Lookup para referências
    const movsById = {};
    movs.forEach(m => { if (m.id) movsById[String(m.id)] = m; });

    let movsHtml = '';
    const movsOrdenadas = [...movs].reverse();

    movsOrdenadas.forEach((mov, idx) => {
        let prazoStr = '';
        if (mov.data_prazo) {
            const foiRespondido = mov.id && refMap.idsRespondidos.has(String(mov.id));
            if (foiRespondido) {
                const resp = refMap.respondidoPor[String(mov.id)];
                prazoStr = '<br><strong style="color:#16a34a;">Prazo ' + Utils.formatDate(mov.data_prazo) + ' - CONCLUÍDO via ' + Utils.escapeHtml(resp.respostaTipo) + ' em ' + Utils.formatDate(resp.respostaData) + '</strong>';
            } else {
                prazoStr = '<br><strong style="color:#d97706;">Prazo: ' + Utils.formatDate(mov.data_prazo) + ' - PENDENTE</strong>';
            }
        }

        let refStr = '';
        if (mov.mov_referencia_id && movsById[String(mov.mov_referencia_id)]) {
            const orig = movsById[String(mov.mov_referencia_id)];
            const prazoRef = orig.data_prazo ? Utils.formatDate(orig.data_prazo).split(' ')[0] : '';
            const dataRef = orig.data_movimentacao ? Utils.formatDate(orig.data_movimentacao).split(' ')[0] : '';
            refStr = '<br><div style="margin:6px 0;padding:8px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;">';
            refStr += '<strong style="color:#059669;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Caminho da Resposta:</strong><br>';
            refStr += '<span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#fff;border:1px solid #d1d5db;border-radius:4px;font-size:11px;color:#374151;">' + Utils.escapeHtml(orig.tipo) + '</span>';
            if (prazoRef) refStr += ' <span style="font-size:11px;color:#6b7280;">(prazo ' + prazoRef + ')</span>';
            if (dataRef) refStr += ' <span style="font-size:11px;color:#9ca3af;">de ' + dataRef + '</span>';
            refStr += ' <span style="color:#059669;font-weight:bold;">&rarr;</span> ';
            refStr += '<span style="display:inline-block;padding:2px 8px;background:#d1fae5;border:1px solid #6ee7b7;border-radius:4px;font-size:11px;color:#065f46;font-weight:bold;">' + Utils.escapeHtml(mov.tipo) + '</span>';
            refStr += ' <span style="font-size:11px;color:#059669;">(esta resposta)</span>';
            refStr += '</div>';
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
                    ${refStr}
                    ${prazoStr}
                    ${anexoStr}
                </td>
            </tr>`;
    });

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

    // Reset referência e preview do caminho
    const refSelect = document.getElementById('mov-referencia');
    if (refSelect) refSelect.value = '';
    const infoEl = document.getElementById('mov-referencia-info');
    if (infoEl) infoEl.innerHTML = '';
}

function setupFileInput() {
    const fileInput = document.getElementById('mov-arquivo');
    const fileName = document.getElementById('file-name');
    const icon = document.getElementById('icon-upload');
    const subtitleEl = fileInput ? fileInput.closest('label').querySelector('p:last-child') : null;

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                var file = this.files[0];
                var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                fileName.textContent = file.name;
                fileName.classList.add('text-green-600', 'font-semibold');
                fileName.classList.remove('text-slate-500');
                icon.classList.remove('text-slate-400');
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>';
                icon.classList.add('text-green-500');
                if (subtitleEl) {
                    subtitleEl.textContent = 'Pronto para envio - ' + sizeMB + ' MB';
                    subtitleEl.classList.add('text-green-500');
                    subtitleEl.classList.remove('text-slate-400');
                }
            } else {
                fileName.textContent = "Anexar PDF ou Imagem";
                fileName.classList.remove('text-green-600', 'font-semibold');
                fileName.classList.add('text-slate-500');
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>';
                icon.classList.remove('text-green-500');
                icon.classList.add('text-slate-400');
                if (subtitleEl) {
                    subtitleEl.textContent = 'Opcional - max 5MB';
                    subtitleEl.classList.remove('text-green-500');
                    subtitleEl.classList.add('text-slate-400');
                }
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

// =============================================================================
// FLOATING ACTION BUTTON - "Nova Movimentação"
// =============================================================================
function setupFloatingButton() {
    const mainContent = document.getElementById('main-content');
    const fab = document.getElementById('fab-nova-mov');
    const formSection = document.getElementById('form-section');
    if (!mainContent || !fab || !formSection) return;

    let ticking = false;
    mainContent.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                const formRect = formSection.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                // Mostra FAB se o formulário não está visível
                if (formRect.top > viewportHeight + 100 || formRect.bottom < -100) {
                    fab.classList.remove('hidden');
                } else {
                    fab.classList.add('hidden');
                }
                ticking = false;
            });
            ticking = true;
        }
    });
}

window.scrollToForm = function() {
    const formSection = document.getElementById('form-section');
    if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Foca no primeiro campo depois de scroll
        setTimeout(function() {
            var tipoSelect = document.getElementById('mov-tipo');
            if (tipoSelect) tipoSelect.focus();
        }, 600);
    }
};

// =============================================================================
// PAINEL DE DOCUMENTOS - Lista anexos das movimentações (sem precisar login Google)
// =============================================================================
let documentosPanelOpen = false;

function renderDocumentos(movimentacoes, linkPasta) {
    const listEl = document.getElementById('documentos-list');
    const badgeEl = document.getElementById('docs-count-badge');
    if (!listEl) return;

    // Coleta todos os anexos das movimentações
    const docs = [];
    if (movimentacoes) {
        movimentacoes.forEach(function(mov) {
            if (mov.anexo_link) {
                docs.push({
                    nome: mov.anexo_nome || 'Documento',
                    url: mov.anexo_link,
                    tipo: mov.tipo,
                    data: mov.data_movimentacao
                });
            }
        });
    }

    // Atualiza badge de contagem
    if (badgeEl) {
        badgeEl.textContent = docs.length;
        if (docs.length > 0) {
            badgeEl.className = 'ml-1.5 text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full min-w-[18px] text-center';
        }
    }

    if (docs.length === 0 && !linkPasta) {
        listEl.innerHTML = '<div class="px-5 py-8 text-center"><svg class="w-10 h-10 text-slate-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg><p class="text-sm text-slate-400 font-medium">Nenhum documento anexado</p><p class="text-[11px] text-slate-300 mt-1">Anexe documentos ao criar movimentações</p></div>';
        return;
    }

    var html = '';

    // Link para pasta do Drive (se houver)
    if (linkPasta) {
        html += '<a href="' + Utils.escapeHtml(linkPasta) + '" target="_blank" class="flex items-center gap-3 px-5 py-3.5 hover:bg-blue-50/50 transition-colors group">';
        html += '<div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors"><svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></div>';
        html += '<div class="flex-1 min-w-0"><p class="text-sm font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">Pasta do Processo (Google Drive)</p><p class="text-[10px] text-slate-400">Clique para abrir todos os arquivos no Drive</p></div>';
        html += '<svg class="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>';
        html += '</a>';
    }

    // Lista de documentos individuais
    docs.forEach(function(doc) {
        var isPdf = doc.nome.toLowerCase().includes('.pdf');
        var isImage = /\.(jpg|jpeg|png|gif|webp|bmp)/i.test(doc.nome);
        var iconColor = isPdf ? 'text-red-500 bg-red-50' : isImage ? 'text-purple-500 bg-purple-50' : 'text-slate-500 bg-slate-50';
        var iconSvg = isPdf
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>'
            : isImage
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path>';

        var safeUrl = doc.url.replace(/'/g, "\\'");
        var safeNome = doc.nome.replace(/'/g, "\\'");
        var dataFmt = doc.data ? Utils.formatDate(doc.data).split(' ')[0] : '';

        html += '<div class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/80 transition-colors animate-slide-down cursor-pointer" onclick="viewFile(\'' + safeUrl + '\', \'' + safeNome + '\')">';
        html += '<div class="w-10 h-10 rounded-xl ' + iconColor + ' flex items-center justify-center shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' + iconSvg + '</svg></div>';
        html += '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-700 truncate">' + Utils.escapeHtml(doc.nome) + '</p>';
        html += '<p class="text-[10px] text-slate-400 truncate">' + Utils.escapeHtml(doc.tipo) + (dataFmt ? ' &middot; ' + dataFmt : '') + '</p></div>';
        html += '<button class="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors shrink-0">Abrir</button>';
        html += '</div>';
    });

    listEl.innerHTML = html;
}

window.toggleDocumentos = function() {
    var section = document.getElementById('documentos-section');
    if (!section) return;

    documentosPanelOpen = !documentosPanelOpen;

    if (documentosPanelOpen) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
};

// Fechar modal de documentos ao clicar no backdrop
document.addEventListener('click', function(e) {
    var section = document.getElementById('documentos-section');
    if (section && !section.classList.contains('hidden') && e.target === section) {
        documentosPanelOpen = false;
        section.classList.add('hidden');
    }
});

// =============================================================================
// AUTO-REFRESH - Polling silencioso para sincronização multi-usuário
// =============================================================================
let autoRefreshTimer = null;
const AUTO_REFRESH_INTERVAL = 30000; // 30 segundos

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(function() {
        if (!currentProcessId || document.hidden) return;

        API.call('getProcessoDetalhe', { id_processo: currentProcessId }, 'POST', true)
            .then(function(data) {
                if (!data || !data.movimentacoes) return;

                var newCount = data.movimentacoes.length;
                var oldCount = currentMovimentacoes.length;

                // Compara quantidade de movimentações e status
                var statusChanged = data.processo && currentProcessData && currentProcessData.processo
                    && data.processo.status !== currentProcessData.processo.status;

                if (newCount !== oldCount || statusChanged) {
                    currentProcessData = data;
                    currentMovimentacoes = data.movimentacoes || [];

                    var p = data.processo;
                    var movs = data.movimentacoes;
                    var refMap = buildReferenceMap(movs);

                    updateStatusUI(p.status);
                    renderTimeline(movs, refMap);
                    renderPrazosPanel(movs, refMap);
                    populateReferenciaDropdown(movs, refMap);
                    renderDocumentos(movs, p.link_pasta);
                    loadNotasFromAPI(p);

                    var countBadge = document.getElementById('mov-count-badge');
                    if (countBadge) countBadge.textContent = movs.length;

                    var cacheKey = 'getProcessoDetalhe_' + JSON.stringify({ id_processo: currentProcessId });
                    Utils.Cache.set(cacheKey, data);

                    Utils.showToast("Dados atualizados.", "info");
                }
            })
            .catch(function() {
                // Erro silencioso - não interrompe polling
            });
    }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

// Pausa quando aba não está visível, retoma quando volta
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        stopAutoRefresh();
    } else if (currentProcessId) {
        startAutoRefresh();
    }
});

window.addEventListener('beforeunload', stopAutoRefresh);
