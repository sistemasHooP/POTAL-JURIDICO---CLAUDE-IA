(function () {
    'use strict';

    let clientes = [];
    let clientesFiltrados = [];
    let carregandoEmBackground = false;

    document.addEventListener('DOMContentLoaded', function () {
        Auth.protectRoute();
        inicializarUsuario();
        bindEventos();

        // Carrega rápido: mostra cache primeiro (se existir) e atualiza em background
        carregarClientes({ forceRefresh: false });
    });

    function inicializarUsuario() {
        const user = Auth.getUser();
        if (!user) return;

        const nome = user.nome || user.email || 'Usuário';
        const perfil = user.perfil || '';
        const iniciais = (nome || 'U').charAt(0).toUpperCase();

        const nameEl = document.getElementById('user-name-display');
        const profileEl = document.getElementById('user-profile-display');
        const initEl = document.getElementById('user-initials');

        if (nameEl) nameEl.textContent = nome;
        if (profileEl) profileEl.textContent = perfil;
        if (initEl) initEl.textContent = iniciais;
    }

    function bindEventos() {
        const inputBusca = document.getElementById('busca-clientes');
        const btnAtualizar = document.getElementById('btn-atualizar-clientes');

        if (inputBusca) {
            inputBusca.addEventListener('input', function () {
                aplicarFiltro();
            });
        }

        if (btnAtualizar) {
            btnAtualizar.addEventListener('click', function () {
                carregarClientes({ forceRefresh: true });
            });
        }
    }

    function setBtnLoading(btn, isLoading, texto) {
        if (!btn) return;

        if (isLoading) {
            btn.disabled = true;
            btn.dataset._oldHtml = btn.innerHTML;

            const label = texto || 'Atualizando...';
            btn.innerHTML = `
                <span class="inline-flex items-center gap-2">
                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    <span>${Utils.escapeHtml(label)}</span>
                </span>
            `;
        } else {
            btn.disabled = false;
            if (btn.dataset._oldHtml) {
                btn.innerHTML = btn.dataset._oldHtml;
                delete btn.dataset._oldHtml;
            } else {
                btn.textContent = 'Atualizar';
            }
        }
    }

    function renderLoadingTabela(mensagem) {
        const tbody = document.getElementById('lista-clientes');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-6 text-center text-slate-400">
                    <span class="inline-flex items-center gap-2">
                        <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span>${Utils.escapeHtml(mensagem || 'Carregando clientes...')}</span>
                    </span>
                </td>
            </tr>
        `;
    }

    function carregarClientes(opts) {
        opts = opts || {};
        const forceRefresh = !!opts.forceRefresh;

        const btn = document.getElementById('btn-atualizar-clientes');

        // Quando não há cache, mostramos loading na tabela.
        if (!clientes || clientes.length === 0) {
            renderLoadingTabela('Carregando clientes...');
        }

        carregandoEmBackground = true;
        setBtnLoading(btn, true, forceRefresh ? 'Atualizando...' : 'Carregando...');

        // Usamos o cache do API.fetchWithCache para resposta imediata
        API.fetchWithCache(
            'listarClientes',
            {},
            function (resultado, source) {
                const lista = (resultado && resultado.clientes) ? resultado.clientes : resultado;
                clientes = Array.isArray(lista) ? lista : [];

                // ordena por nome
                clientes.sort(function (a, b) {
                    const na = String(a.nome_completo || a.nome || '').toLowerCase();
                    const nb = String(b.nome_completo || b.nome || '').toLowerCase();
                    if (na < nb) return -1;
                    if (na > nb) return 1;
                    return 0;
                });

                aplicarFiltro();

                // Se veio do cache, mantemos o botão carregando até vir do "api".
                if (source === 'cache') {
                    return;
                }

                carregandoEmBackground = false;
                setBtnLoading(btn, false);
            },
            true,          // silent: não usa loader global (evita sensação de travamento)
            forceRefresh   // forceRefresh
        );
    }

    function aplicarFiltro() {
        const termo = (document.getElementById('busca-clientes')?.value || '').trim().toLowerCase();

        if (!termo) {
            clientesFiltrados = clientes.slice();
        } else {
            clientesFiltrados = clientes.filter(function (c) {
                const nome = String(c.nome_completo || c.nome || '').toLowerCase();
                const cpf = String(c.cpf || '').replace(/\D/g, '');
                const email = String(c.email || '').toLowerCase();
                const tel = String(c.telefone || '').replace(/\D/g, '');

                const termoDig = termo.replace(/\D/g, '');

                return (
                    nome.includes(termo) ||
                    email.includes(termo) ||
                    (termoDig && cpf.includes(termoDig)) ||
                    (termoDig && tel.includes(termoDig))
                );
            });
        }

        renderTabela();
    }

    function formatarCPF(cpf) {
        const d = String(cpf || '').replace(/\D/g, '').padStart(11, '0').slice(-11);
        return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }

    function formatarTelefone(telefone) {
        const d = String(telefone || '').replace(/\D/g, '');
        if (!d) return '-';
        if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
        if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
        return d;
    }

    function renderTabela() {
        const tbody = document.getElementById('lista-clientes');
        if (!tbody) return;

        if (!clientesFiltrados || clientesFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-6 text-center text-slate-400">
                        ${carregandoEmBackground ? 'Atualizando lista...' : 'Nenhum cliente encontrado.'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = clientesFiltrados.map(function (c) {
            const nome = Utils.escapeHtml(c.nome_completo || c.nome || '-');
            const cpf = Utils.escapeHtml(formatarCPF(c.cpf));
            const email = Utils.escapeHtml(c.email || '-');
            const tel = Utils.escapeHtml(formatarTelefone(c.telefone));
            const status = Utils.escapeHtml(c.status || 'ATIVO');

            return `
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="py-3">${nome}</td>
                    <td class="py-3">${cpf}</td>
                    <td class="py-3">${email}</td>
                    <td class="py-3">${tel}</td>
                    <td class="py-3">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${status.toUpperCase() === 'ATIVO' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}">
                            ${status}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }
})();
