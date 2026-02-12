/**
 * ============================================================================
 * ARQUIVO: Code.gs
 * DESCRIÇÃO: Ponto de entrada principal da API (Roteador).
 * VERSÃO: 3.1 - Rotas de cliente/processo/movimentação e tratamento de erros
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

/**
 * Entrada GET (health básico).
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      message: 'API RPPS Jurídico v3.1 está online!',
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Entrada principal POST.
 */
function doPost(e) {
  var startTime = new Date().getTime();

  try {
    var payload = {};

    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseError) {
        Logger.log('[Code] Erro ao parsear JSON: ' + parseError);
        return _createResponse('error', 'Dados inválidos. Verifique o formato JSON.');
      }
    }

    var actionName = payload.action || 'SEM_ACTION';
    Logger.log('[Code] =============================================');
    Logger.log('[Code] Requisição recebida: ' + actionName);
    Logger.log('[Code] Origem: ' + (payload.origem || 'desconhecida'));

    // Origem (apenas log de aviso)
    var origem = payload.origem || '';
    if (origem && CONFIG.SECURITY.ALLOWED_ORIGINS.indexOf(origem) === -1) {
      Logger.log('[Code] AVISO: Origem fora da allowlist: ' + origem);
    }

    // Rate limit API geral (token/email ou fallback)
    try {
      var identificadorRate = payload.token || payload.email || payload.cpf || payload.origem || 'geral';
      var rate = RateLimiter.verificarAPI(String(identificadorRate));
      if (!rate.permitido) {
        return _createResponse('error', rate.mensagem || 'Muitas requisições. Aguarde e tente novamente.');
      }
    } catch (rateError) {
      Logger.log('[Code] AVISO RateLimiter indisponível: ' + rateError);
      // fail-open
    }

    var result = _routeAction(payload);

    var endTime = new Date().getTime();
    Logger.log('[Code] Tempo de execução: ' + (endTime - startTime) + 'ms');
    Logger.log('[Code] =============================================');

    return _createResponse('success', 'Operação realizada com sucesso.', result);

  } catch (error) {
    Logger.log('[Code] ERRO: ' + error.toString());
    Logger.log('[Code] Stack: ' + (error.stack || 'N/A'));
    return _createResponse('error', error.message || 'Erro interno do servidor.');
  }
}

/**
 * Roteador de actions.
 * @private
 */
function _routeAction(payload) {
  var action = payload.action;

  if (!action) {
    throw new Error('Ação não especificada. Informe o campo "action".');
  }

  switch (action) {

    // Sistema
    case 'ping':
      return { pong: true, timestamp: new Date().toISOString() };

    case 'healthCheck':
      return _healthCheck();

    // Auth gestor
    case 'login':
      return AuthService.login(payload);

    case 'verificarToken':
      return AuthService.verificarToken(payload);

    // Auth cliente (OTP)
    case 'solicitarCodigoCliente':
      return ClienteService.solicitarCodigo(payload);

    case 'validarCodigoCliente':
      return ClienteService.validarCodigo(payload);

    // Clientes
    case 'buscarClientePorCPF':
      var cpfBusca = Utils.normalizarCPF(payload.cpf);
      if (!cpfBusca) {
        throw new Error('CPF inválido.');
      }

      var clienteEncontrado = ClienteService.buscarPorCPF(cpfBusca);
      if (!clienteEncontrado) {
        throw new Error('Cliente não encontrado.');
      }

      return {
        id: clienteEncontrado.id,
        nome_completo: clienteEncontrado.nome_completo,
        cpf: clienteEncontrado.cpf,
        email: clienteEncontrado.email,
        telefone: clienteEncontrado.telefone,
        status: clienteEncontrado.status
      };

    case 'cadastrarCliente':
      return ClienteService.cadastrar(payload);

    case 'listarClientes':
      return ClienteService.listar(payload);

    case 'buscarClientePorId':
      return ClienteService.buscarPorIdGestor(payload);

    case 'atualizarCliente':
      return ClienteService.atualizar(payload);

    // Área do cliente
    case 'getMeusProcessos':
      return ClienteService.getMeusProcessos(payload);

    case 'getProcessoCliente':
      return ClienteService.getProcessoDetalhe(payload);

    case 'downloadArquivoCliente':
      return ClienteService.downloadArquivoCliente(payload);

    case 'listarArquivosProcessoCliente':
      return ClienteService.listarArquivosProcesso(payload);

    // Processos
    case 'listarProcessos':
      return ProcessosService.listarProcessos(payload);

    case 'criarProcesso':
      return ProcessosService.criarProcesso(payload);

    case 'getProcessoDetalhe':
      return ProcessosService.getProcessoDetalhe(payload);

    case 'getDashboard':
      return ProcessosService.getDashboardStats(payload);

    case 'salvarNotasProcesso':
      return ProcessosService.salvarNotas(payload);

    // Movimentações
    case 'novaMovimentacao':
      return MovimentacoesService.novaMovimentacao(payload);

    // Advogados (Gerenciamento)
    case 'listarAdvogados':
      return AdvogadoService.listar(payload);

    case 'cadastrarAdvogado':
      return AdvogadoService.cadastrar(payload);

    case 'atualizarAdvogado':
      return AdvogadoService.atualizar(payload);

    case 'atribuirProcesso':
      return AdvogadoService.atribuirProcesso(payload);

    case 'listarProcessosAdvogado':
      return AdvogadoService.listarProcessosAdvogado(payload);

    case 'listarProcessosAtribuicao':
      return AdvogadoService.listarProcessosParaAtribuicao(payload);

    // Drive
    case 'uploadArquivo':
      return DriveService.uploadArquivo(payload);

    case 'downloadArquivo':
      return DriveService.getArquivoBase64(payload);

    default:
      throw new Error('Ação "' + action + '" não existe. Verifique a documentação.');
  }
}

/**
 * Resposta padrão da API.
 * @private
 */
function _createResponse(status, message, data) {
  var response = {
    status: status,
    message: message,
    data: data || null,
    timestamp: new Date().toISOString()
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Health check de infraestrutura.
 * @private
 */
function _healthCheck() {
  var checks = {
    database: false,
    drive: false,
    email: false
  };

  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    checks.database = !!ss;
  } catch (e) {
    Logger.log('[HealthCheck] Banco: ' + e);
  }

  try {
    var folder = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
    checks.drive = !!folder;
  } catch (e2) {
    Logger.log('[HealthCheck] Drive: ' + e2);
  }

  try {
    var remaining = MailApp.getRemainingDailyQuota();
    checks.email = remaining > 0;
  } catch (e3) {
    Logger.log('[HealthCheck] Email: ' + e3);
  }

  return {
    healthy: checks.database && checks.drive,
    checks: checks,
    version: CONFIG.VERSION,
    timestamp: new Date().toISOString()
  };
}