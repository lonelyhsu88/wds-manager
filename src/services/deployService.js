const AdmZip = require('adm-zip');
const pLimit = require('p-limit');
const s3Service = require('./s3Service');
const versionManager = require('../utils/versionManager');
const logger = require('../utils/logger');
const path = require('path');
const { uploadConfig } = require('../config/aws');

class DeployService {
  /**
   * Extract game name from artifact filename
   * Example: "20251003/event-b-prd-1.0.6.zip" -> "event-b"
   * Pattern: {GameName}-prd-{version}.zip
   * @param {string} artifactKey - The full artifact key
   */
  extractGameName(artifactKey) {
    const fileName = path.basename(artifactKey);
    // Remove file extension
    const nameWithoutExt = fileName.replace(/\.(zip|tar|gz|tgz)$/i, '');
    // Find "-prd-" pattern and extract everything before it
    const prdIndex = nameWithoutExt.indexOf('-prd-');
    if (prdIndex !== -1) {
      return nameWithoutExt.substring(0, prdIndex);
    }
    // Fallback: if no "-prd-" pattern, split by dash and take the first part
    const parts = nameWithoutExt.split('-');
    return parts[0];
  }

  /**
   * Extract version from artifact filename
   * Example: "event-b-prd-1.0.6.zip" -> "1.0.6"
   * Pattern: {GameName}-prd-{version}.zip
   * @param {string} artifactKey - The full artifact key
   * @returns {string|null} - Version string or null if not found
   */
  extractVersion(artifactKey) {
    const fileName = path.basename(artifactKey);
    const nameWithoutExt = fileName.replace(/\.(zip|tar|gz|tgz)$/i, '');
    const prdIndex = nameWithoutExt.indexOf('-prd-');
    if (prdIndex !== -1) {
      return nameWithoutExt.substring(prdIndex + 5); // Skip "-prd-"
    }
    return null;
  }

  /**
   * Compare two semantic versions
   * @param {string} version1 - First version (e.g., "1.0.6")
   * @param {string} version2 - Second version (e.g., "1.0.5")
   * @returns {number} - Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(version1, version2) {
    if (!version1 || !version2) return 0;

    const v1Parts = version1.split('.').map(n => parseInt(n) || 0);
    const v2Parts = version2.split('.').map(n => parseInt(n) || 0);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1 = v1Parts[i] || 0;
      const v2 = v2Parts[i] || 0;

      if (v1 > v2) return 1;
      if (v1 < v2) return -1;
    }

    return 0;
  }

  /**
   * Check artifact versions against currently deployed versions
   * @param {Array<string>} artifactKeys - List of artifact keys to check
   * @returns {Promise<Array>} - Array of version warnings
   */
  async checkVersions(artifactKeys) {
    const warnings = [];

    try {
      // Get current deployed game versions
      const deployedVersions = await s3Service.readGameVersions();
      const deployedMap = new Map(
        deployedVersions.map(v => [v.game, v.version])
      );

      for (const artifactKey of artifactKeys) {
        const gameName = this.extractGameName(artifactKey);
        const artifactVersion = this.extractVersion(artifactKey);
        const deployedVersion = deployedMap.get(gameName);

        if (artifactVersion && deployedVersion) {
          const comparison = this.compareVersions(artifactVersion, deployedVersion);

          if (comparison < 0) {
            // Artifact version is older than deployed version
            warnings.push({
              artifact: path.basename(artifactKey),
              gameName,
              artifactVersion,
              deployedVersion,
              message: `Warning: Artifact version ${artifactVersion} is older than deployed version ${deployedVersion}`
            });
          }
        }
      }

      return warnings;
    } catch (error) {
      logger.error('Error checking versions:', error);
      return []; // Return empty array on error, don't block deployment
    }
  }

  /**
   * Deploy artifacts to webui bucket
   * @param {Array<string>} artifactKeys - List of artifact keys to deploy
   * @param {object} options - Deployment options
   * @param {function} progressCallback - Callback for progress updates
   * @param {Object} req - Express request object (optional, for custom buckets)
   */
  async deploy(artifactKeys, options = {}, progressCallback = null, req = null) {
    const {
      clearBefore = true,
      extractZip = true,
      customPrefix = ''
    } = options;

    const emitProgress = (data) => {
      if (progressCallback) progressCallback(data);
    };

    const deploymentLog = {
      startTime: new Date().toISOString(),
      artifactKeys,
      totalFiles: 0,
      uploadedFiles: [],
      errors: [],
      status: 'in_progress'
    };

    try {
      logger.info(`Starting deployment of ${artifactKeys.length} artifacts`);
      emitProgress({
        phase: 'starting',
        message: `Starting deployment of ${artifactKeys.length} artifacts...`,
        percentage: 0
      });

      // Step 1: Clear game directories if requested
      if (clearBefore) {
        if (customPrefix) {
          // Clear custom prefix directory
          const prefix = customPrefix.endsWith('/') ? customPrefix : `${customPrefix}/`;
          logger.info(`Clearing custom prefix: ${prefix}`);
          emitProgress({
            phase: 'clearing',
            message: `Clearing ${prefix}...`,
            percentage: 5
          });
          const clearResult = await s3Service.clearDeployBucket(prefix);
          deploymentLog.deletedCount = clearResult.deletedCount;
          logger.info(`Cleared ${clearResult.deletedCount} files from ${prefix}`);
        } else {
          // Get unique game names from all artifacts
          const gameNames = [...new Set(artifactKeys.map(key => this.extractGameName(key)))];
          logger.info(`Clearing ${gameNames.length} game directories...`);
          emitProgress({
            phase: 'clearing',
            message: `Clearing ${gameNames.length} game directory(s)...`,
            percentage: 5
          });

          let totalDeleted = 0;
          for (const gameName of gameNames) {
            const clearResult = await s3Service.clearDeployBucket(`${gameName}/`);
            totalDeleted += clearResult.deletedCount;
          }
          deploymentLog.deletedCount = totalDeleted;
          logger.info(`Cleared ${totalDeleted} files from ${gameNames.length} game directories`);
        }
      }

      // Step 2: Process artifacts in parallel
      const maxParallelArtifacts = parseInt(process.env.MAX_PARALLEL_ARTIFACTS) || 3;
      const limit = pLimit(maxParallelArtifacts);
      let processedArtifacts = 0;

      logger.info(`Processing ${artifactKeys.length} artifacts with parallelism: ${maxParallelArtifacts}`);

      // Track active artifact processing
      const activeArtifacts = new Map();

      const artifactTasks = artifactKeys.map((artifactKey, index) => {
        return limit(async () => {
          try {
            // Determine target prefix: custom or auto-parsed
            let targetPrefix;
            let gameName;

            if (customPrefix) {
              // Use custom prefix for all artifacts
              targetPrefix = customPrefix.endsWith('/') ? customPrefix : `${customPrefix}/`;
              gameName = customPrefix;
            } else {
              // Extract game name from artifact filename
              gameName = this.extractGameName(artifactKey);
              targetPrefix = `${gameName}/`;
            }

            logger.info(`Processing artifact: ${artifactKey} -> ${targetPrefix}`);
            const artifactProgress = (processedArtifacts / artifactKeys.length) * 80 + 10;

            // Mark artifact as started
            activeArtifacts.set(artifactKey, {
              name: path.basename(artifactKey),
              progress: 0,
              status: 'downloading',
              gameName: gameName
            });

            emitProgress({
              phase: 'processing',
              message: `Processing ${activeArtifacts.size} artifact(s)...`,
              currentFile: artifactKey,
              percentage: Math.round(artifactProgress),
              activeArtifacts: Array.from(activeArtifacts.values())
            });

            // Download artifact
            const artifactData = await s3Service.getArtifact(artifactKey, req);

            // Check if it's a zip file
            const isZip = artifactKey.endsWith('.zip');

            if (isZip && extractZip) {
              // Update status to extracting
              activeArtifacts.set(artifactKey, {
                name: path.basename(artifactKey),
                progress: 0,
                status: 'extracting'
              });

              // Extract and upload zip contents with progress
              const extractResult = await this.extractAndUploadZip(
                artifactData,
                artifactKey,
                targetPrefix,
                (fileProgress) => {
                  const rawTotalProgress = artifactProgress + (fileProgress.percentage / artifactKeys.length) * 80;
                  const clampedTotalProgress = Math.min(100, Math.max(0, rawTotalProgress));
                  const clampedFileProgress = Math.min(100, Math.max(0, fileProgress.percentage));

                  // Update artifact progress
                  activeArtifacts.set(artifactKey, {
                    name: path.basename(artifactKey),
                    progress: clampedFileProgress,
                    status: 'uploading',
                    currentFile: path.basename(fileProgress.currentFile),
                    gameName: gameName
                  });

                  emitProgress({
                    phase: 'uploading',
                    message: `Uploading ${activeArtifacts.size} artifact(s)...`,
                    currentFile: fileProgress.currentFile,
                    fileProgress: clampedFileProgress,
                    percentage: Math.round(clampedTotalProgress),
                    activeArtifacts: Array.from(activeArtifacts.values())
                  });
                }
              );
              deploymentLog.uploadedFiles.push(...extractResult.files);
              deploymentLog.totalFiles += extractResult.files.length;
            } else {
              // Upload as-is with game name prefix
              const fileName = path.basename(artifactKey);
              const targetKey = `${targetPrefix}${fileName}`;

              activeArtifacts.set(artifactKey, {
                name: path.basename(artifactKey),
                progress: 50,
                status: 'uploading',
                gameName: gameName
              });

              await s3Service.uploadToDeployBucket(targetKey, artifactData);
              deploymentLog.uploadedFiles.push(targetKey);
              deploymentLog.totalFiles += 1;
            }

            // Remove from active artifacts when done
            activeArtifacts.delete(artifactKey);
            processedArtifacts++;

            // Emit progress update after completion
            emitProgress({
              phase: 'uploading',
              message: `Processing ${activeArtifacts.size} artifact(s)...`,
              percentage: Math.round(((processedArtifacts / artifactKeys.length) * 80) + 10),
              activeArtifacts: Array.from(activeArtifacts.values())
            });

            return { success: true, artifactKey };
          } catch (error) {
            logger.error(`Error processing artifact ${artifactKey}:`, error);
            activeArtifacts.delete(artifactKey);
            deploymentLog.errors.push({
              artifact: artifactKey,
              error: error.message
            });
            return { success: false, artifactKey, error: error.message };
          }
        });
      });

      // Wait for all artifacts to be processed
      const results = await Promise.all(artifactTasks);

      // Step 3: Update deployment status
      deploymentLog.endTime = new Date().toISOString();
      deploymentLog.status = deploymentLog.errors.length === 0 ? 'success' : 'partial_success';
      deploymentLog.duration = this.calculateDuration(deploymentLog.startTime, deploymentLog.endTime);

      // Record deployment in version history
      await versionManager.recordDeployment({
        artifactKeys: artifactKeys,
        artifactsCount: artifactKeys.length,
        filesDeployed: deploymentLog.totalFiles,
        status: deploymentLog.status,
        errors: deploymentLog.errors,
        options: {
          clearBefore,
          extractZip,
          customPrefix
        }
      });

      logger.info(`Deployment completed: ${deploymentLog.status}`);
      return deploymentLog;

    } catch (error) {
      logger.error('Deployment failed:', error);
      deploymentLog.endTime = new Date().toISOString();
      deploymentLog.status = 'failed';
      deploymentLog.errors.push({
        general: error.message
      });
      throw error;
    }
  }

  /**
   * Extract zip file and upload contents to S3 with parallel uploads
   * Skips the root directory if all files are under a single top-level directory
   * @param {Buffer} zipData - The zip file data
   * @param {string} originalKey - Original artifact key
   * @param {string} targetPrefix - Target prefix in deploy bucket
   * @param {function} progressCallback - Callback for progress updates
   */
  async extractAndUploadZip(zipData, originalKey, targetPrefix = '', progressCallback = null) {
    const uploadedFiles = [];
    const errors = [];

    try {
      const zip = new AdmZip(zipData);
      const allEntries = zip.getEntries();

      // Detect if all files are under a single root directory
      let rootDir = null;
      const topLevelDirs = new Set();

      for (const entry of allEntries) {
        const parts = entry.entryName.split('/');
        if (parts.length > 1) {
          topLevelDirs.add(parts[0]);
        }
      }

      // If all files are under a single top-level directory, use it as root to skip
      if (topLevelDirs.size === 1) {
        rootDir = Array.from(topLevelDirs)[0];
        logger.info(`Detected root directory in ZIP: ${rootDir}, will skip it`);
      }

      const zipEntries = allEntries.filter(entry => !entry.isDirectory);
      const totalFiles = zipEntries.length;
      let completedFiles = 0;

      logger.info(`Extracting ${totalFiles} files from ${originalKey} with concurrency ${uploadConfig.concurrency}`);

      // Create a limit for concurrent uploads
      const limit = pLimit(uploadConfig.concurrency);

      // Create upload tasks
      const uploadTasks = zipEntries.map((entry, index) => {
        return limit(async () => {
          try {
            // Get file content
            const fileData = entry.getData();

            // Construct target key, skipping root directory if detected
            let entryPath = entry.entryName;
            if (rootDir && entryPath.startsWith(rootDir + '/')) {
              // Remove root directory from path
              entryPath = entryPath.substring(rootDir.length + 1);
            }

            let targetKey = entryPath;
            if (targetPrefix) {
              targetKey = `${targetPrefix}${entryPath}`;
            }

            // Determine content type
            const contentType = this.getContentType(entry.entryName);

            // Upload to S3
            await s3Service.uploadToDeployBucket(targetKey, fileData, {
              ContentType: contentType
            });

            uploadedFiles.push(targetKey);
            completedFiles++;

            // Emit progress with clamped percentage (0-100)
            if (progressCallback) {
              const rawPercentage = (completedFiles / totalFiles) * 100;
              const clampedPercentage = Math.min(100, Math.max(0, Math.round(rawPercentage)));

              progressCallback({
                currentFile: path.basename(targetKey),
                percentage: clampedPercentage,
                completed: completedFiles,
                total: totalFiles
              });
            }

            logger.info(`Uploaded: ${targetKey} (${completedFiles}/${totalFiles})`);

            return { success: true, key: targetKey };
          } catch (error) {
            logger.error(`Error uploading ${entry.entryName}:`, error);
            errors.push({ file: entry.entryName, error: error.message });
            completedFiles++;
            return { success: false, key: entry.entryName, error: error.message };
          }
        });
      });

      // Wait for all uploads to complete
      const results = await Promise.all(uploadTasks);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      logger.info(`Upload completed: ${successCount} succeeded, ${failCount} failed`);

      return {
        files: uploadedFiles,
        count: uploadedFiles.length,
        errors: errors,
        successCount,
        failCount
      };

    } catch (error) {
      logger.error('Error extracting zip:', error);
      throw error;
    }
  }

  /**
   * Get content type based on file extension
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf'
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Calculate duration in human readable format
   */
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
}

module.exports = new DeployService();
