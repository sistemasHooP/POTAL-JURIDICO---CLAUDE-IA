/**
 * ============================================================================
 * ARQUIVO: DriveService.gs
 * DESCRIÇÃO: Serviço de integração com Google Drive.
 * FUNÇÃO: Gerencia criação de pastas, upload e download (proxy) de arquivos.
 * DEPENDÊNCIAS: Config.gs, Auth.gs
 * VERSÃO: 2.0
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var DriveService = {

  /**
   * Cria uma pasta dedicada para um novo processo dentro da pasta raiz.
   * Nomenclatura Padrão: "PROC-{NUMERO} - {NOME_PARTE}"
   * 
   * @param {string} numeroProcesso - Número do processo jurídico.
   * @param {string} nomeParte - Nome do requerente/parte.
   * @returns {Object} { id, url, name } da nova pasta criada.
   */
  criarPastaProcesso: function(numeroProcesso, nomeParte) {
    try {
      // 1. Obtém a pasta raiz definida nas configurações
      var rootId = CONFIG.DRIVE_ROOT_FOLDER_ID;
      
      // Validação básica para evitar erro genérico se o ID não foi configurado
      if (!rootId || rootId.length < 10) { 
        throw new Error("ID da pasta raiz do Drive não configurado corretamente no Config.gs");
      }

      var parentFolder = DriveApp.getFolderById(rootId);
      
      // 2. Sanitização do nome da pasta
      var safeNomeParte = (nomeParte || 'SEM_NOME').replace(/[\/\\:*?"<>|]/g, "").trim();
      var safeNumero = (numeroProcesso || 'SEM_NUMERO').replace(/[\/\\:*?"<>|]/g, "-").trim();
      
      // Monta o nome final: Ex "PROC-2023.001 - JOAO DA SILVA"
      var nomePasta = CONFIG.FOLDER_PREFIX + safeNumero + " - " + safeNomeParte;

      // 3. Criação da pasta
      var newFolder = parentFolder.createFolder(nomePasta);

      Logger.log('[DriveService] Pasta criada: ' + nomePasta);

      // Retorna os dados necessários para salvar no banco de dados
      return {
        id: newFolder.getId(),
        url: newFolder.getUrl(),
        name: newFolder.getName()
      };

    } catch (e) {
      Logger.log("ERRO CRÍTICO DRIVE: " + e.toString());
      throw new Error("Falha ao criar pasta no Google Drive. Verifique as permissões ou o ID da pasta raiz. Detalhe: " + e.message);
    }
  },

  /**
   * Realiza o upload de um arquivo enviado pelo Front-end (codificado em Base64).
   * 
   * @param {Object} payload - Objeto contendo:
   * - dadosBase64: String do arquivo (sem o prefixo 'data:...')
   * - nomeArquivo: Nome original do arquivo (ex: 'documento.pdf')
   * - mimeType: Tipo do arquivo (ex: 'application/pdf')
   * - idPasta: ID da pasta do Google Drive onde será salvo
   * - token: Token de autenticação do usuário
   * 
   * @returns {Object} Metadados do arquivo criado.
   */
  uploadArquivo: function(payload) {
    // 1. Validação de Segurança
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) throw new Error("Sessão expirada. Faça login novamente para enviar arquivos.");

    // 2. Validação dos Parâmetros de Entrada
    if (!payload.dadosBase64 || !payload.idPasta || !payload.nomeArquivo || !payload.mimeType) {
      throw new Error("Dados de upload incompletos. Verifique o arquivo.");
    }

    try {
      // 3. Obtém a pasta de destino
      var folder = DriveApp.getFolderById(payload.idPasta);
      
      // 4. Decodificação do Base64
      var decoded = Utilities.base64Decode(payload.dadosBase64);
      
      // 5. Criação do Blob (Objeto binário)
      var blob = Utilities.newBlob(decoded, payload.mimeType, payload.nomeArquivo);
      
      // 6. Criação do Arquivo no Drive
      var file = folder.createFile(blob);
      
      Logger.log('[DriveService] Arquivo salvo: ' + file.getName());
      
      return {
        id: file.getId(),
        nome: file.getName(),
        url: file.getUrl(),
        downloadUrl: file.getDownloadUrl(),
        mimeType: file.getMimeType(),
        tamanho: file.getSize()
      };

    } catch (e) {
      Logger.log("ERRO UPLOAD: " + e.toString());
      throw new Error("Erro ao salvar arquivo no Drive: " + e.message);
    }
  },
  
  /**
   * Proxy de Arquivo: Lê o arquivo do Drive e retorna em Base64.
   * Permite que o usuário visualize o anexo sem estar logado no Google,
   * pois o sistema "baixa" e entrega o arquivo para ele.
   * 
   * @param {Object} payload - { fileUrl ou fileId, token }
   */
  getArquivoBase64: function(payload) {
    // 1. Validação de Segurança (Obrigatório estar logado no App)
    var auth = AuthService.verificarToken(payload);
    if (!auth.valido) throw new Error("Acesso negado. Faça login no sistema.");

    var fileId = payload.fileId;
    
    // Se veio a URL inteira em vez do ID, tenta extrair o ID
    if (!fileId && payload.fileUrl) {
      try {
        // Tenta achar padrões de ID do Drive (aprox 25+ chars alfanuméricos)
        var match = payload.fileUrl.match(/[-\w]{25,}/);
        if (match) {
          fileId = match[0];
        }
      } catch (e) {
        throw new Error("URL do arquivo inválida.");
      }
    }

    if (!fileId) {
      throw new Error("ID do arquivo não fornecido ou não encontrado.");
    }

    try {
      // 2. Busca o arquivo usando as permissões do Script
      var file = DriveApp.getFileById(fileId);
      
      // 3. Converte o conteúdo para Base64
      var blob = file.getBlob();
      var base64 = Utilities.base64Encode(blob.getBytes());
      
      Logger.log('[DriveService] Arquivo baixado via proxy: ' + file.getName());
      
      return {
        nome: file.getName(),
        mimeType: file.getMimeType(),
        base64: base64,
        tamanho: file.getSize()
      };

    } catch (e) {
      Logger.log("ERRO DOWNLOAD PROXY: " + e.toString());
      throw new Error("Não foi possível ler o arquivo. Ele pode ter sido excluído ou movido.");
    }
  },

  /**
   * Verifica se uma pasta ou arquivo existe e retorna informações básicas.
   * Útil para validar links quebrados na interface.
   * 
   * @param {string} id - ID do arquivo ou pasta no Drive.
   */
  verificarExistencia: function(id) {
    if (!id) return null;
    
    try {
      // Tenta pegar como arquivo
      var file = DriveApp.getFileById(id);
      return { existe: true, tipo: 'arquivo', nome: file.getName(), url: file.getUrl() };
    } catch (e) {
      try {
        // Tenta pegar como pasta
        var folder = DriveApp.getFolderById(id);
        return { existe: true, tipo: 'pasta', nome: folder.getName(), url: folder.getUrl() };
      } catch (e2) {
        return { existe: false };
      }
    }
  }
};