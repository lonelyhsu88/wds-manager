const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS SDK
const awsConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-1',
  maxRetries: 3,
  httpOptions: {
    timeout: 300000, // 5 minutes
    connectTimeout: 10000 // 10 seconds
  }
};

// Use profile if specified
if (process.env.AWS_PROFILE) {
  const credentials = new AWS.SharedIniFileCredentials({
    profile: process.env.AWS_PROFILE
  });
  AWS.config.credentials = credentials;
}

AWS.config.update(awsConfig);

// Parse upload configuration
const uploadConcurrency = parseInt(process.env.UPLOAD_CONCURRENCY) || 10;
const uploadPartSize = parseInt(process.env.UPLOAD_PART_SIZE) || 10 * 1024 * 1024; // 10MB default
const useAccelerateEndpoint = process.env.USE_ACCELERATE_ENDPOINT === 'true';

// Create S3 client with high-speed upload configuration
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
  useAccelerateEndpoint: useAccelerateEndpoint,
  // Managed upload configuration for better performance
  s3Options: {
    region: awsConfig.region
  }
});

// Bucket configuration
const buckets = {
  buildArtifacts: process.env.BUILD_ARTIFACTS_BUCKET || 'build-artifacts-bucket',
  deployWebUI: process.env.DEPLOY_WEBUI_BUCKET || 'deploy-webui-bucket'
};

// Upload configuration
const uploadConfig = {
  concurrency: uploadConcurrency,
  partSize: uploadPartSize,
  queueSize: uploadConcurrency
};

module.exports = {
  s3,
  buckets,
  uploadConfig,
  AWS
};
