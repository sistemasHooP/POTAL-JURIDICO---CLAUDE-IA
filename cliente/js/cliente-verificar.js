/**
 * ============================================================================
 * ARQUIVO: cliente/js/cliente-verificar.js
 * DESCRICAO: Logica da tela de verificacao OTP do portal cliente
 * VERSAO: 1.0 (Fase 4 - Extracao de JS inline)
 * DEPENDENCIAS: cliente-config.js, cliente-api.js, cliente-auth.js
 * ============================================================================
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {

        // Verifica se tem CPF salvo
        var cpf = ClienteAuth.getTempCPF();
        if (!cpf) {
            ClienteUI.showToast('Sessão expirada. Digite seu CPF novamente.', 'warning');
            setTimeout(function () {
                ClienteUI.navigateTo(CONFIG_CLIENTE.PAGES.LOGIN);
            }, 1500);
            return;
        }

        var form = document.getElementById('verify-form');
        var inputs = document.querySelectorAll('.code-input');
        var btnSubmit = document.getElementById('btn-submit');
        var btnText = document.getElementById('btn-text');
        var btnIcon = document.getElementById('btn-icon');
        var btnSpinner = document.getElementById('btn-spinner');
        var btnResend = document.getElementById('btn-resend');
        var timerEl = document.getElementById('timer');

        // Timer de 10 minutos
        var timeLeft = 10 * 60;

        function updateTimer() {
            var minutes = Math.floor(timeLeft / 60);
            var seconds = timeLeft % 60;
            timerEl.textContent = minutes + ':' + String(seconds).padStart(2, '0');

            if (timeLeft <= 60) {
                timerEl.parentElement.parentElement.classList.remove('bg-amber-50', 'border-amber-200');
                timerEl.parentElement.parentElement.classList.add('bg-red-50', 'border-red-200');
                timerEl.parentElement.classList.remove('text-amber-700');
                timerEl.parentElement.classList.add('text-red-700');
            }

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                ClienteUI.showToast('Código expirado. Solicite um novo.', 'error');
                btnSubmit.disabled = true;
                return;
            }

            timeLeft--;
        }

        var timerInterval = setInterval(updateTimer, 1000);
        updateTimer();

        // Logica dos inputs de codigo
        inputs.forEach(function (input, index) {

            // Ao digitar
            input.addEventListener('input', function (e) {
                var value = e.target.value.replace(/\D/g, '');
                e.target.value = value;

                if (value) {
                    e.target.classList.add('filled');
                    e.target.classList.remove('error');

                    // Vai para o proximo
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else {
                    e.target.classList.remove('filled');
                }

                checkComplete();
            });

            // Backspace
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                    inputs[index - 1].value = '';
                    inputs[index - 1].classList.remove('filled');
                }
            });

            // Colar codigo completo
            input.addEventListener('paste', function (e) {
                e.preventDefault();
                var pastedData = e.clipboardData.getData('text').replace(/\D/g, '');

                if (pastedData.length === 6) {
                    pastedData.split('').forEach(function (digit, i) {
                        if (inputs[i]) {
                            inputs[i].value = digit;
                            inputs[i].classList.add('filled');
                        }
                    });
                    inputs[5].focus();
                    checkComplete();
                }
            });
        });

        // Verifica se todos os campos estao preenchidos
        function checkComplete() {
            var complete = true;
            inputs.forEach(function (input) {
                if (!input.value) complete = false;
            });
            btnSubmit.disabled = !complete;
        }

        // Obtem o codigo digitado
        function getCode() {
            return Array.from(inputs).map(function (i) { return i.value; }).join('');
        }

        // Envio do formulario
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            var codigo = getCode();

            if (codigo.length !== 6) {
                ClienteUI.showToast('Digite o código completo.', 'warning');
                return;
            }

            // Estado de loading
            btnSubmit.disabled = true;
            btnText.textContent = 'Verificando...';
            btnIcon.classList.add('hidden');
            btnSpinner.classList.remove('hidden');

            try {
                var result = await ClienteAPI.validarCodigo(cpf, codigo);

                // Salva sessao
                ClienteAuth.saveSession(result);

                // Limpa CPF temporario
                ClienteAuth.clearTempCPF();

                // Sucesso
                clearInterval(timerInterval);
                ClienteUI.showToast('Login realizado com sucesso!', 'success');

                // Redireciona para lista de processos
                setTimeout(function () {
                    ClienteUI.navigateTo(CONFIG_CLIENTE.PAGES.PROCESSOS);
                }, 1000);

            } catch (error) {
                console.error('Erro:', error);
                ClienteUI.showToast(error.message || 'Código inválido.', 'error');

                // Marca campos como erro
                inputs.forEach(function (input) {
                    input.classList.remove('filled');
                    input.classList.add('error');
                    input.value = '';
                });
                inputs[0].focus();

                // Reset do botao
                btnSubmit.disabled = true;
                btnText.textContent = 'Verificar e Entrar';
                btnIcon.classList.remove('hidden');
                btnSpinner.classList.add('hidden');
            }
        });

        // Reenviar codigo
        btnResend.addEventListener('click', async function () {
            btnResend.disabled = true;
            btnResend.textContent = 'Enviando...';

            try {
                await ClienteAPI.solicitarCodigo(cpf);

                // Reseta timer
                timeLeft = 10 * 60;
                timerEl.parentElement.parentElement.classList.remove('bg-red-50', 'border-red-200');
                timerEl.parentElement.parentElement.classList.add('bg-amber-50', 'border-amber-200');
                timerEl.parentElement.classList.remove('text-red-700');
                timerEl.parentElement.classList.add('text-amber-700');

                // Limpa campos
                inputs.forEach(function (input) {
                    input.value = '';
                    input.classList.remove('filled', 'error');
                });
                inputs[0].focus();

                ClienteUI.showToast('Novo código enviado para seu email!', 'success');

            } catch (error) {
                ClienteUI.showToast(error.message || 'Erro ao reenviar.', 'error');
            } finally {
                btnResend.disabled = false;
                btnResend.textContent = 'Enviar novo código';
            }
        });

        // Foco no primeiro input
        inputs[0].focus();
    });

})();
