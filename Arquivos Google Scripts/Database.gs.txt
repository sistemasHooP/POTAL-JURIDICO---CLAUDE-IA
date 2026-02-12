/**
 * ============================================================================
 * ARQUIVO: Database.gs
 * DESCRIÇÃO: Camada de persistência (CRUD) para o Google Sheets.
 * VERSÃO: 3.0 - Auto-criação de colunas + persistência robusta
 * FUNÇÃO: Converte linhas da planilha em objetos JSON e vice-versa.
 * DEPENDÊNCIAS: Config.gs
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var Database = {

  /**
   * Lê todos os dados de uma aba e retorna como lista de objetos.
   * Assume que a LINHA 1 contém os cabeçalhos.
   *
   * IMPORTANTE: Esta função normaliza valores para garantir consistência:
   * - Campos que contêm 'cpf' são convertidos para string e normalizados
   * - Campos que contêm 'id' são convertidos para string
   *
   * @param {string} sheetName - Nome da aba (ex: 'PROCESSOS').
   * @returns {Array} Lista de objetos.
   */
  read: function(sheetName) {
    var sheet = this._getSheet(sheetName);
    var lastRow = sheet.getLastRow();

    // Se só tiver cabeçalho ou estiver vazia
    if (lastRow < 2) {
      return [];
    }

    // Pega todos os dados de uma vez (performance)
    var dataRange = sheet.getRange(1, 1, lastRow, sheet.getLastColumn());
    var values = dataRange.getValues();

    var headers = values[0]; // Primeira linha = cabeçalhos
    var data = values.slice(1); // Restante = dados

    // Normaliza cabeçalhos (remove espaços, lowerCase) para usar como chaves
    var normalizedHeaders = headers.map(function(h) {
      return String(h).toLowerCase().trim().replace(/\s+/g, '_');
    });

    // Mapeia array de arrays para array de objetos
    var self = this;
    return data.map(function(row) {
      var obj = {};
      row.forEach(function(cell, index) {
        var key = normalizedHeaders[index];
        if (key) {
          obj[key] = self._normalizeValue(key, cell);
        }
      });
      return obj;
    });
  },

  /**
   * Adiciona um novo registro (linha) na planilha.
   * Gera ID automaticamente se não fornecido.
   * AUTO-CRIA colunas que não existem no cabeçalho.
   *
   * @param {string} sheetName - Nome da aba.
   * @param {Object} dataObj - Objeto com os dados a inserir.
   * @returns {Object} O objeto inserido com ID.
   */
  create: function(sheetName, dataObj) {
    var sheet = this._getSheet(sheetName);
    var headers = this._getHeaders(sheet);

    // Gera ID único se não existir
    if (!dataObj.id) {
      dataObj.id = Utilities.getUuid();
    }

    // Adiciona timestamps automáticos
    dataObj.created_at = new Date();

    // Normaliza CPF antes de salvar (se existir no objeto)
    dataObj = this._normalizeObjectForSave(dataObj);

    // ================================================================
    // AUTO-CRIAÇÃO DE COLUNAS FALTANTES
    // Se o dataObj tem campos que não existem no header, cria as colunas
    // ================================================================
    var normalizedHeaders = headers.map(function(h) {
      return String(h).toLowerCase().trim().replace(/\s+/g, '_');
    });

    for (var key in dataObj) {
      if (dataObj.hasOwnProperty(key) && dataObj[key] !== '' && dataObj[key] !== null && dataObj[key] !== undefined) {
        if (normalizedHeaders.indexOf(key) === -1) {
          // Coluna não existe: cria no final do header
          var newColIndex = headers.length + 1;
          var headerLabel = key.toUpperCase();
          sheet.getRange(1, newColIndex).setValue(headerLabel);
          headers.push(headerLabel);
          normalizedHeaders.push(key);
          Logger.log('[Database] Auto-criada coluna "' + headerLabel + '" na aba ' + sheetName);
        }
      }
    }

    // Monta a linha na ordem correta das colunas
    var row = headers.map(function(header) {
      var key = header.toLowerCase().trim().replace(/\s+/g, '_');
      return dataObj[key] !== undefined ? dataObj[key] : '';
    });

    // Escreve na planilha
    sheet.appendRow(row);

    return dataObj;
  },

  /**
   * Atualiza um registro existente baseado no ID.
   * AUTO-CRIA colunas que não existem no cabeçalho.
   *
   * @param {string} sheetName - Nome da aba.
   * @param {string} id - ID do registro a ser atualizado.
   * @param {Object} newData - Objeto com os campos a atualizar.
   * @returns {Object} O objeto atualizado ou null se não encontrar.
   */
  update: function(sheetName, id, newData) {
    var sheet = this._getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Normaliza dados antes de atualizar
    newData = this._normalizeObjectForSave(newData);

    // Mapeia índice da coluna ID
    var idIndex = -1;
    var normalizedHeaders = headers.map(function(h, i) {
      var key = String(h).toLowerCase().trim().replace(/\s+/g, '_');
      if (key === 'id') idIndex = i;
      return key;
    });

    if (idIndex === -1) {
      throw new Error('Coluna ID não encontrada na aba ' + sheetName);
    }

    // Auto-cria colunas faltantes no update também
    for (var key in newData) {
      if (newData.hasOwnProperty(key) && newData[key] !== undefined) {
        if (normalizedHeaders.indexOf(key) === -1) {
          var newColIndex = headers.length + 1;
          var headerLabel = key.toUpperCase();
          sheet.getRange(1, newColIndex).setValue(headerLabel);
          headers.push(headerLabel);
          normalizedHeaders.push(key);
          // Garante que o data array tenha a mesma quantidade de colunas
          for (var r = 0; r < data.length; r++) {
            data[r].push('');
          }
          Logger.log('[Database] Auto-criada coluna "' + headerLabel + '" na aba ' + sheetName + ' (update)');
        }
      }
    }

    // Procura a linha correspondente
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(id)) {
        var rowIndex = i + 1; // Linha na planilha (base 1)

        // Atualiza apenas os campos fornecidos
        normalizedHeaders.forEach(function(key, colIndex) {
          if (newData.hasOwnProperty(key)) {
            sheet.getRange(rowIndex, colIndex + 1).setValue(newData[key]);
            data[i][colIndex] = newData[key];
          }
        });

        // Retorna o objeto completo atualizado
        var updatedObj = {};
        var self = this;
        normalizedHeaders.forEach(function(key, idx) {
           updatedObj[key] = self._normalizeValue(key, data[i][idx]);
        });
        return updatedObj;
      }
    }

    return null; // Não encontrado
  },

  /**
   * Busca um único registro pelo ID.
   * @param {string} sheetName - Nome da aba
   * @param {string} id - ID do registro
   * @returns {Object|null}
   */
  findById: function(sheetName, id) {
    var all = this.read(sheetName);
    var idStr = String(id);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === idStr) {
        return all[i];
      }
    }
    return null;
  },

  /**
   * Filtra registros com base em uma chave e valor.
   * @param {string} sheetName - Nome da aba
   * @param {string} key - Nome do campo
   * @param {any} value - Valor a buscar
   * @returns {Array}
   */
  findBy: function(sheetName, key, value) {
    var all = this.read(sheetName);
    var valueStr = String(value);
    return all.filter(function(item) {
      return String(item[key]) === valueStr;
    });
  },

  /**
   * Busca registros por CPF (usa normalização).
   * IMPORTANTE: Sempre use esta função para buscar por CPF!
   * 
   * @param {string} sheetName - Nome da aba
   * @param {string} cpfField - Nome do campo de CPF na planilha
   * @param {any} cpfValue - CPF a buscar (em qualquer formato)
   * @returns {Array}
   */
  findByCPF: function(sheetName, cpfField, cpfValue) {
    var all = this.read(sheetName);
    var cpfNormalizado = Utils.normalizarCPF(cpfValue);
    
    if (!cpfNormalizado) {
      return [];
    }
    
    return all.filter(function(item) {
      var itemCPF = Utils.normalizarCPF(item[cpfField]);
      return itemCPF === cpfNormalizado;
    });
  },

  /**
   * Deleta um registro pelo ID.
   * @param {string} sheetName - Nome da aba
   * @param {string} id - ID do registro
   * @returns {boolean} true se deletou, false se não encontrou
   */
  deleteById: function(sheetName, id) {
    var sheet = this._getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    
    // Encontra índice da coluna ID
    var idIndex = -1;
    for (var h = 0; h < headers.length; h++) {
      var key = String(headers[h]).toLowerCase().trim().replace(/\s+/g, '_');
      if (key === 'id') {
        idIndex = h;
        break;
      }
    }
    
    if (idIndex === -1) {
      throw new Error('Coluna ID não encontrada na aba ' + sheetName);
    }
    
    // Procura e deleta a linha
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(id)) {
        sheet.deleteRow(i + 1); // +1 porque Sheets usa base 1
        return true;
      }
    }
    
    return false;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS / AUXILIARES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Obtém a instância da aba (Sheet).
   * @private
   */
  _getSheet: function(sheetName) {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      // Cria a aba se não existir (Opcional, mas útil na instalação)
      sheet = ss.insertSheet(sheetName);
      // Cria cabeçalho padrão de ID se for nova
      sheet.appendRow(['ID', 'CREATED_AT']); 
    }
    return sheet;
  },

  /**
   * Lê a primeira linha para descobrir a ordem das colunas.
   * @private
   */
  _getHeaders: function(sheet) {
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    return headers;
  },

  /**
   * Normaliza um valor baseado no nome do campo.
   * CRÍTICO: Garante que CPFs sejam sempre strings com 11 dígitos.
   * @private
   */
  _normalizeValue: function(key, value) {
    // Se o valor é null ou undefined, retorna string vazia
    if (value === null || value === undefined) {
      return '';
    }
    
    var keyLower = key.toLowerCase();
    
    // CAMPOS DE CPF: Sempre normalizar como string de 11 dígitos
    if (keyLower === 'cpf' || keyLower.indexOf('cpf') !== -1) {
      return Utils.normalizarCPF(value);
    }
    
    // CAMPOS DE ID: Sempre string
    if (keyLower === 'id' || keyLower.indexOf('_id') !== -1 || keyLower.indexOf('id_') !== -1) {
      return String(value);
    }
    
    // CAMPOS DE TELEFONE: Manter apenas dígitos como string
    if (keyLower === 'telefone' || keyLower === 'celular' || keyLower === 'phone') {
      if (value === '' || value === 0) return '';
      return String(value).replace(/\D/g, '');
    }
    
    // Outros valores: manter como vieram
    return value;
  },

  /**
   * Normaliza um objeto inteiro antes de salvar.
   * @private
   */
  _normalizeObjectForSave: function(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    var normalized = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        normalized[key] = this._normalizeValue(key, obj[key]);
      }
    }
    return normalized;
  }
};