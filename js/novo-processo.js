/**
 * ============================================================================
 * ARQUIVO: js/novo-processo.js
 * DESCRIÇÃO: Lógica de cadastro de novos processos.
 * ATUALIZAÇÃO: Captura e envio do E-mail do Interessado.
 * DEPENDÊNCIAS: js/api.js, js/auth.js, js/utils.js
 * AUTOR: Desenvolvedor Sênior (Sistema RPPS)
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', function() {

    // 1. Proteção de Rota
    if (!Auth.protectRoute()) return;

    // 2. Atualizar UI do Usuário
    Auth.updateUserInfoUI();
    const user = Auth.getUser();
    if (user && user.nome) {
        const initials = user.nome.substring(0, 1).toUpperCase();
        const avatarEl = document.getElementById('user-initials');
        if (avatarEl) avatarEl.textContent = initials;
    }

    // 3. Configurar Logout Desktop
    const btnLogoutDesktop = document.getElementById('desktop-logout-btn');
    if (btnLogoutDesktop) {
        btnLogoutDesktop.addEventListener('click', function() {
            if (confirm('Deseja realmente sair do sistema?')) {
                Auth.logout();
            }
        });
    }

    // 4. Configurar Data Padrão
    const dataInput = document.getElementById('data_entrada');
    if (dataInput && !dataInput.value) {
        // Define hoje como padrão
        const hoje = new Date().toISOString().split('T')[0];
        dataInput.value = hoje;
    }

    // 5. Lógica do Campo "Outros" (Mostrar/Esconder)
    const tipoSelect = document.getElementById('tipo');
    const divOutros = document.getElementById('div-tipo-outro');
    const inputOutros = document.getElementById('tipo_outro');

    if (tipoSelect && divOutros && inputOutros) {
        tipoSelect.addEventListener('change', function() {
            if (this.value === 'OUTROS') {
                // Mostra o campo e torna obrigatório
                divOutros.classList.remove('hidden');
                inputOutros.setAttribute('required', 'true');
                inputOutros.focus();
            } else {
                // Esconde, limpa e remove obrigatoriedade
                divOutros.classList.add('hidden');
                inputOutros.removeAttribute('required');
                inputOutros.value = '';
            }
        });
    }

    // 6. Manipular Envio do Formulário
    const form = document.getElementById('form-novo-processo');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

/**
 * Processa o envio dos dados.
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    // Referências aos campos
    const numeroProcesso = document.getElementById('numero_processo').value.trim();
    const parteNome = document.getElementById('parte_nome').value.trim();
    const emailInteressado = document.getElementById('email_interessado').value.trim(); // [NOVO]
    const tipoSelect = document.getElementById('tipo');
    const inputOutros = document.getElementById('tipo_outro');
    const dataEntrada = document.getElementById('data_entrada').value;
    const descricao = document.getElementById('descricao').value.trim();

    // Lógica para definir o Tipo final
    let tipoFinal = tipoSelect.value;
    
    // Se selecionou OUTROS, usa o valor do input de texto
    if (tipoFinal === 'OUTROS') {
        tipoFinal = inputOutros.value.trim().toUpperCase(); // Salva em maiúsculo para padronizar
        if (!tipoFinal) {
            Utils.showToast("Por favor, especifique o tipo do processo.", "warning");
            inputOutros.focus();
            return;
        }
    }

    // Validação básica
    if (!numeroProcesso || !parteNome || !tipoFinal || !dataEntrada) {
        Utils.showToast("Preencha todos os campos obrigatórios.", "warning");
        return;
    }

    // Monta o objeto para envio
    const payload = {
        numero_processo: numeroProcesso,
        parte_nome: parteNome,
        email_interessado: emailInteressado, // [NOVO] Envia para o Back-end
        tipo: tipoFinal,
        data_entrada: dataEntrada,
        descricao: descricao
    };

    try {
        // PERSONALIZAÇÃO 1: Mensagem de Criação
        // O setTimeout(0) garante que nossa mensagem sobrescreva a padrão "Carregando..."
        setTimeout(() => Utils.showLoading("Criando pasta digital..."), 0);

        // Envia para a API e aguarda a resposta (que contém o ID do novo processo)
        const resultado = await API.processos.criar(payload);
        
        // --- CRÍTICO: LIMPEZA DE CACHE ---
        // Força a atualização das listas quando o usuário voltar para elas
        Utils.Cache.clear('listarProcessos');
        Utils.Cache.clear('getDashboard');

        // Sucesso!
        Utils.showToast("Processo criado com sucesso!", "success");

        // PERSONALIZAÇÃO 2: Mensagem de Abertura
        Utils.showLoading("Abrindo processo jurídico...");

        // Redireciona
        setTimeout(() => {
            // Se a API retornou o ID, vai direto para o detalhe
            if (resultado && resultado.id) {
                Utils.navigateTo(`detalhe-processo.html?id=${resultado.id}`);
            } else {
                // Fallback: Se por algum motivo não vier ID, vai para a lista
                Utils.navigateTo('processos.html');
            }
        }, 1500);

    } catch (error) {
        console.error("Erro ao criar processo:", error);
        // Garante que o loader saia se der erro
        Utils.hideLoading();
        
        if (error.message.includes("Já existe")) {
            Utils.showToast(error.message, "error");
            const campoNumero = document.getElementById('numero_processo');
            campoNumero.focus();
            campoNumero.classList.add('border-red-500');
            setTimeout(() => campoNumero.classList.remove('border-red-500'), 3000);
        } else {
            Utils.showToast("Erro ao criar processo. Tente novamente.", "error");
        }
    }
}
