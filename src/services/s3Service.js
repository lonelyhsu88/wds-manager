const { s3, buckets, getBuckets, uploadConfig } = require('../config/aws');
const logger = require('../utils/logger');
const versionParser = require('../utils/versionParser');
const gameCategories = require('../utils/gameCategories');

class S3Service {
  /**
   * List directories and files in build artifacts bucket
   * @param {string} prefix - The prefix (directory) to list
   * @param {Object} req - Express request object (optional, for custom buckets)
   */
  async listBuildArtifacts(prefix = '', req = null) {
    try {
      const activeBuckets = getBuckets(req);
      const params = {
        Bucket: activeBuckets.buildArtifacts,
        Prefix: prefix,
        Delimiter: '/'
      };

      const data = await s3.listObjectsV2(params).promise();

      // Extract directories (CommonPrefixes) and sort by name (newest first)
      const directories = (data.CommonPrefixes || [])
        .map(item => ({
          type: 'directory',
          name: item.Prefix.replace(prefix, '').replace('/', ''),
          fullPath: item.Prefix,
          isDirectory: true
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name descending (newest first)

      // Extract files and sort by lastModified (newest first)
      const files = (data.Contents || [])
        .filter(item => item.Key !== prefix) // Exclude the prefix itself
        .map(item => ({
          type: 'file',
          name: item.Key.replace(prefix, ''),
          fullPath: item.Key,
          size: item.Size,
          lastModified: item.LastModified,
          isDirectory: false,
          isZip: item.Key.endsWith('.zip')
        }))
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified)); // Sort by date descending

      return {
        directories,
        files,
        currentPrefix: prefix
      };
    } catch (error) {
      logger.error('Error listing build artifacts:', error);
      throw error;
    }
  }

  /**
   * Get object from build artifacts bucket
   * @param {string} key - The S3 key
   * @param {Object} req - Express request object (optional, for custom buckets)
   */
  async getArtifact(key, req = null) {
    try {
      const activeBuckets = getBuckets(req);
      const params = {
        Bucket: activeBuckets.buildArtifacts,
        Key: key
      };

      const data = await s3.getObject(params).promise();
      return data.Body;
    } catch (error) {
      logger.error(`Error getting artifact ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get file list from an artifact ZIP file
   * @param {string} key - The S3 key of the ZIP artifact
   * @param {Object} req - Express request object (optional, for custom buckets)
   */
  async getArtifactFileList(key, req = null) {
    try {
      const AdmZip = require('adm-zip');

      // Download the artifact
      const zipData = await this.getArtifact(key, req);

      // Parse ZIP
      const zip = new AdmZip(zipData);
      const entries = zip.getEntries();

      // Extract file information
      const files = entries
        .filter(entry => !entry.isDirectory)
        .map(entry => ({
          name: entry.entryName,
          size: entry.header.size,
          compressedSize: entry.header.compressedSize,
          crc: entry.header.crc
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`Retrieved ${files.length} files from artifact ${key}`);
      return files;
    } catch (error) {
      logger.error(`Error getting artifact file list for ${key}:`, error);
      throw error;
    }
  }

  /**
   * List all objects in deploy webui bucket
   * @param {string} prefix - Optional prefix to filter
   */
  async listDeployedFiles(prefix = '') {
    try {
      const params = {
        Bucket: buckets.deployWebUI,
        Prefix: prefix
      };

      const data = await s3.listObjectsV2(params).promise();
      return (data.Contents || []).map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified
      }));
    } catch (error) {
      logger.error('Error listing deployed files:', error);
      throw error;
    }
  }

  /**
   * Delete all objects in deploy webui bucket
   * @param {string} prefix - Optional prefix to delete only specific path
   */
  async clearDeployBucket(prefix = '') {
    try {
      const files = await this.listDeployedFiles(prefix);

      if (files.length === 0) {
        logger.info('No files to delete in deploy bucket');
        return { deletedCount: 0 };
      }

      const deleteParams = {
        Bucket: buckets.deployWebUI,
        Delete: {
          Objects: files.map(file => ({ Key: file.key })),
          Quiet: false
        }
      };

      const result = await s3.deleteObjects(deleteParams).promise();
      const deletedCount = result.Deleted ? result.Deleted.length : 0;

      logger.info(`Deleted ${deletedCount} files from deploy bucket`);
      return { deletedCount, deleted: result.Deleted };
    } catch (error) {
      logger.error('Error clearing deploy bucket:', error);
      throw error;
    }
  }

  /**
   * Upload file to deploy webui bucket with high-speed managed upload
   * @param {string} key - The S3 key
   * @param {Buffer} body - The file content
   * @param {object} metadata - Optional metadata
   */
  async uploadToDeployBucket(key, body, metadata = {}) {
    try {
      const params = {
        Bucket: buckets.deployWebUI,
        Key: key,
        Body: body,
        ...metadata
      };

      // Use managed upload for better performance with large files
      const upload = s3.upload(params, {
        partSize: uploadConfig.partSize,
        queueSize: uploadConfig.queueSize
      });

      const result = await upload.promise();
      logger.info(`Uploaded ${key} to deploy bucket (${this.formatBytes(body.length)})`);
      return result;
    } catch (error) {
      logger.error(`Error uploading ${key} to deploy bucket:`, error);
      throw error;
    }
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Check if bucket exists and is accessible
   */
  async checkBucketAccess(bucketName) {
    try {
      await s3.headBucket({ Bucket: bucketName }).promise();
      return true;
    } catch (error) {
      logger.error(`Cannot access bucket ${bucketName}:`, error);
      return false;
    }
  }

  /**
   * Read version.txt files from all game directories in deploy bucket
   */
  async readGameVersions() {
    try {
      // List all directories in deploy bucket
      const params = {
        Bucket: buckets.deployWebUI,
        Delimiter: '/'
      };

      const data = await s3.listObjectsV2(params).promise();
      const versions = [];

      // For each directory, try to read version.txt
      const directories = data.CommonPrefixes || [];

      for (const dir of directories) {
        const dirName = dir.Prefix.replace('/', '');

        try {
          // Try to read version.txt from this directory
          const versionParams = {
            Bucket: buckets.deployWebUI,
            Key: `${dir.Prefix}version.txt`
          };

          const versionData = await s3.getObject(versionParams).promise();
          const versionContent = versionData.Body.toString('utf-8').trim();

          versions.push({
            game: dirName,
            version: versionContent,
            lastModified: versionData.LastModified
          });

          logger.info(`Read version for ${dirName}: ${versionContent}`);
        } catch (error) {
          // If version.txt doesn't exist, skip
          if (error.code !== 'NoSuchKey') {
            logger.warn(`Error reading version for ${dirName}:`, error.message);
          }
        }
      }

      // Also check for version.txt files in root (not in directories)
      try {
        const rootVersionParams = {
          Bucket: buckets.deployWebUI,
          Key: 'version.txt'
        };

        const rootVersionData = await s3.getObject(rootVersionParams).promise();
        const rootVersionContent = rootVersionData.Body.toString('utf-8').trim();

        versions.push({
          game: 'root',
          version: rootVersionContent,
          lastModified: rootVersionData.LastModified
        });
      } catch (error) {
        // Root version.txt is optional
      }

      // Sort by game name
      versions.sort((a, b) => a.game.localeCompare(b.game));

      logger.info(`Found ${versions.length} game versions`);
      return versions;

    } catch (error) {
      logger.error('Error reading game versions:', error);
      throw error;
    }
  }

  /**
   * Delete artifacts from build artifacts bucket
   * @param {string[]} artifactKeys - Array of artifact keys to delete
   */
  async deleteArtifacts(artifactKeys) {
    try {
      if (!artifactKeys || artifactKeys.length === 0) {
        throw new Error('No artifacts specified for deletion');
      }

      logger.info(`Deleting ${artifactKeys.length} artifacts from build bucket`);

      const deleteResults = {
        deleted: [],
        errors: [],
        totalSize: 0
      };

      // Process deletions
      for (const key of artifactKeys) {
        try {
          // First, check if it's a directory (prefix)
          const listParams = {
            Bucket: buckets.buildArtifacts,
            Prefix: key.endsWith('/') ? key : key + '/'
          };

          const listData = await s3.listObjectsV2(listParams).promise();

          if (listData.Contents && listData.Contents.length > 0) {
            // It's a directory, delete all objects with this prefix
            const objectsToDelete = listData.Contents.map(item => ({
              Key: item.Key
            }));

            if (objectsToDelete.length > 0) {
              const deleteParams = {
                Bucket: buckets.buildArtifacts,
                Delete: {
                  Objects: objectsToDelete,
                  Quiet: false
                }
              };

              const deleteData = await s3.deleteObjects(deleteParams).promise();

              // Calculate total size
              const totalSize = listData.Contents.reduce((sum, item) => sum + item.Size, 0);
              deleteResults.totalSize += totalSize;

              // Track deleted items
              if (deleteData.Deleted) {
                deleteResults.deleted.push({
                  key: key,
                  type: 'directory',
                  filesDeleted: deleteData.Deleted.length,
                  size: totalSize
                });
              }

              // Track errors
              if (deleteData.Errors && deleteData.Errors.length > 0) {
                deleteResults.errors.push(...deleteData.Errors);
              }

              logger.info(`Deleted directory ${key} with ${deleteData.Deleted?.length || 0} files`);
            }
          } else {
            // It's a single file
            try {
              // Get file size before deletion
              const headParams = {
                Bucket: buckets.buildArtifacts,
                Key: key
              };

              const headData = await s3.headObject(headParams).promise();
              const fileSize = headData.ContentLength;

              // Delete the file
              const deleteParams = {
                Bucket: buckets.buildArtifacts,
                Key: key
              };

              await s3.deleteObject(deleteParams).promise();

              deleteResults.totalSize += fileSize;
              deleteResults.deleted.push({
                key: key,
                type: 'file',
                size: fileSize
              });

              logger.info(`Deleted file ${key} (${fileSize} bytes)`);
            } catch (error) {
              if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
                logger.warn(`File not found: ${key}`);
                deleteResults.errors.push({
                  Key: key,
                  Code: 'NotFound',
                  Message: 'File not found'
                });
              } else {
                throw error;
              }
            }
          }
        } catch (error) {
          logger.error(`Error deleting ${key}:`, error);
          deleteResults.errors.push({
            Key: key,
            Code: error.code || 'UnknownError',
            Message: error.message
          });
        }
      }

      const summary = {
        status: deleteResults.errors.length === 0 ? 'success' : 'partial_success',
        deleted: deleteResults.deleted.length,
        failed: deleteResults.errors.length,
        totalSize: deleteResults.totalSize,
        details: deleteResults
      };

      logger.info(`Delete operation complete: ${summary.deleted} deleted, ${summary.failed} failed`);

      return summary;

    } catch (error) {
      logger.error('Error in deleteArtifacts:', error);
      throw error;
    }
  }

  /**
   * Get version history for all games from build artifacts bucket
   * Scans all artifacts, groups by game name, and returns last 3 versions for each
   * @returns {Promise<Object>} Object with games array containing version history
   */
  async getGameVersionHistory() {
    try {
      logger.info('Starting to scan build artifacts for version history');

      // Object to store all versions for each game
      const gameVersionsMap = new Map();

      // List all objects in the build bucket (across all prefixes)
      let continuationToken = null;
      let totalArtifacts = 0;

      do {
        const params = {
          Bucket: buckets.buildArtifacts,
          MaxKeys: 1000,
          ContinuationToken: continuationToken
        };

        const data = await s3.listObjectsV2(params).promise();
        const objects = data.Contents || [];
        totalArtifacts += objects.length;

        // Process each object
        for (const obj of objects) {
          // Only process .zip files
          if (!obj.Key.endsWith('.zip')) {
            continue;
          }

          // Extract game name and version
          const gameName = versionParser.extractGameName(obj.Key);
          const version = versionParser.parseVersion(obj.Key);

          if (!gameName || !version) {
            continue;
          }

          // Initialize array for this game if it doesn't exist
          if (!gameVersionsMap.has(gameName)) {
            gameVersionsMap.set(gameName, []);
          }

          // Add version info
          gameVersionsMap.get(gameName).push({
            version,
            lastModified: obj.LastModified,
            artifactPath: obj.Key
          });
        }

        continuationToken = data.NextContinuationToken;
      } while (continuationToken);

      logger.info(`Scanned ${totalArtifacts} artifacts, found ${gameVersionsMap.size} unique games`);

      // Get currently deployed versions
      const deployedVersions = await this.readGameVersions();
      const deployedVersionsMap = new Map(
        deployedVersions.map(v => [v.game, v.version])
      );
      logger.info(`Found ${deployedVersions.length} currently deployed games`);

      // Process each game's versions
      const games = [];

      for (const [gameName, versions] of gameVersionsMap.entries()) {
        // Sort versions (ascending order)
        const sortedVersions = versionParser.sortVersions(versions);

        // Get the last 3 versions
        const last3Versions = sortedVersions.slice(-3);

        // Get currently deployed version for this game
        const deployedVersion = deployedVersionsMap.get(gameName);

        // Mark versions
        for (const v of last3Versions) {
          // Mark if it's the latest available version
          if (v === last3Versions[last3Versions.length - 1]) {
            v.isLatest = true;
          }
          // Mark if it's currently deployed
          if (deployedVersion && v.version === deployedVersion) {
            v.isDeployed = true;
          }
        }

        // Get category information
        const category = gameCategories.getCategoryForGame(gameName);

        games.push({
          name: gameName,
          category: category.name,
          categoryKey: category.key,
          categoryColor: category.color,
          categoryIcon: category.icon,
          versionHistory: last3Versions,
          currentlyDeployed: deployedVersion || null
        });
      }

      // Sort games alphabetically by name
      games.sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`Returning version history for ${games.length} games`);

      return {
        games,
        totalGames: games.length,
        scannedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error getting game version history:', error);
      throw error;
    }
  }
}

module.exports = new S3Service();
