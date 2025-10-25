const AdmZip = require('adm-zip');
const pLimit = require('p-limit');
const s3Service = require('./s3Service');
const versionManager = require('../utils/versionManager');
const logger = require('../utils/logger');
const path = require('path');
const { uploadConfig } = require('../config/aws');

class DeployService {
  /**
   * Deploy artifacts to webui bucket
   * @param {Array<string>} artifactKeys - List of artifact keys to deploy
   * @param {object} options - Deployment options
   * @param {function} progressCallback - Callback for progress updates
   */
  async deploy(artifactKeys, options = {}, progressCallback = null) {
    const {
      clearBefore = true,
      extractZip = true,
      targetPrefix = ''
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

      // Step 1: Clear deploy bucket if requested
      if (clearBefore) {
        logger.info('Clearing deploy bucket...');
        emitProgress({
          phase: 'clearing',
          message: 'Clearing deploy bucket...',
          percentage: 5
        });
        const clearResult = await s3Service.clearDeployBucket(targetPrefix);
        deploymentLog.deletedCount = clearResult.deletedCount;
      }

      // Step 2: Process each artifact
      let processedArtifacts = 0;
      for (const artifactKey of artifactKeys) {
        try {
          logger.info(`Processing artifact: ${artifactKey}`);
          const artifactProgress = (processedArtifacts / artifactKeys.length) * 80 + 10;
          emitProgress({
            phase: 'processing',
            message: `Processing artifact: ${path.basename(artifactKey)}`,
            currentFile: artifactKey,
            percentage: Math.round(artifactProgress)
          });

          // Download artifact
          const artifactData = await s3Service.getArtifact(artifactKey);

          // Check if it's a zip file
          const isZip = artifactKey.endsWith('.zip');

          if (isZip && extractZip) {
            // Extract and upload zip contents with progress
            const extractResult = await this.extractAndUploadZip(
              artifactData,
              artifactKey,
              targetPrefix,
              (fileProgress) => {
                const totalProgress = artifactProgress + (fileProgress / artifactKeys.length) * 80;
                emitProgress({
                  phase: 'uploading',
                  message: `Uploading: ${fileProgress.currentFile}`,
                  currentFile: fileProgress.currentFile,
                  fileProgress: fileProgress.percentage,
                  percentage: Math.round(totalProgress)
                });
              }
            );
            deploymentLog.uploadedFiles.push(...extractResult.files);
            deploymentLog.totalFiles += extractResult.files.length;
          } else {
            // Upload as-is
            const fileName = path.basename(artifactKey);
            const targetKey = targetPrefix ? `${targetPrefix}${fileName}` : fileName;

            await s3Service.uploadToDeployBucket(targetKey, artifactData);
            deploymentLog.uploadedFiles.push(targetKey);
            deploymentLog.totalFiles += 1;
          }

          processedArtifacts++;
        } catch (error) {
          logger.error(`Error processing artifact ${artifactKey}:`, error);
          deploymentLog.errors.push({
            artifact: artifactKey,
            error: error.message
          });
        }
      }

      // Step 3: Update deployment status
      deploymentLog.endTime = new Date().toISOString();
      deploymentLog.status = deploymentLog.errors.length === 0 ? 'success' : 'partial_success';
      deploymentLog.duration = this.calculateDuration(deploymentLog.startTime, deploymentLog.endTime);

      // Record deployment in version history
      await versionManager.recordDeployment({
        artifactsCount: artifactKeys.length,
        filesDeployed: deploymentLog.totalFiles,
        status: deploymentLog.status,
        errors: deploymentLog.errors
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
      const zipEntries = zip.getEntries().filter(entry => !entry.isDirectory);
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

            // Construct target key
            let targetKey = entry.entryName;
            if (targetPrefix) {
              targetKey = `${targetPrefix}${entry.entryName}`;
            }

            // Determine content type
            const contentType = this.getContentType(entry.entryName);

            // Upload to S3
            await s3Service.uploadToDeployBucket(targetKey, fileData, {
              ContentType: contentType
            });

            uploadedFiles.push(targetKey);
            completedFiles++;

            // Emit progress
            if (progressCallback) {
              progressCallback({
                currentFile: path.basename(targetKey),
                percentage: Math.round((completedFiles / totalFiles) * 100),
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
