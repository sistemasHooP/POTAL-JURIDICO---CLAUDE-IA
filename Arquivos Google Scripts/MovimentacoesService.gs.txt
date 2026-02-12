/**
 * ============================================================================
 * ARQUIVO: MovimentacoesService.gs
 * DESCRIÇÃO: Regras de negócio para movimentações processuais.
 * FUNÇÃO: Registrar andamentos, uploads, prazos e notificar por e-mail.
 * DEPENDÊNCIAS: Database.gs, DriveService.gs, Auth.gs, Config.gs, Utils.gs
 * VERSÃO: 3.0 - Persistência robusta de referências e prazos inteligentes
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var MovimentacoesService = {

  /**
   * Registra nova movimentação em processo existente.
   * Salva mov_referencia_id para vincular respostas a prazos.
   * Atualiza data_prazo do processo inteligentemente.
   * @param {Object} payload
   */
  novaMovimentacao: function(payload) {
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!AuthService.isGestor(auth.user.perfil)) {
      throw new Error('Acesso negado. Apenas gestores podem registrar movimentações.');
    }

    if (!payload.id_processo || !payload.tipo || !payload.descricao) {
      throw new Error('Dados incompletos. Informe processo, tipo e descrição.');
    }

    var processo = Database.findById(CONFIG.SHEET_NAMES.PROCESSOS, payload.id_processo);
    if (!processo) {
      throw new Error('Processo não encontrado.');
    }

    var linkArquivo = '';
    var nomeArquivoSalvo = '';

    // Upload opcional
    if (payload.arquivo && payload.arquivo.dadosBase64) {
      if (!processo.id_pasta_drive) {
        var pastaInfo = DriveService.criarPastaProcesso(processo.numero_processo, processo.parte_nome);
        processo = Database.update(CONFIG.SHEET_NAMES.PROCESSOS, processo.id, {
          id_pasta_drive: pastaInfo.id,
          link_pasta: pastaInfo.url
        });
      }

      var arquivoSalvo = DriveService.uploadArquivo({
        token: payload.token,
        idPasta: processo.id_pasta_drive,
        dadosBase64: payload.arquivo.dadosBase64,
        nomeArquivo: payload.arquivo.nome,
        mimeType: payload.arquivo.mimeType
      });

      linkArquivo = arquivoSalvo.url;
      nomeArquivoSalvo = arquivoSalvo.nome;
    }

    // Registro da movimentação
    var novaMov = {
      id_processo: payload.id_processo,
      tipo: String(payload.tipo).trim(),
      descricao: String(payload.descricao).trim(),
      data_movimentacao: new Date(),
      usuario_responsavel: auth.user.email,
      anexo_link: linkArquivo,
      anexo_nome: nomeArquivoSalvo,
      data_prazo: payload.data_prazo ? new Date(payload.data_prazo) : '',
      mov_referencia_id: payload.mov_referencia_id ? String(payload.mov_referencia_id).trim() : ''
    };

    var movSalva = Database.create(CONFIG.SHEET_NAMES.MOVIMENTACOES, novaMov);

    // ================================================================
    // ATUALIZAÇÃO INTELIGENTE DO PROCESSO
    // Quando responde a um prazo (mov_referencia_id), calcula o próximo
    // prazo pendente entre todas as movimentações do processo.
    // ================================================================
    var updatesProcesso = {};

    if (payload.novo_status && payload.novo_status !== processo.status) {
      updatesProcesso.status = payload.novo_status;
      Utils.logAction(auth.user.email, ENUMS.ACOES_LOG.ALTERAR_STATUS,
        'Processo ' + processo.numero_processo + ' alterado para ' + payload.novo_status);
    }

    if (payload.data_prazo) {
      // Nova movimentação com prazo: atualiza o prazo do processo
      updatesProcesso.data_prazo = new Date(payload.data_prazo);
    } else if (payload.mov_referencia_id) {
      // Respondeu a um prazo: calcula próximo prazo pendente
      var proximoPrazo = this._calcularProximoPrazoPendente(payload.id_processo, movSalva.id);
      updatesProcesso.data_prazo = proximoPrazo ? proximoPrazo : '';
    } else if (payload.hasOwnProperty('data_prazo') && !payload.data_prazo) {
      updatesProcesso.data_prazo = '';
    }

    if (Object.keys(updatesProcesso).length > 0) {
      Database.update(CONFIG.SHEET_NAMES.PROCESSOS, processo.id, updatesProcesso);
    }

    // Notificação por e-mail (respeita preferência do cliente)
    var emailInteressado = String(processo.email_interessado || '').trim().toLowerCase();
    if (emailInteressado && Utils.isValidEmail(emailInteressado)) {
      // Verifica se o cliente desativou notificações
      var notificacoesAtivas = true;
      if (processo.cliente_id) {
        try {
          var clienteNotif = Database.findById(CONFIG.SHEET_NAMES.CLIENTES, processo.cliente_id);
          if (clienteNotif && String(clienteNotif.notificacoes_ativas || '').toUpperCase() === 'NAO') {
            notificacoesAtivas = false;
            Logger.log('[MovimentacoesService] Notificação desativada para cliente ID: ' + processo.cliente_id);
          }
        } catch (clienteErr) {
          Logger.log('[MovimentacoesService] Erro ao verificar preferência de notificação: ' + clienteErr);
        }
      }

      if (notificacoesAtivas) {
        try {
          this._enviarEmailNotificacao(processo, novaMov, payload.data_prazo);
        } catch (emailError) {
          Logger.log('[MovimentacoesService] Erro ao enviar email: ' + emailError);
        }
      }
    }

    Utils.logAction(auth.user.email, ENUMS.ACOES_LOG.CRIAR_MOVIMENTACAO,
      'Movimentação (' + payload.tipo + ') no processo ' + processo.numero_processo +
      (payload.mov_referencia_id ? ' [em resposta a: ' + payload.mov_referencia_id + ']' : ''));

    return movSalva;
  },

  /**
   * Calcula o próximo prazo pendente (não respondido) de um processo.
   * Retorna a data mais próxima do futuro, ou a mais recente se todas estão vencidas.
   * @private
   * @param {string} idProcesso - ID do processo
   * @param {string} ignorarMovId - ID da movimentação recém-criada (para ignorar)
   * @returns {Date|null} Próximo prazo pendente ou null se não houver
   */
  _calcularProximoPrazoPendente: function(idProcesso, ignorarMovId) {
    var movimentacoes = Database.findBy(CONFIG.SHEET_NAMES.MOVIMENTACOES, 'id_processo', idProcesso);

    // Monta set de IDs que foram respondidos (tem alguma mov apontando para eles)
    var idsRespondidos = {};
    movimentacoes.forEach(function(m) {
      var refId = m.mov_referencia_id;
      if (refId && String(refId).trim() !== '') {
        idsRespondidos[String(refId)] = true;
      }
    });

    // Filtra: tem prazo, NÃO foi respondido, NÃO é a movimentação recém-criada
    var pendentes = movimentacoes.filter(function(m) {
      if (!m.data_prazo) return false;
      if (m.id && String(m.id) === String(ignorarMovId)) return false;
      if (m.id && idsRespondidos[String(m.id)]) return false;
      return true;
    });

    if (pendentes.length === 0) return null;

    // Ordena por data_prazo (mais próximo primeiro)
    pendentes.sort(function(a, b) {
      return new Date(a.data_prazo) - new Date(b.data_prazo);
    });

    return new Date(pendentes[0].data_prazo);
  },

  /**
   * Envia notificação de movimentação para o cliente.
   * @private
   */
  _enviarEmailNotificacao: function(processo, mov, dataPrazoStr) {
    var assunto = 'Atualização no Processo: ' + processo.numero_processo;
    var prazoHtml = '';
    var btnCalendar = '';

    if (dataPrazoStr) {
      var dataPrazo = new Date(dataPrazoStr);
      var dataFormatada = Utilities.formatDate(dataPrazo, CONFIG.TIMEZONE, 'dd/MM/yyyy');

      prazoHtml =
        '<div style="background-color: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin: 15px 0; border: 1px solid #ffeeba;">' +
        '  <strong>⚠️ ATENÇÃO AO PRAZO:</strong> ' + dataFormatada +
        '</div>';

      var dateString = Utilities.formatDate(dataPrazo, CONFIG.TIMEZONE, 'yyyyMMdd');
      var nextDay = new Date(dataPrazo);
      nextDay.setDate(nextDay.getDate() + 1);
      var nextDayString = Utilities.formatDate(nextDay, CONFIG.TIMEZONE, 'yyyyMMdd');

      var calTitle = encodeURIComponent('Prazo: Processo ' + processo.numero_processo);
      var calDetails = encodeURIComponent('Movimentação: ' + mov.tipo + '\nDescrição: ' + mov.descricao);

      var calendarLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' +
        calTitle + '&dates=' + dateString + '/' + nextDayString + '&details=' + calDetails;

      btnCalendar =
        '<div style="text-align: center; margin-top: 20px;">' +
        '  <a href="' + calendarLink + '" target="_blank" style="background-color: #4285F4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-family: sans-serif; display: inline-block;">' +
        '    📅 Adicionar Prazo à Agenda Google' +
        '  </a>' +
        '</div>';
    }

    var htmlBody =
      '<div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px; border-radius: 8px;">' +
      '  <div style="background-color: #2c3e50; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">' +
      '    <h2 style="color: #ffffff; margin: 0;">RPPS Jurídico</h2>' +
      '    <p style="color: #bdc3c7; margin: 5px 0 0 0;">Atualização Processual</p>' +
      '  </div>' +
      '  <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e9ecef; border-radius: 0 0 8px 8px;">' +
      '    <h3 style="color: #2c3e50; margin-top: 0;">Olá,</h3>' +
      '    <p style="color: #555;">Houve uma nova movimentação no seu processo.</p>' +
      '    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">' +
      '      <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #7f8c8d; width: 30%;">Processo:</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #2c3e50; font-weight: bold;">' + processo.numero_processo + '</td></tr>' +
      '      <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #7f8c8d;">Interessado:</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #2c3e50;">' + processo.parte_nome + '</td></tr>' +
      '      <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #7f8c8d;">Tipo de Ação:</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #2980b9; font-weight: bold;">' + mov.tipo + '</td></tr>' +
      '    </table>' +
      '    <div style="background-color: #f1f3f5; padding: 15px; border-radius: 5px; margin-bottom: 10px;">' +
      '      <p style="margin: 0; color: #7f8c8d; font-size: 12px; font-weight: bold; text-transform: uppercase;">Descrição do Andamento:</p>' +
      '      <p style="margin: 5px 0 0 0; color: #333; line-height: 1.5;">' + mov.descricao + '</p>' +
      '    </div>' +
      prazoHtml +
      btnCalendar +
      '    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">' +
      '    <p style="font-size: 12px; color: #95a5a6; text-align: center;">Este é um e-mail automático do Sistema Jurídico RPPS. Por favor, não responda.</p>' +
      '  </div>' +
      '</div>';

    MailApp.sendEmail({
      to: processo.email_interessado,
      subject: assunto,
      htmlBody: htmlBody
    });
  }
};
