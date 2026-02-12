/**
 * ============================================================================
 * ARQUIVO: Utils.gs
 * DESCRIÇÃO: Funções utilitárias e transversais do sistema.
 * VERSÃO: 3.1 - Normalização robusta de CPF e respostas padronizadas
 * AUTOR: Sistema RPPS JurídicoTh
 * ============================================================================
 */

var Utils = {

  /**
   * Registra uma ação no Log de Auditoria do sistema.
   * @param {string} emailUsuario
   * @param {string} acao
   * @param {string} detalhes
   * @param {Object} dadosExtras
   */
  logAction: function(emailUsuario, acao, detalhes, dadosExtras) {
    try {
      var logEntry = {
        usuario: emailUsuario || 'SISTEMA',
        acao: acao,
        data_hora: new Date(),
        detalhes: detalhes || ''
      };

      if (dadosExtras) {
        try {
          logEntry.detalhes += ' | Extras: ' + JSON.stringify(dadosExtras);
        } catch (jsonError) {
          Logger.log('[Utils.logAction] Falha ao serializar extras: ' + jsonError);
        }
      }

      Database.create(CONFIG.SHEET_NAMES.LOGS, logEntry);
    } catch (e) {
      Logger.log('[Utils.logAction] ERRO AO GRAVAR LOG: ' + e.toString());
    }
  },

  /**
   * Formata data no padrão BR (DD/MM/AAAA HH:mm:ss).
   * @param {Date|string} dateObj
   * @returns {string}
   */
  formatDateBR: function(dateObj) {
    if (!dateObj) return '';
    try {
      var d = new Date(dateObj);
      if (isNaN(d.getTime())) return '';
      return Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
      return '';
    }
  },

  /**
   * Normaliza texto removendo acentos e colocando em minúsculo.
   * @param {string} text
   * @returns {string}
   */
  normalizeText: function(text) {
    if (!text) return '';
    var str = String(text).toLowerCase();
    str = str.replace(/[áàãâä]/g, 'a');
    str = str.replace(/[éèêë]/g, 'e');
    str = str.replace(/[íìîï]/g, 'i');
    str = str.replace(/[óòõôö]/g, 'o');
    str = str.replace(/[úùûü]/g, 'u');
    str = str.replace(/[ç]/g, 'c');
    str = str.replace(/[ñ]/g, 'n');
    return str;
  },

  /**
   * Sanitiza string para uso em nome de arquivo/chave.
   * @param {string} str
   * @returns {string}
   */
  sanitizeString: function(str) {
    if (!str) return '';
    return String(str).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  },

  /**
   * Validação simples de email.
   * @param {string} email
   * @returns {boolean}
   */
  isValidEmail: function(email) {
    if (!email) return false;
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).trim());
  },

  // ==========================================================================
  // CPF
  // ==========================================================================

  /**
   * Normaliza CPF para string com 11 dígitos.
   * Aceita número, formatado, com apóstrofo do Sheets.
   * @param {any} cpf
   * @returns {string}
   */
  normalizarCPF: function(cpf) {
    if (cpf === null || cpf === undefined || cpf === '') {
      return '';
    }

    var cpfStr = String(cpf);

    if (cpfStr.charAt(0) === "'") {
      cpfStr = cpfStr.substring(1);
    }

    cpfStr = cpfStr.replace(/\D/g, '');

    if (!cpfStr) return '';

    while (cpfStr.length < 11) {
      cpfStr = '0' + cpfStr;
    }

    if (cpfStr.length > 11) {
      cpfStr = cpfStr.substring(cpfStr.length - 11);
    }

    return cpfStr;
  },

  /**
   * Valida CPF (algoritmo oficial).
   * @param {any} cpf
   * @returns {boolean}
   */
  isValidCPF: function(cpf) {
    var cpfLimpo = this.normalizarCPF(cpf);

    if (cpfLimpo.length !== 11) {
      return false;
    }

    if (/^(\d)\1{10}$/.test(cpfLimpo)) {
      return false;
    }

    var soma = 0;
    var i;

    for (i = 0; i < 9; i++) {
      soma += parseInt(cpfLimpo.charAt(i), 10) * (10 - i);
    }

    var resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(9), 10)) return false;

    soma = 0;
    for (i = 0; i < 10; i++) {
      soma += parseInt(cpfLimpo.charAt(i), 10) * (11 - i);
    }

    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(10), 10)) return false;

    return true;
  },

  /**
   * Formata CPF para XXX.XXX.XXX-XX.
   * @param {any} cpf
   * @returns {string}
   */
  formatCPF: function(cpf) {
    var cpfLimpo = this.normalizarCPF(cpf);
    if (cpfLimpo.length !== 11) return '';
    return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  },

  /**
   * Mascara CPF para logs/exibição segura.
   * @param {any} cpf
   * @returns {string}
   */
  maskCPF: function(cpf) {
    var cpfLimpo = this.normalizarCPF(cpf);
    if (cpfLimpo.length !== 11) return '***.***.***-**';
    return '***.' + cpfLimpo.substring(3, 6) + '.' + cpfLimpo.substring(6, 9) + '-**';
  },

  // ==========================================================================
  // CNPJ
  // ==========================================================================

  /**
   * Normaliza CNPJ para string com 14 dígitos.
   * @param {any} cnpj
   * @returns {string}
   */
  normalizarCNPJ: function(cnpj) {
    if (cnpj === null || cnpj === undefined || cnpj === '') return '';
    var s = String(cnpj).replace(/\D/g, '');
    if (!s) return '';
    while (s.length < 14) s = '0' + s;
    if (s.length > 14) s = s.substring(s.length - 14);
    return s;
  },

  /**
   * Valida CNPJ (algoritmo oficial).
   * @param {any} cnpj
   * @returns {boolean}
   */
  isValidCNPJ: function(cnpj) {
    var d = this.normalizarCNPJ(cnpj);
    if (d.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(d)) return false;

    var t = d.length - 2;
    var n = d.substring(0, t);
    var digitos = d.substring(t);
    var soma = 0, pos = t - 7, i;

    for (i = t; i >= 1; i--) {
      soma += parseInt(n.charAt(t - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    var res = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (res !== parseInt(digitos.charAt(0), 10)) return false;

    t++;
    n = d.substring(0, t);
    soma = 0;
    pos = t - 7;
    for (i = t; i >= 1; i--) {
      soma += parseInt(n.charAt(t - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    res = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return res === parseInt(digitos.charAt(1), 10);
  },

  /**
   * Formata CNPJ para XX.XXX.XXX/XXXX-XX.
   * @param {any} cnpj
   * @returns {string}
   */
  formatCNPJ: function(cnpj) {
    var d = this.normalizarCNPJ(cnpj);
    if (d.length !== 14) return '';
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  },

  // ==========================================================================
  // Helpers gerais
  // ==========================================================================

  /**
   * Gera código numérico aleatório (OTP).
   * @param {number} tamanho
   * @returns {string}
   */
  gerarCodigoNumerico: function(tamanho) {
    tamanho = tamanho || 6;
    var codigo = '';
    for (var i = 0; i < tamanho; i++) {
      codigo += Math.floor(Math.random() * 10).toString();
    }
    return codigo;
  },

  /**
   * Verifica se data está no passado.
   * @param {Date|string} data
   * @returns {boolean}
   */
  isDataPassada: function(data) {
    if (!data) return true;
    var d = new Date(data);
    return d < new Date();
  },

  /**
   * Cria resposta de erro padrão.
   * @param {string} message
   * @returns {Object}
   */
  createErrorResponse: function(message) {
    return {
      status: 'error',
      message: message,
      data: null
    };
  },

  /**
   * Cria resposta de sucesso padrão.
   * @param {*} data
   * @param {string} message
   * @returns {Object}
   */
  createSuccessResponse: function(data, message) {
    return {
      status: 'success',
      message: message || 'Operação realizada com sucesso.',
      data: data
    };
  },

  /**
   * Remove campos sensíveis de objeto antes de retorno.
   * @param {Object} obj
   * @param {Array} campos
   * @returns {Object}
   */
  removerCamposSensiveis: function(obj, campos) {
    if (!obj || typeof obj !== 'object') return obj;

    var copia = JSON.parse(JSON.stringify(obj));
    campos = campos || ['senha', 'password', 'codigo_acesso', 'token'];

    for (var i = 0; i < campos.length; i++) {
      if (copia.hasOwnProperty(campos[i])) {
        delete copia[campos[i]];
      }
    }

    return copia;
  }
};
