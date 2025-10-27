# WebUI Deployment System Manager

**Version**: 1.19.0
**Description**: Deploy artifacts from Jenkins build bucket to WebUI deployment bucket with SSO authentication

---

## 🚀 Quick Start

### Start Service

```bash
./run.sh
```

That's it! The script will:
- Login to AWS ECR
- Pull the latest image
- Start the service on port 3015

### Optional: Specify Version

```bash
./run.sh 1.19.0
```

---

## 📋 Features

- ✅ **Multi-Platform Support** - Works on AMD64 and ARM64 (Apple Silicon)
- ✅ **SSO Authentication** - Operations Portal SSO + Google OAuth2
- ✅ **Role-Based Access Control** - Admin, Operator, Viewer roles
- ✅ **S3 Deployment** - Deploy artifacts to WebUI bucket
- ✅ **Version Management** - Track deployment history
- ✅ **Real-time Progress** - WebSocket-based deployment tracking
- ✅ **Health Checks** - Built-in container health monitoring

---

## 🔧 Configuration

### Environment Variables

Create `.env` file from example:

```bash
cp .env.example .env
```

**Required Variables:**

```bash
# AWS Configuration
AWS_PROFILE=gemini-pro_ck
AWS_REGION=ap-east-1
BUILD_ARTIFACTS_BUCKET=jenkins-build-artfs
DEPLOY_WEBUI_BUCKET=deploy-webui-bucket

# Session Secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=your-strong-32-byte-hex-secret

# Google OAuth2
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3015/auth/google/callback

# SSO Configuration
OPS_PORTAL_URL=https://ops.ftgaming.cc
```

---

## 👥 Role Management

Edit `src/data/role-mappings.json`:

```json
{
  "emailRoleMapping": {
    "admin@example.com": ["Admin"],
    "operator@example.com": ["Operator"],
    "viewer@example.com": ["Viewer"]
  },
  "domainDefaultRoles": {
    "example.com": ["Viewer"],
    "default": ["Viewer"]
  }
}
```

**Role Permissions:**

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access |
| **Operator** | Deploy, manage artifacts, configure presets |
| **Viewer** | Read-only access |

---

## 🌐 Access

- **Local**: http://localhost:3015
- **Production**: https://wds-manager.ftgaming.cc

---

## 📊 Management Commands

```bash
# View logs
docker logs -f wds-manager

# Check status
docker ps --filter name=wds-manager

# Stop service
docker stop wds-manager

# Remove container
docker rm wds-manager
```

---

## 🔐 Authentication

### SSO Login (Operations Portal)

1. Access via Operations Portal
2. Portal redirects to: `http://wds-manager/auth/sso?token=<jwt>`
3. Automatic role assignment based on email

### Google OAuth2

1. Navigate to `/auth/google`
2. Select Google account
3. Automatic role assignment

---

## 📦 Docker Image

**ECR Repository:**
```
470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager
```

**Platforms:**
- `linux/amd64` (Intel/AMD)
- `linux/arm64` (Apple Silicon, ARM servers)

---

## 📚 Documentation

- **SSO Integration**: [SSO_INTEGRATION_v1.19.0.md](SSO_INTEGRATION_v1.19.0.md)
- **Deployment Guide**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Deployment Configuration**: [DEPLOYMENT_CONFIGURATION_GUIDE.md](DEPLOYMENT_CONFIGURATION_GUIDE.md)
- **Performance Fixes**: [PERFORMANCE_FIX_v1.17.1.md](PERFORMANCE_FIX_v1.17.1.md)
- **Bug Fixes**: [FIXES_v1.17.0.md](FIXES_v1.17.0.md)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         User (Browser)                  │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴──────────┐
    │                    │
SSO Login          Google OAuth
    │                    │
    └─────────┬──────────┘
              │
┌─────────────▼───────────────────────────┐
│     WDS Manager (Express.js)            │
│  - Role-Based Access Control            │
│  - Session Management                   │
│  - WebSocket Progress Tracking          │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴──────────┐
    │                    │
Build Bucket      Deploy Bucket
(jenkins-build)    (deploy-webui)
    │                    │
    └────── S3 ──────────┘
```

---

## 🐛 Troubleshooting

### Service won't start

```bash
# Check Docker is running
docker info

# Check logs
docker logs wds-manager

# Check AWS credentials
aws sts get-caller-identity --profile gemini-pro_ck
```

### Health check failing

```bash
# Test health endpoint
curl http://localhost:3015/api/health

# Expected response:
# {"status":"ok","timestamp":"...","uptime":123.45}
```

### ECR login fails

```bash
# Login manually
AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | \
  docker login --username AWS --password-stdin \
  470013648166.dkr.ecr.ap-east-1.amazonaws.com
```

---

## 🔄 Version History

- **v1.19.0** (2025-10-27)
  - Added SSO integration with Operations Portal
  - Implemented Role-Based Access Control (RBAC)
  - Multi-platform Docker image (AMD64 + ARM64)
  - Simplified `run.sh` script

- **v1.18.0** (2025-10-27)
  - Removed Favorites section
  - Removed Search Games feature
  - Removed game names from category display
  - Fixed Clear Deploy Bucket functionality

- **v1.17.1** (2025-10-26)
  - Fixed Deploy Now button 10-20 second delay
  - Added deployed versions cache
  - Parallel S3 operations (20-1000x faster)

- **v1.17.0** (2025-10-26)
  - Fixed version.txt creation after deployment
  - Added version history caching
  - Improved rollback display

---

## 📞 Support

**Logs Location:**
- Container: `docker logs wds-manager`
- Application: `./logs/combined.log`, `./logs/error.log`

**Health Endpoint:**
```bash
curl http://localhost:3015/api/health
```

**Version Info:**
```bash
curl http://localhost:3015/api/version
```

---

## 📄 License

ISC

---

**Maintained by**: DevOps Team
**Last Updated**: 2025-10-27
