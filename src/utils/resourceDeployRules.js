const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const rulesPath = path.join(__dirname, '../../config/resource-deploy-rules.json');
let rulesData = null;

/**
 * Load resource deployment rules from config file
 */
function loadRules() {
  if (!rulesData) {
    try {
      const data = fs.readFileSync(rulesPath, 'utf8');
      rulesData = JSON.parse(data);
      logger.info('Resource deployment rules loaded');
    } catch (error) {
      logger.error('Error loading resource deployment rules:', error);
      rulesData = { resourceDeploymentRules: {}, defaultResourceRule: {} };
    }
  }
  return rulesData;
}

/**
 * Get deployment rule for a specific resource/game
 * @param {string} gameName - Game or resource name (e.g., "i18n", "bundle-i18n", "game-configs")
 * @returns {object} Deployment rule configuration
 */
function getDeploymentRule(gameName) {
  const rules = loadRules();

  // Check if there's a specific rule for this resource
  if (rules.resourceDeploymentRules[gameName]) {
    return {
      ...rules.resourceDeploymentRules[gameName],
      gameName,
      isResourceType: true
    };
  }

  // Return default rule
  const defaultRule = rules.defaultResourceRule;
  return {
    ...defaultRule,
    targetPrefix: defaultRule.targetPrefix.replace('{gameName}', gameName),
    gameName,
    isResourceType: false
  };
}

/**
 * Check if a game is a resource type
 * @param {string} gameName - Game name
 * @returns {boolean} True if it's a resource type
 */
function isResourceType(gameName) {
  const rules = loadRules();
  return !!rules.resourceDeploymentRules[gameName];
}

/**
 * Get all resource types
 * @returns {Array<string>} List of resource type names
 */
function getAllResourceTypes() {
  const rules = loadRules();
  return Object.keys(rules.resourceDeploymentRules);
}

/**
 * Get deployment target prefix for a game
 * @param {string} gameName - Game name
 * @param {string} customPrefix - Custom prefix override
 * @returns {string} Target prefix (can be empty string for root deployment)
 */
function getTargetPrefix(gameName, customPrefix = null) {
  if (customPrefix) {
    return customPrefix;
  }

  const rule = getDeploymentRule(gameName);
  return rule.targetPrefix;
}

/**
 * Get all deployment targets for a game (including additional targets)
 * @param {string} gameName - Game name
 * @param {string} customPrefix - Custom prefix override
 * @returns {Array<string>} Array of target prefixes
 */
function getAllTargets(gameName, customPrefix = null) {
  const rule = getDeploymentRule(gameName);
  const targets = [];

  // Primary target
  const primary = getTargetPrefix(gameName, customPrefix);
  targets.push(primary);

  // Additional targets (only if not using custom prefix)
  if (!customPrefix && rule.additionalTargets && rule.additionalTargets.length > 0) {
    targets.push(...rule.additionalTargets);
  }

  return targets;
}

/**
 * Should clear target directory before deployment?
 * @param {string} gameName - Game name
 * @param {boolean} clearBeforeOverride - Override from user input
 * @returns {boolean}
 */
function shouldClearBefore(gameName, clearBeforeOverride = null) {
  if (clearBeforeOverride !== null) {
    return clearBeforeOverride;
  }

  const rule = getDeploymentRule(gameName);
  return rule.clearBeforeDeploy !== false; // Default to true
}

/**
 * Should preserve other files in target directory?
 * This is important for game-configs which shouldn't clear the root directory
 * @param {string} gameName - Game name
 * @returns {boolean}
 */
function shouldPreserveOtherFiles(gameName) {
  const rule = getDeploymentRule(gameName);
  return rule.preserveOtherFiles === true;
}

/**
 * Get internal directory to find (for bundle-i18n special case)
 * @param {string} gameName - Game name
 * @returns {string|null} Internal directory name or null
 */
function getInternalDirToFind(gameName) {
  const rule = getDeploymentRule(gameName);
  return rule.findInternalDir || null;
}

/**
 * Should skip root directory when extracting?
 * @param {string} gameName - Game name
 * @returns {boolean}
 */
function shouldSkipRootDir(gameName) {
  const rule = getDeploymentRule(gameName);
  return rule.skipRootDir !== false; // Default to true
}

module.exports = {
  getDeploymentRule,
  isResourceType,
  getAllResourceTypes,
  getTargetPrefix,
  getAllTargets,
  shouldClearBefore,
  shouldPreserveOtherFiles,
  getInternalDirToFind,
  shouldSkipRootDir
};
