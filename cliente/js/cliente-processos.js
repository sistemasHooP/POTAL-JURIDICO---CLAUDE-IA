/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-processos.js
 * DESCRICAO: Logica da tela de listagem de processos do portal cliente
 * VERSAO: 1.0 (Fase 4 - Extracao de JS inline + XSS fix + telefone dinamico)
 * DEPENDENCIAS: cliente-config.js, cliente-api.js, cliente-auth.js
 * ============================================================================
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {

        if (!ClienteAuth.protectRoute()) return;

        ClienteAuth.updateClienteUI();

        document.getElementById('btn-logout').addEventListener('click', function () {
            if (confirm('Deseja sair do sistema?')) {
                ClienteAuth.logout();
            }
        });

        // Atualizar links de contato a partir do config
        atualizarContato();

        loadProcessos();
    });

    // =========================================================================
    // CONTATO DINAMICO (antes era hardcoded)
    // =========================================================================
    function atualizarContato() {
        var tel = CONFIG_CLIENTE.CONTATO.TELEFONE;
        var linkTel = document.getElementById('link-telefone');
        var linkWa = document.getElementById('link-whatsapp');

        if (linkTel) linkTel.setAttribute('href', 'tel:+' + tel);
        if (linkWa) linkWa.setAttribute('href', 'https://wa.me/' + tel);
    }

    // =========================================================================
    // CARREGAR PROCESSOS
    // =========================================================================
    async function loadProcessos() {
        var container = document.getElementById('processos-container');
        var loadingState = document.getElementById('loading-state');
        var emptyState = document.getElementById('empty-state');

        try {
            var processos = await ClienteAPI.getMeusProcessos();

            loadingState.classList.add('hidden');

            if (!processos || processos.length === 0) {
                emptyState.classList.remove('hidden');
                return;
            }

            container.innerHTML = processos.map(function (p, index) {
                var statusClass = ClienteUI.getStatusClass(p.status);
                var statusDesc = ClienteUI.getStatusDescription(p.status);
                var dataEntrada = ClienteUI.formatDate(p.data_entrada);

                // Escapar dados de usuario para prevenir XSS
                var numProcesso = ClienteUI.escapeHtml(p.numero_processo || 'S/N');
                var tipo = ClienteUI.escapeHtml(p.tipo || '-');
                var status = ClienteUI.escapeHtml(p.status || '-');
                var idEscaped = ClienteUI.escapeHtml(p.id || '');

                var prazoHtml = '';
                if (p.data_prazo) {
                    var hoje = new Date();
                    hoje.setHours(0, 0, 0, 0);
                    var prazo = new Date(p.data_prazo);
                    prazo.setHours(0, 0, 0, 0);

                    var diffDays = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));

                    var corPrazo = 'bg-slate-100 text-slate-600';
                    if (diffDays < 0) {
                        corPrazo = 'bg-red-100 text-red-700';
                    } else if (diffDays <= 3) {
                        corPrazo = 'bg-amber-100 text-amber-700';
                    }

                    prazoHtml =
                        '<div class="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ' + corPrazo + '">' +
                            '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>' +
                            '</svg>' +
                            'Prazo: ' + ClienteUI.formatDate(p.data_prazo) +
                        '</div>';
                }

                return '<div data-processo-id="' + idEscaped + '" class="card-processo cursor-pointer block opacity-0 animate-fade-in-up card-delay-' + ((index % 3) + 1) + '">' +
                    '<div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition-all group">' +
                        '<div class="flex items-start justify-between">' +
                            '<div class="flex-1">' +
                                '<div class="flex items-center gap-2 mb-2">' +
                                    '<span class="px-3 py-1 rounded-full text-xs font-bold border ' + statusClass + '">' + status + '</span>' +
                                '</div>' +
                                '<h3 class="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Processo n\u00BA ' + numProcesso + '</h3>' +
                                '<p class="text-sm text-slate-500 mt-1">' + tipo + '</p>' +
                                '<p class="text-xs text-slate-400 mt-2">Entrada: ' + dataEntrada + '</p>' +
                                prazoHtml +
                            '</div>' +
                            '<div class="text-slate-300 group-hover:text-blue-500 transition-colors ml-4">' +
                                '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>' +
                                '</svg>' +
                            '</div>' +
                        '</div>' +
                        (statusDesc ? '<p class="mt-3 text-xs text-slate-500 italic">' + ClienteUI.escapeHtml(statusDesc) + '</p>' : '') +
                    '</div>' +
                '</div>';
            }).join('');

            // Event delegation para abrir processos (substitui onclick inline)
            container.addEventListener('click', function (e) {
                var card = e.target.closest('.card-processo');
                if (card) {
                    var id = card.getAttribute('data-processo-id');
                    abrirProcesso(id);
                }
            });

        } catch (error) {
            console.error('Erro ao carregar processos:', error);
            loadingState.innerHTML =
                '<div class="text-center">' +
                    '<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">' +
                        '<svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>' +
                        '</svg>' +
                    '</div>' +
                    '<p class="text-slate-700 font-medium mb-2">Erro ao carregar processos</p>' +
                    '<p class="text-slate-500 text-sm mb-4">' + ClienteUI.escapeHtml(error.message) + '</p>' +
                    '<button onclick="location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Tentar novamente</button>' +
                '</div>';
        }
    }

    // =========================================================================
    // NAVEGACAO
    // =========================================================================
    function abrirProcesso(id) {
        if (!id) {
            ClienteUI.showToast('Processo não identificado.', 'error');
            return;
        }
        window.location.href = 'processo.html?id=' + encodeURIComponent(id);
    }

})();
