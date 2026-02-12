/**
 * ============================================================================
 * ARQUIVO: js/clientes.js
 * DESCRICAO: Gerenciamento completo de clientes - CRUD + Processos vinculados
 * VERSAO: 2.0 (Fase 1 - Gerenciamento de Clientes)
 * DEPENDENCIAS: js/config.js, js/utils.js, js/api.js, js/auth.js
 * ============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // ESTADO
    // =========================================================================
    let clientes = [];
    let clientesFiltrados = [];
    let processosCache = [];
    let carregandoEmBackground = false;
    let clienteDetalheAtual = null;

    // =========================================================================
    // INICIALIZACAO
    // =========================================================================
    document.addEventListener('DOMContentLoaded', function () {
        // 1. Protecao de rota
        if (!Auth.protectRoute()) return;

        // 2. UI do usuario
        Auth.updateUserInfoUI();
        var user = Auth.getUser();
        if (user && user.nome) {
            var initEl = document.getElementById('user-initials');
            if (initEl) initEl.textContent = user.nome.substring(0, 1).toUpperCase();
        }

        // 3. Logout desktop
        var btnLogout = document.getElementById('desktop-logout-btn');
        if (btnLogout) {
            btnLogout.addEventListener('click', function () {
                if (confirm('Sair do sistema?')) Auth.logout();
            });
        }

        // 4. Bind de eventos
        bindEventos();

        // 5. Aplicar mascaras nos inputs do modal
        aplicarMascaras();

        // 6. Carregar dados
        carregarClientes({ forceRefresh: false });
        carregarProcessos();
    });

    // =========================================================================
    // BIND DE EVENTOS
    // =========================================================================
    function bindEventos() {
        // Busca e filtro
        var inputBusca = document.getElementById('busca-clientes');
        var selectStatus = document.getElementById('filtro-status');
        if (inputBusca) inputBusca.addEventListener('input', aplicarFiltro);
        if (selectStatus) selectStatus.addEventListener('change', aplicarFiltro);

        // Botao atualizar
        var btnAtualizar = document.getElementById('btn-atualizar-clientes');
        if (btnAtualizar) {
            btnAtualizar.addEventListener('click', function () {
                carregarClientes({ forceRefresh: true });
                carregarProcessos();
            });
        }

        // Botao novo cliente - abre modal
        var btnNovo = document.getElementById('btn-novo-cliente');
        if (btnNovo) btnNovo.addEventListener('click', abrirModalNovo);

        // Modal: fechar, cancelar
        var btnFecharModal = document.getElementById('btn-fechar-modal');
        var btnCancelar = document.getElementById('btn-cancelar-modal');
        if (btnFecharModal) btnFecharModal.addEventListener('click', fecharModal);
        if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

        // Modal: submit form
        var form = document.getElementById('form-cliente');
        if (form) form.addEventListener('submit', salvarCliente);

        // Modal overlay click fecha
        var modalOverlay = document.getElementById('modal-cliente');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function (e) {
                if (e.target === modalOverlay) fecharModal();
            });
        }

        // Modal detalhe: fechar
        var btnFecharDetalhe = document.getElementById('btn-fechar-detalhe');
        if (btnFecharDetalhe) btnFecharDetalhe.addEventListener('click', fecharModalDetalhe);

        var modalDetalhe = document.getElementById('modal-detalhe');
        if (modalDetalhe) {
            modalDetalhe.addEventListener('click', function (e) {
                if (e.target === modalDetalhe) fecharModalDetalhe();
            });
        }

        // Modal detalhe: editar
        var btnEditarDetalhe = document.getElementById('btn-editar-detalhe');
        if (btnEditarDetalhe) {
            btnEditarDetalhe.addEventListener('click', function () {
                if (clienteDetalheAtual) {
                    var cliente = clienteDetalheAtual;
                    fecharModalDetalhe();
                    abrirModalEditar(cliente);
                }
            });
        }

        // Toggle notificações de movimentação - UI OTIMISTA (resposta instantânea)
        var toggleNotif = document.getElementById('toggle-notificacao');
        if (toggleNotif) {
            toggleNotif.addEventListener('change', function () {
                if (!clienteDetalheAtual || !clienteDetalheAtual.id) return;
                var ativo = toggleNotif.checked;
                var label = document.getElementById('notif-status-label');

                // OTIMISTA: Atualiza UI imediatamente sem esperar API
                if (label) label.textContent = ativo ? 'Ativadas - e-mail a cada movimentação' : 'Desativadas';
                Utils.showToast(ativo ? 'Notificações ativadas!' : 'Notificações desativadas.', 'success');

                // Atualiza estado local imediatamente
                clienteDetalheAtual.notificacoes_ativas = ativo ? 'SIM' : 'NAO';
                clientes.forEach(function (c) {
                    if (String(c.id) === String(clienteDetalheAtual.id)) {
                        c.notificacoes_ativas = ativo ? 'SIM' : 'NAO';
                    }
                });

                // Sincroniza com backend em background (não bloqueia UI)
                API.call('atualizarCliente', {
                    cliente_id: clienteDetalheAtual.id,
                    notificacoes_ativas: ativo ? 'SIM' : 'NAO'
                }, 'POST', true).catch(function (err) {
                    // Reverte apenas se falhar
                    toggleNotif.checked = !ativo;
                    clienteDetalheAtual.notificacoes_ativas = !ativo ? 'SIM' : 'NAO';
                    clientes.forEach(function (c) {
                        if (String(c.id) === String(clienteDetalheAtual.id)) {
                            c.notificacoes_ativas = !ativo ? 'SIM' : 'NAO';
                        }
                    });
                    if (label) label.textContent = 'Erro - tente novamente';
                    Utils.showToast('Erro ao salvar notificação. Revertido.', 'error');
                });
            });
        }

        // Tecla Escape fecha modais
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var modalCliente = document.getElementById('modal-cliente');
                var modalDetalheEl = document.getElementById('modal-detalhe');
                if (modalCliente && !modalCliente.classList.contains('hidden')) fecharModal();
                if (modalDetalheEl && !modalDetalheEl.classList.contains('hidden')) fecharModalDetalhe();
            }
        });
    }

    // =========================================================================
    // MASCARAS
    // =========================================================================
    function aplicarMascaras() {
        var cpfInput = document.getElementById('cliente-cpf');
        if (cpfInput) {
            cpfInput.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');
                if (v.length <= 11) {
                    // Mascara CPF
                    if (v.length > 11) v = v.substring(0, 11);
                    if (v.length > 9) {
                        v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                    } else if (v.length > 6) {
                        v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                    } else if (v.length > 3) {
                        v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                    }
                } else {
                    // Mascara CNPJ
                    if (v.length > 14) v = v.substring(0, 14);
                    if (v.length > 12) {
                        v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
                    } else if (v.length > 8) {
                        v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
                    } else if (v.length > 5) {
                        v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
                    } else if (v.length > 2) {
                        v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
                    }
                }
                e.target.value = v;
            });
        }

        var telInput = document.getElementById('cliente-telefone');
        if (telInput) {
            telInput.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.substring(0, 11);
                if (v.length > 6) {
                    v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
                } else if (v.length > 2) {
                    v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
                }
                e.target.value = v;
            });
        }
    }

    // =========================================================================
    // CARREGAR DADOS
    // =========================================================================
    function carregarClientes(opts) {
        opts = opts || {};
        var forceRefresh = !!opts.forceRefresh;
        var btn = document.getElementById('btn-atualizar-clientes');

        if (!clientes || clientes.length === 0) {
            renderLoadingTabela('Carregando clientes...');
        }

        carregandoEmBackground = true;
        setBtnLoading(btn, true, forceRefresh ? 'Atualizando...' : 'Carregando...');

        API.fetchWithCache(
            'listarClientes',
            {},
            function (resultado, source) {
                var lista = (resultado && resultado.clientes) ? resultado.clientes : resultado;
                clientes = Array.isArray(lista) ? lista : [];

                clientes.sort(function (a, b) {
                    var na = String(a.nome_completo || a.nome || '').toLowerCase();
                    var nb = String(b.nome_completo || b.nome || '').toLowerCase();
                    if (na < nb) return -1;
                    if (na > nb) return 1;
                    return 0;
                });

                atualizarStats();
                aplicarFiltro();

                if (source === 'cache') return;
                carregandoEmBackground = false;
                setBtnLoading(btn, false);
            },
            true,
            forceRefresh
        );
    }

    function carregarProcessos() {
        API.fetchWithCache(
            'listarProcessos',
            {},
            function (resultado, source) {
                processosCache = Array.isArray(resultado) ? resultado : [];
                // Atualiza badges de contagem de processos nos clientes já renderizados
                atualizarBadgesProcessos();
            },
            true,
            false
        );
    }

    function atualizarBadgesProcessos() {
        if (!processosCache.length) return;
        var badges = document.querySelectorAll('[data-badge-cliente-id]');
        badges.forEach(function(el) {
            var clienteId = el.getAttribute('data-badge-cliente-id');
            var clienteNome = el.getAttribute('data-badge-cliente-nome') || '';
            var count = 0;

            processosCache.forEach(function(p) {
                var pClienteId = String(p.cliente_id || '');
                var parteNome = String(p.parte_nome || '').trim().toLowerCase();
                if ((clienteId && pClienteId === clienteId) || (clienteNome && parteNome === clienteNome)) {
                    count++;
                }
            });

            if (count > 0) {
                el.innerHTML = '<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">' + count + ' proc.</span>';
            } else {
                el.innerHTML = '';
            }
        });
    }

    // =========================================================================
    // STATS
    // =========================================================================
    function atualizarStats() {
        var total = clientes.length;
        var ativos = 0;
        var inativos = 0;
        var bloqueados = 0;

        clientes.forEach(function (c) {
            var status = String(c.status || 'ATIVO').toUpperCase();
            if (status === 'ATIVO') ativos++;
            else if (status === 'INATIVO') inativos++;
            else if (status === 'BLOQUEADO') bloqueados++;
        });

        var elTotal = document.getElementById('stat-total');
        var elAtivos = document.getElementById('stat-ativos');
        var elInativos = document.getElementById('stat-inativos');
        var elBloqueados = document.getElementById('stat-bloqueados');

        if (elTotal) elTotal.textContent = total;
        if (elAtivos) elAtivos.textContent = ativos;
        if (elInativos) elInativos.textContent = inativos;
        if (elBloqueados) elBloqueados.textContent = bloqueados;
    }

    // =========================================================================
    // FILTRO
    // =========================================================================
    function aplicarFiltro() {
        var termo = (document.getElementById('busca-clientes')?.value || '').trim().toLowerCase();
        var statusFiltro = (document.getElementById('filtro-status')?.value || '');

        clientesFiltrados = clientes.filter(function (c) {
            // Filtro de status
            if (statusFiltro && String(c.status || 'ATIVO').toUpperCase() !== statusFiltro) {
                return false;
            }

            // Filtro de texto
            if (!termo) return true;

            var nome = String(c.nome_completo || c.nome || '').toLowerCase();
            var cpfRaw = String(c.cpf || '').toLowerCase();
            var cpfDigits = cpfRaw.replace(/\D/g, '');
            var email = String(c.email || '').toLowerCase();
            var tel = String(c.telefone || '').replace(/\D/g, '');
            var termoDig = termo.replace(/\D/g, '');

            return (
                nome.includes(termo) ||
                email.includes(termo) ||
                cpfRaw.includes(termo) ||
                (termoDig && termoDig.length >= 3 && cpfDigits.includes(termoDig)) ||
                (termoDig && tel.includes(termoDig))
            );
        });

        var countEl = document.getElementById('results-count');
        if (countEl) countEl.textContent = clientesFiltrados.length;

        renderTabela();
    }

    // =========================================================================
    // FORMATACAO
    // =========================================================================
    function formatarCPF(cpf) {
        var raw = String(cpf || '');
        var d = raw.replace(/\D/g, '');
        if (!d) return raw || '-';
        if (d.length === 11) {
            return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        }
        if (d.length === 14) {
            return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        }
        return d;
    }

    function formatarTelefone(telefone) {
        var d = String(telefone || '').replace(/\D/g, '');
        if (!d) return '-';
        if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
        if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
        return d;
    }

    function getStatusConfig(status) {
        var s = String(status || 'ATIVO').toUpperCase();
        switch (s) {
            case 'ATIVO':
                return { class: 'bg-green-100 text-green-700', label: 'Ativo' };
            case 'INATIVO':
                return { class: 'bg-slate-100 text-slate-600', label: 'Inativo' };
            case 'BLOQUEADO':
                return { class: 'bg-red-100 text-red-700', label: 'Bloqueado' };
            default:
                return { class: 'bg-slate-100 text-slate-600', label: s };
        }
    }

    function getIniciais(nome) {
        var parts = String(nome || 'C').trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }
        return parts[0].charAt(0).toUpperCase();
    }

    // =========================================================================
    // RENDERIZACAO DA TABELA
    // =========================================================================
    function renderLoadingTabela(mensagem) {
        var tbody = document.getElementById('lista-clientes');
        if (!tbody) return;
        tbody.innerHTML =
            '<tr><td colspan="5" class="py-8 text-center text-slate-400">' +
            '<span class="inline-flex items-center gap-2">' +
            '<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">' +
            '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
            '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>' +
            '<span>' + Utils.escapeHtml(mensagem || 'Carregando...') + '</span></span></td></tr>';
    }

    function setBtnLoading(btn, isLoading, texto) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.dataset._oldHtml = btn.innerHTML;
            btn.innerHTML =
                '<span class="inline-flex items-center gap-2">' +
                '<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">' +
                '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
                '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>' +
                '<span>' + Utils.escapeHtml(texto || 'Atualizando...') + '</span></span>';
        } else {
            btn.disabled = false;
            if (btn.dataset._oldHtml) {
                btn.innerHTML = btn.dataset._oldHtml;
                delete btn.dataset._oldHtml;
            }
        }
    }

    function renderTabela() {
        var tbody = document.getElementById('lista-clientes');
        if (!tbody) return;

        if (!clientesFiltrados || clientesFiltrados.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" class="py-8 text-center text-slate-400">' +
                (carregandoEmBackground ? 'Atualizando lista...' : 'Nenhum cliente encontrado.') +
                '</td></tr>';
            return;
        }

        var fragment = document.createDocumentFragment();

        clientesFiltrados.forEach(function (c) {
            var tr = document.createElement('tr');
            tr.className = 'border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group';

            var nome = Utils.escapeHtml(c.nome_completo || c.nome || '-');
            var cpf = Utils.escapeHtml(formatarCPF(c.cpf));
            var email = Utils.escapeHtml(c.email || '-');
            var tel = Utils.escapeHtml(formatarTelefone(c.telefone));
            var statusCfg = getStatusConfig(c.status);
            var iniciais = Utils.escapeHtml(getIniciais(c.nome_completo || c.nome));

            // Badge de processos - usa data attribute para atualização assíncrona
            var clienteIdStr = String(c.id || '');
            var clienteNomeStr = String(c.nome_completo || c.nome || '').trim().toLowerCase();
            var qtdProcessos = contarProcessosCliente(c);
            var badgeHtml = qtdProcessos > 0
                ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">' + qtdProcessos + ' proc.</span>'
                : '';

            tr.innerHTML =
                '<td class="px-4 py-3">' +
                    '<div class="flex items-center gap-3">' +
                        '<div class="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">' + iniciais + '</div>' +
                        '<div class="min-w-0">' +
                            '<p class="font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate">' + nome + '</p>' +
                            '<p class="text-xs text-slate-400 sm:hidden">' + cpf + '</p>' +
                        '</div>' +
                        '<span class="ml-1" data-badge-cliente-id="' + Utils.escapeHtml(clienteIdStr) + '" data-badge-cliente-nome="' + Utils.escapeHtml(clienteNomeStr) + '">' + badgeHtml + '</span>' +
                    '</div>' +
                '</td>' +
                '<td class="px-4 py-3 hidden sm:table-cell text-slate-600">' + cpf + '</td>' +
                '<td class="px-4 py-3 hidden md:table-cell">' +
                    '<p class="text-slate-600">' + email + '</p>' +
                    '<p class="text-xs text-slate-400">' + tel + '</p>' +
                '</td>' +
                '<td class="px-4 py-3">' +
                    '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ' + statusCfg.class + '">' + Utils.escapeHtml(statusCfg.label) + '</span>' +
                '</td>' +
                '<td class="px-4 py-3 text-right">' +
                    '<div class="flex items-center justify-end gap-1">' +
                        '<button class="btn-editar p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">' +
                            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>' +
                        '</button>' +
                        '<button class="btn-ver p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="Ver detalhes">' +
                            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>' +
                        '</button>' +
                    '</div>' +
                '</td>';

            // Evento: clique na linha abre detalhe
            tr.addEventListener('click', function (e) {
                // Se clicou em um botao de acao, nao abre detalhe
                if (e.target.closest('.btn-editar') || e.target.closest('.btn-ver')) return;
                abrirModalDetalhe(c);
            });

            // Evento: botao editar
            var btnEditar = tr.querySelector('.btn-editar');
            if (btnEditar) {
                btnEditar.addEventListener('click', function (e) {
                    e.stopPropagation();
                    abrirModalEditar(c);
                });
            }

            // Evento: botao ver
            var btnVer = tr.querySelector('.btn-ver');
            if (btnVer) {
                btnVer.addEventListener('click', function (e) {
                    e.stopPropagation();
                    abrirModalDetalhe(c);
                });
            }

            fragment.appendChild(tr);
        });

        tbody.replaceChildren(fragment);
    }

    // =========================================================================
    // CONTAR PROCESSOS DO CLIENTE
    // =========================================================================
    function contarProcessosCliente(cliente) {
        if (!processosCache || !processosCache.length) return 0;
        var nomeCliente = String(cliente.nome_completo || cliente.nome || '').trim().toLowerCase();
        var clienteId = String(cliente.id || '');
        var count = 0;

        processosCache.forEach(function (p) {
            var parteNome = String(p.parte_nome || '').trim().toLowerCase();
            var pClienteId = String(p.cliente_id || '');
            if ((clienteId && pClienteId === clienteId) || (nomeCliente && parteNome === nomeCliente)) {
                count++;
            }
        });

        return count;
    }

    function getProcessosDoCliente(cliente) {
        if (!processosCache || !processosCache.length) return [];
        var nomeCliente = String(cliente.nome_completo || cliente.nome || '').trim().toLowerCase();
        var clienteId = String(cliente.id || '');

        return processosCache.filter(function (p) {
            var parteNome = String(p.parte_nome || '').trim().toLowerCase();
            var pClienteId = String(p.cliente_id || '');
            return (clienteId && pClienteId === clienteId) || (nomeCliente && parteNome === nomeCliente);
        });
    }

    // =========================================================================
    // MODAL: NOVO CLIENTE
    // =========================================================================
    function abrirModalNovo() {
        document.getElementById('modal-titulo').textContent = 'Novo Cliente';
        document.getElementById('btn-salvar-cliente').textContent = 'Cadastrar';
        document.getElementById('cliente-edit-id').value = '';
        document.getElementById('cliente-nome').value = '';
        document.getElementById('cliente-cpf').value = '';
        document.getElementById('cliente-cpf').readOnly = false;
        document.getElementById('cliente-email').value = '';
        document.getElementById('cliente-telefone').value = '';
        document.getElementById('cliente-status').value = 'ATIVO';
        document.getElementById('campo-status').classList.add('hidden');

        var modal = document.getElementById('modal-cliente');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        setTimeout(function () {
            document.getElementById('cliente-nome').focus();
        }, 200);
    }

    // =========================================================================
    // MODAL: EDITAR CLIENTE
    // =========================================================================
    function abrirModalEditar(cliente) {
        document.getElementById('modal-titulo').textContent = 'Editar Cliente';
        document.getElementById('btn-salvar-cliente').textContent = 'Salvar Alteracoes';
        document.getElementById('cliente-edit-id').value = cliente.id || '';
        document.getElementById('cliente-nome').value = cliente.nome_completo || cliente.nome || '';
        document.getElementById('cliente-cpf').value = formatarCPF(cliente.cpf);
        document.getElementById('cliente-cpf').readOnly = true;
        document.getElementById('cliente-email').value = cliente.email || '';
        document.getElementById('cliente-telefone').value = formatarTelefone(cliente.telefone);
        document.getElementById('cliente-status').value = String(cliente.status || 'ATIVO').toUpperCase();
        document.getElementById('campo-status').classList.remove('hidden');

        var modal = document.getElementById('modal-cliente');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        setTimeout(function () {
            document.getElementById('cliente-nome').focus();
        }, 200);
    }

    function fecharModal() {
        var modal = document.getElementById('modal-cliente');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // =========================================================================
    // SALVAR CLIENTE (CADASTRAR OU EDITAR)
    // =========================================================================
    async function salvarCliente(e) {
        e.preventDefault();

        var editId = document.getElementById('cliente-edit-id').value.trim();
        var nome = document.getElementById('cliente-nome').value.trim();
        var cpfRaw = document.getElementById('cliente-cpf').value.replace(/\D/g, '');
        var email = document.getElementById('cliente-email').value.trim().toLowerCase();
        var telefone = document.getElementById('cliente-telefone').value.replace(/\D/g, '');
        var status = document.getElementById('cliente-status').value;

        // Validacoes
        if (!nome) {
            Utils.showToast('Digite o nome do cliente.', 'warning');
            document.getElementById('cliente-nome').focus();
            return;
        }

        if (!editId && cpfRaw.length !== 11 && cpfRaw.length !== 14) {
            Utils.showToast('CPF deve ter 11 digitos ou CNPJ deve ter 14 digitos.', 'warning');
            document.getElementById('cliente-cpf').focus();
            return;
        }

        if (!editId && cpfRaw.length === 11 && !Utils.validarCPF(cpfRaw)) {
            Utils.showToast('CPF invalido. Verifique os digitos.', 'warning');
            document.getElementById('cliente-cpf').focus();
            return;
        }

        if (!editId && cpfRaw.length === 14 && !Utils.validarCNPJ(cpfRaw)) {
            Utils.showToast('CNPJ invalido. Verifique os digitos.', 'warning');
            document.getElementById('cliente-cpf').focus();
            return;
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            Utils.showToast('Digite um email valido.', 'warning');
            document.getElementById('cliente-email').focus();
            return;
        }

        var btn = document.getElementById('btn-salvar-cliente');
        btn.classList.add('btn-loading');
        btn.disabled = true;

        try {
            if (editId) {
                // EDITAR
                var payload = {
                    cliente_id: editId,
                    nome_completo: nome,
                    email: email,
                    telefone: telefone,
                    status: status
                };

                await API.call('atualizarCliente', payload);
                Utils.showToast('Cliente atualizado com sucesso!', 'success');
            } else {
                // CADASTRAR
                var payload = {
                    nome_completo: nome,
                    cpf: cpfRaw,
                    email: email,
                    telefone: telefone
                };

                await API.call('cadastrarCliente', payload);
                Utils.showToast('Cliente cadastrado com sucesso!', 'success');
            }

            // Limpar cache e recarregar
            Utils.Cache.clear('listarClientes');
            fecharModal();
            carregarClientes({ forceRefresh: true });

            // Sincronizar com outras abas
            try {
                if ('BroadcastChannel' in window) {
                    var bc = new BroadcastChannel('rpps_juridico_sync');
                    bc.postMessage({ type: 'clientes_updated', ts: Date.now() });
                    bc.close();
                }
                localStorage.setItem('rpps_clientes_last_update', String(Date.now()));
            } catch (syncErr) {
                // silencio
            }

        } catch (error) {
            console.error('Erro ao salvar cliente:', error);
            Utils.showToast(error.message || 'Erro ao salvar cliente.', 'error');
        } finally {
            btn.classList.remove('btn-loading');
            btn.disabled = false;
        }
    }

    // =========================================================================
    // MODAL: DETALHE DO CLIENTE (COM PROCESSOS)
    // =========================================================================
    function abrirModalDetalhe(cliente) {
        clienteDetalheAtual = cliente;

        var nome = cliente.nome_completo || cliente.nome || '-';
        var statusCfg = getStatusConfig(cliente.status);

        document.getElementById('detalhe-avatar').textContent = getIniciais(nome);
        document.getElementById('detalhe-nome').textContent = nome;
        document.getElementById('detalhe-email').textContent = cliente.email || '-';
        var docDigits = String(cliente.cpf || '').replace(/\D/g, '');
        var docLabel = docDigits.length === 14 ? 'CNPJ: ' : 'CPF: ';
        document.getElementById('detalhe-cpf').textContent = docLabel + formatarCPF(cliente.cpf);
        document.getElementById('detalhe-tel').textContent = 'Tel: ' + formatarTelefone(cliente.telefone);

        var statusEl = document.getElementById('detalhe-status');
        statusEl.textContent = statusCfg.label;
        statusEl.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ' + statusCfg.class;

        var criadoEl = document.getElementById('detalhe-criado');
        if (cliente.created_at) {
            criadoEl.textContent = 'Cadastrado em ' + Utils.formatDate(cliente.created_at);
        } else {
            criadoEl.textContent = '';
        }

        // Configurar toggle de notificações
        var toggleNotif = document.getElementById('toggle-notificacao');
        var notifLabel = document.getElementById('notif-status-label');
        if (toggleNotif) {
            var notifAtiva = String(cliente.notificacoes_ativas || 'SIM').toUpperCase() !== 'NAO';
            toggleNotif.checked = notifAtiva;
            if (notifLabel) {
                notifLabel.textContent = notifAtiva ? 'Ativadas - e-mail a cada movimentação' : 'Desativadas';
            }
        }

        // Carregar processos do cliente
        var processos = getProcessosDoCliente(cliente);
        renderProcessosDetalhe(processos);

        var qtdEl = document.getElementById('detalhe-qtd-processos');
        qtdEl.textContent = processos.length + (processos.length === 1 ? ' processo' : ' processos');

        // Botao "Novo Processo para este Cliente" - valida status antes
        var btnNovoProc = document.getElementById('btn-novo-processo-cliente');
        if (btnNovoProc) {
            var statusCliente = String(cliente.status || 'ATIVO').toUpperCase();
            if (statusCliente === 'BLOQUEADO' || statusCliente === 'INATIVO') {
                // Bloqueia o botão para clientes inativos/bloqueados
                btnNovoProc.removeAttribute('href');
                btnNovoProc.style.pointerEvents = 'none';
                btnNovoProc.className = 'w-full py-2.5 bg-slate-300 text-slate-500 rounded-lg font-medium flex items-center justify-center gap-2 cursor-not-allowed';
                btnNovoProc.innerHTML =
                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>' +
                    (statusCliente === 'BLOQUEADO' ? 'Cliente Bloqueado - Não é possível abrir processo' : 'Cliente Inativo - Ative o cadastro primeiro');
            } else {
                // Cliente ativo - permite criar processo
                var params = new URLSearchParams();
                params.set('cliente_id', cliente.id || '');
                params.set('cliente_nome', cliente.nome_completo || cliente.nome || '');
                params.set('cliente_cpf', String(cliente.cpf || '').replace(/\D/g, ''));
                params.set('cliente_email', cliente.email || '');
                params.set('cliente_telefone', cliente.telefone || '');
                btnNovoProc.href = 'novo-processo.html?' + params.toString();
                btnNovoProc.style.pointerEvents = '';
                btnNovoProc.className = 'w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all';
                btnNovoProc.innerHTML =
                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>' +
                    'Novo Processo para este Cliente';
            }
        }

        var modal = document.getElementById('modal-detalhe');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function fecharModalDetalhe() {
        var modal = document.getElementById('modal-detalhe');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        clienteDetalheAtual = null;
    }

    function renderProcessosDetalhe(processos) {
        var container = document.getElementById('detalhe-processos-lista');
        if (!container) return;

        if (!processos || processos.length === 0) {
            container.innerHTML =
                '<div class="text-center py-8 text-slate-400">' +
                    '<svg class="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>' +
                    '<p class="text-sm">Nenhum processo vinculado a este cliente.</p>' +
                '</div>';
            return;
        }

        var fragment = document.createDocumentFragment();

        processos.forEach(function (p) {
            var div = document.createElement('a');
            div.href = 'detalhe-processo.html?id=' + encodeURIComponent(p.id) + '&parte=' + encodeURIComponent(p.parte_nome || '');
            div.className = 'block p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all group';

            var badgeClass = Utils.getStatusClass(p.status);
            var data = p.data_entrada ? Utils.formatDate(p.data_entrada) : Utils.formatDate(p.created_at);

            div.innerHTML =
                '<div class="flex items-center justify-between">' +
                    '<div class="min-w-0 flex-1">' +
                        '<p class="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors text-sm truncate">' + Utils.escapeHtml(p.numero_processo || 'S/N') + '</p>' +
                        '<p class="text-xs text-slate-500 mt-0.5">' + Utils.escapeHtml(p.tipo || '-') + ' &middot; ' + Utils.escapeHtml(data) + '</p>' +
                    '</div>' +
                    '<div class="flex items-center gap-2 ml-3 shrink-0">' +
                        '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ' + badgeClass + '">' + Utils.escapeHtml(p.status || '-') + '</span>' +
                        '<svg class="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>' +
                    '</div>' +
                '</div>';

            fragment.appendChild(div);
        });

        container.replaceChildren(fragment);
    }

})();
