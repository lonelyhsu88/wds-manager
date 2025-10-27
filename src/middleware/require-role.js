/**
 * Role-Based Access Control Middleware
 * Ensures users have required roles to access routes
 */

const logger = require('../utils/logger');
const { hasRole, getHighestRoleLevel } = require('../config/roles');

/**
 * Role hierarchy for comparison
 */
const ROLE_HIERARCHY = {
  'Viewer': 1,
  'Operator': 2,
  'Admin': 3
};

/**
 * Middleware to require a specific role or higher
 * @param {string} requiredRole - Required role name (Viewer, Operator, Admin)
 * @returns {Function} - Express middleware function
 */
function requireRole(requiredRole) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      logger.warn('Unauthorized access attempt - not authenticated');
      return res.status(401).json({
        error: 'Unauthorized',
        message: '尚未登入'
      });
    }

    // Check if user has roles
    const user = req.user;
    if (!user || !user.roles || user.roles.length === 0) {
      logger.warn('Unauthorized access attempt - no roles assigned', {
        email: user?.email
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: '沒有權限訪問此資源'
      });
    }

    // Check if user has required role
    if (!hasRole(user.roles, requiredRole)) {
      logger.warn('Forbidden access attempt - insufficient role', {
        email: user.email,
        userRoles: user.roles,
        requiredRole: requiredRole
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: `需要 ${requiredRole} 或更高權限`
      });
    }

    // User has required role
    logger.debug('Access granted', {
      email: user.email,
      roles: user.roles,
      requiredRole: requiredRole
    });

    next();
  };
}

/**
 * Convenience middleware for requiring Viewer role (minimum access)
 */
function requireViewer() {
  return requireRole('Viewer');
}

/**
 * Convenience middleware for requiring Operator role
 */
function requireOperator() {
  return requireRole('Operator');
}

/**
 * Convenience middleware for requiring Admin role
 */
function requireAdmin() {
  return requireRole('Admin');
}

/**
 * Check if user has specific permission
 * @param {string} permission - Permission to check (e.g., 'deploy:create')
 * @returns {Function} - Express middleware function
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '尚未登入'
      });
    }

    const user = req.user;
    if (!user || !user.roles || user.roles.length === 0) {
      return res.status(403).json({
        error: 'Forbidden',
        message: '沒有權限'
      });
    }

    // Check if any of user's roles has the permission
    const { hasPermission } = require('../config/roles');
    const hasAccess = user.roles.some(role => hasPermission(role, permission));

    if (!hasAccess) {
      logger.warn('Forbidden access attempt - insufficient permission', {
        email: user.email,
        userRoles: user.roles,
        requiredPermission: permission
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: `需要 ${permission} 權限`
      });
    }

    next();
  };
}

module.exports = {
  requireRole,
  requireViewer,
  requireOperator,
  requireAdmin,
  requirePermission
};
