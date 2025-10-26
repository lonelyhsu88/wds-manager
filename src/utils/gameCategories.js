const fs = require('fs');
const path = require('path');

const categoriesPath = path.join(__dirname, '../../config/game-categories.json');
let categoriesData = null;

/**
 * Load game categories from config file
 */
function loadCategories() {
  if (!categoriesData) {
    try {
      const data = fs.readFileSync(categoriesPath, 'utf8');
      categoriesData = JSON.parse(data);
    } catch (error) {
      console.error('Error loading game categories:', error);
      categoriesData = { categories: {} };
    }
  }
  return categoriesData;
}

/**
 * Get category for a game name
 * @param {string} gameName - Game name (e.g., "MultiPlayerAviator")
 * @returns {object} Category info { key, name, icon, color } or null
 */
function getCategoryForGame(gameName) {
  const data = loadCategories();

  for (const [key, category] of Object.entries(data.categories)) {
    if (category.games.includes(gameName)) {
      return {
        key,
        name: category.name,
        icon: category.icon,
        color: category.color
      };
    }
  }

  // Return 'other' category if not found
  return {
    key: 'uncategorized',
    name: 'Uncategorized',
    icon: 'bi-question-circle',
    color: 'secondary'
  };
}

/**
 * Extract game name from artifact key
 * Examples:
 *   "20251003/MultiPlayerAviator-prd-1.0.26.zip" -> "MultiPlayerAviator"
 *   "dean-test/event-b-prd-1.0.6.zip" -> "event-b"
 * @param {string} artifactKey - S3 artifact key
 * @returns {string} Game name
 */
function extractGameName(artifactKey) {
  const filename = artifactKey.split('/').pop(); // Get filename from path
  const parts = filename.replace('.zip', '').split('-');

  // Find 'prd' index to get everything before it
  const prdIndex = parts.findIndex(p => p === 'prd');
  if (prdIndex > 0) {
    return parts.slice(0, prdIndex).join('-');
  }

  // If no 'prd' found, return first part
  return parts[0];
}

/**
 * Categorize a list of artifacts
 * @param {Array} artifacts - Array of artifact objects with 'key' property
 * @returns {Object} Categorized artifacts
 */
function categorizeArtifacts(artifacts) {
  const categorized = {
    hash: [],
    bingo: [],
    arcade: [],
    resources: [],
    dashboard: [],
    event: [],
    'jump-page': [],
    'game-demo': [],
    'ex-mgmt': [],
    other: [],
    uncategorized: []
  };

  artifacts.forEach(artifact => {
    const gameName = extractGameName(artifact.key);
    const category = getCategoryForGame(gameName);

    if (categorized[category.key]) {
      categorized[category.key].push({
        ...artifact,
        gameName,
        category: category.name
      });
    } else {
      categorized.uncategorized.push({
        ...artifact,
        gameName,
        category: category.name
      });
    }
  });

  return categorized;
}

/**
 * Get all categories with metadata
 * @returns {Object} Categories with metadata
 */
function getAllCategories() {
  const data = loadCategories();
  return data.categories;
}

module.exports = {
  getCategoryForGame,
  extractGameName,
  categorizeArtifacts,
  getAllCategories
};
