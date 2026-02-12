/**
 * ============================================================================
 * ARQUIVO: AdvogadoService.gs
 * DESCRIÇÃO: Gerenciamento de advogados - CRUD e atribuição de processos.
 * VERSÃO: 1.0 - Sistema de permissões por advogado
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var AdvogadoService = {

  /**
   * Lista todos os advogados cadastrados no sistema.
   * Apenas ADMIN e PRESIDENTE podem acessar.
   *
   * @param {Object} payload - { token }
   * @returns {Array} Lista de advogados (sem senha)
   */
  listar: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var perfil = (auth.user.perfil || '').toUpperCase();
    if (perfil !== ENUMS.PERFIL.ADMIN && perfil !== ENUMS.PERFIL.PRESIDENTE) {
      throw new Error('Acesso negado. Apenas administradores podem gerenciar advogados.');
    }

    var usuarios = Database.read(CONFIG.SHEET_NAMES.USUARIOS);

    // PRESIDENTE vê ADMIN + ADVOGADO; ADMIN vê apenas ADVOGADO
    var advogados = usuarios.filter(function(u) {
      var p = (u.perfil || '').toUpperCase();
      if (perfil === ENUMS.PERFIL.PRESIDENTE) {
        return p === ENUMS.PERFIL.ADVOGADO || p === ENUMS.PERFIL.ADMIN;
      }
      return p === ENUMS.PERFIL.ADVOGADO;
    });

    // Retorna sem expor a senha
    return advogados.map(function(a) {
      return {
        id: a.id,
        nome: a.nome,
        email: a.email,
        perfil: a.perfil,
        ativo: a.ativo,
        created_at: a.created_at
      };
    });
  },

  /**
   * Cadastra um novo advogado no sistema.
   *
   * @param {Object} payload - { nome, email, senha, token }
   * @returns {Object} Dados do advogado criado
   */
  cadastrar: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var perfil = (auth.user.perfil || '').toUpperCase();
    if (perfil !== ENUMS.PERFIL.ADMIN && perfil !== ENUMS.PERFIL.PRESIDENTE) {
      throw new Error('Acesso negado.');
    }

    var nome = String(payload.nome || '').trim();
    var email = String(payload.email || '').trim().toLowerCase();
    var senha = String(payload.senha || '').trim();

    if (!nome) throw new Error('Nome do advogado é obrigatório.');
    if (!email) throw new Error('Email do advogado é obrigatório.');
    if (!senha || senha.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres.');
    if (!Utils.isValidEmail(email)) throw new Error('Email inválido.');

    // Verifica duplicidade de email
    var existente = Database.findBy(CONFIG.SHEET_NAMES.USUARIOS, 'email', email);
    if (existente && existente.length > 0) {
      throw new Error('Já existe um usuário com este email.');
    }

    var senhaHash = AuthService._gerarHashSenha(senha);

    // PRESIDENTE pode criar ADMIN ou ADVOGADO; ADMIN cria apenas ADVOGADO
    var perfilNovo = ENUMS.PERFIL.ADVOGADO;
    if (perfil === ENUMS.PERFIL.PRESIDENTE && payload.perfil_usuario) {
      var perfilSolicitado = String(payload.perfil_usuario).toUpperCase();
      if (perfilSolicitado === ENUMS.PERFIL.ADMIN || perfilSolicitado === ENUMS.PERFIL.ADVOGADO) {
        perfilNovo = perfilSolicitado;
      }
    }

    var novoAdvogado = Database.create(CONFIG.SHEET_NAMES.USUARIOS, {
      nome: nome,
      email: email,
      senha: senhaHash,
      perfil: perfilNovo,
      ativo: true
    });

    Utils.logAction(auth.user.email, 'CRIAR_USUARIO', perfilNovo + ' criado: ' + email);

    return {
      id: novoAdvogado.id,
      nome: novoAdvogado.nome,
      email: novoAdvogado.email,
      perfil: novoAdvogado.perfil,
      ativo: novoAdvogado.ativo
    };
  },

  /**
   * Atualiza dados de um advogado.
   * Pode atualizar nome, email, status (ativo/inativo) e senha.
   *
   * @param {Object} payload - { advogado_id, nome?, email?, ativo?, senha?, token }
   */
  atualizar: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var perfil = (auth.user.perfil || '').toUpperCase();
    if (perfil !== ENUMS.PERFIL.ADMIN && perfil !== ENUMS.PERFIL.PRESIDENTE) {
      throw new Error('Acesso negado.');
    }

    var advogadoId = String(payload.advogado_id || '').trim();
    if (!advogadoId) throw new Error('ID do advogado não fornecido.');

    var advogado = Database.findById(CONFIG.SHEET_NAMES.USUARIOS, advogadoId);
    if (!advogado) throw new Error('Advogado não encontrado.');

    // Hierarquia: PRESIDENTE > ADMIN > ADVOGADO
    var perfilAlvo = (advogado.perfil || '').toUpperCase();
    if (perfil === ENUMS.PERFIL.PRESIDENTE) {
      // PRESIDENTE pode editar ADMIN e ADVOGADO (não pode editar outro PRESIDENTE)
      if (perfilAlvo !== ENUMS.PERFIL.ADVOGADO && perfilAlvo !== ENUMS.PERFIL.ADMIN) {
        throw new Error('Não é possível editar este usuário.');
      }
    } else {
      // ADMIN só pode editar ADVOGADO
      if (perfilAlvo !== ENUMS.PERFIL.ADVOGADO) {
        throw new Error('Apenas o Presidente pode editar administradores.');
      }
    }

    var updates = {};

    if (payload.nome !== undefined && payload.nome !== null) {
      updates.nome = String(payload.nome).trim();
    }

    if (payload.email !== undefined && payload.email !== null) {
      var novoEmail = String(payload.email).trim().toLowerCase();
      if (!Utils.isValidEmail(novoEmail)) throw new Error('Email inválido.');

      if (novoEmail !== (advogado.email || '').toLowerCase()) {
        var existente = Database.findBy(CONFIG.SHEET_NAMES.USUARIOS, 'email', novoEmail);
        if (existente && existente.length > 0) {
          throw new Error('Já existe um usuário com este email.');
        }
      }
      updates.email = novoEmail;
    }

    if (payload.ativo !== undefined && payload.ativo !== null) {
      updates.ativo = payload.ativo;
    }

    if (payload.senha) {
      if (String(payload.senha).length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres.');
      updates.senha = AuthService._gerarHashSenha(String(payload.senha));
    }

    // PRESIDENTE pode alterar perfil entre ADMIN e ADVOGADO
    if (perfil === ENUMS.PERFIL.PRESIDENTE && payload.perfil_usuario !== undefined && payload.perfil_usuario !== null) {
      var novoPerfil = String(payload.perfil_usuario).toUpperCase();
      if (novoPerfil === ENUMS.PERFIL.ADMIN || novoPerfil === ENUMS.PERFIL.ADVOGADO) {
        updates.perfil = novoPerfil;
      }
    }

    Database.update(CONFIG.SHEET_NAMES.USUARIOS, advogadoId, updates);

    Utils.logAction(auth.user.email, 'ATUALIZAR_USUARIO',
      'Usuário atualizado: ' + advogadoId + ' (' + (advogado.email || '') + ')');

    return { atualizado: true };
  },

  /**
   * Atribui um processo a um advogado.
   * Define qual advogado é responsável/tem visibilidade do processo.
   *
   * @param {Object} payload - { processo_id, advogado_id, token }
   */
  atribuirProcesso: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var perfil = (auth.user.perfil || '').toUpperCase();
    if (perfil !== ENUMS.PERFIL.ADMIN && perfil !== ENUMS.PERFIL.PRESIDENTE) {
      throw new Error('Acesso negado.');
    }

    var processoId = String(payload.processo_id || '').trim();
    var advogadoId = String(payload.advogado_id || '').trim();

    if (!processoId) throw new Error('ID do processo não fornecido.');

    var processo = Database.findById(CONFIG.SHEET_NAMES.PROCESSOS, processoId);
    if (!processo) throw new Error('Processo não encontrado.');

    // advogadoId vazio = desatribuir
    if (advogadoId) {
      var advogado = Database.findById(CONFIG.SHEET_NAMES.USUARIOS, advogadoId);
      if (!advogado) throw new Error('Advogado não encontrado.');
    }

    Database.update(CONFIG.SHEET_NAMES.PROCESSOS, processoId, {
      advogado_id: advogadoId
    });

    Utils.logAction(auth.user.email, 'ATRIBUIR_PROCESSO',
      'Processo ' + (processo.numero_processo || processoId) +
      ' atribuído ao advogado ' + (advogadoId || 'NENHUM'));

    return { atribuido: true };
  },

  /**
   * Lista processos atribuídos a um advogado específico.
   *
   * @param {Object} payload - { advogado_id, token }
   * @returns {Array} Lista resumida de processos
   */
  listarProcessosAdvogado: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var perfil = (auth.user.perfil || '').toUpperCase();
    if (perfil !== ENUMS.PERFIL.ADMIN && perfil !== ENUMS.PERFIL.PRESIDENTE) {
      throw new Error('Acesso negado.');
    }

    var advogadoId = String(payload.advogado_id || '').trim();
    if (!advogadoId) throw new Error('ID do advogado não fornecido.');

    var processos = Database.read(CONFIG.SHEET_NAMES.PROCESSOS);

    return processos.filter(function(p) {
      return String(p.advogado_id || '').trim() === advogadoId;
    }).map(function(p) {
      return {
        id: p.id,
        numero_processo: p.numero_processo,
        parte_nome: p.parte_nome,
        tipo: p.tipo,
        status: p.status,
        data_entrada: p.data_entrada
      };
    });
  },

  /**
   * Lista TODOS os processos (resumido) para o modal de atribuição.
   *
   * @param {Object} payload - { token }
   * @returns {Array} Lista de processos com advogado_id
   */
  listarProcessosParaAtribuicao: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    var perfil = (auth.user.perfil || '').toUpperCase();
    if (perfil !== ENUMS.PERFIL.ADMIN && perfil !== ENUMS.PERFIL.PRESIDENTE) {
      throw new Error('Acesso negado.');
    }

    var processos = Database.read(CONFIG.SHEET_NAMES.PROCESSOS);

    return processos.map(function(p) {
      return {
        id: p.id,
        numero_processo: p.numero_processo,
        parte_nome: p.parte_nome,
        tipo: p.tipo,
        status: p.status,
        advogado_id: p.advogado_id || ''
      };
    });
  }
};
