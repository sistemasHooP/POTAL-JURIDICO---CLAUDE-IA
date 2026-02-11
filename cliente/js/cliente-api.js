/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-api.js
 * DESCRIÇÃO: Camada de comunicação com a API para o módulo Cliente
 * VERSÃO: 1.1 - Com suporte a download de arquivos via proxy
 * ============================================================================
 */

const ClienteAPI = {

    /**
     * Função genérica para enviar requisições à API.
     */
    call: async function(action, data = {}, showLoading = true) {
        if (showLoading) {
            ClienteUI.showLoading();
        }

        try {
            const token = sessionStorage.getItem(CONFIG_CLIENTE.STORAGE_KEYS.TOKEN);
            
            const payload = {
                action: action,
                token: token,
                origem: window.location.origin,
                ...data
            };

            const response = await fetch(CONFIG_CLIENTE.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(payload),
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error(`Erro de rede: ${response.status}`);
            }

            const result = await response.json();

            if (result.status === 'error') {
                // Sessão expirada
                if (result.message && (result.message.includes("Sessão expirada") || result.message.includes("Token"))) {
                    ClienteAuth.logout();
                    throw new Error("Sessão expirada. Faça login novamente.");
                }
                throw new Error(result.message);
            }

            return result.data;

        } catch (error) {
            console.error("API Error:", error);
            throw error;
        } finally {
            if (showLoading) {
                ClienteUI.hideLoading();
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════════
    // AUTENTICAÇÃO
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Solicita código de acesso via CPF.
     */
    solicitarCodigo: function(cpf) {
        return this.call('solicitarCodigoCliente', { cpf: cpf });
    },

    /**
     * Valida o código digitado.
     */
    validarCodigo: function(cpf, codigo) {
        return this.call('validarCodigoCliente', { cpf: cpf, codigo: codigo });
    },

    // ══════════════════════════════════════════════════════════════════════
    // PROCESSOS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Lista os processos do cliente logado.
     */
    getMeusProcessos: function() {
        return this.call('getMeusProcessos', {});
    },

    /**
     * Obtém detalhes de um processo específico.
     */
    getProcesso: function(idProcesso) {
        return this.call('getProcessoCliente', { id_processo: idProcesso });
    },

    // ══════════════════════════════════════════════════════════════════════
    // ARQUIVOS
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Baixa arquivo via proxy (para visualização sem login no Google).
     * O backend baixa o arquivo do Drive e retorna em Base64.
     * 
     * @param {string} fileUrl - URL ou ID do arquivo no Google Drive
     * @returns {Promise<{base64: string, mimeType: string, nome: string}>}
     */
    downloadArquivo: function(fileUrl) {
        return this.call('downloadArquivoCliente', { fileUrl: fileUrl }, true);
    },

    /**
     * Lista arquivos da pasta do processo (proxy sem login Google).
     */
    listarArquivosProcesso: function(idProcesso) {
        return this.call('listarArquivosProcessoCliente', { id_processo: idProcesso }, true);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE UI
// ══════════════════════════════════════════════════════════════════════════════

const ClienteUI = {

    /**
     * Exibe tela de carregamento.
     */
    showLoading: function(message = "Carregando...") {
        let loader = document.getElementById('cliente-loader');
        
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'cliente-loader';
            loader.className = 'fixed inset-0 z-[80] flex flex-col items-center justify-center bg-slate-900 bg-opacity-90 backdrop-blur-sm';
            
            loader.innerHTML = `
                <div class="flex flex-col items-center p-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-500 mb-4"></div>
                    <p id="loader-message" class="text-white font-medium text-lg">${message}</p>
                </div>
            `;
            document.body.appendChild(loader);
        } else {
            const msgEl = document.getElementById('loader-message');
            if (msgEl) msgEl.textContent = message;
        }
        
        loader.classList.remove('hidden');
    },

    /**
     * Esconde tela de carregamento.
     */
    hideLoading: function() {
        const loader = document.getElementById('cliente-loader');
        if (loader) {
            loader.classList.add('hidden');
        }
    },

    /**
     * Exibe toast de notificação.
     */
    showToast: function(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed top-4 right-4 z-[85] flex flex-col gap-2 max-w-sm w-full px-4';
            document.body.appendChild(container);
        }

        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            warning: 'bg-amber-500',
            info: 'bg-blue-600'
        };

        const icons = {
            success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
            error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
            warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
            info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `flex items-center gap-3 w-full p-4 rounded-lg shadow-xl text-white transform transition-all duration-300 translate-x-full ${colors[type] || colors.info}`;
        toast.innerHTML = `
            ${icons[type] || icons.info}
            <span class="flex-1 font-medium">${message}</span>
        `;

        container.appendChild(toast);
        
        // Anima entrada
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full');
        });

        // Remove após 4 segundos
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    /**
     * Formata data para exibição.
     */
    formatDate: function(dateInput) {
        if (!dateInput) return '-';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return dateInput;
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}/${month}/${year}`;
    },

    /**
     * Retorna classe CSS baseada no status.
     */
    getStatusClass: function(status) {
        if (!status) return 'bg-slate-100 text-slate-800';
        switch (status.toUpperCase()) {
            case 'EM ANDAMENTO': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'JULGADO': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'ARQUIVADO': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'SOBRESTADO': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'CANCELADO': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    },

    /**
     * Retorna descrição do status.
     */
    getStatusDescription: function(status) {
        const map = {
            'EM ANDAMENTO': 'Seu processo está sendo analisado.',
            'JULGADO': 'Decisão final foi proferida.',
            'SOBRESTADO': 'Aguardando decisão externa.',
            'ARQUIVADO': 'Processo finalizado.',
            'CANCELADO': 'Processo foi cancelado.'
        };
        return map[status?.toUpperCase()] || '';
    },

    /**
     * Navega para outra página.
     */
    navigateTo: function(page) {
        window.location.href = page;
    },

    /**
     * Escapa HTML para prevenir XSS.
     */
    escapeHtml: function(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Valida CPF usando algoritmo oficial brasileiro (dígitos verificadores).
     * @param {string} cpf - CPF (apenas dígitos ou com pontuação)
     * @returns {boolean}
     */
    validarCPF: function(cpf) {
        var d = String(cpf || '').replace(/\D/g, '');
        if (d.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(d)) return false;
        var sum = 0, i;
        for (i = 0; i < 9; i++) sum += parseInt(d.charAt(i)) * (10 - i);
        var rem = sum % 11;
        var dig1 = rem < 2 ? 0 : 11 - rem;
        if (parseInt(d.charAt(9)) !== dig1) return false;
        sum = 0;
        for (i = 0; i < 10; i++) sum += parseInt(d.charAt(i)) * (11 - i);
        rem = sum % 11;
        var dig2 = rem < 2 ? 0 : 11 - rem;
        return parseInt(d.charAt(10)) === dig2;
    },

    /**
     * Abre arquivo em um modal de visualização.
     * Baixa o arquivo via proxy e exibe em Base64.
     * 
     * @param {string} fileUrl - URL do arquivo no Drive
     * @param {string} fileName - Nome do arquivo para exibir
     */
    viewFile: async function(fileUrl, fileName) {
        if (!fileUrl) {
            this.showToast('URL do arquivo não fornecida.', 'error');
            return;
        }

        // Fecha o modal da pasta antes da visualização para evitar sobreposição
        const folderModal = document.getElementById('pasta-arquivos-modal');
        if (folderModal) folderModal.remove();

        // Mostra loading
        this.showLoading('Carregando arquivo...');

        try {
            // Baixa o arquivo via API (proxy)
            const data = await ClienteAPI.downloadArquivo(fileUrl);

            if (!data || !data.base64) {
                throw new Error('Dados do arquivo não recebidos.');
            }

            // Cria URL blob para visualização
            const byteCharacters = atob(data.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: data.mimeType });
            const blobUrl = URL.createObjectURL(blob);

            this.hideLoading();

            // Decide como exibir baseado no tipo
            if (data.mimeType.includes('pdf')) {
                // PDF: abre em modal interno (evita bloqueio de popup em mobile/navegadores restritos)
                this._showPdfModal(blobUrl, fileName || data.nome || 'Documento.pdf');
            } else if (data.mimeType.includes('image')) {
                // Imagem: Mostra em modal
                this._showImageModal(blobUrl, fileName || data.nome);
            } else {
                // Outros: Força download
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = fileName || data.nome || 'arquivo';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.showToast('Download iniciado!', 'success');
            }

        } catch (error) {
            this.hideLoading();
            console.error('Erro ao visualizar arquivo:', error);
            this.showToast(error.message || 'Erro ao carregar arquivo.', 'error');
        }
    },

    /**
     * Mostra modal com imagem.
     * @private
     */
    _showImageModal: function(imageUrl, title) {
        // Remove modal existente se houver
        const existingModal = document.getElementById('image-modal');
        if (existingModal) existingModal.remove();

        // Cria o modal
        const modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-90 p-4';
        modal.innerHTML = `
            <div class="relative max-w-4xl w-full">
                <!-- Botão Fechar -->
                <button id="close-image-modal" class="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
                
                <!-- Título -->
                <p class="text-white text-center mb-4 font-medium truncate">${this.escapeHtml(title)}</p>
                
                <!-- Imagem -->
                <img src="${imageUrl}" alt="${this.escapeHtml(title)}" class="max-w-full max-h-[80vh] mx-auto rounded-lg shadow-2xl">
                
                <!-- Botão Download -->
                <div class="text-center mt-4">
                    <a href="${imageUrl}" download="${this.escapeHtml(title)}" 
                       class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                        Baixar Imagem
                    </a>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Eventos para fechar
        document.getElementById('close-image-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // ESC para fechar
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    },

    /**
     * Mostra modal com PDF (fallback para evitar bloqueio de popups).
     * @private
     */
    _showPdfModal: function(pdfUrl, title) {
        const existingModal = document.getElementById('pdf-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'pdf-modal';
        modal.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-90 p-3 sm:p-4';

        modal.innerHTML = `
            <div class="relative w-full max-w-5xl h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl">
                <div class="h-14 px-4 flex items-center justify-between border-b border-slate-200 bg-slate-50">
                    <p class="font-medium text-slate-700 truncate pr-3">${this.escapeHtml(title || 'Documento PDF')}</p>
                    <div class="flex items-center gap-2">
                        <a href="${pdfUrl}" download="${this.escapeHtml(title || 'documento.pdf')}" class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Baixar</a>
                        <button id="close-pdf-modal" class="px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg">Fechar</button>
                    </div>
                </div>
                <iframe src="${pdfUrl}" class="w-full h-[calc(90vh-56px)]" title="PDF"></iframe>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => modal.remove();
        document.getElementById('close-pdf-modal').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
};
