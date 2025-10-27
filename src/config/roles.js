/**
 * Role-Based Access Control (RBAC) Configuration
 * Defines roles and their permissions for WDS Manager
 */

const ROLES = {
  ADMIN: {
    name: 'Admin',
    level: 3,
    permissions: [
      '*' // All permissions
    ],
    description: 'Full system access including user management and system configuration'
  },

  OPERATOR: {
    name: 'Operator',
    level: 2,
    permissions: [
      // Deployment permissions
      'deploy:create',
      'deploy:read',
      'deploy:delete',
      'deploy:rollback',

      // Artifact permissions
      'artifact:read',
      'artifact:delete',

      // Bucket permissions
      'bucket:read',
      'bucket:clear',

      // Version permissions
      'version:read',
      'version:write',

      // Preset permissions
      'preset:read',
      'preset:write',
      'preset:delete'
    ],
    description: 'Can perform deployments, manage artifacts, and configure presets'
  },

  VIEWER: {
    name: 'Viewer',
    level: 1,
    permissions: [
      // Read-only permissions
      'deploy:read',
      'artifact:read',
      'bucket:read',
      'version:read',
      'preset:read'
    ],
    description: 'Read-only access to view deployments, artifacts, and configurations'
  }
};

/**
 * Check if a role has a specific permission
 * @param {string} roleName - Role name (Admin, Operator, Viewer)
 * @param {string} permission - Permission to check (e.g., 'deploy:create')
 * @returns {boolean} - True if role has permission
 */
function hasPermission(roleName, permission) {
  const role = ROLES[roleName.toUpperCase()];
  if (!role) return false;

  // Admin has all permissions
  if (role.permissions.includes('*')) return true;

  // Check exact permission or wildcard
  return role.permissions.some(p => {
    if (p === permission) return true;
    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -2);
      return permission.startsWith(prefix + ':');
    }
    return false;
  });
}

/**
 * Check if user has minimum required role level
 * @param {Array<string>} userRoles - User's roles
 * @param {string} requiredRole - Required role name
 * @returns {boolean} - True if user meets requirement
 */
function hasRole(userRoles, requiredRole) {
  if (!userRoles || userRoles.length === 0) return false;

  const required = ROLES[requiredRole.toUpperCase()];
  if (!required) return false;

  // Check if user has any role with equal or higher level
  return userRoles.some(userRole => {
    const role = ROLES[userRole.toUpperCase()];
    return role && role.level >= required.level;
  });
}

/**
 * Get highest role level from user's roles
 * @param {Array<string>} userRoles - User's roles
 * @returns {number} - Highest role level
 */
function getHighestRoleLevel(userRoles) {
  if (!userRoles || userRoles.length === 0) return 0;

  return Math.max(...userRoles.map(roleName => {
    const role = ROLES[roleName.toUpperCase()];
    return role ? role.level : 0;
  }));
}

/**
 * Validate role name
 * @param {string} roleName - Role name to validate
 * @returns {boolean} - True if valid
 */
function isValidRole(roleName) {
  return ROLES.hasOwnProperty(roleName.toUpperCase());
}

/**
 * Get all available roles
 * @returns {Array<Object>} - Array of role objects
 */
function getAllRoles() {
  return Object.keys(ROLES).map(key => ({
    key: key,
    ...ROLES[key]
  }));
}

module.exports = {
  ROLES,
  hasPermission,
  hasRole,
  getHighestRoleLevel,
  isValidRole,
  getAllRoles
};
