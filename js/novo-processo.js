/**
 * ============================================================================
 * ARQUIVO: js/novo-processo.js
 * DESCRICAO: Logica da pagina Novo Processo com busca unificada inteligente
 * VERSAO: 2.0 (Fase 3 - Campo unico de busca por nome ou CPF)
 * DEPENDENCIAS: js/config.js, js/utils.js, js/api.js, js/auth.js
 * ============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // ESTADO
    // =========================================================================
    var clienteSelecionado = null;
    var clienteVinculado = false;
    var listaClientesCache = [];
    var clientesById = {};

    // Cache sync
    var CLIENTES_CACHE_KEY = 'listarClientes_' + JSON.stringify({});
    var CLIENTES_CACHE_TTL_MINUTES = 60;
    var CLIENTES_SYNC_CHANNEL = 'rpps_juridico_sync';
    var bcClientes = null;

    // =========================================================================
    // INICIALIZACAO
    // =========================================================================
    document.addEventListener('DOMContentLoaded', function () {
        if (!Auth.protectRoute()) return;

        Auth.updateUserInfoUI();
        var user = Auth.getUser();
        if (user && user.nome) {
            var el = document.getElementById('user-initials');
            if (el) el.textContent = user.nome.substring(0, 1).toUpperCase();
        }

        var btnLogout = document.getElementById('desktop-logout-btn');
        if (btnLogout) {
            btnLogout.addEventListener('click', function () { if (confirm('Sair?')) Auth.logout(); });
        }

        // Datepicker
        flatpickr('#data_entrada', { locale: 'pt', dateFormat: 'd/m/Y', defaultDate: new Date() });

        // Mascaras
        aplicarMascaras();

        // Campo "Outros"
        var tipoSelect = document.getElementById('tipo');
        var divOutros = document.getElementById('div-tipo-outro');
        var inputOutros = document.getElementById('tipo_outro');
        if (tipoSelect && divOutros && inputOutros) {
            tipoSelect.addEventListener('change', function () {
                if (this.value === 'OUTROS') {
                    divOutros.classList.remove('hidden');
                    inputOutros.setAttribute('required', 'true');
                    inputOutros.focus();
                } else {
                    divOutros.classList.add('hidden');
                    inputOutros.removeAttribute('required');
                    inputOutros.value = '';
                }
            });
        }

        // Eventos
        bindEventos();

        // Sync e carga de clientes
        initClientesSync();
        carregarClientes();

        // Auto-preencher cliente se veio da tela de clientes (com params na URL)
        verificarClienteViaURL();
    });

    // =========================================================================
    // BIND DE EVENTOS
    // =========================================================================
    function bindEventos() {
        // Campo unificado
        var inputBusca = document.getElementById('busca-unificada');
        var btnBuscar = document.getElementById('btn-buscar');

        if (inputBusca) {
            inputBusca.addEventListener('input', onBuscaInput);
            inputBusca.addEventListener('focus', onBuscaInput);
            inputBusca.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    executarBuscaInteligente();
                }
            });
        }
        if (btnBuscar) btnBuscar.addEventListener('click', executarBuscaInteligente);

        // Fechar sugestoes ao clicar fora
        document.addEventListener('click', function (e) {
            var box = document.getElementById('sugestoes-box');
            var wrap = document.getElementById('busca-unificada');
            if (box && wrap && !wrap.parentElement.contains(e.target)) {
                box.classList.add('hidden');
            }
        });

        // Botoes do resultado
        var btnLimpar = document.getElementById('btn-limpar-cliente');
        if (btnLimpar) btnLimpar.addEventListener('click', limparCliente);

        var btnContinuar = document.getElementById('btn-continuar-cliente');
        if (btnContinuar) btnContinuar.addEventListener('click', avancarParaProcesso);

        var btnCadastrar = document.getElementById('btn-cadastrar-cliente');
        if (btnCadastrar) btnCadastrar.addEventListener('click', cadastrarEAvancar);

        var btnPular = document.getElementById('btn-pular');
        if (btnPular) btnPular.addEventListener('click', pularCadastroCliente);

        // Step 2 botoes
        var btnVoltar = document.getElementById('btn-voltar-step1');
        if (btnVoltar) btnVoltar.addEventListener('click', voltarParaCliente);

        var btnAlterar = document.getElementById('btn-alterar-cliente');
        if (btnAlterar) btnAlterar.addEventListener('click', voltarParaCliente);

        var formProcesso = document.getElementById('form-processo');
        if (formProcesso) formProcesso.addEventListener('submit', salvarProcesso);
    }

    // =========================================================================
    // MASCARAS
    // =========================================================================
    function aplicarMascaras() {
        var telInput = document.getElementById('novo-cliente-telefone');
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

        // Mascara CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO (20 digitos)
        var numInput = document.getElementById('numero_processo');
        if (numInput) {
            numInput.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');
                if (v.length > 20) v = v.substring(0, 20);
                if (v.length > 16) {
                    v = v.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{0,4})/, '$1-$2.$3.$4.$5.$6');
                } else if (v.length > 14) {
                    v = v.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{0,2})/, '$1-$2.$3.$4.$5');
                } else if (v.length > 13) {
                    v = v.replace(/^(\d{7})(\d{2})(\d{4})(\d{0,1})/, '$1-$2.$3.$4');
                } else if (v.length > 9) {
                    v = v.replace(/^(\d{7})(\d{2})(\d{0,4})/, '$1-$2.$3');
                } else if (v.length > 7) {
                    v = v.replace(/^(\d{7})(\d{0,2})/, '$1-$2');
                }
                e.target.value = v;
            });
            numInput.setAttribute('placeholder', '0000000-00.0000.0.00.0000');
            numInput.setAttribute('maxlength', '25');
        }
    }

    // =========================================================================
    // HELPERS CPF
    // =========================================================================
    function normalizarCPF(valor) {
        var digitos = String(valor || '').replace(/\D/g, '');
        if (!digitos) return '';
        return digitos.padStart(11, '0').slice(-11);
    }

    function formatarCPF(cpf) {
        var d = String(cpf || '').replace(/\D/g, '');
        if (d.length === 11) {
            return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        }
        return String(cpf || '-');
    }

    function pareceSerCPF(termo) {
        var digitos = termo.replace(/\D/g, '');
        return digitos.length >= 6 && digitos.length <= 11;
    }

    function ehCPFCompleto(termo) {
        var digitos = termo.replace(/\D/g, '');
        return digitos.length === 11;
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================================================================
    // CACHE + SYNC DE CLIENTES
    // =========================================================================
    function initClientesSync() {
        try {
            if ('BroadcastChannel' in window) {
                bcClientes = new BroadcastChannel(CLIENTES_SYNC_CHANNEL);
                bcClientes.onmessage = function (ev) {
                    var msg = ev && ev.data ? ev.data : null;
                    if (!msg || msg.type !== 'clientes_updated') return;
                    sincronizarDoCache();
                };
            }
        } catch (e) { bcClientes = null; }

        window.addEventListener('storage', function (e) {
            if (!e) return;
            if (e.key === CLIENTES_CACHE_KEY || e.key === 'rpps_clientes_last_update') {
                sincronizarDoCache();
            }
        });
    }

    function sincronizarDoCache() {
        var cached = Utils.Cache.get(CLIENTES_CACHE_KEY);
        if (Array.isArray(cached) && cached.length) {
            listaClientesCache = cached;
            rebuildIndex();
        }
    }

    function rebuildIndex() {
        clientesById = {};
        (listaClientesCache || []).forEach(function (c) {
            if (c && c.id) clientesById[String(c.id)] = c;
        });
    }

    function salvarNoCache() {
        if (!Array.isArray(listaClientesCache)) return;
        Utils.Cache.set(CLIENTES_CACHE_KEY, listaClientesCache, CLIENTES_CACHE_TTL_MINUTES);
    }

    function broadcastUpdate() {
        try { localStorage.setItem('rpps_clientes_last_update', String(Date.now())); } catch (e) { }
        try { if (bcClientes) bcClientes.postMessage({ type: 'clientes_updated', ts: Date.now() }); } catch (e) { }
    }

    function upsertClienteNoCache(cliente) {
        if (!cliente || !cliente.id) return;
        var idStr = String(cliente.id);
        var idx = listaClientesCache.findIndex(function (x) {
            return String((x && x.id) || '') === idStr;
        });
        var c = {
            id: cliente.id,
            nome_completo: cliente.nome_completo || '',
            cpf: cliente.cpf || '',
            email: cliente.email || '',
            telefone: cliente.telefone || '',
            status: cliente.status || 'ATIVO'
        };
        if (idx >= 0) listaClientesCache[idx] = c;
        else listaClientesCache.unshift(c);

        rebuildIndex();
        salvarNoCache();
        broadcastUpdate();
    }

    async function carregarClientes() {
        sincronizarDoCache();
        try {
            var rede = await API.call('listarClientes', {}, 'POST', true);
            if (Array.isArray(rede)) {
                listaClientesCache = rede;
                rebuildIndex();
                salvarNoCache();
                broadcastUpdate();
            }
        } catch (e) {
            console.warn('Nao carregou clientes:', e.message || e);
        }
    }

    // =========================================================================
    // BUSCA UNIFICADA INTELIGENTE
    // =========================================================================

    function filtrarClientesLocal(termo) {
        var t = String(termo || '').toLowerCase().trim();
        var tDigits = t.replace(/\D/g, '');
        if (!t) return listaClientesCache.slice(0, 8);

        return listaClientesCache.filter(function (c) {
            var nome = String(c.nome_completo || '').toLowerCase();
            var email = String(c.email || '').toLowerCase();
            var cpfRaw = String(c.cpf || '');
            var cpfDigits = cpfRaw.replace(/\D/g, '');

            return nome.includes(t) ||
                email.includes(t) ||
                cpfRaw.toLowerCase().includes(t) ||
                (tDigits && tDigits.length >= 3 && cpfDigits.includes(tDigits));
        }).slice(0, 8);
    }

    function onBuscaInput() {
        var input = document.getElementById('busca-unificada');
        var box = document.getElementById('sugestoes-box');
        if (!input || !box) return;

        var termo = input.value.trim();

        if (termo.length < 2) {
            box.classList.add('hidden');
            return;
        }

        var itens = filtrarClientesLocal(termo);

        if (!itens.length) {
            box.innerHTML = '<div class="px-4 py-3 text-sm text-slate-400">Nenhum cliente encontrado. Clique "Buscar" para pesquisar na base.</div>';
            box.classList.remove('hidden');
            return;
        }

        var html = '';
        itens.forEach(function (c) {
            var nome = escapeHtml(c.nome_completo || '-');
            var cpf = escapeHtml(formatarCPF(c.cpf));
            var email = escapeHtml(c.email || '-');
            var id = escapeHtml(String(c.id || ''));
            var iniciais = escapeHtml(getIniciais(c.nome_completo));
            var statusCli = String(c.status || 'ATIVO').toUpperCase();
            var isBloqueado = (statusCli === 'BLOQUEADO' || statusCli === 'INATIVO');
            var avatarBg = isBloqueado ? 'bg-red-400' : 'bg-blue-500';
            var statusTag = isBloqueado ? ' <span class="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600 ml-1">' + statusCli + '</span>' : '';

            html += '<button type="button" class="sugestao-item w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 flex items-center gap-3 transition-colors' + (isBloqueado ? ' opacity-60' : '') + '" data-id="' + id + '">' +
                '<div class="w-9 h-9 ' + avatarBg + ' rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">' + iniciais + '</div>' +
                '<div class="min-w-0 flex-1">' +
                '<div class="text-sm font-medium text-slate-700 truncate">' + nome + statusTag + '</div>' +
                '<div class="text-xs text-slate-500">' + cpf + ' &middot; ' + email + '</div>' +
                '</div>' +
                '<svg class="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>' +
                '</button>';
        });

        box.innerHTML = html;
        box.classList.remove('hidden');

        box.querySelectorAll('.sugestao-item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                var cliente = clientesById[String(id)];
                if (cliente) {
                    selecionarCliente(cliente);
                }
                box.classList.add('hidden');
            });
        });
    }

    async function executarBuscaInteligente() {
        var input = document.getElementById('busca-unificada');
        var termo = (input ? input.value : '').trim();
        var btn = document.getElementById('btn-buscar');

        if (!termo) {
            Utils.showToast('Digite o nome ou CPF do cliente.', 'warning');
            if (input) input.focus();
            return;
        }

        btn.classList.add('btn-loading');
        btn.disabled = true;

        try {
            document.getElementById('cliente-encontrado').classList.add('hidden');
            document.getElementById('cliente-nao-encontrado').classList.add('hidden');
            document.getElementById('sugestoes-box').classList.add('hidden');

            var cliente = null;
            var cpfDigitos = termo.replace(/\D/g, '');

            // ---- ESTRATEGIA 1: CPF completo -> busca direto na API ----
            // (cache local pode ter CPFs mascarados, entao prioriza API)
            if (ehCPFCompleto(termo)) {
                var cpfNorm = normalizarCPF(termo);

                try {
                    cliente = await API.call('buscarClientePorCPF', { cpf: cpfNorm }, 'POST', true);
                    if (cliente && cliente.id) {
                        upsertClienteNoCache(cliente);
                    }
                } catch (apiErr) {
                    if (apiErr.message && apiErr.message.toLowerCase().includes('encontrado')) {
                        cliente = null;
                    } else {
                        throw apiErr;
                    }
                }

                if (!cliente) {
                    mostrarFormNovoCliente(cpfNorm);
                    return;
                }

                selecionarCliente(cliente);
                return;
            }

            // ---- ESTRATEGIA 2: CPF parcial (6-10 digitos) -> cache + API ----
            // (cache pode ter CPFs mascarados, entao busca parcial pode falhar)
            if (pareceSerCPF(termo)) {
                var candidatos = listaClientesCache.filter(function (c) {
                    var cCpf = String(c.cpf || '').replace(/\D/g, '');
                    return cCpf && cCpf.includes(cpfDigitos);
                });

                if (candidatos.length === 1) {
                    selecionarCliente(candidatos[0]);
                    return;
                } else if (candidatos.length > 1) {
                    Utils.showToast('Encontrei ' + candidatos.length + ' clientes. Refine com o CPF completo.', 'warning');
                    return;
                }

                // Cache nao encontrou (possivelmente CPF mascarado) - tenta API se >= 10 digitos
                if (cpfDigitos.length >= 10) {
                    var cpfPad = cpfDigitos.padStart(11, '0');
                    try {
                        var clienteApi = await API.call('buscarClientePorCPF', { cpf: cpfPad }, 'POST', true);
                        if (clienteApi && clienteApi.id) {
                            upsertClienteNoCache(clienteApi);
                            selecionarCliente(clienteApi);
                            return;
                        }
                    } catch (apiErr2) {
                        // Nao encontrado na API - oferece cadastro
                    }
                    mostrarFormNovoCliente(cpfPad);
                    return;
                }

                Utils.showToast('Nenhum cliente encontrado. Complete o CPF ou tente pelo nome.', 'warning');
                return;
            }

            // ---- ESTRATEGIA 3: Texto (nome/email) -> busca no cache ----
            var termoLower = termo.toLowerCase();

            if (termoLower.includes('@')) {
                var byEmail = listaClientesCache.filter(function (c) {
                    return String(c.email || '').toLowerCase() === termoLower;
                });
                if (byEmail.length === 1) { selecionarCliente(byEmail[0]); return; }
            }

            if (termoLower.length >= 3) {
                var byNome = listaClientesCache.filter(function (c) {
                    return String(c.nome_completo || '').toLowerCase().includes(termoLower);
                });

                if (byNome.length === 1) { selecionarCliente(byNome[0]); return; }
                if (byNome.length > 1) {
                    Utils.showToast('Encontrei ' + byNome.length + ' clientes. Selecione nas sugestoes ou refine.', 'warning');
                    onBuscaInput();
                    return;
                }
            }

            // Nada encontrado - mostra form de cadastro
            var msgEl = document.getElementById('msg-nao-encontrado');
            if (msgEl) msgEl.textContent = 'Nenhum cliente encontrado para "' + termo + '". Preencha os dados abaixo para cadastrar.';

            document.getElementById('cliente-nao-encontrado').classList.remove('hidden');
            document.getElementById('opcao-pular').classList.add('hidden');

            var nomeInput = document.getElementById('novo-cliente-nome');
            var cpfInput = document.getElementById('novo-cliente-cpf');
            if (!pareceSerCPF(termo) && termoLower.length >= 3) {
                if (nomeInput) nomeInput.value = termo;
                if (cpfInput) { cpfInput.value = ''; cpfInput.readOnly = false; }
            } else {
                if (nomeInput) nomeInput.value = '';
                if (cpfInput) { cpfInput.value = ''; cpfInput.readOnly = false; }
            }

            // Aplica mascara CPF no campo do form de cadastro
            if (cpfInput && !cpfInput.readOnly) {
                cpfInput.addEventListener('input', mascaraCPFInput);
            }

            setTimeout(function () {
                if (nomeInput && nomeInput.value) {
                    (cpfInput || nomeInput).focus();
                } else if (nomeInput) {
                    nomeInput.focus();
                }
            }, 300);

        } catch (error) {
            console.error('Erro na busca:', error);
            Utils.showToast(error.message || 'Erro ao buscar cliente.', 'error');
        } finally {
            btn.classList.remove('btn-loading');
            btn.disabled = false;
        }
    }

    function mascaraCPFInput(e) {
        var v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.substring(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        e.target.value = v;
    }

    // =========================================================================
    // SELECIONAR / MOSTRAR CLIENTE
    // =========================================================================
    function selecionarCliente(cliente) {
        // Bloqueia seleção de clientes inativos ou bloqueados
        var statusCliente = String(cliente.status || 'ATIVO').toUpperCase();
        if (statusCliente === 'INATIVO' || statusCliente === 'BLOQUEADO') {
            var msg = statusCliente === 'BLOQUEADO'
                ? 'Cliente BLOQUEADO. Não é possível abrir processo para este cliente.'
                : 'Cliente INATIVO. Ative o cadastro antes de abrir um processo.';
            Utils.showToast(msg, 'error');
            return;
        }

        clienteSelecionado = cliente;

        var cpfDisplay = formatarCPF(cliente.cpf);
        var iniciais = getIniciais(cliente.nome_completo);

        document.getElementById('cliente-iniciais').textContent = iniciais;
        document.getElementById('cliente-nome').textContent = cliente.nome_completo || '-';
        document.getElementById('cliente-email').textContent = cliente.email || '-';
        document.getElementById('cliente-cpf-display').textContent = 'CPF: ' + cpfDisplay;
        document.getElementById('cliente-id-selecionado').value = cliente.id || '';

        var inpParte = document.getElementById('parte_nome');
        if (inpParte && !inpParte.value.trim()) {
            inpParte.value = (cliente.nome_completo || '').trim();
        }
        var inpEmail = document.getElementById('email_interessado');
        if (inpEmail && !inpEmail.value.trim()) {
            inpEmail.value = (cliente.email || '').trim().toLowerCase();
        }

        document.getElementById('cliente-encontrado').classList.remove('hidden');
        document.getElementById('cliente-nao-encontrado').classList.add('hidden');
        document.getElementById('opcao-pular').classList.add('hidden');

        Utils.showToast('Cliente selecionado!', 'success');

        // Busca dados completos em background
        if (cliente.id) {
            API.clientes.buscarPorId(cliente.id).then(function (completo) {
                if (completo && completo.id) {
                    upsertClienteNoCache(completo);
                    if (clienteSelecionado && String(clienteSelecionado.id) === String(completo.id)) {
                        clienteSelecionado = completo;
                        document.getElementById('cliente-cpf-display').textContent = 'CPF: ' + formatarCPF(completo.cpf);
                    }
                }
            }).catch(function () { });
        }
    }

    function mostrarFormNovoCliente(cpfDigitos) {
        var cpfFormatado = '';
        if (cpfDigitos) {
            cpfFormatado = formatarCPF(cpfDigitos.padStart(11, '0'));
        }

        var cpfField = document.getElementById('novo-cliente-cpf');
        cpfField.value = cpfFormatado;
        cpfField.readOnly = !!cpfDigitos;

        if (!cpfDigitos) {
            cpfField.readOnly = false;
            cpfField.addEventListener('input', mascaraCPFInput);
        }

        var msgEl = document.getElementById('msg-nao-encontrado');
        if (msgEl && cpfDigitos) {
            msgEl.textContent = 'Nenhum cliente com o CPF ' + cpfFormatado + ' esta cadastrado. Preencha os dados abaixo.';
        }

        document.getElementById('cliente-nao-encontrado').classList.remove('hidden');
        document.getElementById('cliente-encontrado').classList.add('hidden');
        document.getElementById('opcao-pular').classList.add('hidden');

        setTimeout(function () {
            document.getElementById('novo-cliente-nome').focus();
        }, 300);
    }

    function limparCliente() {
        clienteSelecionado = null;
        document.getElementById('busca-unificada').value = '';
        document.getElementById('cliente-encontrado').classList.add('hidden');
        document.getElementById('cliente-nao-encontrado').classList.add('hidden');
        document.getElementById('opcao-pular').classList.remove('hidden');
        document.getElementById('busca-unificada').focus();
    }

    // =========================================================================
    // CADASTRO DE NOVO CLIENTE
    // =========================================================================
    async function cadastrarEAvancar() {
        var nome = document.getElementById('novo-cliente-nome').value.trim();
        var cpfRaw = document.getElementById('novo-cliente-cpf').value.replace(/\D/g, '');
        var email = document.getElementById('novo-cliente-email').value.trim().toLowerCase();
        var telefone = document.getElementById('novo-cliente-telefone').value.replace(/\D/g, '');

        if (!nome) {
            Utils.showToast('Digite o nome do cliente.', 'warning');
            document.getElementById('novo-cliente-nome').focus();
            return;
        }
        if (!cpfRaw || cpfRaw.length !== 11) {
            Utils.showToast('CPF deve ter 11 digitos.', 'warning');
            document.getElementById('novo-cliente-cpf').focus();
            return;
        }
        if (!Utils.validarCPF(cpfRaw)) {
            Utils.showToast('CPF invalido. Verifique os digitos.', 'warning');
            document.getElementById('novo-cliente-cpf').focus();
            return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            Utils.showToast('Digite um email valido.', 'warning');
            document.getElementById('novo-cliente-email').focus();
            return;
        }

        var btn = document.getElementById('btn-cadastrar-cliente');
        btn.classList.add('btn-loading');
        btn.disabled = true;

        try {
            var resultado = await API.call('cadastrarCliente', {
                nome_completo: nome,
                cpf: cpfRaw,
                email: email,
                telefone: telefone
            });

            clienteSelecionado = resultado;

            // Adiciona ao cache imediatamente - aparece na busca instantaneamente
            upsertClienteNoCache(resultado);

            // Limpa cache de listagem para forcar refresh nas outras abas
            Utils.Cache.clear('listarClientes');

            Utils.showToast('Cliente cadastrado com sucesso!', 'success');

            setTimeout(function () {
                avancarParaProcesso();
            }, 500);

        } catch (error) {
            console.error('Erro ao cadastrar cliente:', error);
            Utils.showToast(error.message || 'Erro ao cadastrar cliente.', 'error');
        } finally {
            btn.classList.remove('btn-loading');
            btn.disabled = false;
        }
    }

    // =========================================================================
    // NAVEGACAO ENTRE STEPS
    // =========================================================================
    function avancarParaProcesso() {
        clienteVinculado = true;

        document.getElementById('step1-indicator').classList.remove('step-active');
        document.getElementById('step1-indicator').classList.add('step-complete');
        document.getElementById('step1-indicator').innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';

        document.getElementById('step2-indicator').classList.remove('step-pending');
        document.getElementById('step2-indicator').classList.add('step-active');
        document.getElementById('progress-bar').style.width = '100%';

        if (clienteSelecionado) {
            document.getElementById('resumo-cliente').classList.remove('hidden');
            document.getElementById('resumo-cliente-nome').textContent = clienteSelecionado.nome_completo || clienteSelecionado.nome || '-';
            document.getElementById('parte_nome').value = clienteSelecionado.nome_completo || clienteSelecionado.nome || '';
            document.getElementById('email_interessado').value = clienteSelecionado.email || '';
        }

        document.getElementById('step1-content').classList.add('hidden');
        document.getElementById('step2-content').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function pularCadastroCliente() {
        clienteSelecionado = null;
        clienteVinculado = false;

        document.getElementById('step1-indicator').classList.remove('step-active');
        document.getElementById('step1-indicator').classList.add('step-complete');
        document.getElementById('step1-indicator').innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';

        document.getElementById('step2-indicator').classList.remove('step-pending');
        document.getElementById('step2-indicator').classList.add('step-active');
        document.getElementById('progress-bar').style.width = '100%';

        document.getElementById('resumo-cliente').classList.add('hidden');

        document.getElementById('step1-content').classList.add('hidden');
        document.getElementById('step2-content').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function voltarParaCliente() {
        document.getElementById('step1-indicator').classList.remove('step-complete');
        document.getElementById('step1-indicator').classList.add('step-active');
        document.getElementById('step1-indicator').textContent = '1';

        document.getElementById('step2-indicator').classList.remove('step-active');
        document.getElementById('step2-indicator').classList.add('step-pending');
        document.getElementById('progress-bar').style.width = '0%';

        document.getElementById('step2-content').classList.add('hidden');
        document.getElementById('step1-content').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // =========================================================================
    // SALVAR PROCESSO
    // =========================================================================
    async function salvarProcesso(e) {
        e.preventDefault();

        var numero = document.getElementById('numero_processo').value.trim();
        var tipoSelect = document.getElementById('tipo');
        var inputOutros = document.getElementById('tipo_outro');
        var parte = document.getElementById('parte_nome').value.trim();
        var dataEntrada = document.getElementById('data_entrada').value;
        var email = document.getElementById('email_interessado').value.trim();
        var descricao = document.getElementById('descricao').value.trim();

        var tipoFinal = tipoSelect.value;
        if (tipoFinal === 'OUTROS') {
            tipoFinal = inputOutros.value.trim().toUpperCase();
            if (!tipoFinal) {
                Utils.showToast('Especifique o tipo do processo.', 'warning');
                inputOutros.focus();
                return;
            }
        }

        if (!numero) {
            Utils.showToast('Digite o numero do processo.', 'warning');
            document.getElementById('numero_processo').focus();
            return;
        }
        if (!tipoFinal) {
            Utils.showToast('Selecione o tipo do processo.', 'warning');
            return;
        }
        if (!parte) {
            Utils.showToast('Digite o nome da parte interessada.', 'warning');
            document.getElementById('parte_nome').focus();
            return;
        }

        Utils.showLoading('Criando pasta digital...', 'database');

        try {
            var payload = {
                numero_processo: numero,
                tipo: tipoFinal,
                parte_nome: parte,
                data_entrada: dataEntrada,
                email_interessado: email.toLowerCase(),
                descricao: descricao
            };

            if (clienteSelecionado) {
                if (clienteSelecionado.id) {
                    payload.cliente_id = String(clienteSelecionado.id).trim();
                }
                var cpfNorm = normalizarCPF(clienteSelecionado.cpf);
                if (cpfNorm.length === 11) {
                    payload.cpf_cliente = cpfNorm;
                }
                payload.nome_cliente = (clienteSelecionado.nome_completo || clienteSelecionado.nome || '').trim();
                payload.email_cliente = (clienteSelecionado.email || '').trim().toLowerCase();
                payload.telefone_cliente = String(clienteSelecionado.telefone || '').replace(/\D/g, '');
            }

            var resultado = await API.call('criarProcesso', payload, 'POST', true);

            Utils.Cache.clear('listarProcessos');
            Utils.Cache.clear('getDashboard');

            Utils.showToast('Processo cadastrado com sucesso!', 'success');
            Utils.showLoading('Abrindo processo juridico...', 'database');

            setTimeout(function () {
                if (resultado && resultado.id) {
                    Utils.navigateTo('detalhe-processo.html?id=' + resultado.id);
                } else {
                    Utils.navigateTo('processos.html');
                }
            }, 1500);

        } catch (error) {
            console.error('Erro ao salvar processo:', error);
            Utils.hideLoading();

            if (error.message && error.message.includes('existe')) {
                Utils.showToast(error.message, 'error');
                var campoNumero = document.getElementById('numero_processo');
                campoNumero.focus();
                campoNumero.classList.add('border-red-500');
                setTimeout(function () { campoNumero.classList.remove('border-red-500'); }, 3000);
            } else {
                Utils.showToast(error.message || 'Erro ao cadastrar processo.', 'error');
            }
        }
    }

    // =========================================================================
    // AUTO-PREENCHER CLIENTE VIA URL (vindo da tela de clientes)
    // =========================================================================
    function verificarClienteViaURL() {
        var params = new URLSearchParams(window.location.search);
        var clienteId = params.get('cliente_id');
        var clienteNome = params.get('cliente_nome');

        if (!clienteId || !clienteNome) return;

        // Monta objeto cliente a partir dos params
        var clienteURL = {
            id: clienteId,
            nome_completo: clienteNome,
            cpf: params.get('cliente_cpf') || '',
            email: params.get('cliente_email') || '',
            telefone: params.get('cliente_telefone') || ''
        };

        // Seleciona o cliente e avanca direto para Step 2
        selecionarCliente(clienteURL);

        setTimeout(function () {
            avancarParaProcesso();
            Utils.showToast('Cliente ' + clienteNome.split(' ')[0] + ' selecionado automaticamente!', 'success');
        }, 300);

        // Limpa a URL para nao reprocessar em refresh
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function getIniciais(nome) {
        var parts = String(nome || 'C').trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }
        return parts[0].charAt(0).toUpperCase();
    }

})();
