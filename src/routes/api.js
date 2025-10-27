const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const deployService = require('../services/deployService');
const statsService = require('../services/statsService');
const versionManager = require('../utils/versionManager');
const logger = require('../utils/logger');
const auditLogger = require('../utils/auditLogger');
const gameCategories = require('../utils/gameCategories');
const { ensureAuthenticated } = require('../middleware/auth');
const { deployLimiter } = require('../middleware/rateLimit');
const bucketOverride = require('../middleware/bucketOverride');
const {
  validateDeploy,
  validateClearDeploy,
  validateVersionBump,
  validateArtifactsQuery,
  validateDeployedQuery,
  validateDeleteArtifacts
} = require('../middleware/validation');

// Apply bucket override middleware to all routes
router.use(bucketOverride);

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version
  });
});

// Get current user info (requires authentication)
router.get('/user', ensureAuthenticated, (req, res) => {
  res.json({
    user: {
      email: req.user.email,
      displayName: req.user.displayName,
      name: req.user.name,
      photo: req.user.photo
    }
  });
});

// Get current version
router.get('/version', async (req, res) => {
  try {
    const version = await versionManager.getCurrentVersion();
    const history = await versionManager.getVersionHistory();
    res.json({
      version,
      history: history.slice(0, 10) // Last 10 versions
    });
  } catch (error) {
    logger.error('Error getting version:', error);
    res.status(500).json({ error: 'Failed to get version information' });
  }
});

// Check bucket access (requires authentication)
router.get('/check-access', ensureAuthenticated, async (req, res) => {
  try {
    const { getBuckets } = require('../config/aws');
    const activeBuckets = getBuckets(req);

    const buildAccess = await s3Service.checkBucketAccess(activeBuckets.buildArtifacts);
    const deployAccess = await s3Service.checkBucketAccess(activeBuckets.deployWebUI);

    res.json({
      buildArtifactsBucket: {
        name: activeBuckets.buildArtifacts,
        accessible: buildAccess
      },
      deployWebUIBucket: {
        name: activeBuckets.deployWebUI,
        accessible: deployAccess
      }
    });
  } catch (error) {
    logger.error('Error checking bucket access:', error);
    res.status(500).json({ error: 'Failed to check bucket access' });
  }
});

// List all S3 buckets (requires authentication)
router.get('/list-buckets', ensureAuthenticated, async (req, res) => {
  try {
    const { s3, buckets } = require('../config/aws');

    logger.info(`Listing all S3 buckets for user: ${req.user?.email}`);

    // List all buckets
    const data = await s3.listBuckets().promise();

    // Sort buckets alphabetically
    const bucketList = (data.Buckets || [])
      .map(bucket => ({
        name: bucket.Name,
        creationDate: bucket.CreationDate,
        isDefault: bucket.Name === buckets.buildArtifacts || bucket.Name === buckets.deployWebUI
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      buckets: bucketList,
      totalCount: bucketList.length,
      defaultBuckets: {
        build: buckets.buildArtifacts,
        deploy: buckets.deployWebUI
      }
    });
  } catch (error) {
    logger.error('Error listing S3 buckets:', error);
    res.status(500).json({
      error: 'Failed to list S3 buckets',
      message: error.message
    });
  }
});

// List build artifacts (requires authentication + validation)
router.get('/artifacts', validateArtifactsQuery, ensureAuthenticated, async (req, res) => {
  try {
    const { prefix = '', categorize = 'false' } = req.query;
    const result = await s3Service.listBuildArtifacts(prefix, req);

    // If categorize flag is set, return categorized data
    if (categorize === 'true') {
      const categorized = gameCategories.categorizeArtifacts(result.artifacts || []);
      const categories = gameCategories.getAllCategories();

      res.json({
        ...result,
        categorized,
        categories
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    logger.error('Error listing artifacts:', error);
    res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// List deployed files (requires authentication + validation)
router.get('/deployed', validateDeployedQuery, ensureAuthenticated, async (req, res) => {
  try {
    const { prefix = '' } = req.query;
    const files = await s3Service.listDeployedFiles(prefix);
    res.json({ files });
  } catch (error) {
    logger.error('Error listing deployed files:', error);
    res.status(500).json({ error: 'Failed to list deployed files' });
  }
});

// Check artifact versions before deployment (requires authentication)
router.post('/check-versions', ensureAuthenticated, async (req, res) => {
  try {
    const { artifactKeys = [] } = req.body;

    if (!Array.isArray(artifactKeys) || artifactKeys.length === 0) {
      return res.status(400).json({ error: 'artifactKeys must be a non-empty array' });
    }

    const warnings = await deployService.checkVersions(artifactKeys);

    res.json({
      warnings,
      hasWarnings: warnings.length > 0
    });

  } catch (error) {
    logger.error('Version check error:', error);
    res.status(500).json({
      error: 'Version check failed',
      message: error.message
    });
  }
});

// Deploy artifacts with real-time progress (requires validation + authentication + rate limiting)
router.post('/deploy', validateDeploy, deployLimiter, ensureAuthenticated, async (req, res) => {
  const startTime = Date.now();
  const {
    artifactKeys = [],
    clearBefore = true,
    extractZip = true,
    targetPrefix = '',
    customPrefix = '',
    isRollback = false,
    rollbackTimestamp = null
  } = req.body;

  try {
    logger.info(`${isRollback ? 'Rollback' : 'Deployment'} requested for ${artifactKeys.length} artifacts`);

    // Log rollback or deployment start
    if (isRollback) {
      auditLogger.logRollback('rollback_start', req.user, {
        targetTimestamp: rollbackTimestamp,
        artifactsCount: artifactKeys.length,
        artifacts: artifactKeys,
        options: { clearBefore, extractZip, customPrefix: customPrefix || targetPrefix }
      }, req);
    } else {
      auditLogger.logDeployment('deploy_start', req.user, {
        artifactsCount: artifactKeys.length,
        artifacts: artifactKeys
      }, req);
    }

    // Get Socket.IO instance
    const io = req.app.get('io');

    // Start deployment with progress callback
    const result = await deployService.deploy(artifactKeys, {
      clearBefore,
      extractZip,
      targetPrefix: customPrefix || targetPrefix
    }, (progress) => {
      // Emit progress to all connected clients
      io.emit('deployProgress', progress);
    }, req);

    const duration = Date.now() - startTime;

    // Log rollback or deployment completion
    if (isRollback) {
      auditLogger.logRollback(
        result.status === 'success' ? 'rollback_success' : 'rollback_failure',
        req.user,
        {
          targetTimestamp: rollbackTimestamp,
          artifactsCount: artifactKeys.length,
          artifacts: artifactKeys,
          totalFiles: result.totalFiles,
          status: result.status,
          duration,
          errors: result.errors || [],
          options: { clearBefore, extractZip, customPrefix: customPrefix || targetPrefix }
        },
        req
      );
    } else {
      auditLogger.logDeployment(
        result.status === 'success' ? 'deploy_success' : 'deploy_failure',
        req.user,
        {
          artifactsCount: artifactKeys.length,
          artifacts: artifactKeys,
          totalFiles: result.totalFiles,
          status: result.status,
          duration,
          errors: result.errors || []
        },
        req
      );
    }

    // Record deployment in version history
    try {
      await versionManager.recordDeployment({
        artifactKeys,
        artifactsCount: artifactKeys.length,
        filesDeployed: result.totalFiles,
        status: result.status,
        isRollback,
        user: req.user?.email || req.user?.name || 'Unknown',
        options: { clearBefore, extractZip, customPrefix: customPrefix || targetPrefix }
      });
    } catch (error) {
      logger.error('Error recording deployment:', error);
      // Don't fail the deployment if recording fails
    }

    // Emit completion
    io.emit('deployComplete', result);

    res.json({
      success: result.status === 'success' || result.status === 'partial_success',
      ...result
    });

  } catch (error) {
    logger.error(`${isRollback ? 'Rollback' : 'Deployment'} error:`, error);

    const duration = Date.now() - startTime;

    // Log error
    if (isRollback) {
      auditLogger.logRollback('rollback_failure', req.user, {
        targetTimestamp: rollbackTimestamp,
        artifactsCount: artifactKeys.length,
        artifacts: artifactKeys,
        status: 'failure',
        duration,
        errors: [error.message],
        options: { clearBefore, extractZip, customPrefix: customPrefix || targetPrefix }
      }, req);
    } else {
      auditLogger.logDeployment('deploy_failure', req.user, {
        artifactsCount: artifactKeys.length,
        artifacts: artifactKeys,
        status: 'failure',
        duration,
        errors: [error.message]
      }, req);
    }

    // Emit error
    const io = req.app.get('io');
    io.emit('deployError', { error: error.message });

    res.status(500).json({
      error: `${isRollback ? 'Rollback' : 'Deployment'} failed`,
      message: error.message
    });
  }
});

// Clear deploy bucket (requires validation + authentication + rate limiting)
router.post('/clear-deploy', validateClearDeploy, deployLimiter, ensureAuthenticated, async (req, res) => {
  try {
    const { prefix = '' } = req.body;
    const io = req.app.get('io');

    // Create progress callback to emit Socket.IO events
    const progressCallback = (progressData) => {
      if (io) {
        io.emit('clear-bucket-progress', {
          ...progressData,
          user: req.user.email
        });
      }
    };

    const result = await s3Service.clearDeployBucket(prefix, progressCallback);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error clearing deploy bucket:', error);
    const io = req.app.get('io');
    if (io) {
      io.emit('clear-bucket-progress', {
        phase: 'error',
        message: `Error: ${error.message}`,
        error: error.message,
        user: req.user.email
      });
    }
    res.status(500).json({ error: 'Failed to clear deploy bucket' });
  }
});

// Bump version (requires validation + authentication)
router.post('/version/bump', validateVersionBump, ensureAuthenticated, async (req, res) => {
  try {
    const { type = 'patch', changes = [] } = req.body;

    const newVersion = await versionManager.bumpVersion(type, changes);
    res.json({
      success: true,
      version: newVersion
    });
  } catch (error) {
    logger.error('Error bumping version:', error);
    res.status(500).json({ error: 'Failed to bump version' });
  }
});

// Read game versions from version.txt files (requires authentication)
router.get('/game-versions', ensureAuthenticated, async (req, res) => {
  try {
    const versions = await s3Service.readGameVersions();
    res.json({ versions });
  } catch (error) {
    logger.error('Error reading game versions:', error);
    res.status(500).json({ error: 'Failed to read game versions' });
  }
});

// Get deployment history (requires authentication)
router.get('/deployment-history', ensureAuthenticated, async (req, res) => {
  try {
    const versionData = require('../../version.json');
    const deployments = versionData.deployments || [];

    // Return last 30 deployments
    res.json({
      deployments: deployments.slice(0, 30)
    });
  } catch (error) {
    logger.error('Error reading deployment history:', error);
    res.status(500).json({ error: 'Failed to read deployment history' });
  }
});

// Delete artifacts (requires validation + authentication + rate limiting)
router.post('/artifacts/delete', validateDeleteArtifacts, deployLimiter, ensureAuthenticated, async (req, res) => {
  try {
    const { artifactKeys = [] } = req.body;

    logger.info(`Delete requested for ${artifactKeys.length} artifacts by ${req.user?.email}`);

    const result = await s3Service.deleteArtifacts(artifactKeys);

    res.json({
      success: result.status === 'success',
      ...result
    });

  } catch (error) {
    logger.error('Deletion error:', error);
    res.status(500).json({
      error: 'Deletion failed',
      message: error.message
    });
  }
});

// Get game version history from build artifacts (requires authentication)
router.get('/game-version-history', ensureAuthenticated, async (req, res) => {
  try {
    logger.info(`Version history requested by ${req.user?.email}`);

    const result = await s3Service.getGameVersionHistory();

    res.json(result);
  } catch (error) {
    logger.error('Error getting game version history:', error);
    res.status(500).json({
      error: 'Failed to get game version history',
      message: error.message
    });
  }
});

// Get comprehensive statistics (requires authentication)
router.get('/stats', ensureAuthenticated, async (req, res) => {
  try {
    logger.info(`Stats requested by ${req.user?.email}`);

    const [
      deploymentStats,
      successRate,
      deploymentTimes,
      topGames,
      systemHealth,
      deploymentTrend,
      activeGames
    ] = await Promise.all([
      statsService.getDeploymentStats(),
      statsService.getSuccessRate(),
      statsService.getDeploymentTimes(),
      statsService.getTopGames(),
      statsService.getSystemHealth(),
      statsService.getDeploymentTrend(),
      statsService.getActiveGames()
    ]);

    res.json({
      deploymentStats,
      successRate,
      deploymentTimes,
      topGames,
      systemHealth,
      deploymentTrend,
      activeGames
    });
  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

// Get file list from an artifact ZIP (requires authentication)
router.get('/artifacts/files', ensureAuthenticated, async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ error: 'Artifact key is required' });
    }

    logger.info(`Artifact file list requested for ${key} by ${req.user?.email}`);

    const files = await s3Service.getArtifactFileList(key, req);

    res.json({ files });
  } catch (error) {
    logger.error('Error getting artifact files:', error);
    res.status(500).json({
      error: 'Failed to get artifact files',
      message: error.message
    });
  }
});

module.exports = router;
