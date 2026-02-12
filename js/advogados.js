/**
 * ============================================================================
 * ARQUIVO: js/advogados.js
 * DESCRIÇÃO: Lógica da página de gerenciamento de advogados.
 * VERSÃO: 1.0 - CRUD completo + atribuição de processos
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * ============================================================================
 */

let advogadosData = [];
let processosAtribuicaoData = [];
let advogadoSelecionadoId = null;
let isPresidente = false;

document.addEventListener('DOMContentLoaded', function() {

    if (!Auth.protectRoute()) return;

    // Só ADMIN e PRESIDENTE podem acessar esta página
    if (!Auth.isAdminOrPresident()) {
        Utils.showToast("Acesso negado. Apenas administradores.", "error");
        setTimeout(function() { Utils.navigateTo('dashboard.html'); }, 1500);
        return;
    }

    Auth.updateUserInfoUI();

    var user = Auth.getUser();
    if (user && user.nome) {
        var initialsEl = document.getElementById('user-initials');
        if (initialsEl) initialsEl.textContent = user.nome.substring(0, 1).toUpperCase();
    }

    // PRESIDENTE pode criar/editar ADMIN e escolher perfil
    isPresidente = user && (user.perfil || '').toUpperCase() === 'PRESIDENTE';
    if (isPresidente) {
        var perfilWrap = document.getElementById('adv-perfil-wrap');
        if (perfilWrap) perfilWrap.classList.remove('hidden');
    }

    var btnLogout = document.getElementById('desktop-logout-btn');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() { if (confirm('Sair?')) Auth.logout(); });
    }

    var mobileLogout = document.getElementById('mobile-logout-btn');
    if (mobileLogout) {
        mobileLogout.addEventListener('click', function() { if (confirm('Sair?')) Auth.logout(); });
    }

    // Form submit
    var form = document.getElementById('form-advogado');
    if (form) {
        form.addEventListener('submit', handleSalvarAdvogado);
    }

    // Busca na tabela
    var buscaInput = document.getElementById('busca-advogado');
    if (buscaInput) {
        buscaInput.addEventListener('input', function() {
            renderAdvogadosTable(this.value.trim().toLowerCase());
        });
    }

    // Busca no modal de processos
    var buscaProcInput = document.getElementById('busca-processo-atrib');
    if (buscaProcInput) {
        buscaProcInput.addEventListener('input', function() {
            renderProcessosAtribuicao(this.value.trim().toLowerCase());
        });
    }

    carregarAdvogados();
});

// =============================================================================
// CARREGAR ADVOGADOS
// =============================================================================
function carregarAdvogados() {
    API.advogados.listar()
        .then(function(data) {
            advogadosData = data || [];
            renderAdvogadosTable();
            atualizarStats();
        })
        .catch(function(err) {
            console.error("Erro ao carregar advogados:", err);
            Utils.showToast("Erro ao carregar advogados.", "error");
        });
}

// =============================================================================
// ATUALIZAR ESTATÍSTICAS
// =============================================================================
function atualizarStats() {
    var total = advogadosData.length;
    var ativos = advogadosData.filter(function(a) {
        var ativo = a.ativo;
        return ativo === true || ativo === 'TRUE' || ativo === 'true' || ativo === 1;
    }).length;
    var inativos = total - ativos;

    var elTotal = document.getElementById('stat-total');
    var elAtivos = document.getElementById('stat-ativos');
    var elInativos = document.getElementById('stat-inativos');

    if (elTotal) elTotal.textContent = total;
    if (elAtivos) elAtivos.textContent = ativos;
    if (elInativos) elInativos.textContent = inativos;
}

// =============================================================================
// RENDERIZAR TABELA DE ADVOGADOS
// =============================================================================
function renderAdvogadosTable(filtro) {
    var tbody = document.getElementById('advogados-list');
    if (!tbody) return;

    var lista = advogadosData;

    if (filtro) {
        lista = lista.filter(function(a) {
            var nome = (a.nome || '').toLowerCase();
            var email = (a.email || '').toLowerCase();
            return nome.indexOf(filtro) > -1 || email.indexOf(filtro) > -1;
        });
    }

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-12 text-center text-slate-400">' +
            '<svg class="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>' +
            '<p class="text-sm font-medium">Nenhum advogado encontrado</p>' +
            '<p class="text-xs text-slate-300 mt-1">Cadastre o primeiro advogado clicando no botão acima</p>' +
            '</td></tr>';
        return;
    }

    var html = '';
    lista.forEach(function(adv) {
        var ativo = adv.ativo === true || adv.ativo === 'TRUE' || adv.ativo === 'true' || adv.ativo === 1;
        var statusClass = ativo
            ? 'bg-green-100 text-green-700 border-green-200'
            : 'bg-red-100 text-red-700 border-red-200';
        var statusLabel = ativo ? 'Ativo' : 'Inativo';
        var iniciais = (adv.nome || '??').substring(0, 2).toUpperCase();
        var dataCriacao = adv.created_at ? Utils.formatDate(adv.created_at) : '-';

        html += '<tr class="hover:bg-slate-50/80 transition-colors">';

        // Nome + Iniciais + Badge de perfil
        var perfilUser = (adv.perfil || 'ADVOGADO').toUpperCase();
        var isAdmin = perfilUser === 'ADMIN';
        var avatarClass = isAdmin
            ? (ativo ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400')
            : (ativo ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400');

        html += '<td class="px-5 py-3.5">';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="w-9 h-9 rounded-xl ' + avatarClass + ' flex items-center justify-center font-bold text-xs shrink-0">' + Utils.escapeHtml(iniciais) + '</div>';
        html += '<div class="min-w-0">';
        html += '<div class="flex items-center gap-1.5">';
        html += '<p class="text-sm font-semibold text-slate-700 truncate">' + Utils.escapeHtml(adv.nome || '-') + '</p>';
        if (isAdmin) {
            html += '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 uppercase shrink-0">Admin</span>';
        }
        html += '</div>';
        html += '<p class="text-[10px] text-slate-400 sm:hidden truncate">' + Utils.escapeHtml(adv.email || '') + '</p>';
        html += '</div>';
        html += '</div>';
        html += '</td>';

        // Email (desktop)
        html += '<td class="px-5 py-3.5 hidden sm:table-cell">';
        html += '<p class="text-sm text-slate-600 truncate">' + Utils.escapeHtml(adv.email || '-') + '</p>';
        html += '<p class="text-[10px] text-slate-400">Desde: ' + dataCriacao + '</p>';
        html += '</td>';

        // Status
        html += '<td class="px-5 py-3.5">';
        html += '<span class="text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wider ' + statusClass + '">' + statusLabel + '</span>';
        html += '</td>';

        // Processos (desktop)
        html += '<td class="px-5 py-3.5 hidden md:table-cell">';
        html += '<button onclick="abrirModalProcessos(\'' + adv.id + '\', \'' + Utils.escapeHtml(adv.nome || '') + '\')" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors">';
        html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
        html += 'Gerenciar';
        html += '</button>';
        html += '</td>';

        // Ações
        html += '<td class="px-5 py-3.5 text-right">';
        html += '<div class="flex items-center justify-end gap-1">';

        // Botão editar
        html += '<button onclick="editarAdvogado(\'' + adv.id + '\')" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">';
        html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>';
        html += '</button>';

        // Botão processos (mobile)
        html += '<button onclick="abrirModalProcessos(\'' + adv.id + '\', \'' + Utils.escapeHtml(adv.nome || '') + '\')" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors md:hidden" title="Processos">';
        html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
        html += '</button>';

        // Botão ativar/desativar
        if (ativo) {
            html += '<button onclick="toggleStatusAdvogado(\'' + adv.id + '\', false)" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Desativar">';
            html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>';
            html += '</button>';
        } else {
            html += '<button onclick="toggleStatusAdvogado(\'' + adv.id + '\', true)" class="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Ativar">';
            html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            html += '</button>';
        }

        html += '</div>';
        html += '</td>';

        html += '</tr>';
    });

    tbody.innerHTML = html;
}

// =============================================================================
// ABRIR MODAL DE CADASTRO (Novo)
// =============================================================================
window.abrirModalCadastro = function() {
    document.getElementById('adv-id').value = '';
    document.getElementById('adv-nome').value = '';
    document.getElementById('adv-email').value = '';
    document.getElementById('adv-senha').value = '';
    document.getElementById('adv-senha').required = true;
    document.getElementById('adv-senha').placeholder = 'Mínimo 6 caracteres';
    document.getElementById('modal-titulo').textContent = 'Novo Usuário';
    document.getElementById('adv-senha-hint').classList.add('hidden');

    var perfilSel = document.getElementById('adv-perfil');
    if (perfilSel) perfilSel.value = 'ADVOGADO';

    document.getElementById('modal-advogado').classList.remove('hidden');
};

// =============================================================================
// EDITAR ADVOGADO
// =============================================================================
window.editarAdvogado = function(id) {
    var adv = advogadosData.find(function(a) { return a.id === id; });
    if (!adv) return;

    document.getElementById('adv-id').value = adv.id;
    document.getElementById('adv-nome').value = adv.nome || '';
    document.getElementById('adv-email').value = adv.email || '';
    document.getElementById('adv-senha').value = '';
    document.getElementById('adv-senha').required = false;
    document.getElementById('adv-senha').placeholder = 'Deixe vazio para manter';
    document.getElementById('modal-titulo').textContent = 'Editar Usuário';
    document.getElementById('adv-senha-hint').classList.remove('hidden');

    var perfilSel = document.getElementById('adv-perfil');
    if (perfilSel) perfilSel.value = (adv.perfil || 'ADVOGADO').toUpperCase();

    document.getElementById('modal-advogado').classList.remove('hidden');
};

// =============================================================================
// FECHAR MODAL
// =============================================================================
window.fecharModalAdvogado = function() {
    document.getElementById('modal-advogado').classList.add('hidden');
};

// =============================================================================
// SALVAR ADVOGADO (Criar ou Atualizar)
// =============================================================================
function handleSalvarAdvogado(e) {
    e.preventDefault();

    var id = document.getElementById('adv-id').value;
    var nome = document.getElementById('adv-nome').value.trim();
    var email = document.getElementById('adv-email').value.trim();
    var senha = document.getElementById('adv-senha').value;

    if (!nome || !email) {
        Utils.showToast("Preencha nome e email.", "warning");
        return;
    }

    var btn = document.getElementById('btn-salvar-adv');
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Salvando...';

    var promise;

    var perfilSel = document.getElementById('adv-perfil');
    var perfilEscolhido = (perfilSel && isPresidente) ? perfilSel.value : 'ADVOGADO';

    if (id) {
        // Atualizar
        var payload = { advogado_id: id, nome: nome, email: email };
        if (senha) payload.senha = senha;
        if (isPresidente) payload.perfil_usuario = perfilEscolhido;
        promise = API.advogados.atualizar(payload);
    } else {
        // Criar
        if (!senha || senha.length < 6) {
            Utils.showToast("Senha deve ter pelo menos 6 caracteres.", "warning");
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Salvar';
            return;
        }
        var payloadCriar = { nome: nome, email: email, senha: senha };
        if (isPresidente) payloadCriar.perfil_usuario = perfilEscolhido;
        promise = API.advogados.cadastrar(payloadCriar);
    }

    promise
        .then(function() {
            Utils.showToast(id ? "Usuário atualizado!" : "Usuário cadastrado!", "success");
            fecharModalAdvogado();
            carregarAdvogados();
        })
        .catch(function(err) {
            Utils.showToast(err.message || "Erro ao salvar.", "error");
        })
        .finally(function() {
            btn.disabled = false;
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Salvar';
        });
}

// =============================================================================
// TOGGLE STATUS (Ativar/Desativar) - Optimistic UI
// =============================================================================
window.toggleStatusAdvogado = function(id, novoStatus) {
    var adv = advogadosData.find(function(a) { return a.id === id; });
    if (!adv) return;

    var label = novoStatus ? 'ativar' : 'desativar';
    if (!confirm('Deseja ' + label + ' o advogado "' + (adv.nome || '') + '"?')) return;

    // Optimistic update
    adv.ativo = novoStatus;
    renderAdvogadosTable();
    atualizarStats();
    Utils.showToast(novoStatus ? "Advogado ativado!" : "Advogado desativado!", "success");

    API.advogados.atualizar({ advogado_id: id, ativo: novoStatus })
        .catch(function(err) {
            // Revert
            adv.ativo = !novoStatus;
            renderAdvogadosTable();
            atualizarStats();
            Utils.showToast("Erro: " + (err.message || 'Falha ao atualizar.'), "error");
        });
};

// =============================================================================
// MODAL: ATRIBUIR PROCESSOS AO ADVOGADO
// =============================================================================
window.abrirModalProcessos = function(advogadoId, advogadoNome) {
    advogadoSelecionadoId = advogadoId;

    var nomeEl = document.getElementById('modal-proc-advogado-nome');
    if (nomeEl) nomeEl.textContent = 'Advogado: ' + (advogadoNome || '...');

    var listEl = document.getElementById('processos-atrib-list');
    listEl.innerHTML = '<div class="px-5 py-8 text-center text-slate-400 text-sm"><svg class="w-6 h-6 animate-spin text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Carregando processos...</div>';

    document.getElementById('modal-processos').classList.remove('hidden');

    // Busca todos os processos
    API.advogados.listarProcessosAtribuicao()
        .then(function(data) {
            processosAtribuicaoData = data || [];
            renderProcessosAtribuicao();
        })
        .catch(function(err) {
            listEl.innerHTML = '<div class="px-5 py-8 text-center text-red-400 text-sm">Erro ao carregar processos.</div>';
        });
};

window.fecharModalProcessos = function() {
    document.getElementById('modal-processos').classList.add('hidden');
    advogadoSelecionadoId = null;
};

// =============================================================================
// RENDERIZAR LISTA DE PROCESSOS PARA ATRIBUIÇÃO
// =============================================================================
function renderProcessosAtribuicao(filtro) {
    var listEl = document.getElementById('processos-atrib-list');
    var statusEl = document.getElementById('atrib-status');
    if (!listEl) return;

    var lista = processosAtribuicaoData;

    if (filtro) {
        lista = lista.filter(function(p) {
            var num = (p.numero_processo || '').toLowerCase();
            var parte = (p.parte_nome || '').toLowerCase();
            return num.indexOf(filtro) > -1 || parte.indexOf(filtro) > -1;
        });
    }

    if (lista.length === 0) {
        listEl.innerHTML = '<div class="px-5 py-8 text-center text-slate-400 text-sm">Nenhum processo encontrado.</div>';
        return;
    }

    var atribuidos = 0;

    var html = '';
    lista.forEach(function(proc) {
        var isAtribuido = String(proc.advogado_id || '').trim() === String(advogadoSelecionadoId).trim();
        if (isAtribuido) atribuidos++;

        var outroAdvogado = proc.advogado_id && !isAtribuido;
        var statusClass = '';
        var statusIcon = '';

        if (isAtribuido) {
            statusClass = 'bg-indigo-50 border-indigo-200';
        } else {
            statusClass = 'bg-white hover:bg-slate-50';
        }

        var procStatusClass = Utils.getStatusClass(proc.status);

        html += '<div class="flex items-center gap-3 px-4 py-3 border-b border-slate-50 ' + statusClass + ' transition-colors">';

        // Checkbox visual
        html += '<button onclick="toggleAtribuicao(\'' + proc.id + '\', ' + (isAtribuido ? 'false' : 'true') + ')" class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all ';
        if (isAtribuido) {
            html += 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/20';
        } else {
            html += 'bg-white border-slate-300 hover:border-indigo-400 text-transparent hover:text-indigo-300';
        }
        html += '">';
        html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
        html += '</button>';

        // Info do processo
        html += '<div class="flex-1 min-w-0">';
        html += '<p class="text-sm font-semibold text-slate-700 truncate">' + Utils.escapeHtml(proc.numero_processo || 'S/N') + '</p>';
        html += '<p class="text-[10px] text-slate-400 truncate">' + Utils.escapeHtml(proc.parte_nome || '-') + ' &middot; ' + Utils.escapeHtml(proc.tipo || '') + '</p>';
        html += '</div>';

        // Status do processo
        html += '<span class="text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase shrink-0 ' + procStatusClass + '">' + Utils.escapeHtml(proc.status || '-') + '</span>';

        // Indicador de outro advogado
        if (outroAdvogado) {
            html += '<span class="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-semibold border border-amber-200 shrink-0" title="Atribuído a outro advogado">Outro</span>';
        }

        html += '</div>';
    });

    listEl.innerHTML = html;

    if (statusEl) {
        statusEl.textContent = atribuidos + ' processo(s) atribuído(s)';
    }
}

// =============================================================================
// TOGGLE ATRIBUIÇÃO DE PROCESSO
// =============================================================================
window.toggleAtribuicao = function(processoId, atribuir) {
    var advId = atribuir ? advogadoSelecionadoId : '';

    // Optimistic update
    var proc = processosAtribuicaoData.find(function(p) { return p.id === processoId; });
    if (proc) {
        proc.advogado_id = advId;
        renderProcessosAtribuicao(
            (document.getElementById('busca-processo-atrib') || {}).value || ''
        );
    }

    API.advogados.atribuirProcesso({ processo_id: processoId, advogado_id: advId })
        .then(function() {
            Utils.showToast(atribuir ? "Processo atribuído!" : "Processo desatribuído!", "success");
        })
        .catch(function(err) {
            // Revert
            if (proc) {
                proc.advogado_id = atribuir ? '' : advogadoSelecionadoId;
                renderProcessosAtribuicao();
            }
            Utils.showToast("Erro: " + (err.message || 'Falha na atribuição.'), "error");
        });
};

// Fechar modais ao clicar no backdrop
document.addEventListener('click', function(e) {
    var modalAdv = document.getElementById('modal-advogado');
    if (modalAdv && !modalAdv.classList.contains('hidden') && e.target === modalAdv) {
        fecharModalAdvogado();
    }

    var modalProc = document.getElementById('modal-processos');
    if (modalProc && !modalProc.classList.contains('hidden') && e.target === modalProc) {
        fecharModalProcessos();
    }
});
