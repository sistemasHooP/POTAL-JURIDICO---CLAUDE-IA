/**
 * ============================================================================
 * ARQUIVO: Auth.gs
 * DESCRIÇÃO: Serviço de Autenticação e Autorização.
 * VERSÃO: 3.0 - Com suporte a Cliente e métodos públicos para JWT
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var AuthService = {

  /**
   * Realiza o login do usuário (Advogado/Admin).
   * 
   * @param {Object} payload - { email, senha }
   * @returns {Object} { token, user }
   */
  login: function(payload) {
    // 1. Validação básica
    if (!payload || !payload.email || !payload.senha) {
      throw new Error("Email e senha são obrigatórios.");
    }

    var email = payload.email.trim().toLowerCase();
    var senha = payload.senha;

    // 2. Verificar Rate Limit
    var rateCheck = RateLimiter.verificarLogin(email);
    if (!rateCheck.permitido) {
      Utils.logAction(email, ENUMS.ACOES_LOG.LOGIN_BLOQUEADO, 
        'Tentativas excedidas. Bloqueio temporário.');
      throw new Error("Muitas tentativas de login. Aguarde alguns minutos.");
    }

    // 3. Buscar usuário pelo email
    var usuarios = Database.read(CONFIG.SHEET_NAMES.USUARIOS);
    var usuario = null;

    for (var i = 0; i < usuarios.length; i++) {
      var u = usuarios[i];
      if (u.email && u.email.toString().toLowerCase() === email) {
        usuario = u;
        break;
      }
    }

    if (!usuario) {
      Utils.logAction(email, ENUMS.ACOES_LOG.LOGIN_FALHA, 'Email não encontrado');
      throw new Error("Email ou senha incorretos.");
    }

    // 4. Verificar se está ativo
    var ativo = usuario.ativo;
    if (ativo === false || ativo === 'FALSE' || ativo === 'false' || ativo === 0) {
      Utils.logAction(email, ENUMS.ACOES_LOG.LOGIN_FALHA, 'Usuário inativo');
      throw new Error("Usuário desativado. Entre em contato com o administrador.");
    }

    // 5. Validar senha (APENAS HASH)
    var senhaHash = this._gerarHashSenha(senha);
    var senhaArmazenada = (usuario.senha || '').toString().toLowerCase();
    
    if (senhaHash !== senhaArmazenada) {
      Utils.logAction(email, ENUMS.ACOES_LOG.LOGIN_FALHA, 'Senha incorreta');
      throw new Error("Email ou senha incorretos.");
    }

    // 6. Login bem-sucedido! Resetar rate limit
    RateLimiter.resetarLogin(email);

    // 7. Gerar token JWT
    var token = this._gerarTokenJWT(usuario, usuario.perfil);

    // 8. Log de sucesso
    Utils.logAction(email, ENUMS.ACOES_LOG.LOGIN, 'Login realizado com sucesso');

    // 9. Retornar dados (sem a senha!)
    return {
      token: token,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      }
    };
  },

  /**
   * Verifica e decodifica um token JWT.
   * 
   * @param {Object} payload - { token }
   * @returns {Object} { valido: boolean, user: Object|null, mensagem: string }
   */
  verificarToken: function(payload) {
    if (!payload || !payload.token) {
      return { valido: false, user: null, mensagem: "Token não fornecido." };
    }

    try {
      var token = payload.token;
      var partes = token.split('.');

      if (partes.length !== 3) {
        return { valido: false, user: null, mensagem: "Token mal formatado." };
      }

      var header = partes[0];
      var payloadBase64 = partes[1];
      var assinaturaRecebida = partes[2];

      // Verificar assinatura
      var assinaturaCalculada = this._gerarAssinatura(header + '.' + payloadBase64);

      if (assinaturaRecebida !== assinaturaCalculada) {
        return { valido: false, user: null, mensagem: "Token inválido (assinatura)." };
      }

      // Decodificar payload
      var payloadJSON = Utilities.newBlob(Utilities.base64Decode(payloadBase64)).getDataAsString();
      var dados = JSON.parse(payloadJSON);

      // Verificar expiração
      if (dados.exp && new Date().getTime() > dados.exp) {
        return { valido: false, user: null, mensagem: "Token expirado." };
      }

      return {
        valido: true,
        user: {
          id: dados.id,
          email: dados.email,
          nome: dados.nome,
          perfil: dados.perfil
        },
        mensagem: "Token válido."
      };

    } catch (e) {
      Logger.log("Erro ao verificar token: " + e);
      return { valido: false, user: null, mensagem: "Erro ao processar token." };
    }
  },

  /**
   * Verifica se o perfil é de gestor (admin/advogado/presidente).
   */
  isGestor: function(perfil) {
    if (!perfil) return false;
    var p = perfil.toUpperCase();
    return p === ENUMS.PERFIL.ADMIN || 
           p === ENUMS.PERFIL.ADVOGADO || 
           p === ENUMS.PERFIL.PRESIDENTE;
  },

  /**
   * Verifica se o perfil é de cliente.
   */
  isCliente: function(perfil) {
    if (!perfil) return false;
    return perfil.toUpperCase() === ENUMS.PERFIL.CLIENTE;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS INTERNOS (usados também pelo ClienteService)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gera hash SHA-256 da senha (apenas a senha, sem o email).
   */
  _gerarHashSenha: function(senha) {
    var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha);
    return hash.map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
  },

  /**
   * Gera um token JWT assinado.
   * NOTA: Este método é usado também pelo ClienteService para gerar tokens de cliente.
   */
  _gerarTokenJWT: function(usuario, perfil) {
    // Header
    var header = {
      alg: "HS256",
      typ: "JWT"
    };

    // Tempo de expiração baseado no perfil
    var tempoExpiracao = CONFIG.SECURITY.TOKEN_EXPIRY_ADVOGADO; // 8 horas padrão
    if (perfil && perfil.toUpperCase() === ENUMS.PERFIL.CLIENTE) {
      tempoExpiracao = CONFIG.SECURITY.TOKEN_EXPIRY_CLIENTE; // 4 horas para cliente
    }

    // Payload
    var payload = {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome || usuario.nome_completo,
      perfil: perfil,
      iat: new Date().getTime(),
      exp: new Date().getTime() + tempoExpiracao
    };

    // Codificar em Base64
    var headerBase64 = Utilities.base64Encode(JSON.stringify(header));
    var payloadBase64 = Utilities.base64Encode(JSON.stringify(payload));

    // Gerar assinatura
    var assinatura = this._gerarAssinatura(headerBase64 + '.' + payloadBase64);

    return headerBase64 + '.' + payloadBase64 + '.' + assinatura;
  },

  /**
   * Gera assinatura HMAC-SHA256 para o token.
   */
  _gerarAssinatura: function(dados) {
    var secret = getJWTSecret();
    var signature = Utilities.computeHmacSha256Signature(dados, secret);
    
    // Converter para Base64 URL-safe
    var base64 = Utilities.base64Encode(signature);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES UTILITÁRIAS DE AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera hash de uma senha para armazenar no banco.
 * Use esta função para criar o hash antes de salvar na planilha.
 * 
 * COMO USAR:
 * 1. Altere a variável 'senha' abaixo
 * 2. Execute esta função no Editor do Apps Script
 * 3. Veja o hash no log (View > Logs)
 * 4. Copie e cole na coluna SENHA da planilha USUARIOS
 */
function criarHashSenha() {
  var senha = "123456";  // ← ALTERE AQUI para a senha desejada
  
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha);
  var hashHex = hash.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
  
  Logger.log("==========================================");
  Logger.log("GERADOR DE HASH DE SENHA");
  Logger.log("==========================================");
  Logger.log("Senha original: " + senha);
  Logger.log("Hash SHA-256:   " + hashHex);
  Logger.log("==========================================");
  Logger.log("Copie o hash acima e cole na coluna SENHA");
  Logger.log("da planilha USUARIOS para este usuário.");
  Logger.log("==========================================");
  
  return hashHex;
}

/**
 * Inicializa a segurança do sistema.
 * Gera e armazena o JWT Secret se não existir.
 */
function inicializarSeguranca() {
  var props = PropertiesService.getScriptProperties();
  var existingSecret = props.getProperty('JWT_SECRET');
  
  if (!existingSecret) {
    // Gera um secret aleatório de 64 caracteres
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    var secret = '';
    for (var i = 0; i < 64; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    props.setProperty('JWT_SECRET', secret);
    Logger.log("JWT Secret criado e armazenado com sucesso!");
  } else {
    Logger.log("JWT Secret já existe. Nenhuma ação necessária.");
  }
  
  Logger.log("==========================================");
  Logger.log("Segurança inicializada!");
  Logger.log("==========================================");
}