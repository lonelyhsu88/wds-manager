const fs = require('fs').promises;
const path = require('path');
const s3Service = require('./s3Service');
const logger = require('../utils/logger');
const gameCategories = require('../utils/gameCategories');

/**
 * Service to handle automatic copying of config files to deployed game directories
 */
class ConfigCopyService {
  constructor() {
    this.configMappings = this.loadConfigMappings();
  }

  /**
   * Load config mappings from environment variables
   * @returns {Object} Config mappings by type
   */
  loadConfigMappings() {
    const mappings = {
      hash: {
        configFile: 'config/hashconfig.json',
        games: this.parseGameList(process.env.CONFIG_MAPPING_HASH || '*')
      },
      bingo: {
        configFile: 'config/bingoconfig.json',
        games: this.parseGameList(process.env.CONFIG_MAPPING_BINGO || '*')
      },
      arcade: {
        configFile: 'config/arcadeconfig.json',
        games: this.parseGameList(process.env.CONFIG_MAPPING_ARCADE || '*')
      }
    };

    // Load custom mappings (CONFIG_CUSTOM_*)
    const customMappings = this.loadCustomMappings();
    if (Object.keys(customMappings).length > 0) {
      mappings.custom = customMappings;
    }

    return mappings;
  }

  /**
   * Load custom config mappings from environment
   * Format: CONFIG_CUSTOM_<NAME>=<source_file>:<target_games>
   * @returns {Object} Custom mappings
   */
  loadCustomMappings() {
    const customMappings = {};
    const envKeys = Object.keys(process.env).filter(key => key.startsWith('CONFIG_CUSTOM_'));

    for (const key of envKeys) {
      const value = process.env[key];
      const [sourceFile, targetGames] = value.split(':');

      if (sourceFile && targetGames) {
        const name = key.replace('CONFIG_CUSTOM_', '').toLowerCase();
        customMappings[name] = {
          configFile: sourceFile,
          games: this.parseGameList(targetGames)
        };
      }
    }

    return customMappings;
  }

  /**
   * Parse game list string to array
   * @param {string} gameList - Comma-separated list or '*' for all
   * @returns {Array|string} Array of game names or '*'
   */
  parseGameList(gameList) {
    if (!gameList || gameList.trim() === '*') {
      return '*';
    }
    return gameList.split(',').map(g => g.trim()).filter(g => g.length > 0);
  }

  /**
   * Get all games in a category
   * @param {string} category - Category name (hash, bingo, arcade)
   * @returns {Array} Array of game names
   */
  getGamesInCategory(category) {
    const categories = gameCategories.getAllCategories();
    return categories[category]?.games || [];
  }

  /**
   * Resolve game names from '*' wildcard or specific list
   * @param {string|Array} games - Games specification
   * @param {string} category - Category name
   * @returns {Array} Resolved game names
   */
  resolveGameNames(games, category) {
    if (games === '*') {
      return this.getGamesInCategory(category);
    }
    return games;
  }

  /**
   * Determine target config filename for a game category
   * Special case: arcade games use hashconfig.json as target
   * @param {string} category - Game category (hash, bingo, arcade)
   * @param {string} sourceFileName - Original config filename
   * @returns {string} Target filename to use
   */
  getTargetConfigFileName(category, sourceFileName) {
    // Special case: arcade games use hashconfig.json instead of arcadeconfig.json
    if (category === 'arcade') {
      return 'hashconfig.json';
    }
    return sourceFileName;
  }

  /**
   * Copy a config file to a game directory in S3
   * @param {string} configFilePath - Local path to config file
   * @param {string} gameName - Target game name
   * @param {string} targetFileName - Target filename in S3
   * @param {Object} req - Express request object (for custom bucket)
   * @returns {Promise<Object>} Upload result
   */
  async copyConfigToGame(configFilePath, gameName, targetFileName, req = null) {
    try {
      // Read config file
      const configContent = await fs.readFile(configFilePath, 'utf8');
      const configBuffer = Buffer.from(configContent, 'utf8');

      // Determine target S3 key
      const targetKey = `${gameName}/${targetFileName}`;

      // Upload to S3
      const uploadResult = await s3Service.uploadToDeployBucket(
        targetKey,
        configBuffer,
        {
          ContentType: 'application/json'
        }
      );

      logger.info(`Copied config ${configFilePath} to ${targetKey}`);

      return {
        success: true,
        source: configFilePath,
        target: targetKey,
        gameName: gameName
      };
    } catch (error) {
      logger.error(`Error copying config ${configFilePath} to ${gameName}:`, error);
      return {
        success: false,
        source: configFilePath,
        target: `${gameName}/${targetFileName}`,
        gameName: gameName,
        error: error.message
      };
    }
  }

  /**
   * Copy all configured config files to their target games
   * @param {Array<string>} deployedGames - List of games that were just deployed
   * @param {function} progressCallback - Progress callback function
   * @param {Object} req - Express request object (for custom bucket)
   * @returns {Promise<Object>} Copy results
   */
  async copyConfigsForDeployedGames(deployedGames, progressCallback = null, req = null) {
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    const emitProgress = (data) => {
      if (progressCallback) progressCallback(data);
    };

    try {
      logger.info(`Starting config copy for ${deployedGames.length} deployed games`);
      emitProgress({
        phase: 'config_copy',
        message: 'Copying configuration files...',
        percentage: 90
      });

      // Process each mapping type
      for (const [type, mapping] of Object.entries(this.configMappings)) {
        if (type === 'custom') {
          // Handle custom mappings
          for (const [name, customMapping] of Object.entries(mapping)) {
            const targetGames = this.resolveGameNames(customMapping.games, null);
            const configFileName = path.basename(customMapping.configFile);

            for (const gameName of deployedGames) {
              if (targetGames.includes(gameName)) {
                results.total++;
                const result = await this.copyConfigToGame(
                  customMapping.configFile,
                  gameName,
                  configFileName,
                  req
                );

                if (result.success) {
                  results.success++;
                } else {
                  results.failed++;
                }
                results.details.push(result);
              }
            }
          }
        } else {
          // Handle standard mappings (hash, bingo, arcade)
          const targetGames = this.resolveGameNames(mapping.games, type);
          const sourceFileName = path.basename(mapping.configFile);

          for (const gameName of deployedGames) {
            if (targetGames.includes(gameName)) {
              // Check if config file exists
              try {
                await fs.access(mapping.configFile);
              } catch (error) {
                logger.warn(`Config file not found: ${mapping.configFile}, skipping`);
                results.skipped++;
                continue;
              }

              // Determine target filename (arcade games use hashconfig.json)
              const targetFileName = this.getTargetConfigFileName(type, sourceFileName);

              results.total++;
              const result = await this.copyConfigToGame(
                mapping.configFile,
                gameName,
                targetFileName,
                req
              );

              if (result.success) {
                results.success++;
              } else {
                results.failed++;
              }
              results.details.push(result);
            }
          }
        }
      }

      logger.info(`Config copy completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
      emitProgress({
        phase: 'config_copy',
        message: `Config copy completed: ${results.success} files copied`,
        percentage: 95
      });

      return results;
    } catch (error) {
      logger.error('Error during config copy:', error);
      throw error;
    }
  }

  /**
   * Copy configs for specific games (manual trigger)
   * @param {Array<string>} gameNames - List of game names
   * @param {Object} req - Express request object (for custom bucket)
   * @returns {Promise<Object>} Copy results
   */
  async copyConfigsForGames(gameNames, req = null) {
    return this.copyConfigsForDeployedGames(gameNames, null, req);
  }

  /**
   * Get current config mappings (for debugging/display)
   * @returns {Object} Current mappings
   */
  getMappings() {
    const mappings = {};

    for (const [type, mapping] of Object.entries(this.configMappings)) {
      if (type === 'custom') {
        mappings.custom = {};
        for (const [name, customMapping] of Object.entries(mapping)) {
          const games = this.resolveGameNames(customMapping.games, null);
          mappings.custom[name] = {
            configFile: customMapping.configFile,
            targetGames: games,
            gameCount: games.length
          };
        }
      } else {
        const games = this.resolveGameNames(mapping.games, type);
        mappings[type] = {
          configFile: mapping.configFile,
          targetGames: games,
          gameCount: games.length
        };
      }
    }

    return mappings;
  }
}

// Export singleton instance
module.exports = new ConfigCopyService();
