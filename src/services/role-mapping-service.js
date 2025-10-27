/**
 * Role Mapping Service
 * Manages email-to-role mappings and domain-based default roles
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { isValidRole } = require('../config/roles');

const ROLE_MAPPINGS_FILE = path.join(__dirname, '../data/role-mappings.json');

/**
 * Load role mappings from file
 * @returns {Promise<Object>} - Role mappings object
 */
async function loadRoleMappings() {
  try {
    const data = await fs.readFile(ROLE_MAPPINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Error loading role mappings:', error);
    // Return default mappings
    return {
      emailRoleMapping: {},
      domainDefaultRoles: {
        'default': ['Viewer']
      }
    };
  }
}

/**
 * Save role mappings to file
 * @param {Object} mappings - Role mappings object
 * @returns {Promise<void>}
 */
async function saveRoleMappings(mappings) {
  try {
    await fs.writeFile(ROLE_MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf8');
    logger.info('Role mappings saved successfully');
  } catch (error) {
    logger.error('Error saving role mappings:', error);
    throw error;
  }
}

/**
 * Get roles for an email address
 * @param {string} email - User email address
 * @returns {Promise<Array<string>>} - Array of role names
 */
async function getRolesForEmail(email) {
  const mappings = await loadRoleMappings();

  // Check email-specific mapping first
  if (mappings.emailRoleMapping && mappings.emailRoleMapping[email]) {
    logger.info(`Found email-specific roles for ${email}:`, mappings.emailRoleMapping[email]);
    return mappings.emailRoleMapping[email];
  }

  // Extract domain from email
  const domain = email.split('@')[1];

  // Check domain-based default roles
  if (mappings.domainDefaultRoles && mappings.domainDefaultRoles[domain]) {
    logger.info(`Using domain default roles for ${email} (${domain}):`, mappings.domainDefaultRoles[domain]);
    return mappings.domainDefaultRoles[domain];
  }

  // Use global default
  const defaultRoles = mappings.domainDefaultRoles?.default || ['Viewer'];
  logger.info(`Using global default roles for ${email}:`, defaultRoles);
  return defaultRoles;
}

/**
 * Set roles for an email address
 * @param {string} email - User email address
 * @param {Array<string>} roles - Array of role names
 * @returns {Promise<void>}
 */
async function setRolesForEmail(email, roles) {
  // Validate roles
  const invalidRoles = roles.filter(role => !isValidRole(role));
  if (invalidRoles.length > 0) {
    throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
  }

  const mappings = await loadRoleMappings();

  if (!mappings.emailRoleMapping) {
    mappings.emailRoleMapping = {};
  }

  mappings.emailRoleMapping[email] = roles;
  await saveRoleMappings(mappings);

  logger.info(`Updated roles for ${email}:`, roles);
}

/**
 * Remove email-specific role mapping
 * @param {string} email - User email address
 * @returns {Promise<void>}
 */
async function removeEmailMapping(email) {
  const mappings = await loadRoleMappings();

  if (mappings.emailRoleMapping && mappings.emailRoleMapping[email]) {
    delete mappings.emailRoleMapping[email];
    await saveRoleMappings(mappings);
    logger.info(`Removed role mapping for ${email}`);
  }
}

/**
 * Get all role mappings
 * @returns {Promise<Object>} - All role mappings
 */
async function getAllMappings() {
  return await loadRoleMappings();
}

/**
 * Update all role mappings
 * @param {Object} mappings - New mappings object
 * @returns {Promise<void>}
 */
async function updateAllMappings(mappings) {
  // Validate structure
  if (!mappings.emailRoleMapping || !mappings.domainDefaultRoles) {
    throw new Error('Invalid mappings structure');
  }

  // Validate all roles
  const allRoles = [
    ...Object.values(mappings.emailRoleMapping).flat(),
    ...Object.values(mappings.domainDefaultRoles).flat()
  ];

  const invalidRoles = allRoles.filter(role => !isValidRole(role));
  if (invalidRoles.length > 0) {
    throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
  }

  // Ensure at least one admin exists
  const hasAdmin = Object.values(mappings.emailRoleMapping).some(roles =>
    roles.includes('Admin')
  );

  if (!hasAdmin) {
    throw new Error('At least one Admin user must exist');
  }

  await saveRoleMappings(mappings);
  logger.info('All role mappings updated successfully');
}

/**
 * Set domain default roles
 * @param {string} domain - Domain name or 'default'
 * @param {Array<string>} roles - Array of role names
 * @returns {Promise<void>}
 */
async function setDomainDefaultRoles(domain, roles) {
  // Validate roles
  const invalidRoles = roles.filter(role => !isValidRole(role));
  if (invalidRoles.length > 0) {
    throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
  }

  const mappings = await loadRoleMappings();

  if (!mappings.domainDefaultRoles) {
    mappings.domainDefaultRoles = {};
  }

  mappings.domainDefaultRoles[domain] = roles;
  await saveRoleMappings(mappings);

  logger.info(`Updated domain default roles for ${domain}:`, roles);
}

module.exports = {
  getRolesForEmail,
  setRolesForEmail,
  removeEmailMapping,
  getAllMappings,
  updateAllMappings,
  setDomainDefaultRoles
};
