/**
 * ============================================================================
 * ARQUIVO: RateLimiter.gs
 * DESCRIÇÃO: Controle de taxa de requisições para prevenir ataques.
 * FUNÇÃO: Limita tentativas de login e requisições excessivas à API.
 * VERSÃO: 1.1 - Robustez de cache/JSON e normalização de identificadores
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 *
 * COMO FUNCIONA:
 * - Usa o CacheService do Google (memória temporária) para contar requisições
 * - Não precisa de planilha extra (mais rápido)
 * - Os dados expiram automaticamente após o tempo configurado
 *
 * ============================================================================
 */

var RateLimiter = {

  /**
   * Verifica se uma chave (email, IP, CPF) excedeu o limite de requisições.
   *
   * @param {string} tipo - Tipo de limite ('LOGIN', 'API_GERAL', 'CODIGO_OTP')
   * @param {string} identificador - Email, IP ou CPF para identificar o usuário
   * @returns {Object} { permitido: boolean, tentativasRestantes: number, bloqueadoAte: Date|null }
   */
  verificar: function(tipo, identificador) {
    // Pega as configurações do tipo de limite
    var config = this._getConfig(tipo);
    if (!config) {
      // Se não encontrar config, permite (fail-open para não quebrar o sistema)
      return { permitido: true, tentativasRestantes: 999, bloqueadoAte: null };
    }

    var cache = CacheService.getScriptCache();
    var idSeguro = this._normalizarIdentificador(identificador);
    var chaveContador = 'rate_' + tipo + '_' + idSeguro;
    var chaveBloqueio = 'block_' + tipo + '_' + idSeguro;

    // 1. Verifica se está bloqueado
    var bloqueioData = cache.get(chaveBloqueio);
    if (bloqueioData) {
      var bloqueio = this._safeParseJSON(bloqueioData, null);
      if (bloqueio && bloqueio.ate) {
        return {
          permitido: false,
          tentativasRestantes: 0,
          bloqueadoAte: new Date(bloqueio.ate),
          mensagem: 'Muitas tentativas. Tente novamente em alguns minutos.'
        };
      }
      // Se cache estiver corrompido, remove e segue fluxo
      cache.remove(chaveBloqueio);
    }

    // 2. Pega o contador atual
    var dadosStr = cache.get(chaveContador);
    var dados = this._safeParseJSON(dadosStr, null);
    var agora = new Date().getTime();

    if (!dados || typeof dados.inicio !== 'number' || typeof dados.contador !== 'number') {
      // Primeira requisição ou cache corrompido
      dados = { inicio: agora, contador: 0 };
    } else {
      // Verifica se ainda está na mesma janela de tempo
      var tempoDecorrido = (agora - dados.inicio) / 1000; // em segundos
      if (tempoDecorrido > config.JANELA_SEGUNDOS) {
        // Janela expirou, reinicia contador
        dados = { inicio: agora, contador: 0 };
      }
    }

    // 3. Incrementa o contador
    dados.contador++;

    // 4. Verifica se excedeu o limite
    var maxPermitido = config.MAX_TENTATIVAS || config.MAX_REQUISICOES || config.MAX_ENVIOS || 0;

    if (dados.contador > maxPermitido) {
      // Excedeu! Aplica bloqueio
      var tempoBloqueioPadrao = config.BLOQUEIO_SEGUNDOS || config.JANELA_SEGUNDOS;
      var bloqueioAte = agora + (tempoBloqueioPadrao * 1000);

      cache.put(chaveBloqueio, JSON.stringify({ ate: bloqueioAte }), tempoBloqueioPadrao);

      // Log de segurança
      try {
        Utils.logAction('SISTEMA', ENUMS.ACOES_LOG.RATE_LIMIT_EXCEDIDO,
          'Tipo: ' + tipo + ', Identificador: ' + idSeguro);
      } catch (e) {
        Logger.log('Erro ao registrar log de rate limit: ' + e);
      }

      return {
        permitido: false,
        tentativasRestantes: 0,
        bloqueadoAte: new Date(bloqueioAte),
        mensagem: 'Limite excedido. Aguarde antes de tentar novamente.'
      };
    }

    // 5. Salva o contador atualizado
    var ttl = (config.JANELA_SEGUNDOS || 60) + 60; // TTL do cache = janela + margem
    cache.put(chaveContador, JSON.stringify(dados), ttl);

    // 6. Calcula tentativas restantes
    var restantes = maxPermitido - dados.contador;

    return {
      permitido: true,
      tentativasRestantes: restantes > 0 ? restantes : 0,
      bloqueadoAte: null
    };
  },

  /**
   * Verifica rate limit para tentativas de LOGIN.
   * @param {string} email - Email do usuário tentando logar
   */
  verificarLogin: function(email) {
    var emailNormalizado = (email || 'desconhecido').toLowerCase().trim();
    return this.verificar('LOGIN', emailNormalizado);
  },

  /**
   * Verifica rate limit para requisições gerais da API.
   * @param {string} identificador - IP ou token do usuário
   */
  verificarAPI: function(identificador) {
    return this.verificar('API_GERAL', identificador || 'geral');
  },

  /**
   * Verifica rate limit para envio de código OTP (cliente).
   * @param {string} cpf - CPF do cliente
   */
  verificarEnvioCodigo: function(cpf) {
    var cpfLimpo = Utils.normalizarCPF(cpf);

    // Evita concentração em chave vazia quando CPF vier inválido
    if (!cpfLimpo) {
      cpfLimpo = 'cpf_invalido_' + String(cpf || '').replace(/\D/g, '').substring(0, 11);
      if (!cpfLimpo || cpfLimpo === 'cpf_invalido_') {
        cpfLimpo = 'cpf_invalido_generico';
      }
    }

    return this.verificar('CODIGO_OTP', cpfLimpo);
  },

  /**
   * Reseta o contador de um identificador específico.
   * Útil após login bem-sucedido.
   * @param {string} tipo - Tipo de limite
   * @param {string} identificador - Email, IP ou CPF
   */
  resetar: function(tipo, identificador) {
    var cache = CacheService.getScriptCache();
    var idSeguro = this._normalizarIdentificador(identificador);
    var chaveContador = 'rate_' + tipo + '_' + idSeguro;
    var chaveBloqueio = 'block_' + tipo + '_' + idSeguro;

    cache.remove(chaveContador);
    cache.remove(chaveBloqueio);
  },

  /**
   * Reseta o contador de login após sucesso.
   * @param {string} email
   */
  resetarLogin: function(email) {
    var emailNormalizado = (email || '').toLowerCase().trim();
    this.resetar('LOGIN', emailNormalizado);
  },

  /**
   * Obtém a configuração de rate limit baseada no tipo.
   * @private
   */
  _getConfig: function(tipo) {
    if (!CONFIG || !CONFIG.RATE_LIMIT) {
      return null;
    }

    switch (tipo) {
      case 'LOGIN':
        return CONFIG.RATE_LIMIT.LOGIN;
      case 'API_GERAL':
        return CONFIG.RATE_LIMIT.API_GERAL;
      case 'CODIGO_OTP':
        return CONFIG.RATE_LIMIT.CODIGO_OTP;
      default:
        return null;
    }
  },

  /**
   * Sanitiza identificador para uso em chave de cache.
   * @private
   */
  _normalizarIdentificador: function(identificador) {
    var id = String(identificador || 'anonimo').trim().toLowerCase();
    if (!id) id = 'anonimo';

    // Remove espaços e caracteres que podem poluir a chave
    id = id.replace(/\s+/g, '_').replace(/[^a-z0-9@._:-]/g, '_');

    // Limita tamanho da chave
    if (id.length > 120) {
      id = id.substring(0, 120);
    }

    return id;
  },

  /**
   * Parse JSON seguro.
   * @private
   */
  _safeParseJSON: function(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
};
