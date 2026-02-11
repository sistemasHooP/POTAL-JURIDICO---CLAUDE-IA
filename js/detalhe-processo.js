/**
 * ============================================================================
 * ARQUIVO: js/detalhe-processo.js
 * DESCRIÇÃO: Lógica da tela de detalhes, timeline e stepper.
 * ATUALIZAÇÃO: Visualizador Modal Completo, Descrição e UI Otimista.
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

let currentProcessId = null;

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

/**
 * [ATUALIZADO] Visualizador de Arquivos IN-APP (Modal)
 * Carrega o arquivo no Modal e configura o botão "Abrir Externo"
 */
window.viewFile = async function(url, nome) {
    if (!url) return;
    
    // Feedback visual no botão que foi clicado
    const btn = document.activeElement;
    const originalText = btn ? btn.innerText : '';
    if(btn && btn.tagName === 'BUTTON') {
        btn.innerText = "Baixando...";
        btn.disabled = true;
    }
    
    // Prepara o Modal
    const modal = document.getElementById('file-viewer-modal');
    const loader = document.getElementById('file-loader');
    const frame = document.getElementById('file-viewer-frame');
    const img = document.getElementById('file-viewer-image');
    const title = document.getElementById('file-viewer-title');
    const btnExternal = document.getElementById('btn-open-external');

    // Mostra Modal em estado de carregamento
    modal.classList.remove('hidden');
    loader.classList.remove('hidden');
    frame.classList.add('hidden');
    img.classList.add('hidden');
    title.textContent = nome || "Visualizando Arquivo";
    
    // Desabilita botão externo enquanto carrega
    if (btnExternal) {
        btnExternal.href = "#";
        btnExternal.classList.add('opacity-50', 'pointer-events-none');
    }
    
    try {
        // Baixa o arquivo via Proxy
        const data = await API.drive.download({ fileUrl: url });
        
        // Converte Base64 para Blob URL
        const byteCharacters = atob(data.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.mimeType });
        const blobUrl = URL.createObjectURL(blob);
        
        // Habilita e configura botão externo (Salvação para Mobile)
        if (btnExternal) {
            btnExternal.href = blobUrl;
            btnExternal.download = data.nome || nome || 'arquivo'; // Sugere nome para download
            btnExternal.classList.remove('opacity-50', 'pointer-events-none');
        }

        // Decide onde exibir
        if (data.mimeType.includes('pdf')) {
             frame.src = blobUrl;
             frame.classList.remove('hidden');
             loader.classList.add('hidden');
        } else if (data.mimeType.includes('image')) {
             img.src = blobUrl;
             img.classList.remove('hidden');
             loader.classList.add('hidden');
        } else {
             // Se não for PDF nem Imagem, força download direto e fecha modal
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

/**
 * Fecha o Modal de Visualização e limpa memória
 */
window.closeFileViewer = function() {
    const modal = document.getElementById('file-viewer-modal');
    const frame = document.getElementById('file-viewer-frame');
    const img = document.getElementById('file-viewer-image');
    
    modal.classList.add('hidden');
    
    // Limpa os recursos após a animação de saída
    setTimeout(() => {
        frame.src = "";
        img.src = "";
    }, 300);
};

/**
 * Carrega dados do processo.
 * Estratégia: Network First (Ignora cache velho).
 */
function loadProcessoDetalhe(id) {
    const timelineContainer = document.getElementById('timeline-container');

    // Usamos API.call direto (POST) em vez de API.processos.detalhar (SWR)
    // para garantir dados frescos. isSilent=true pois o loader já está na tela.
    API.call('getProcessoDetalhe', { id_processo: id }, 'POST', true)
    .then(data => {
        if (!data) {
            Utils.hideLoading();
            Utils.showToast("Erro ao carregar.", "error");
            return;
        }

        const p = data.processo;
        const movs = data.movimentacoes;

        // Atualiza Cache manualmente para a próxima vez ser rápido se necessário
        const cacheKey = `getProcessoDetalhe_${JSON.stringify({ id_processo: id })}`;
        Utils.Cache.set(cacheKey, data);

        // --- Renderização ---
        const elNumero = document.getElementById('proc-numero');
        if (elNumero) elNumero.textContent = p.numero_processo || 'S/N';

        const elParte = document.getElementById('proc-parte');
        if (elParte) elParte.textContent = p.parte_nome;

        const elTipo = document.getElementById('proc-tipo');
        if (elTipo) elTipo.textContent = p.tipo || 'Não Informado';
        
        // Preenche a Descrição Inicial
        const elDescricao = document.getElementById('proc-descricao');
        if (elDescricao) {
            elDescricao.textContent = p.descricao || "Nenhuma observação inicial registrada.";
        }
        
        updateStatusUI(p.status);

        const elData = document.getElementById('proc-data');
        if (elData) elData.textContent = Utils.formatDate(p.data_entrada);

        const elCriador = document.getElementById('proc-criador');
        if (elCriador) elCriador.textContent = p.criado_por ? p.criado_por.split('@')[0] : '-';

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

        // Remove o loader apenas após desenhar tudo
        Utils.hideLoading();

    }).catch(error => {
        console.error("Erro detalhes:", error);
        Utils.hideLoading();
        if (timelineContainer) timelineContainer.innerHTML = `<p class="text-red-500 pl-8">Falha ao carregar histórico.</p>`;
    });
}

function updateStatusUI(status) {
    const statusEl = document.getElementById('proc-status');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = `px-4 py-2 text-base font-bold rounded-lg border shadow-sm flex items-center gap-2 uppercase tracking-wide ${Utils.getStatusClass(status)}`;
    }
    const statusDescEl = document.getElementById('proc-status-desc');
    if (statusDescEl) statusDescEl.textContent = Utils.getStatusLabel(status);
}

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
        
        if (prazo < hoje) {
            colorClass = "bg-red-50 border-red-200 text-red-800"; 
            iconPulse = "animate-pulse";
        } else if (prazo > hoje) {
            colorClass = "bg-blue-50 border-blue-200 text-blue-800";
        }

        prazoHtml = `
            <div class="mt-3 px-3 py-2 ${colorClass} border rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                <svg class="w-4 h-4 flex-shrink-0 ${iconPulse}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>Vencimento: ${prazoFmt}</span>
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

async function handleMovimentacaoSubmit(e) {
    e.preventDefault();

    const tipo = document.getElementById('mov-tipo').value;
    const descricao = document.getElementById('mov-descricao').value.trim();
    const novoStatus = document.getElementById('mov-novo-status').value;
    const fileInput = document.getElementById('mov-arquivo');
    const dataPrazo = document.getElementById('mov-prazo').value;
    
    if (!tipo || !descricao) {
        Utils.showToast("Preencha tipo e descrição.", "warning");
        return;
    }

    const payload = {
        id_processo: currentProcessId,
        tipo: tipo,
        descricao: descricao,
        novo_status: novoStatus || null,
        data_prazo: dataPrazo || null
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
        data_prazo: dataPrazo
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

        const p = freshData.processo;
        const movs = freshData.movimentacoes;
        
        updateStatusUI(p.status);
        renderTimeline(movs);

    } catch (error) {
        console.error("Erro background:", error);
        Utils.showToast("Falha na sincronização.", "error");
    }
}

function resetForm() {
    document.getElementById('form-movimentacao').reset();
    const fileName = document.getElementById('file-name');
    const icon = document.getElementById('icon-upload');
    if(fileName) fileName.textContent = "Clique para anexar PDF ou Imagem";
    if(icon) icon.classList.remove('text-blue-500');
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
