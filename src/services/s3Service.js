const { s3, buckets, getBuckets, uploadConfig } = require('../config/aws');
const logger = require('../utils/logger');
const versionParser = require('../utils/versionParser');
const gameCategories = require('../utils/gameCategories');

class S3Service {
  constructor() {
    // Cache for game version history
    this.versionHistoryCache = {
      data: null,
      timestamp: null,
      ttl: 5 * 60 * 1000 // 5 minutes TTL
    };

    // Cache for deployed game versions
    this.deployedVersionsCache = {
      data: null,
      timestamp: null,
      ttl: 2 * 60 * 1000 // 2 minutes TTL (shorter than version history)
    };
  }
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
      const allFiles = [];
      let continuationToken = null;

      do {
        const params = {
          Bucket: buckets.deployWebUI,
          Prefix: prefix,
          ContinuationToken: continuationToken
        };

        const data = await s3.listObjectsV2(params).promise();

        if (data.Contents && data.Contents.length > 0) {
          allFiles.push(...data.Contents.map(item => ({
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified
          })));
        }

        continuationToken = data.IsTruncated ? data.NextContinuationToken : null;
      } while (continuationToken);

      logger.info(`Listed ${allFiles.length} files from deploy bucket with prefix: ${prefix || '(root)'}`);
      return allFiles;
    } catch (error) {
      logger.error('Error listing deployed files:', error);
      throw error;
    }
  }

  /**
   * Delete all objects in deploy webui bucket
   * @param {string} prefix - Optional prefix to delete only specific path
   * @param {Function} progressCallback - Optional callback for progress updates
   */
  async clearDeployBucket(prefix = '', progressCallback = null) {
    try {
      // Emit listing phase
      if (progressCallback) {
        progressCallback({
          phase: 'listing',
          message: 'Scanning bucket for files...',
          progress: 0
        });
      }

      const files = await this.listDeployedFiles(prefix);

      if (files.length === 0) {
        logger.info('No files to delete in deploy bucket');
        if (progressCallback) {
          progressCallback({
            phase: 'complete',
            message: 'No files to delete',
            progress: 100,
            deletedCount: 0
          });
        }
        return { deletedCount: 0 };
      }

      logger.info(`Found ${files.length} files to delete from deploy bucket`);

      if (progressCallback) {
        progressCallback({
          phase: 'deleting',
          message: `Found ${files.length} files to delete`,
          progress: 0,
          totalFiles: files.length
        });
      }

      // AWS deleteObjects can only delete 1000 objects at a time
      const batchSize = 1000;
      let totalDeleted = 0;
      const allDeleted = [];
      const totalBatches = Math.ceil(files.length / batchSize);

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;

        const deleteParams = {
          Bucket: buckets.deployWebUI,
          Delete: {
            Objects: batch.map(file => ({ Key: file.key })),
            Quiet: false
          }
        };

        const result = await s3.deleteObjects(deleteParams).promise();
        const deletedCount = result.Deleted ? result.Deleted.length : 0;
        totalDeleted += deletedCount;

        if (result.Deleted) {
          allDeleted.push(...result.Deleted);
        }

        const progress = Math.round((totalDeleted / files.length) * 100);

        if (progressCallback) {
          progressCallback({
            phase: 'deleting',
            message: `Deleting batch ${currentBatch}/${totalBatches}...`,
            progress: progress,
            deletedCount: totalDeleted,
            totalFiles: files.length,
            currentBatch: currentBatch,
            totalBatches: totalBatches
          });
        }

        logger.info(`Deleted batch ${currentBatch}/${totalBatches}: ${deletedCount} files (Total: ${totalDeleted}/${files.length})`);

        if (result.Errors && result.Errors.length > 0) {
          logger.error(`Errors in batch ${currentBatch}:`, result.Errors);
        }
      }

      logger.info(`Total deleted ${totalDeleted} files from deploy bucket`);

      // Clear caches after bucket clearing
      this.clearDeployedVersionsCache();
      this.clearVersionHistoryCache();
      logger.info('Cleared deployed versions and version history caches');

      if (progressCallback) {
        progressCallback({
          phase: 'complete',
          message: `Successfully deleted ${totalDeleted} files`,
          progress: 100,
          deletedCount: totalDeleted,
          totalFiles: files.length
        });
      }

      return { deletedCount: totalDeleted, deleted: allDeleted };
    } catch (error) {
      logger.error('Error clearing deploy bucket:', error);
      if (progressCallback) {
        progressCallback({
          phase: 'error',
          message: `Error: ${error.message}`,
          progress: 0,
          error: error.message
        });
      }
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
   * Clear deployed versions cache
   * Call this after deployments to ensure fresh data
   */
  clearDeployedVersionsCache() {
    this.deployedVersionsCache.data = null;
    this.deployedVersionsCache.timestamp = null;
    logger.info('Deployed versions cache cleared');
  }

  /**
   * Read version.txt files from all game directories in deploy bucket
   * Now with caching and parallel S3 reads for better performance
   */
  async readGameVersions(forceRefresh = false) {
    try {
      // Check cache first
      const now = Date.now();
      if (!forceRefresh && this.deployedVersionsCache.data && this.deployedVersionsCache.timestamp) {
        const cacheAge = now - this.deployedVersionsCache.timestamp;
        if (cacheAge < this.deployedVersionsCache.ttl) {
          logger.info(`Returning cached deployed versions (age: ${Math.round(cacheAge / 1000)}s)`);
          return this.deployedVersionsCache.data;
        }
      }

      logger.info('Reading deployed game versions from S3...');

      // List all directories in deploy bucket
      const params = {
        Bucket: buckets.deployWebUI,
        Delimiter: '/'
      };

      const data = await s3.listObjectsV2(params).promise();
      const directories = data.CommonPrefixes || [];

      // Read all version.txt files IN PARALLEL
      const versionPromises = directories.map(async (dir) => {
        const dirName = dir.Prefix.replace('/', '');

        try {
          const versionParams = {
            Bucket: buckets.deployWebUI,
            Key: `${dir.Prefix}version.txt`
          };

          const versionData = await s3.getObject(versionParams).promise();
          const versionContent = versionData.Body.toString('utf-8').trim();

          return {
            game: dirName,
            version: versionContent,
            lastModified: versionData.LastModified
          };
        } catch (error) {
          // If version.txt doesn't exist, return null
          if (error.code !== 'NoSuchKey') {
            logger.warn(`Error reading version for ${dirName}:`, error.message);
          }
          return null;
        }
      });

      // Also check for root version.txt
      const rootVersionPromise = (async () => {
        try {
          const rootVersionParams = {
            Bucket: buckets.deployWebUI,
            Key: 'version.txt'
          };

          const rootVersionData = await s3.getObject(rootVersionParams).promise();
          const rootVersionContent = rootVersionData.Body.toString('utf-8').trim();

          return {
            game: 'root',
            version: rootVersionContent,
            lastModified: rootVersionData.LastModified
          };
        } catch (error) {
          // Root version.txt is optional
          return null;
        }
      })();

      // Wait for all reads to complete in parallel
      const allResults = await Promise.all([...versionPromises, rootVersionPromise]);

      // Filter out null results and sort
      const versions = allResults.filter(v => v !== null);
      versions.sort((a, b) => a.game.localeCompare(b.game));

      logger.info(`Found ${versions.length} game versions (read in parallel)`);

      // Update cache
      this.deployedVersionsCache.data = versions;
      this.deployedVersionsCache.timestamp = now;

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
  /**
   * Clear version history cache
   * Call this after deployments to ensure fresh data
   */
  clearVersionHistoryCache() {
    this.versionHistoryCache.data = null;
    this.versionHistoryCache.timestamp = null;
    logger.info('Version history cache cleared');
  }

  async getGameVersionHistory(forceRefresh = false) {
    try {
      // Check cache first
      const now = Date.now();
      if (!forceRefresh && this.versionHistoryCache.data && this.versionHistoryCache.timestamp) {
        const cacheAge = now - this.versionHistoryCache.timestamp;
        if (cacheAge < this.versionHistoryCache.ttl) {
          logger.info(`Returning cached version history (age: ${Math.round(cacheAge / 1000)}s)`);
          return this.versionHistoryCache.data;
        }
      }

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

      const result = {
        games,
        totalGames: games.length,
        scannedAt: new Date().toISOString()
      };

      // Update cache
      this.versionHistoryCache.data = result;
      this.versionHistoryCache.timestamp = now;
      logger.info('Version history cache updated');

      return result;

    } catch (error) {
      logger.error('Error getting game version history:', error);
      throw error;
    }
  }
}

module.exports = new S3Service();
