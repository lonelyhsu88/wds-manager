# WDS Manager Deployment Guide

**Version**: 1.19.0
**Last Updated**: 2025-10-27

---

## 📦 Docker Images

### Multi-Platform Support

The WDS Manager is built for both **AMD64** and **ARM64** architectures.

**ECR Repository:**
```
470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager
```

**Available Tags:**
- `1.19.0` - Current version
- `latest` - Latest stable version

---

## 🚀 Quick Start with run.sh

The easiest way to manage the service is using the `run.sh` script:

```bash
# Start the service (pulls from ECR automatically)
./run.sh start

# Check service status
./run.sh status

# View logs
./run.sh logs

# Restart the service
./run.sh restart

# Stop the service
./run.sh stop
```

---

## 📋 run.sh Commands Reference

### Start Service
```bash
./run.sh start
```
- Checks Docker is running
- Logs in to AWS ECR
- Pulls latest image
- Starts the service
- Shows status

### Stop Service
```bash
./run.sh stop
```
- Stops and removes containers
- Removes networks

### Restart Service
```bash
./run.sh restart
```
- Restarts the running container
- Shows updated status

### Show Status
```bash
./run.sh status
```
- Shows container status
- Shows health check status
- Shows exposed ports
- Shows image information

### View Logs
```bash
./run.sh logs
```
- Shows service logs in follow mode
- Press `Ctrl+C` to exit

### Pull Latest Image
```bash
./run.sh pull
```
- Logs in to AWS ECR
- Pulls latest image from registry
- Shows image digest

### Rebuild Local Image
```bash
./run.sh rebuild
```
- Builds image locally from source
- Useful for development

---

## 🔧 Manual Deployment

### Step 1: Login to AWS ECR

```bash
AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | \
  docker login --username AWS --password-stdin \
  470013648166.dkr.ecr.ap-east-1.amazonaws.com
```

### Step 2: Pull Image

```bash
docker pull 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:1.19.0
```

### Step 3: Start with Docker Compose

```bash
docker compose up -d
```

### Step 4: Verify

```bash
docker ps --filter "name=wds-manager"
```

---

## 🏗️ Building and Pushing New Images

### Build Multi-Platform Image

```bash
# Build and push to ECR
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:1.19.0 \
  -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:latest \
  --push .
```

### Build for Specific Platform

**AMD64 only:**
```bash
docker buildx build \
  --platform linux/amd64 \
  -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:1.19.0-amd64 \
  --push .
```

**ARM64 only:**
```bash
docker buildx build \
  --platform linux/arm64 \
  -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:1.19.0-arm64 \
  --push .
```

---

## 🌐 Environment Configuration

### Required Environment Variables

Create a `.env` file with the following:

```bash
# Application
APP_NAME=webui-deployment-system-manager
APP_VERSION=1.19.0
PORT=3015
NODE_ENV=production
LOG_LEVEL=info

# AWS
AWS_PROFILE=gemini-pro_ck
AWS_REGION=ap-east-1
BUILD_ARTIFACTS_BUCKET=jenkins-build-artfs
DEPLOY_WEBUI_BUCKET=deploy-webui-bucket

# Session (IMPORTANT: Use a strong random secret)
SESSION_SECRET=<strong-32-byte-hex-secret>

# Google OAuth2
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback
ALLOWED_EMAIL_DOMAINS=your-domain.com

# SSO (Operations Portal)
OPS_PORTAL_URL=https://ops.ftgaming.cc
SSO_VERIFY_PATH=/api/sso/verify
SSO_VERIFY_TIMEOUT_MS=5000

# CORS
ALLOWED_ORIGINS=https://your-domain.com,https://ops.ftgaming.cc

# Security
FORCE_SECURE_COOKIE=true

# Docker Registry
DOCKER_REGISTRY=470013648166.dkr.ecr.ap-east-1.amazonaws.com
```

### Generate Strong Session Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🔐 AWS Credentials

The service requires AWS credentials to access S3 buckets.

### Using AWS Profile (Recommended)

Mount your AWS credentials directory:

```yaml
volumes:
  - ~/.aws:/home/nodejs/.aws:ro
```

Set the profile in `.env`:
```bash
AWS_PROFILE=gemini-pro_ck
```

### Using Environment Variables

Alternatively, set AWS credentials directly:

```bash
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_REGION=ap-east-1
```

---

## 🏥 Health Check

The service includes a health check endpoint:

```bash
curl http://localhost:3015/api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-27T02:17:22.000Z",
  "uptime": 123.45
}
```

**Docker Health Check:**
- Interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3
- Start period: 10 seconds

---

## 📊 Monitoring

### View Container Logs

```bash
# Using run.sh
./run.sh logs

# Using docker
docker logs -f wds-manager

# Last 100 lines
docker logs --tail 100 wds-manager
```

### Check Container Stats

```bash
docker stats wds-manager
```

### Inspect Container

```bash
docker inspect wds-manager
```

---

## 🔄 Upgrading

### Upgrade to New Version

```bash
# Pull new version
./run.sh pull

# Restart with new image
./run.sh restart

# Verify
./run.sh status
```

### Rollback to Previous Version

```bash
# Stop current version
./run.sh stop

# Update .env to previous version
# APP_VERSION=1.18.0

# Start with previous version
./run.sh start
```

---

## 🐛 Troubleshooting

### Service Won't Start

**Check Docker:**
```bash
docker info
```

**Check Logs:**
```bash
./run.sh logs
```

**Check Environment:**
```bash
cat .env | grep -v "SECRET\|PASSWORD"
```

### ECR Login Fails

**Check AWS Profile:**
```bash
AWS_PROFILE=gemini-pro_ck aws sts get-caller-identity
```

**Check ECR Permissions:**
```bash
AWS_PROFILE=gemini-pro_ck aws ecr describe-repositories \
  --repository-names wds-manager --region ap-east-1
```

### Health Check Failing

**Check Port:**
```bash
curl http://localhost:3015/api/health
```

**Check Logs:**
```bash
docker logs wds-manager | grep -i error
```

**Check AWS Credentials:**
```bash
docker exec wds-manager env | grep AWS
```

### Container Exits Immediately

**Check Logs:**
```bash
docker logs wds-manager
```

**Common Issues:**
- Missing `.env` file
- Invalid AWS credentials
- Port 3015 already in use
- Insufficient permissions

---

## 📝 Docker Compose Configuration

### Production Setup

```yaml
version: '3.8'

services:
  wds-manager:
    image: 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:1.19.0
    container_name: wds-manager
    restart: unless-stopped
    ports:
      - "3015:3015"
    env_file:
      - .env
    volumes:
      - ~/.aws:/home/nodejs/.aws:ro
      - ./logs:/app/logs
      - ./version.json:/app/version.json
    networks:
      - wds-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3015/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

networks:
  wds-network:
    driver: bridge
```

### Development Setup

For local development with build:

```yaml
services:
  wds-manager:
    build:
      context: .
      dockerfile: Dockerfile
    # ... rest of configuration
```

---

## 🔒 Security Best Practices

### 1. Session Secret
- Use strong random 32-byte hex string
- Never commit to version control
- Rotate periodically

### 2. HTTPS in Production
- Set `FORCE_SECURE_COOKIE=true`
- Use reverse proxy (nginx/traefik) for TLS
- Configure proper CORS origins

### 3. AWS Credentials
- Use IAM roles when possible
- Limit S3 bucket permissions
- Use read-only mount for credentials

### 4. Role Mappings
- Review `src/data/role-mappings.json`
- Ensure at least one Admin user
- Use principle of least privilege

---

## 📞 Support

### Logs Location

**Container Logs:**
```bash
./run.sh logs
```

**Application Logs:**
```bash
cat logs/app.log
cat logs/error.log
```

### Health Endpoint

```bash
curl http://localhost:3015/api/health
```

### Version Info

```bash
curl http://localhost:3015/api/version
```

---

## 📚 Additional Resources

- **SSO Integration Guide**: `SSO_INTEGRATION_v1.19.0.md`
- **Deployment Configuration**: `DEPLOYMENT_CONFIGURATION_GUIDE.md`
- **Performance Fixes**: `PERFORMANCE_FIX_v1.17.1.md`

---

**Last Updated**: 2025-10-27
**Version**: 1.19.0
**Maintainer**: DevOps Team
