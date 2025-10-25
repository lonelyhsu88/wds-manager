const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const VERSION_FILE = path.join(__dirname, '../../version.json');

class VersionManager {
  /**
   * Get current version
   */
  async getCurrentVersion() {
    try {
      const data = await fs.readFile(VERSION_FILE, 'utf8');
      const versionData = JSON.parse(data);
      return versionData.version;
    } catch (error) {
      logger.error('Error reading version file:', error);
      throw error;
    }
  }

  /**
   * Get version history
   */
  async getVersionHistory() {
    try {
      const data = await fs.readFile(VERSION_FILE, 'utf8');
      const versionData = JSON.parse(data);
      return versionData.history || [];
    } catch (error) {
      logger.error('Error reading version history:', error);
      throw error;
    }
  }

  /**
   * Bump version (patch, minor, or major)
   * @param {string} type - 'patch', 'minor', or 'major'
   * @param {Array<string>} changes - List of changes made
   */
  async bumpVersion(type = 'patch', changes = []) {
    try {
      const data = await fs.readFile(VERSION_FILE, 'utf8');
      const versionData = JSON.parse(data);

      const [major, minor, patch] = versionData.version.split('.').map(Number);

      let newVersion;
      switch (type) {
        case 'major':
          newVersion = `${major + 1}.0.0`;
          break;
        case 'minor':
          newVersion = `${major}.${minor + 1}.0`;
          break;
        case 'patch':
        default:
          newVersion = `${major}.${minor}.${patch + 1}`;
          break;
      }

      // Update version data
      versionData.version = newVersion;
      versionData.history.unshift({
        version: newVersion,
        date: new Date().toISOString().split('T')[0],
        changes: changes.length > 0 ? changes : ['Version bump']
      });

      // Write back to file
      await fs.writeFile(VERSION_FILE, JSON.stringify(versionData, null, 2));

      logger.info(`Version bumped to ${newVersion}`);
      return newVersion;
    } catch (error) {
      logger.error('Error bumping version:', error);
      throw error;
    }
  }

  /**
   * Add deployment record to version history
   */
  async recordDeployment(deploymentInfo) {
    try {
      const data = await fs.readFile(VERSION_FILE, 'utf8');
      const versionData = JSON.parse(data);

      if (!versionData.deployments) {
        versionData.deployments = [];
      }

      versionData.deployments.unshift({
        version: versionData.version,
        timestamp: new Date().toISOString(),
        ...deploymentInfo
      });

      // Keep only last 50 deployments
      if (versionData.deployments.length > 50) {
        versionData.deployments = versionData.deployments.slice(0, 50);
      }

      await fs.writeFile(VERSION_FILE, JSON.stringify(versionData, null, 2));
      logger.info('Deployment recorded');
    } catch (error) {
      logger.error('Error recording deployment:', error);
      throw error;
    }
  }
}

module.exports = new VersionManager();
