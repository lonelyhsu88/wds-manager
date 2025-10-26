/**
 * Middleware to override S3 bucket names from session storage
 * Allows users to temporarily change buckets without modifying .env
 */

const logger = require('../utils/logger');

function bucketOverrideMiddleware(req, res, next) {
  // Get custom buckets from session storage (passed via headers)
  const customBuildBucket = req.headers['x-custom-build-bucket'];
  const customDeployBucket = req.headers['x-custom-deploy-bucket'];

  // Store in request object for use by services
  req.customBuckets = {
    build: customBuildBucket || null,
    deploy: customDeployBucket || null
  };

  // Log if custom buckets are being used
  if (customBuildBucket) {
    logger.info(`Using custom build bucket: ${customBuildBucket}`, {
      user: req.user?.email,
      service: 'bucket-override'
    });
  }

  if (customDeployBucket) {
    logger.info(`Using custom deploy bucket: ${customDeployBucket}`, {
      user: req.user?.email,
      service: 'bucket-override'
    });
  }

  next();
}

module.exports = bucketOverrideMiddleware;
