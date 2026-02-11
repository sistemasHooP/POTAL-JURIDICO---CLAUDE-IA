/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-processo.js
 * DESCRICAO: Logica da tela de detalhes do processo no portal cliente
 * VERSAO: 1.0 (Fase 4 - Extracao de JS inline + XSS fix)
 * DEPENDENCIAS: cliente-config.js, cliente-api.js, cliente-auth.js
 * ============================================================================
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {

        if (!ClienteAuth.protectRoute()) return;

        document.getElementById('btn-logout').addEventListener('click', function () {
            if (confirm('Deseja sair do sistema?')) {
                ClienteAuth.logout();
            }
        });

        var params = new URLSearchParams(window.location.search);
        var processoId = params.get('id');

        if (!processoId) {
            ClienteUI.showToast('Processo não identificado.', 'error');
            window.location.href = 'processos.html';
            return;
        }

        loadProcessoDetalhes(processoId);
    });

    // =========================================================================
    // CARREGAR DETALHES
    // =========================================================================
    async function loadProcessoDetalhes(id) {
        var loadingState = document.getElementById('loading-state');
        var processoContent = document.getElementById('processo-content');

        try {
            var data = await ClienteAPI.getProcesso(id);

            if (!data || !data.processo) {
                throw new Error('Dados do processo não encontrados.');
            }

            var p = data.processo;
            var movs = data.movimentacoes || [];

            loadingState.classList.add('hidden');
            processoContent.classList.remove('hidden');

            // Preencher dados usando textContent (previne XSS)
            document.getElementById('proc-numero').textContent = 'Processo nº ' + (p.numero_processo || 'S/N');
            document.getElementById('proc-tipo').textContent = p.tipo || 'Tipo não informado';
            document.getElementById('proc-parte').textContent = 'Parte: ' + (p.parte_nome || '-');
            document.getElementById('proc-data').textContent = 'Entrada: ' + ClienteUI.formatDate(p.data_entrada);

            var statusEl = document.getElementById('proc-status');
            statusEl.textContent = p.status;
            statusEl.className = 'px-3 py-1 rounded-full text-xs font-bold border ' + ClienteUI.getStatusClass(p.status);

            if (p.data_prazo) {
                document.getElementById('proc-prazo-container').classList.remove('hidden');
                document.getElementById('proc-prazo').textContent = ClienteUI.formatDate(p.data_prazo);
            }

            if (p.descricao && p.descricao.trim()) {
                document.getElementById('proc-descricao-container').classList.remove('hidden');
                document.getElementById('proc-descricao').textContent = p.descricao;
            }

            if (p.id_pasta_drive || p.link_pasta) {
                var btnDrive = document.getElementById('btn-drive');
                btnDrive.classList.remove('hidden');
                btnDrive.onclick = function (event) {
                    if (event) event.preventDefault();
                    openPastaArquivosModal(id);
                };
            }

            renderMovimentacoes(movs);

        } catch (error) {
            console.error('Erro ao carregar processo:', error);
            loadingState.innerHTML =
                '<div class="text-center">' +
                    '<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">' +
                        '<svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>' +
                        '</svg>' +
                    '</div>' +
                    '<p class="text-slate-700 font-medium mb-2">Erro ao carregar processo</p>' +
                    '<p class="text-slate-500 text-sm mb-4">' + ClienteUI.escapeHtml(error.message) + '</p>' +
                    '<button onclick="location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Tentar novamente</button>' +
                '</div>';
        }
    }

    // =========================================================================
    // MODAL DE ARQUIVOS
    // =========================================================================
    async function openPastaArquivosModal(idProcesso) {
        ClienteUI.showLoading('Carregando arquivos da pasta...');
        try {
            var data = await ClienteAPI.listarArquivosProcesso(idProcesso);
            ClienteUI.hideLoading();

            var arquivos = (data && data.arquivos) ? data.arquivos : [];

            var modalExistente = document.getElementById('pasta-arquivos-modal');
            if (modalExistente) modalExistente.remove();

            var modal = document.createElement('div');
            modal.id = 'pasta-arquivos-modal';
            modal.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-70 p-3 sm:p-4';

            var listaHtml = arquivos.length > 0
                ? arquivos.map(function (arquivo) {
                    var nomeRaw = arquivo.nome || 'Arquivo';
                    var nome = ClienteUI.escapeHtml(nomeRaw);
                    var nomeEnc = encodeURIComponent(nomeRaw);
                    var tamanhoKb = arquivo.tamanho ? Math.max(1, Math.round(arquivo.tamanho / 1024)) : 0;
                    var atualizado = arquivo.atualizado_em ? ClienteUI.formatDate(arquivo.atualizado_em) : '-';
                    return '<div class="p-3 border border-slate-200 rounded-lg bg-slate-50">' +
                        '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">' +
                            '<div class="min-w-0">' +
                                '<p class="font-medium text-slate-800 truncate">' + nome + '</p>' +
                                '<p class="text-xs text-slate-500">' + tamanhoKb + ' KB &bull; Atualizado em ' + atualizado + '</p>' +
                            '</div>' +
                            '<button type="button" class="btn-view-arquivo px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium" data-file-id="' + ClienteUI.escapeHtml(arquivo.id) + '" data-file-name="' + nomeEnc + '">Visualizar</button>' +
                        '</div>' +
                    '</div>';
                }).join('')
                : '<p class="text-sm text-slate-500">Nenhum arquivo encontrado na pasta deste processo.</p>';

            modal.innerHTML =
                '<div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">' +
                    '<div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">' +
                        '<h3 class="font-bold text-slate-800">Arquivos do Processo</h3>' +
                        '<button id="close-pasta-arquivos-modal" class="text-slate-500 hover:text-slate-700">\u2715</button>' +
                    '</div>' +
                    '<div class="p-5 space-y-3 overflow-y-auto max-h-[65vh]">' + listaHtml + '</div>' +
                '</div>';

            document.body.appendChild(modal);

            modal.querySelectorAll('.btn-view-arquivo').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var fileId = btn.getAttribute('data-file-id');
                    var fileName = decodeURIComponent(btn.getAttribute('data-file-name') || 'Arquivo');
                    ClienteUI.viewFile(fileId, fileName);
                });
            });

            document.getElementById('close-pasta-arquivos-modal').addEventListener('click', function () {
                modal.remove();
            });
            modal.addEventListener('click', function (e) {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            ClienteUI.hideLoading();
            ClienteUI.showToast(error.message || 'Erro ao listar arquivos da pasta.', 'error');
        }
    }

    // =========================================================================
    // MOVIMENTACOES (TIMELINE)
    // =========================================================================
    function renderMovimentacoes(movs) {
        var container = document.getElementById('timeline-container');
        var emptyState = document.getElementById('empty-movimentacoes');

        if (!movs || movs.length === 0) {
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        container.innerHTML = '';

        movs.forEach(function (mov, index) {
            var item = document.createElement('div');
            item.className = 'relative opacity-0 animate-fade-in-up';
            item.style.animationDelay = (index * 0.1) + 's';
            item.style.animationFillMode = 'forwards';

            var iconColor = 'bg-blue-100 text-blue-600';
            var icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';

            var tipoUpper = String(mov.tipo || '').toUpperCase();

            if (tipoUpper.includes('DECIS\u00C3O') || tipoUpper.includes('SENTEN\u00C7A')) {
                iconColor = 'bg-green-100 text-green-600';
                icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
            } else if (tipoUpper.includes('AUDI\u00CANCIA')) {
                iconColor = 'bg-purple-100 text-purple-600';
                icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>';
            }

            // Botao de anexo
            var anexoHtml = '';
            if (mov.anexo_link) {
                var nomeAnexoRaw = mov.anexo_nome || 'Documento';
                var nomeAnexo = ClienteUI.escapeHtml(nomeAnexoRaw);
                var nomeAnexoEnc = encodeURIComponent(nomeAnexoRaw);
                var linkAnexo = encodeURIComponent(mov.anexo_link || '');

                anexoHtml =
                    '<div class="mt-3 pt-3 border-t border-slate-100">' +
                        '<button type="button" class="btn-view-anexo inline-flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto justify-center" data-file-url="' + linkAnexo + '" data-file-name="' + nomeAnexoEnc + '">' +
                            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>' +
                            nomeAnexo +
                        '</button>' +
                    '</div>';
            }

            item.innerHTML =
                '<div class="absolute left-0 top-0 w-10 h-10 rounded-full ' + iconColor + ' flex items-center justify-center border-4 border-white shadow-md z-10">' + icon + '</div>' +
                '<div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">' +
                    '<div class="flex justify-between items-start mb-2">' +
                        '<h3 class="font-bold text-slate-800">' + ClienteUI.escapeHtml(mov.tipo) + '</h3>' +
                        '<span class="text-xs text-slate-500">' + ClienteUI.formatDate(mov.data_movimentacao) + '</span>' +
                    '</div>' +
                    '<p class="text-sm text-slate-600 leading-relaxed">' + ClienteUI.escapeHtml(mov.descricao) + '</p>' +
                    anexoHtml +
                '</div>';

            container.appendChild(item);
        });

        container.querySelectorAll('.btn-view-anexo').forEach(function (btn) {
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                var fileUrl = decodeURIComponent(btn.getAttribute('data-file-url') || '');
                var fileName = decodeURIComponent(btn.getAttribute('data-file-name') || 'Documento');
                ClienteUI.viewFile(fileUrl, fileName);
            });
        });
    }

})();
