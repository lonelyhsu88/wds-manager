/**
 * Environment Configuration
 * Centralized configuration management for WDS Manager
 */

require('dotenv').config();

const config = {
  // Application
  app: {
    name: process.env.APP_NAME || 'webui-deployment-system-manager',
    version: process.env.APP_VERSION || '1.18.0',
    port: process.env.PORT || 3015,
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },

  // AWS Configuration
  aws: {
    profile: process.env.AWS_PROFILE || 'gemini-pro_ck',
    region: process.env.AWS_REGION || 'ap-east-1',
    buildBucket: process.env.BUILD_ARTIFACTS_BUCKET || 'jenkins-build-artfs',
    deployBucket: process.env.DEPLOY_WEBUI_BUCKET || 'deploy-webui-bucket'
  },

  // Session Configuration
  sessionSecret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',

  // Google OAuth2 Configuration
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3015/auth/google/callback',
    allowedDomains: process.env.ALLOWED_EMAIL_DOMAINS?.split(',').map(d => d.trim()) || [],
    allowedEmails: process.env.ALLOWED_EMAILS?.split(',').map(e => e.trim()).filter(Boolean) || []
  },

  // SSO Configuration (Operations Portal)
  sso: {
    portalUrl: process.env.OPS_PORTAL_URL || 'https://ops.ftgaming.cc',
    verifyPath: process.env.SSO_VERIFY_PATH || '/api/sso/verify',
    timeoutMs: Number(process.env.SSO_VERIFY_TIMEOUT_MS || 5000),
    mockEmail: process.env.MOCK_SSO_EMAIL || ''
  },

  // CORS Configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:3015']
  },

  // Deployment Configuration
  deployment: {
    defaultClearBefore: process.env.DEFAULT_CLEAR_BEFORE_DEPLOY === 'true',
    defaultExtractZip: process.env.DEFAULT_EXTRACT_ZIP === 'true',
    defaultTargetPrefix: process.env.DEFAULT_TARGET_PREFIX || '',
    uploadConcurrency: Number(process.env.UPLOAD_CONCURRENCY || 20),
    uploadPartSize: Number(process.env.UPLOAD_PART_SIZE || 10485760),
    useAccelerateEndpoint: process.env.USE_ACCELERATE_ENDPOINT === 'true',
    maxParallelArtifacts: Number(process.env.MAX_PARALLEL_ARTIFACTS || 5)
  }
};

module.exports = config;
