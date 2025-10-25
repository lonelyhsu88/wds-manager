const express = require('express');
const router = express.Router();
const s3Service = require('../services/s3Service');
const deployService = require('../services/deployService');
const versionManager = require('../utils/versionManager');
const logger = require('../utils/logger');

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: require('../../package.json').version
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

// Check bucket access
router.get('/check-access', async (req, res) => {
  try {
    const { s3, buckets } = require('../config/aws');

    const buildAccess = await s3Service.checkBucketAccess(buckets.buildArtifacts);
    const deployAccess = await s3Service.checkBucketAccess(buckets.deployWebUI);

    res.json({
      buildArtifactsBucket: {
        name: buckets.buildArtifacts,
        accessible: buildAccess
      },
      deployWebUIBucket: {
        name: buckets.deployWebUI,
        accessible: deployAccess
      }
    });
  } catch (error) {
    logger.error('Error checking bucket access:', error);
    res.status(500).json({ error: 'Failed to check bucket access' });
  }
});

// List build artifacts
router.get('/artifacts', async (req, res) => {
  try {
    const { prefix = '' } = req.query;
    const result = await s3Service.listBuildArtifacts(prefix);
    res.json(result);
  } catch (error) {
    logger.error('Error listing artifacts:', error);
    res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// List deployed files
router.get('/deployed', async (req, res) => {
  try {
    const { prefix = '' } = req.query;
    const files = await s3Service.listDeployedFiles(prefix);
    res.json({ files });
  } catch (error) {
    logger.error('Error listing deployed files:', error);
    res.status(500).json({ error: 'Failed to list deployed files' });
  }
});

// Deploy artifacts with real-time progress
router.post('/deploy', async (req, res) => {
  try {
    const {
      artifactKeys = [],
      clearBefore = true,
      extractZip = true,
      targetPrefix = ''
    } = req.body;

    // Validation
    if (!Array.isArray(artifactKeys) || artifactKeys.length === 0) {
      return res.status(400).json({ error: 'artifactKeys must be a non-empty array' });
    }

    logger.info(`Deployment requested for ${artifactKeys.length} artifacts`);

    // Get Socket.IO instance
    const io = req.app.get('io');

    // Start deployment with progress callback
    const result = await deployService.deploy(artifactKeys, {
      clearBefore,
      extractZip,
      targetPrefix
    }, (progress) => {
      // Emit progress to all connected clients
      io.emit('deployProgress', progress);
    });

    // Emit completion
    io.emit('deployComplete', result);

    res.json({
      success: result.status === 'success' || result.status === 'partial_success',
      ...result
    });

  } catch (error) {
    logger.error('Deployment error:', error);

    // Emit error
    const io = req.app.get('io');
    io.emit('deployError', { error: error.message });

    res.status(500).json({
      error: 'Deployment failed',
      message: error.message
    });
  }
});

// Clear deploy bucket
router.post('/clear-deploy', async (req, res) => {
  try {
    const { prefix = '' } = req.body;
    const result = await s3Service.clearDeployBucket(prefix);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error clearing deploy bucket:', error);
    res.status(500).json({ error: 'Failed to clear deploy bucket' });
  }
});

// Bump version
router.post('/version/bump', async (req, res) => {
  try {
    const { type = 'patch', changes = [] } = req.body;

    if (!['major', 'minor', 'patch'].includes(type)) {
      return res.status(400).json({ error: 'Invalid version bump type' });
    }

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

// Read game versions from version.txt files
router.get('/game-versions', async (req, res) => {
  try {
    const versions = await s3Service.readGameVersions();
    res.json({ versions });
  } catch (error) {
    logger.error('Error reading game versions:', error);
    res.status(500).json({ error: 'Failed to read game versions' });
  }
});

module.exports = router;
