/**
 * Version Parser Utility
 * Handles version parsing and comparison for game artifacts
 */

/**
 * Parse version number from filename
 * Pattern: GameName-prd-X.Y.Z.zip -> extract X.Y.Z
 * @param {string} filename - Filename or full path
 * @returns {string|null} Version string (e.g., "1.0.26") or null if not found
 */
function parseVersion(filename) {
  // Get just the filename if a full path was provided
  const file = filename.split('/').pop();

  // Remove .zip extension
  const nameWithoutExt = file.replace('.zip', '');

  // Match pattern: anything-prd-X.Y.Z
  // Support multiple version formats: X.Y.Z, X.Y, or X
  const versionMatch = nameWithoutExt.match(/-prd-(\d+\.\d+\.\d+|\d+\.\d+|\d+)$/);

  if (versionMatch && versionMatch[1]) {
    return versionMatch[1];
  }

  return null;
}

/**
 * Compare two semantic versions
 * @param {string} v1 - First version (e.g., "1.0.26")
 * @param {string} v2 - Second version (e.g., "1.0.27")
 * @returns {number} -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  // Handle null/undefined
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  // Normalize versions to have 3 parts (major.minor.patch)
  const normalize = (v) => {
    const parts = v.split('.').map(Number);
    while (parts.length < 3) {
      parts.push(0);
    }
    return parts;
  };

  const parts1 = normalize(v1);
  const parts2 = normalize(v2);

  // Compare each part
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }

  return 0;
}

/**
 * Sort array of version objects by version number (ascending)
 * @param {Array<Object>} versions - Array of objects with 'version' property
 * @returns {Array<Object>} Sorted array (ascending order)
 */
function sortVersions(versions) {
  if (!Array.isArray(versions)) {
    return [];
  }

  return versions.slice().sort((a, b) => {
    return compareVersions(a.version, b.version);
  });
}

/**
 * Extract game name from artifact filename
 * Pattern: GameName-prd-X.Y.Z.zip -> extract GameName
 * @param {string} filename - Filename or full path
 * @returns {string|null} Game name or null if pattern doesn't match
 */
function extractGameName(filename) {
  // Get just the filename if a full path was provided
  const file = filename.split('/').pop();

  // Remove .zip extension
  const nameWithoutExt = file.replace('.zip', '');

  // Find 'prd' and get everything before it
  const parts = nameWithoutExt.split('-');
  const prdIndex = parts.findIndex(p => p === 'prd');

  if (prdIndex > 0) {
    return parts.slice(0, prdIndex).join('-');
  }

  // If no 'prd' found, return first part
  return parts[0];
}

module.exports = {
  parseVersion,
  compareVersions,
  sortVersions,
  extractGameName
};
