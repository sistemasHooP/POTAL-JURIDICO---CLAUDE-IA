/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-login.js
 * DESCRICAO: Logica da tela de login do portal cliente (CPF + solicitar codigo)
 * VERSAO: 1.0 (Fase 4 - Extracao de JS inline)
 * DEPENDENCIAS: cliente-config.js, cliente-api.js, cliente-auth.js
 * ============================================================================
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {

        // Redireciona se ja esta logado
        ClienteAuth.redirectIfAuthenticated();

        var form = document.getElementById('login-form');
        var cpfInput = document.getElementById('cpf');
        var btnSubmit = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        var btnArrow = document.getElementById('btn-arrow');
        var btnSpinner = document.getElementById('btn-spinner');

        // Mascara de CPF: 000.000.000-00
        cpfInput.addEventListener('input', function (e) {
            var value = e.target.value.replace(/\D/g, '');
            if (value.length > 11) value = value.substring(0, 11);

            if (value.length > 9) {
                value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
            } else if (value.length > 6) {
                value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            } else if (value.length > 3) {
                value = value.replace(/(\d{3})(\d{1,3})/, '$1.$2');
            }

            e.target.value = value;
        });

        // Envio do formulario
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            var cpf = cpfInput.value.replace(/\D/g, '');

            // Validacao de tamanho
            if (cpf.length !== 11) {
                ClienteUI.showToast('Digite um CPF válido com 11 dígitos.', 'warning');
                cpfInput.focus();
                return;
            }

            // Validacao de digitos verificadores
            if (!ClienteUI.validarCPF(cpf)) {
                ClienteUI.showToast('CPF inválido. Verifique os dígitos informados.', 'warning');
                cpfInput.focus();
                return;
            }

            // Estado de loading
            btnSubmit.disabled = true;
            btnText.textContent = 'Enviando...';
            btnArrow.classList.add('hidden');
            btnSpinner.classList.remove('hidden');

            try {
                var result = await ClienteAPI.solicitarCodigo(cpf);

                // Salva CPF temporariamente para a proxima tela
                ClienteAuth.saveTempCPF(cpf);

                ClienteUI.showToast(result.mensagem || 'Código enviado!', 'success');

                // Mostra email mascarado se disponivel
                if (result.emailMascarado) {
                    ClienteUI.showToast('Verifique: ' + result.emailMascarado, 'info');
                }

                // Redireciona para tela de verificacao
                setTimeout(function () {
                    ClienteUI.navigateTo(CONFIG_CLIENTE.PAGES.VERIFICAR);
                }, 1500);

            } catch (error) {
                console.error('Erro:', error);
                ClienteUI.showToast(error.message || 'Erro ao solicitar código.', 'error');

                // Reset do botao
                btnSubmit.disabled = false;
                btnText.textContent = 'Receber Código de Acesso';
                btnArrow.classList.remove('hidden');
                btnSpinner.classList.add('hidden');
            }
        });

        // Foco inicial no campo CPF
        cpfInput.focus();
    });

})();
