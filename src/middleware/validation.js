const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      path: req.path,
      errors: errors.array(),
      user: req.user?.email
    });
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * Validation rules for deploy endpoint
 */
const validateDeploy = [
  body('artifactKeys')
    .isArray({ min: 1, max: 100 })
    .withMessage('artifactKeys must be an array with 1-100 items'),
  body('artifactKeys.*')
    .isString()
    .trim()
    .notEmpty()
    .matches(/^[a-zA-Z0-9\/_\-\.]+$/)
    .withMessage('Invalid artifact key format - only alphanumeric, /, _, -, . allowed')
    .isLength({ max: 1000 })
    .withMessage('Artifact key too long'),
  body('clearBefore')
    .optional()
    .isBoolean()
    .withMessage('clearBefore must be boolean'),
  body('extractZip')
    .optional()
    .isBoolean()
    .withMessage('extractZip must be boolean'),
  body('targetPrefix')
    .optional()
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9\/_\-]*$/)
    .withMessage('Invalid target prefix - only alphanumeric, /, _, - allowed')
    .isLength({ max: 200 })
    .withMessage('Target prefix too long'),
  handleValidationErrors
];

/**
 * Validation rules for clear deploy endpoint
 */
const validateClearDeploy = [
  body('prefix')
    .optional()
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9\/_\-]*$/)
    .withMessage('Invalid prefix - only alphanumeric, /, _, - allowed')
    .isLength({ max: 200 })
    .withMessage('Prefix too long'),
  handleValidationErrors
];

/**
 * Validation rules for version bump endpoint
 */
const validateVersionBump = [
  body('type')
    .isIn(['major', 'minor', 'patch'])
    .withMessage('Type must be major, minor, or patch'),
  body('changes')
    .optional()
    .isArray()
    .withMessage('Changes must be an array'),
  body('changes.*')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Change description too long'),
  handleValidationErrors
];

/**
 * Validation rules for artifacts query
 */
const validateArtifactsQuery = [
  query('prefix')
    .optional()
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9\/_\-]*$/)
    .withMessage('Invalid prefix - only alphanumeric, /, _, - allowed')
    .isLength({ max: 500 })
    .withMessage('Prefix too long'),
  handleValidationErrors
];

/**
 * Validation rules for deployed files query
 */
const validateDeployedQuery = [
  query('prefix')
    .optional()
    .isString()
    .trim()
    .matches(/^[a-zA-Z0-9\/_\-]*$/)
    .withMessage('Invalid prefix - only alphanumeric, /, _, - allowed')
    .isLength({ max: 500 })
    .withMessage('Prefix too long'),
  handleValidationErrors
];

/**
 * Validation rules for delete artifacts endpoint
 */
const validateDeleteArtifacts = [
  body('artifactKeys')
    .isArray({ min: 1, max: 100 })
    .withMessage('artifactKeys must be an array with 1-100 items'),
  body('artifactKeys.*')
    .isString()
    .trim()
    .notEmpty()
    .matches(/^[a-zA-Z0-9\/_.\-]+$/)
    .withMessage('Invalid artifact key format - only alphanumeric, /, _, -, . allowed')
    .isLength({ max: 1000 })
    .withMessage('Artifact key too long'),
  handleValidationErrors
];

/**
 * Sanitize user input to prevent injection attacks
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize all string inputs
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
        .trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

module.exports = {
  validateDeploy,
  validateClearDeploy,
  validateVersionBump,
  validateArtifactsQuery,
  validateDeployedQuery,
  validateDeleteArtifacts,
  sanitizeInput,
  handleValidationErrors
};
