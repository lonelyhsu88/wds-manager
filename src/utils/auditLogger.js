const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Audit log format
const auditFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
  })
);

// Create audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: auditFormat,
  transports: [
    // Write to audit.log file
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    // Also write to console in development
    ...(process.env.NODE_ENV === 'development' ? [
      new winston.transports.Console({ format: auditFormat })
    ] : [])
  ]
});

/**
 * Log authentication event
 * @param {string} event - Event type (login_success, login_failure, logout)
 * @param {object} user - User information
 * @param {string} authMethod - Authentication method (oauth2_google, sso, etc.)
 * @param {object} req - Express request object
 */
function logAuth(event, user, authMethod, req) {
  auditLogger.info(`AUTH: ${event}`, {
    event,
    authMethod,
    user: {
      email: user?.email,
      name: user?.displayName || user?.name,
      id: user?.id
    },
    ip: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get('user-agent'),
    timestamp: new Date().toISOString()
  });
}

/**
 * Log deployment operation
 * @param {string} action - Action type (deploy_start, deploy_success, deploy_failure)
 * @param {object} user - User information
 * @param {object} details - Deployment details
 * @param {object} req - Express request object
 */
function logDeployment(action, user, details, req) {
  auditLogger.info(`DEPLOY: ${action}`, {
    action,
    user: {
      email: user?.email,
      name: user?.displayName || user?.name
    },
    deployment: {
      artifactsCount: details.artifactsCount,
      artifacts: details.artifacts,
      gameNames: details.gameNames,
      totalFiles: details.totalFiles,
      status: details.status,
      duration: details.duration,
      errors: details.errors
    },
    ip: req?.ip || req?.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log file operation (delete, browse, etc.)
 * @param {string} operation - Operation type (delete, browse, download)
 * @param {object} user - User information
 * @param {object} details - Operation details
 * @param {object} req - Express request object
 */
function logFileOperation(operation, user, details, req) {
  auditLogger.info(`FILE: ${operation}`, {
    operation,
    user: {
      email: user?.email,
      name: user?.displayName || user?.name
    },
    files: {
      keys: details.keys,
      count: details.count,
      totalSize: details.totalSize
    },
    ip: req?.ip || req?.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log bucket clear operation
 * @param {string} user - User information
 * @param {object} details - Clear operation details
 * @param {object} req - Express request object
 */
function logBucketClear(user, details, req) {
  auditLogger.info('BUCKET: clear', {
    operation: 'clear_bucket',
    user: {
      email: user?.email,
      name: user?.displayName || user?.name
    },
    bucket: {
      name: details.bucketName,
      prefix: details.prefix,
      deletedCount: details.deletedCount
    },
    ip: req?.ip || req?.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log rollback operation
 * @param {string} action - Action type (rollback_start, rollback_success, rollback_failure)
 * @param {object} user - User information
 * @param {object} details - Rollback details
 * @param {object} req - Express request object
 */
function logRollback(action, user, details, req) {
  auditLogger.info(`ROLLBACK: ${action}`, {
    action,
    user: {
      email: user?.email,
      name: user?.displayName || user?.name
    },
    rollback: {
      targetTimestamp: details.targetTimestamp,
      targetVersion: details.targetVersion,
      artifactsCount: details.artifactsCount,
      artifacts: details.artifacts,
      totalFiles: details.totalFiles,
      status: details.status,
      duration: details.duration,
      errors: details.errors,
      options: details.options
    },
    ip: req?.ip || req?.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log general system operation
 * @param {string} operation - Operation type
 * @param {object} user - User information
 * @param {object} details - Operation details
 * @param {object} req - Express request object
 */
function logOperation(operation, user, details, req) {
  auditLogger.info(`OPERATION: ${operation}`, {
    operation,
    user: {
      email: user?.email,
      name: user?.displayName || user?.name
    },
    details,
    ip: req?.ip || req?.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  logAuth,
  logDeployment,
  logRollback,
  logFileOperation,
  logBucketClear,
  logOperation
};
