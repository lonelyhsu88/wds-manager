const { s3, buckets, uploadConfig } = require('../config/aws');
const logger = require('../utils/logger');

class S3Service {
  /**
   * List directories and files in build artifacts bucket
   * @param {string} prefix - The prefix (directory) to list
   */
  async listBuildArtifacts(prefix = '') {
    try {
      const params = {
        Bucket: buckets.buildArtifacts,
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
   */
  async getArtifact(key) {
    try {
      const params = {
        Bucket: buckets.buildArtifacts,
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

      // Optional: Track progress
      // upload.on('httpUploadProgress', (progress) => {
      //   logger.debug(`Upload progress for ${key}: ${progress.loaded}/${progress.total}`);
      // });

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
}

module.exports = new S3Service();
