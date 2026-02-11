/**
 * ============================================================================
 * ARQUIVO: Config.gs
 * DESCRIÇÃO: Configurações globais do sistema.
 * VERSÃO: 3.0 - Com suporte completo a Clientes
 * AUTOR: Sistema RPPS Jurídico
 * ============================================================================
 */

var CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DO BANCO DE DADOS (GOOGLE SHEETS)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // IMPORTANTE: Substitua pelo ID da sua planilha
  SPREADSHEET_ID: '1-yHby3m5kCLTNBiHuC2SEEFrd_5U5t1zuZPXkb8lvW0',

  // Nomes das abas na planilha
  SHEET_NAMES: {
    PROCESSOS: 'PROCESSOS',
    MOVIMENTACOES: 'MOVIMENTACOES',
    USUARIOS: 'USUARIOS',
    LOGS: 'LOGS',
    CLIENTES: 'CLIENTES'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE ARQUIVOS (GOOGLE DRIVE)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // IMPORTANTE: Substitua pelo ID da sua pasta raiz
  DRIVE_ROOT_FOLDER_ID: '1GV7pQyKughJjxw90yxL93e-ChnoLfxRX',

  // Prefixo para nomear as pastas
  FOLDER_PREFIX: 'PROC-',

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE SEGURANÇA
  // ═══════════════════════════════════════════════════════════════════════════
  
  SECURITY: {
    // Tempo de expiração do token (em milissegundos)
    TOKEN_EXPIRY_ADVOGADO: 8 * 60 * 60 * 1000,  // 8 horas
    TOKEN_EXPIRY_CLIENTE: 4 * 60 * 60 * 1000,   // 4 horas
    
    // Tempo de expiração do código OTP do cliente (em milissegundos)
    CODIGO_OTP_EXPIRY: 10 * 60 * 1000,  // 10 minutos
    
    // Origens permitidas (adicione seu domínio do GitHub Pages)
    ALLOWED_ORIGINS: [
      'https://sistemashoop.github.io',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      'null'  // Para testes locais abrindo arquivo direto
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE RATE LIMIT
  // ═══════════════════════════════════════════════════════════════════════════
  
  RATE_LIMIT: {
    // Login: máximo de tentativas em uma janela de tempo
    LOGIN: {
      MAX_TENTATIVAS: 5,
      JANELA_SEGUNDOS: 900,      // 15 minutos
      BLOQUEIO_SEGUNDOS: 1800    // 30 minutos de bloqueio
    },
    
    // API Geral: requisições por minuto
    API_GERAL: {
      MAX_REQUISICOES: 100,
      JANELA_SEGUNDOS: 60
    },
    
    // Envio de código OTP para cliente
    CODIGO_OTP: {
      MAX_ENVIOS: 3,
      JANELA_SEGUNDOS: 3600      // 1 hora
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES GERAIS
  // ═══════════════════════════════════════════════════════════════════════════
  
  APP_NAME: 'Sistema Jurídico RPPS',
  VERSION: '3.0.0',
  TIMEZONE: 'America/Sao_Paulo'
};

/**
 * ============================================================================
 * ENUMS (Valores fixos aceitos pelo sistema)
 * ============================================================================
 */
var ENUMS = {
  // Perfis de acesso
  PERFIL: {
    PRESIDENTE: 'PRESIDENTE',
    ADVOGADO: 'ADVOGADO',
    ADMIN: 'ADMIN',
    CLIENTE: 'CLIENTE'
  },

  // Status do processo
  STATUS_PROCESSO: {
    EM_ANDAMENTO: 'EM ANDAMENTO',
    SOBRESTADO: 'SOBRESTADO',
    ARQUIVADO: 'ARQUIVADO',
    JULGADO: 'JULGADO',
    CANCELADO: 'CANCELADO'
  },

  // Tipos de movimentação
  TIPO_MOVIMENTACAO: {
    INICIAL: 'PETIÇÃO INICIAL',
    DESPACHO: 'DESPACHO',
    DECISAO: 'DECISÃO',
    SENTENCA: 'SENTENÇA',
    RECURSO: 'RECURSO',
    JUNTADA: 'JUNTADA DE DOCUMENTO',
    CERTIDAO: 'CERTIDÃO',
    AUDIENCIA: 'AUDIÊNCIA',
    OUTROS: 'OUTROS'
  },

  // Tipos de processo
  TIPO_PROCESSO: {
    APOSENTADORIA: 'CONCESSÃO DE APOSENTADORIA',
    PENSAO: 'PENSÃO POR MORTE',
    REVISAO: 'REVISÃO DE BENEFÍCIO',
    AVERBACAO: 'AVERBAÇÃO DE TEMPO',
    ADMINISTRATIVO: 'PROCESSO ADMINISTRATIVO',
    JUDICIAL: 'PROCESSO JUDICIAL',
    TCU: 'TOMADA DE CONTAS (TCU/TCE)'
  },

  // Status do cliente
  STATUS_CLIENTE: {
    ATIVO: 'ATIVO',
    INATIVO: 'INATIVO',
    BLOQUEADO: 'BLOQUEADO'
  },

  // Ações para log de auditoria
  ACOES_LOG: {
    LOGIN: 'LOGIN',
    LOGIN_FALHA: 'LOGIN_FALHA',
    LOGIN_BLOQUEADO: 'LOGIN_BLOQUEADO',
    LOGIN_CLIENTE: 'LOGIN_CLIENTE',
    LOGIN_CLIENTE_FALHA: 'LOGIN_CLIENTE_FALHA',
    LOGOUT: 'LOGOUT',
    CRIAR_PROCESSO: 'CRIAR_PROCESSO',
    CRIAR_MOVIMENTACAO: 'CRIAR_MOVIMENTACAO',
    ALTERAR_STATUS: 'ALTERAR_STATUS',
    CRIAR_CLIENTE: 'CRIAR_CLIENTE',
    ENVIAR_CODIGO_OTP: 'ENVIAR_CODIGO_OTP',
    ACESSO_NEGADO: 'ACESSO_NEGADO',
    TOKEN_INVALIDO: 'TOKEN_INVALIDO',
    RATE_LIMIT_EXCEDIDO: 'RATE_LIMIT_EXCEDIDO',
    ORIGEM_BLOQUEADA: 'ORIGEM_BLOQUEADA'
  }
};

/**
 * Obtém a chave secreta para assinatura JWT.
 * Armazenada nas Propriedades do Script (mais seguro que no código).
 * Na primeira execução, gera uma chave automaticamente.
 */
function getJWTSecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('JWT_SECRET');
  
  if (!secret) {
    // Gera uma chave aleatória forte na primeira execução
    secret = Utilities.getUuid() + '-' + Utilities.getUuid() + '-' + new Date().getTime();
    props.setProperty('JWT_SECRET', secret);
    Logger.log('JWT_SECRET gerado automaticamente. Guarde em local seguro se precisar.');
  }
  
  return secret;
}

/**
 * Função auxiliar para obter configuração de forma segura.
 */
function getConfig(key) {
  if (CONFIG.hasOwnProperty(key)) {
    return CONFIG[key];
  }
  throw new Error('Configuração não encontrada: ' + key);
}