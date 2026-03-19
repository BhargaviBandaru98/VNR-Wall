/**
 * VNR Wall — Centralized Logging System (Singleton)
 * Tracks DB writes, AI responses, and system errors.
 */
const winston = require('winston');
const path = require('path');

let loggerInstance;

function createLogger() {
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  );

  const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { service: 'vnr-wall-server' },
    transports: [
      // 1. Console transport for development
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      // 2. File transport for production-safe record keeping
      new winston.transports.File({ 
        filename: path.join(__dirname, '../logs/system.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ]
  });

  // Custom logging helpers
  return {
    /**
     * Standard info log
     * @param {string} message 
     * @param {Object} meta 
     */
    logInfo: (message, meta = {}) => {
      logger.info(message, { ...meta });
    },

    /**
     * Standard error log
     * @param {string} message 
     * @param {Error|Object} error 
     */
    logError: (message, error = {}) => {
      const meta = error instanceof Error 
        ? { stack: error.stack, message: error.message } 
        : error;
      logger.error(message, { meta });
    },

    /**
     * Database-specific logging
     * @param {string} operation - e.g. 'insert', 'update', 'query'
     * @param {string} dbType - 'sqlite' | 'mongo'
     * @param {string} status - 'success' | 'failure'
     * @param {Object} extra - additional context (latency, IDs)
     */
    logDB: (operation, dbType, status, extra = {}) => {
      const level = status === 'failure' ? 'error' : 'info';
      logger.log(level, `[DB ${dbType.toUpperCase()}] ${operation} ${status}`, {
        dbType,
        operation,
        status,
        ...extra
      });
    },

    // Exposure of raw logger for advanced use-cases
    _raw: logger
  };
}

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

module.exports = getLogger();
