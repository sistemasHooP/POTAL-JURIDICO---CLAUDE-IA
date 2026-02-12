/**
 * ============================================================================
 * ARQUIVO: ClienteService.gs
 * DESCRIÇÃO: Lógica de autenticação e acesso do Cliente (OTP)
 * VERSÃO: 2.3 - Correção do download de arquivos para clientes
 * ============================================================================
 */

var ClienteService = {

  /**
   * Solicita código de acesso via email (6 dígitos)
   */
  solicitarCodigo: function(payload) {
    var cpf = Utils.normalizarCPF(payload.cpf);

    if (!cpf || cpf.length !== 11) {
      throw new Error('CPF inválido. Informe 11 dígitos.');
    }

    // Rate limit
    var rateCheck = RateLimiter.verificarEnvioCodigo(cpf);
    if (!rateCheck.permitido) {
      throw new Error(rateCheck.mensagem || 'Muitas tentativas. Aguarde alguns minutos.');
    }

    // Busca cliente
    var clientes = Database.findByCPF(CONFIG.SHEET_NAMES.CLIENTES, 'cpf', cpf);

    if (!clientes || clientes.length === 0) {
      Utils.logAction('SISTEMA', ENUMS.ACOES_LOG.LOGIN_CLIENTE_FALHA,
        'CPF não cadastrado: ' + Utils.maskCPF(cpf));
      throw new Error('Cliente não encontrado. Verifique o CPF informado.');
    }

    var cliente = clientes[0];

    // Verifica status
    if (cliente.status && cliente.status.toUpperCase() === ENUMS.STATUS_CLIENTE.BLOQUEADO) {
      throw new Error('Conta bloqueada. Entre em contato com o escritório.');
    }

    if (cliente.status && cliente.status.toUpperCase() === ENUMS.STATUS_CLIENTE.INATIVO) {
      throw new Error('Cadastro inativo. Entre em contato com o escritório.');
    }

    // Gera código
    var codigo = Utils.gerarCodigoNumerico(6);
    var expira = new Date(new Date().getTime() + CONFIG.SECURITY.CODIGO_OTP_EXPIRY);

    // Atualiza no banco
    Database.update(CONFIG.SHEET_NAMES.CLIENTES, cliente.id, {
      codigo_acesso: codigo,
      codigo_expira: expira,
      tentativas: 0
    });

    // Envia email
    this._enviarEmailCodigo(cliente.email, cliente.nome_completo, codigo);

    Utils.logAction(cliente.email, ENUMS.ACOES_LOG.ENVIAR_CODIGO_OTP,
      'Código enviado para: ' + Utils.maskCPF(cpf));

    return {
      mensagem: 'Código enviado com sucesso!',
      emailMascarado: this._mascaraEmail(cliente.email)
    };
  },

  /**
   * Valida o código digitado e retorna token
   */
  validarCodigo: function(payload) {
    var cpf = Utils.normalizarCPF(payload.cpf);
    var codigoDigitado = String(payload.codigo || '').trim();

    if (!cpf || !codigoDigitado) {
      throw new Error('CPF e código são obrigatórios.');
    }

    // Busca cliente
    var clientes = Database.findByCPF(CONFIG.SHEET_NAMES.CLIENTES, 'cpf', cpf);

    if (!clientes || clientes.length === 0) {
      throw new Error('Cliente não encontrado.');
    }

    var cliente = clientes[0];

    // Verifica tentativas
    var tentativas = parseInt(cliente.tentativas || 0, 10);
    if (tentativas >= 30) {
      // Bloqueia
      Database.update(CONFIG.SHEET_NAMES.CLIENTES, cliente.id, {
        status: ENUMS.STATUS_CLIENTE.BLOQUEADO
      });

      Utils.logAction(cliente.email, ENUMS.ACOES_LOG.LOGIN_CLIENTE_FALHA,
        'Conta bloqueada por excesso de tentativas');

      throw new Error('Conta bloqueada por excesso de tentativas. Entre em contato.');
    }

    // Verifica expiração
    if (!cliente.codigo_expira || Utils.isDataPassada(cliente.codigo_expira)) {
      throw new Error('Código expirado. Solicite um novo.');
    }

    // Valida código
    if (cliente.codigo_acesso !== codigoDigitado) {
      Database.update(CONFIG.SHEET_NAMES.CLIENTES, cliente.id, {
        tentativas: tentativas + 1
      });

      throw new Error('Código incorreto. Tentativas restantes: ' + (4 - tentativas));
    }

    // SUCESSO! Limpa código e gera token
    Database.update(CONFIG.SHEET_NAMES.CLIENTES, cliente.id, {
      codigo_acesso: '',
      codigo_expira: '',
      tentativas: 0,
      ultimo_acesso: new Date()
    });

    var token = AuthService._gerarTokenJWT(cliente, ENUMS.PERFIL.CLIENTE);

    Utils.logAction(cliente.email, ENUMS.ACOES_LOG.LOGIN_CLIENTE,
      'Login cliente bem-sucedido');

    return {
      token: token,
      cliente: {
        id: cliente.id,
        nome: cliente.nome_completo,
        email: cliente.email,
        cpf: cliente.cpf
      }
    };
  },

  /**
   * Retorna processos vinculados ao cliente logado
   */
  getMeusProcessos: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!AuthService.isCliente(auth.user.perfil)) {
      throw new Error('Acesso negado. Apenas clientes podem acessar esta função.');
    }

    var clienteId = auth.user.id;

    // Busca cliente para pegar o CPF
    var cliente = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, clienteId);

    if (!cliente) {
      throw new Error('Cliente não encontrado.');
    }

    // Busca processos vinculados ao cliente
    var todosProcessos = Database.read(CONFIG.SHEET_NAMES.PROCESSOS);

    var processosCliente = todosProcessos.filter(function(p) {
      // Vinculado por ID
      if (p.cliente_id && String(p.cliente_id) === String(clienteId)) {
        return true;
      }

      // Vinculado por email
      var processoEmail = String(p.email_interessado || '').toLowerCase().trim();
      var clienteEmail = String(cliente.email || '').toLowerCase().trim();

      if (processoEmail && clienteEmail && processoEmail === clienteEmail) {
        return true;
      }

      return false;
    });

    // Ordena por data de entrada (mais recente primeiro)
    processosCliente.sort(function(a, b) {
      var dataA = a.data_entrada ? new Date(a.data_entrada) : new Date(0);
      var dataB = b.data_entrada ? new Date(b.data_entrada) : new Date(0);
      return dataB - dataA;
    });

    return processosCliente;
  },

  /**
   * Retorna detalhes de um processo específico
   */
  getProcessoDetalhe: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!AuthService.isCliente(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    var idProcesso = payload.id_processo;

    if (!idProcesso) {
      throw new Error('ID do processo não fornecido.');
    }

    var processo = Database.findById(CONFIG.SHEET_NAMES.PROCESSOS, idProcesso);

    if (!processo) {
      throw new Error('Processo não encontrado.');
    }

    // Verifica autorização
    var cliente = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, auth.user.id);

    if (!cliente) {
      throw new Error('Cliente não encontrado.');
    }

    var autorizado = false;

    // Verifica por ID
    if (processo.cliente_id && String(processo.cliente_id) === String(cliente.id)) {
      autorizado = true;
    }

    // Verifica por email
    var processoEmail = String(processo.email_interessado || '').toLowerCase().trim();
    var clienteEmail = String(cliente.email || '').toLowerCase().trim();

    if (processoEmail && clienteEmail && processoEmail === clienteEmail) {
      autorizado = true;
    }

    if (!autorizado) {
      Utils.logAction(cliente.email, ENUMS.ACOES_LOG.ACESSO_NEGADO,
        'Tentativa de acesso indevido ao processo: ' + idProcesso);
      throw new Error('Você não tem acesso a este processo.');
    }

    // Busca movimentações
    var movimentacoes = Database.findBy(CONFIG.SHEET_NAMES.MOVIMENTACOES, 'id_processo', idProcesso);

    movimentacoes.sort(function(a, b) {
      return new Date(b.data_movimentacao) - new Date(a.data_movimentacao);
    });

    return {
      processo: processo,
      movimentacoes: movimentacoes
    };
  },

  /**
   * Busca cliente por CPF
   */
  buscarPorCPF: function(cpf) {
    var doc = String(cpf || '').replace(/\D/g, '');

    // CPF: normaliza com padding
    if (doc.length > 0 && doc.length <= 11) {
      doc = Utils.normalizarCPF(cpf);
    }
    // CNPJ: normaliza com padding
    if (doc.length > 11 && doc.length <= 14) {
      doc = Utils.normalizarCNPJ(cpf);
    }

    if (!doc || (doc.length !== 11 && doc.length !== 14)) {
      return null;
    }

    var clientes = Database.findByCPF(CONFIG.SHEET_NAMES.CLIENTES, 'cpf', doc);

    if (!clientes || clientes.length === 0) {
      return null;
    }

    return clientes[0];
  },

  /**
   * Cadastra novo cliente (uso interno - gestores)
   */
  cadastrar: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado. Apenas gestores podem cadastrar clientes.');
    }

    var nome = String(payload.nome_completo || '').trim();
    var docRaw = String(payload.cpf || '').replace(/\D/g, '');
    var email = String(payload.email || '').trim().toLowerCase();
    var telefone = String(payload.telefone || '').replace(/\D/g, '');

    // Normaliza conforme tipo de documento
    if (docRaw.length > 0 && docRaw.length <= 11) {
      docRaw = Utils.normalizarCPF(payload.cpf);
    } else if (docRaw.length > 11 && docRaw.length <= 14) {
      docRaw = Utils.normalizarCNPJ(payload.cpf);
    }

    // Validações
    if (!nome) {
      throw new Error('Nome é obrigatório.');
    }

    if (!docRaw || (docRaw.length !== 11 && docRaw.length !== 14)) {
      throw new Error('CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.');
    }

    if (docRaw.length === 11 && !Utils.isValidCPF(docRaw)) {
      throw new Error('CPF inválido (dígitos verificadores incorretos).');
    }

    if (docRaw.length === 14 && !Utils.isValidCNPJ(docRaw)) {
      throw new Error('CNPJ inválido (dígitos verificadores incorretos).');
    }

    if (!email || !Utils.isValidEmail(email)) {
      throw new Error('Email inválido.');
    }

    // Verifica duplicidade de CPF/CNPJ
    var existente = this.buscarPorCPF(docRaw);
    if (existente) {
      throw new Error('Já existe um cliente cadastrado com este CPF/CNPJ.');
    }

    // Verifica duplicidade de email
    var clientesPorEmail = Database.findBy(CONFIG.SHEET_NAMES.CLIENTES, 'email', email);
    if (clientesPorEmail && clientesPorEmail.length > 0) {
      throw new Error('Já existe um cliente cadastrado com este email.');
    }

    // Cria cliente
    var novoCliente = Database.create(CONFIG.SHEET_NAMES.CLIENTES, {
      nome_completo: nome,
      cpf: docRaw,
      email: email,
      telefone: telefone,
      status: ENUMS.STATUS_CLIENTE.ATIVO,
      codigo_acesso: '',
      codigo_expira: '',
      tentativas: 0,
      ultimo_acesso: '',
      criado_por: auth.user.email
    });

    var logDoc = docRaw.length === 14 ? docRaw.substring(0, 4) + '***' : Utils.maskCPF(docRaw);
    Utils.logAction(auth.user.email, ENUMS.ACOES_LOG.CRIAR_CLIENTE,
      'Cliente criado: ' + logDoc);

    return novoCliente;
  },

  /**
   * Lista todos os clientes (uso interno - gestores)
   */
  listar: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    var clientes = Database.read(CONFIG.SHEET_NAMES.CLIENTES);

    // Remove campos sensíveis
    return clientes.map(function(c) {
      return {
        id: c.id,
        nome_completo: c.nome_completo,
        cpf: c.cpf,
        email: c.email,
        telefone: c.telefone,
        status: c.status,
        notificacoes_ativas: c.notificacoes_ativas || 'SIM',
        ultimo_acesso: c.ultimo_acesso,
        created_at: c.created_at
      };
    });
  },


  /**
   * Retorna um cliente específico por ID (uso interno - gestores)
   */
  buscarPorIdGestor: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    var clienteId = String(payload.cliente_id || '').trim();
    if (!clienteId) {
      throw new Error('ID do cliente não informado.');
    }

    var cliente = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, clienteId);
    if (!cliente) {
      throw new Error('Cliente não encontrado.');
    }

    return {
      id: cliente.id,
      nome_completo: cliente.nome_completo,
      cpf: cliente.cpf,
      email: cliente.email,
      telefone: cliente.telefone,
      status: cliente.status,
      notificacoes_ativas: cliente.notificacoes_ativas || 'SIM'
    };
  },

  /**
   * Atualiza dados do cliente (uso interno - gestores)
   */
  atualizar: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    var clienteId = payload.cliente_id;

    if (!clienteId) {
      throw new Error('ID do cliente não fornecido.');
    }

    var updates = {};

    if (payload.nome_completo) {
      updates.nome_completo = String(payload.nome_completo).trim();
    }

    if (payload.email) {
      var email = String(payload.email).trim().toLowerCase();
      if (!Utils.isValidEmail(email)) {
        throw new Error('Email inválido.');
      }
      updates.email = email;
    }

    if (payload.telefone) {
      updates.telefone = String(payload.telefone).replace(/\D/g, '');
    }

    if (payload.status) {
      updates.status = payload.status;
    }

    if (payload.notificacoes_ativas) {
      var val = String(payload.notificacoes_ativas).toUpperCase();
      if (val === 'SIM' || val === 'NAO') {
        updates.notificacoes_ativas = val;
      }
    }

    var clienteAtualizado = Database.update(CONFIG.SHEET_NAMES.CLIENTES, clienteId, updates);

    if (!clienteAtualizado) {
      throw new Error('Cliente não encontrado.');
    }

    Utils.logAction(auth.user.email, ENUMS.ACOES_LOG.CRIAR_CLIENTE,
      'Cliente atualizado: ID ' + clienteId);

    return clienteAtualizado;
  },

  /**
   * =========================================================================
   * DOWNLOAD DE ARQUIVO PARA CLIENTE (PROXY)
   * =========================================================================
   * Esta função permite que o cliente visualize arquivos anexados sem
   * precisar estar logado no Google. O sistema baixa o arquivo e envia
   * em Base64 para o frontend renderizar.
   */
  downloadArquivoCliente: function(payload) {
    // 1. Valida token do cliente
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    // Permite tanto clientes quanto gestores
    var isCliente = AuthService.isCliente(auth.user.perfil);
    var isGestor = AuthService.isGestor(auth.user.perfil);

    if (!isCliente && !isGestor) {
      throw new Error('Acesso negado.');
    }

    // 2. Obtém URL ou ID do arquivo
    var fileUrl = payload.fileUrl || payload.fileId;

    if (!fileUrl) {
      throw new Error('URL do arquivo não fornecida.');
    }

    // 3. Extrai o ID do arquivo da URL do Google Drive
    var fileId = null;

    // Se já for um ID puro (sem URL)
    if (fileUrl.length > 20 && fileUrl.length < 50 && !fileUrl.includes('/')) {
      fileId = fileUrl;
    } else {
      // Tenta extrair ID de diferentes formatos de URL do Drive
      var patterns = [
        /\/d\/([a-zA-Z0-9_-]{25,})/,           // /d/FILE_ID/
        /id=([a-zA-Z0-9_-]{25,})/,             // id=FILE_ID
        /\/file\/d\/([a-zA-Z0-9_-]{25,})/,     // /file/d/FILE_ID
        /([a-zA-Z0-9_-]{25,})/                  // ID direto (fallback)
      ];

      for (var i = 0; i < patterns.length; i++) {
        var match = fileUrl.match(patterns[i]);
        if (match && match[1]) {
          fileId = match[1];
          break;
        }
      }
    }

    if (!fileId) {
      throw new Error('Não foi possível identificar o arquivo. URL inválida.');
    }

    Logger.log('[ClienteService] Baixando arquivo ID: ' + fileId);

    try {
      // 4. Busca o arquivo no Drive usando as credenciais do script
      var file = DriveApp.getFileById(fileId);

      // 5. Converte para Base64
      var blob = file.getBlob();
      var base64Content = Utilities.base64Encode(blob.getBytes());

      Logger.log('[ClienteService] Arquivo baixado com sucesso: ' + file.getName());

      // 6. Retorna dados para o frontend
      return {
        base64: base64Content,
        mimeType: file.getMimeType(),
        nome: file.getName(),
        tamanho: file.getSize()
      };

    } catch (e) {
      Logger.log('[ClienteService] ERRO ao baixar arquivo: ' + e.toString());

      // Mensagens amigáveis baseadas no tipo de erro
      if (e.toString().includes('não encontrado') || e.toString().includes('not found')) {
        throw new Error('Arquivo não encontrado. Ele pode ter sido excluído ou movido.');
      }

      if (e.toString().includes('permissão') || e.toString().includes('permission')) {
        throw new Error('Sem permissão para acessar este arquivo.');
      }

      throw new Error('Erro ao baixar arquivo: ' + e.message);
    }
  },

  /**
   * Lista arquivos da pasta do processo para cliente/gestor autorizado.
   */
  listarArquivosProcesso: function(payload) {
    var auth = AuthService.verificarToken(payload);

    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var idProcesso = String(payload.id_processo || '').trim();
    if (!idProcesso) {
      throw new Error('ID do processo não fornecido.');
    }

    var processo = Database.findById(CONFIG.SHEET_NAMES.PROCESSOS, idProcesso);
    if (!processo) {
      throw new Error('Processo não encontrado.');
    }

    var isCliente = AuthService.isCliente(auth.user.perfil);
    var isGestor = AuthService.isGestor(auth.user.perfil);

    if (!isCliente && !isGestor) {
      throw new Error('Acesso negado.');
    }

    // Cliente precisa estar vinculado ao processo
    if (isCliente) {
      var cliente = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, auth.user.id);
      if (!cliente) {
        throw new Error('Cliente não encontrado.');
      }

      var processoClienteId = String(processo.cliente_id || '').trim();
      var clienteId = String(cliente.id || '').trim();
      var processoEmail = String(processo.email_interessado || '').toLowerCase().trim();
      var clienteEmail = String(cliente.email || '').toLowerCase().trim();

      var autorizado = (processoClienteId && processoClienteId === clienteId) ||
                       (processoEmail && clienteEmail && processoEmail === clienteEmail);

      if (!autorizado) {
        Utils.logAction(cliente.email, ENUMS.ACOES_LOG.ACESSO_NEGADO,
          'Tentativa de listar arquivos de processo não vinculado: ' + idProcesso);
        throw new Error('Você não tem acesso aos arquivos deste processo.');
      }
    }

    if (!processo.id_pasta_drive) {
      return {
        id_pasta: '',
        arquivos: []
      };
    }

    try {
      var folder = DriveApp.getFolderById(processo.id_pasta_drive);
      var files = folder.getFiles();
      var arquivos = [];

      while (files.hasNext()) {
        var file = files.next();
        arquivos.push({
          id: file.getId(),
          nome: file.getName(),
          mimeType: file.getMimeType(),
          tamanho: file.getSize(),
          atualizado_em: file.getLastUpdated()
        });
      }

      arquivos.sort(function(a, b) {
        return new Date(b.atualizado_em) - new Date(a.atualizado_em);
      });

      return {
        id_pasta: processo.id_pasta_drive,
        nome_pasta: folder.getName(),
        total_arquivos: arquivos.length,
        arquivos: arquivos
      };
    } catch (e) {
      Logger.log('[ClienteService] Erro ao listar arquivos da pasta: ' + e);
      throw new Error('Não foi possível listar os arquivos deste processo no momento.');
    }
  },

  // ===== MÉTODOS PRIVADOS =====

  _enviarEmailCodigo: function(email, nome, codigo) {
    var assunto = 'Código de Acesso - Acompanhamento Processual';

    var htmlBody =
      '<div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px; border-radius: 8px;">' +
      '  <div style="background-color: #2c3e50; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">' +
      '    <h2 style="color: #ffffff; margin: 0;">RPPS Jurídico</h2>' +
      '    <p style="color: #bdc3c7; margin: 5px 0 0 0;">Área do Cliente</p>' +
      '  </div>' +
      '  <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-radius: 0 0 8px 8px;">' +
      '    <h3 style="color: #2c3e50; margin-top: 0;">Olá, ' + nome + '!</h3>' +
      '    <p style="color: #555; line-height: 1.6;">Você solicitou acesso ao acompanhamento de seus processos. Use o código abaixo para entrar:</p>' +
      '    <div style="background-color: #ecf0f1; border-left: 4px solid #3498db; padding: 20px; margin: 25px 0; text-align: center;">' +
      '      <p style="color: #7f8c8d; font-size: 12px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px;">Código de Acesso</p>' +
      '      <p style="font-size: 36px; font-weight: bold; color: #2c3e50; margin: 0; letter-spacing: 8px; font-family: Courier New, monospace;">' + codigo + '</p>' +
      '    </div>' +
      '    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">' +
      '      <p style="margin: 0; color: #856404; font-size: 13px;">' +
      '        <strong>⚠️ Importante:</strong> Este código é válido por 10 minutos e só pode ser usado uma vez.' +
      '      </p>' +
      '    </div>' +
      '    <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">' +
      '      Se você não solicitou este código, ignore este email. Seu acesso está seguro.' +
      '    </p>' +
      '  </div>' +
      '</div>';

    MailApp.sendEmail({
      to: email,
      subject: assunto,
      htmlBody: htmlBody
    });
  },

  _mascaraEmail: function(email) {
    if (!email) return '';

    var partes = email.split('@');
    if (partes.length !== 2) return email;

    var usuario = partes[0];
    var dominio = partes[1];

    if (usuario.length <= 3) {
      return usuario.charAt(0) + '***@' + dominio;
    }

    return usuario.substring(0, 2) + '***' + usuario.charAt(usuario.length - 1) + '@' + dominio;
  }
};