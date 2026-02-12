/**
 * ============================================================================
 * ARQUIVO: ProcessosService.gs
 * DESCRIÇÃO: Regras de negócio para gestão de processos jurídicos.
 * VERSÃO: 3.1 - Vínculo robusto de cliente e normalização de dados
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var ProcessosService = {

  /**
   * Lista processos com filtros opcionais.
   *
   * @param {Object} payload - { status, busca, token }
   */
  listarProcessos: function(payload) {
    // 1) Segurança
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    // Apenas gestores podem listar o acervo completo
    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    // 2) Base
    var processos = Database.read(CONFIG.SHEET_NAMES.PROCESSOS);

    // 3) Filtros
    var statusFiltro = (payload.status || '').toString().trim().toUpperCase();
    var termoBusca = Utils.normalizeText((payload.busca || '').toString().trim());

    var resultado = processos.filter(function(p) {
      var matchStatus = true;
      var matchBusca = true;

      if (statusFiltro) {
        matchStatus = (String(p.status || '').toUpperCase() === statusFiltro);
      }

      if (termoBusca) {
        var num = Utils.normalizeText(String(p.numero_processo || ''));
        var parte = Utils.normalizeText(String(p.parte_nome || ''));
        var tipo = Utils.normalizeText(String(p.tipo || ''));

        matchBusca = (num.indexOf(termoBusca) > -1 ||
                      parte.indexOf(termoBusca) > -1 ||
                      tipo.indexOf(termoBusca) > -1);
      }

      return matchStatus && matchBusca;
    });

    // 4) Permissão: ADVOGADO só vê processos atribuídos a ele
    if (auth.user.perfil.toUpperCase() === ENUMS.PERFIL.ADVOGADO) {
      var advId = String(auth.user.id || '').trim();
      resultado = resultado.filter(function(p) {
        return String(p.advogado_id || '').trim() === advId;
      });
    }

    // 5) Ordenação (mais recentes primeiro)
    resultado.sort(function(a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return resultado;
  },

  /**
   * Cria um novo processo no sistema.
   * Suporta vínculo com cliente via CPF.
   *
   * @param {Object} payload - Dados do processo + dados do cliente (opcional)
   */
  criarProcesso: function(payload) {
    // 1) Segurança
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado. Apenas advogados/gestores podem criar processos.');
    }

    // 2) Dados obrigatórios
    var numeroProcesso = String(payload.numero_processo || '').trim();
    var parteNome = String(payload.parte_nome || '').trim();
    var tipoProcesso = String(payload.tipo || '').trim();

    if (!numeroProcesso) {
      throw new Error('Número do processo é obrigatório.');
    }

    if (!parteNome) {
      throw new Error('Nome da parte/interessado é obrigatório.');
    }

    if (!tipoProcesso) {
      throw new Error('Tipo do processo é obrigatório.');
    }

    // 3) Duplicidade de número (normalizada)
    var existente = Database.findBy(CONFIG.SHEET_NAMES.PROCESSOS, 'numero_processo', numeroProcesso);
    if (existente && existente.length > 0) {
      throw new Error('Já existe um processo com este número.');
    }

    // 4) Vínculo com cliente
    var clienteId = '';
    var emailInteressado = String(payload.email_interessado || '').trim().toLowerCase();

    // Vínculo direto por ID (fluxo de seleção rápida)
    if (payload.cliente_id) {
      var clienteById = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, String(payload.cliente_id).trim());
      if (!clienteById) {
        throw new Error('Cliente selecionado não encontrado. Atualize a lista e tente novamente.');
      }
      clienteId = clienteById.id;
      emailInteressado = String(clienteById.email || emailInteressado || '').trim().toLowerCase();

      if (!payload.cpf_cliente) {
        payload.cpf_cliente = clienteById.cpf;
      }
    }

    // CPF/CNPJ informado: tenta localizar cliente e/ou cadastrar automaticamente
    if (!clienteId && payload.cpf_cliente) {
      var docDigits = String(payload.cpf_cliente).replace(/\D/g, '');
      var cpfNormalizado;

      if (docDigits.length <= 11) {
        cpfNormalizado = Utils.normalizarCPF(payload.cpf_cliente);
        if (!cpfNormalizado || cpfNormalizado.length !== 11) {
          throw new Error('CPF do cliente inválido. Informe 11 dígitos.');
        }
        if (!Utils.isValidCPF(cpfNormalizado)) {
          throw new Error('CPF do cliente inválido. Verifique os dígitos informados.');
        }
      } else {
        cpfNormalizado = Utils.normalizarCNPJ(payload.cpf_cliente);
        if (!cpfNormalizado || cpfNormalizado.length !== 14) {
          throw new Error('CNPJ do cliente inválido. Informe 14 dígitos.');
        }
        if (!Utils.isValidCNPJ(cpfNormalizado)) {
          throw new Error('CNPJ do cliente inválido. Verifique os dígitos informados.');
        }
      }

      // Tenta achar cliente existente
      var clienteExistente = ClienteService.buscarPorCPF(cpfNormalizado);

      if (clienteExistente) {
        clienteId = clienteExistente.id;
        emailInteressado = String(clienteExistente.email || emailInteressado || '').trim().toLowerCase();
      } else {
        // Não encontrou cliente: cria se vierem dados suficientes
        var nomeCliente = String(payload.nome_cliente || '').trim();
        var emailCliente = String(payload.email_cliente || '').trim().toLowerCase();
        var telefoneCliente = String(payload.telefone_cliente || '').replace(/\D/g, '');

        if (!nomeCliente || !emailCliente) {
          throw new Error('Cliente não encontrado. Preencha nome e email para cadastrar.');
        }

        if (!Utils.isValidEmail(emailCliente)) {
          throw new Error('Email do cliente inválido.');
        }

        // Proteção extra: se já houver cliente com mesmo email, vincula nele
        var clientePorEmail = Database.findBy(CONFIG.SHEET_NAMES.CLIENTES, 'email', emailCliente);
        if (clientePorEmail && clientePorEmail.length > 0) {
          clienteId = clientePorEmail[0].id;
          emailInteressado = emailCliente;
        } else {
          var novoCliente = Database.create(CONFIG.SHEET_NAMES.CLIENTES, {
            nome_completo: nomeCliente,
            cpf: cpfNormalizado,
            email: emailCliente,
            telefone: telefoneCliente,
            status: ENUMS.STATUS_CLIENTE.ATIVO,
            codigo_acesso: '',
            codigo_expira: '',
            tentativas: 0,
            ultimo_acesso: '',
            criado_por: auth.user.email
          });

          clienteId = novoCliente.id;
          emailInteressado = novoCliente.email;

          Utils.logAction(
            auth.user.email,
            ENUMS.ACOES_LOG.CRIAR_CLIENTE,
            'Cliente criado automaticamente no fluxo de processo. CPF: ' + Utils.maskCPF(cpfNormalizado)
          );
        }
      }
    }

    // Se email foi informado mas inválido, limpa para evitar falha de notificação futura
    if (emailInteressado && !Utils.isValidEmail(emailInteressado)) {
      emailInteressado = '';
    }

    // 5) Cria pasta no Drive
    var infoPasta = DriveService.criarPastaProcesso(numeroProcesso, parteNome);

    // 6) Monta e salva processo
    var novoProcesso = {
      numero_processo: numeroProcesso,
      parte_nome: parteNome,
      email_interessado: emailInteressado,
      cliente_id: clienteId,
      tipo: tipoProcesso,
      status: ENUMS.STATUS_PROCESSO.EM_ANDAMENTO,
      data_entrada: payload.data_entrada || new Date(),
      id_pasta_drive: infoPasta.id,
      link_pasta: infoPasta.url,
      criado_por: auth.user.email,
      descricao: String(payload.descricao || '').trim(),
      data_prazo: ''
    };

    var processoSalvo = Database.create(CONFIG.SHEET_NAMES.PROCESSOS, novoProcesso);

    // 7) Movimentação inicial
    Database.create(CONFIG.SHEET_NAMES.MOVIMENTACOES, {
      id_processo: processoSalvo.id,
      tipo: ENUMS.TIPO_MOVIMENTACAO.INICIAL,
      descricao: 'Abertura de processo administrativo/judicial.',
      data_movimentacao: new Date(),
      usuario_responsavel: auth.user.email
    });

    // 8) Auditoria
    var detalhesLog = 'Processo ' + numeroProcesso + ' criado.';
    if (clienteId) {
      detalhesLog += ' Vinculado ao cliente ID: ' + clienteId;
    }

    Utils.logAction(auth.user.email, ENUMS.ACOES_LOG.CRIAR_PROCESSO, detalhesLog);

    return processoSalvo;
  },

  /**
   * Obtém detalhes completos de um processo.
   * Inclui dados cadastrais e histórico de movimentações.
   */
  getProcessoDetalhe: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Acesso negado.');
    }

    var idProcesso = payload.id_processo;
    if (!idProcesso) {
      throw new Error('ID do processo não fornecido.');
    }

    // Busca processo
    var processo = Database.findById(CONFIG.SHEET_NAMES.PROCESSOS, idProcesso);
    if (!processo) {
      throw new Error('Processo não encontrado.');
    }

    // ADVOGADO só pode acessar processo atribuído a ele
    if (auth.user.perfil.toUpperCase() === ENUMS.PERFIL.ADVOGADO) {
      var advId = String(auth.user.id || '').trim();
      var procAdvId = String(processo.advogado_id || '').trim();
      if (procAdvId !== advId) {
        throw new Error('Você não tem acesso a este processo.');
      }
    }

    // Cliente só pode acessar processo vinculado a ele
    if (AuthService.isCliente(auth.user.perfil)) {
      var cliente = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, auth.user.id);
      if (!cliente) {
        throw new Error('Cliente não encontrado.');
      }

      var processoClienteId = String(processo.cliente_id || '').trim();
      var clienteId = String(cliente.id || '').trim();
      var processoEmail = String(processo.email_interessado || '').trim().toLowerCase();
      var clienteEmail = String(cliente.email || '').trim().toLowerCase();

      var autorizado = (processoClienteId && processoClienteId === clienteId) ||
                       (processoEmail && clienteEmail && processoEmail === clienteEmail);

      if (!autorizado) {
        Utils.logAction(cliente.email, ENUMS.ACOES_LOG.ACESSO_NEGADO,
          'Tentativa de acesso indevido ao processo: ' + (processo.numero_processo || processo.id));
        throw new Error('Você não tem acesso a este processo.');
      }
    }

    // Busca movimentações
    var movimentacoes = Database.findBy(CONFIG.SHEET_NAMES.MOVIMENTACOES, 'id_processo', idProcesso);
    movimentacoes.sort(function(a, b) {
      return new Date(b.data_movimentacao) - new Date(a.data_movimentacao);
    });

    // Busca cliente vinculado (se houver)
    var clienteVinculado = null;
    if (processo.cliente_id) {
      var clienteData = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, processo.cliente_id);
      if (clienteData) {
        clienteVinculado = {
          id: clienteData.id,
          nome: clienteData.nome_completo,
          cpf: Utils.maskCPF(clienteData.cpf),
          email: clienteData.email,
          telefone: clienteData.telefone
        };
      }
    }

    return {
      processo: processo,
      movimentacoes: movimentacoes,
      cliente: clienteVinculado
    };
  },

  /**
   * Salva notas internas de um processo.
   * Visível para toda a equipe (gestores).
   *
   * @param {Object} payload - { id_processo, notas_internas, token }
   */
  salvarNotas: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    var idProcesso = String(payload.id_processo || '').trim();
    if (!idProcesso) {
      throw new Error('ID do processo não fornecido.');
    }

    var processo = Database.findById(CONFIG.SHEET_NAMES.PROCESSOS, idProcesso);
    if (!processo) {
      throw new Error('Processo não encontrado.');
    }

    var notas = payload.notas_internas != null ? String(payload.notas_internas) : '';

    Database.update(CONFIG.SHEET_NAMES.PROCESSOS, idProcesso, {
      notas_internas: notas
    });

    return { salvo: true };
  },

  /**
   * Gera estatísticas para o Dashboard.
   */
  getDashboardStats: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Acesso negado.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado.');
    }

    var processos = Database.read(CONFIG.SHEET_NAMES.PROCESSOS);

    // ADVOGADO só vê estatísticas dos processos atribuídos a ele
    if (auth.user.perfil.toUpperCase() === ENUMS.PERFIL.ADVOGADO) {
      var advId = String(auth.user.id || '').trim();
      processos = processos.filter(function(p) {
        return String(p.advogado_id || '').trim() === advId;
      });
    }

    var stats = {
      total: processos.length,
      em_andamento: 0,
      sobrestado: 0,
      arquivado: 0,
      julgado: 0,
      cancelado: 0,
      recente: []
    };

    processos.forEach(function(p) {
      var st = String(p.status || '').toUpperCase();

      if (st === ENUMS.STATUS_PROCESSO.EM_ANDAMENTO) stats.em_andamento++;
      else if (st === ENUMS.STATUS_PROCESSO.SOBRESTADO) stats.sobrestado++;
      else if (st === ENUMS.STATUS_PROCESSO.ARQUIVADO) stats.arquivado++;
      else if (st === ENUMS.STATUS_PROCESSO.JULGADO) stats.julgado++;
      else if (st === ENUMS.STATUS_PROCESSO.CANCELADO) stats.cancelado++;
    });

    var sorted = processos.slice().sort(function(a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    stats.recente = sorted.slice(0, 5);

    return stats;
  }
};