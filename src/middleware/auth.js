const logger = require('../utils/logger');

/**
 * Middleware to check if user is authenticated
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    logger.debug(`User authenticated: ${req.user.email}`);
    return next();
  }

  logger.warn('Unauthenticated access attempt', {
    path: req.path,
    ip: req.ip
  });

  // For API requests, return JSON error
  if (req.path.startsWith('/api')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // For web requests, redirect to login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

/**
 * Middleware to check if user has specific email domain
 */
function ensureEmailDomain(allowedDomains) {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userDomain = req.user.email.split('@')[1];
    const domains = Array.isArray(allowedDomains) ? allowedDomains : [allowedDomains];

    if (!domains.includes(userDomain)) {
      logger.warn(`Email domain not allowed: ${userDomain}`, {
        user: req.user.email
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your email domain is not authorized'
      });
    }

    next();
  };
}

/**
 * Middleware to add user info to response locals
 */
function addUserToLocals(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
}

/**
 * Skip authentication in development mode (optional)
 */
function skipAuthInDev(req, res, next) {
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    // Create a mock user for development
    req.user = {
      id: 'dev-user',
      email: 'developer@example.com',
      displayName: 'Development User',
      provider: 'dev'
    };
    logger.debug('Development mode: Authentication skipped');
    return next();
  }
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureEmailDomain,
  addUserToLocals,
  skipAuthInDev
};
