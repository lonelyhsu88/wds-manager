# WebUI Deployment System Manager

A web-based deployment system for managing and deploying build artifacts from AWS S3 build bucket to deployment bucket with automatic ZIP extraction.

## Features

- Browse and select files from AWS S3 build artifacts bucket
- Navigate through subdirectories
- Multi-select and select-all functionality
- Deploy artifacts to WebUI bucket with:
  - Automatic bucket clearing before deployment
  - ZIP file extraction during upload
  - Custom target prefix support
- Version management (starting from 1.0.1)
- Multi-architecture Docker support (amd64, arm64)
- Least-privilege IAM policy

## Prerequisites

- Node.js 18+ or Docker
- AWS Account with S3 access
- AWS CLI configured with profile `gemini-pro_ck`
- Two S3 buckets:
  - `build-artifacts-bucket` (source)
  - `deploy-webui-bucket` (destination)

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy environment file and configure:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up IAM policy:
```bash
cd aws
chmod +x setup-iam.sh
./setup-iam.sh
```

4. Start development server:
```bash
npm run dev
```

5. Access the UI:
```
http://localhost:3000
```

### Docker Deployment

#### Using docker-compose (Recommended)

1. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

2. Start the service:
```bash
docker-compose up -d
```

3. View logs:
```bash
docker-compose logs -f
```

4. Stop the service:
```bash
docker-compose down
```

#### Using buildx for multi-architecture

Build for multiple platforms (amd64, arm64):

```bash
chmod +x build-and-deploy.sh
./build-and-deploy.sh
```

The script will:
- Create a buildx builder if needed
- Build images for linux/amd64 and linux/arm64
- Optionally push to registry
- Start services with docker-compose

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_PROFILE` | AWS credentials profile | `gemini-pro_ck` |
| `AWS_REGION` | AWS region | `ap-northeast-1` |
| `BUILD_ARTIFACTS_BUCKET` | Source S3 bucket | `build-artifacts-bucket` |
| `DEPLOY_WEBUI_BUCKET` | Destination S3 bucket | `deploy-webui-bucket` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SESSION_SECRET` | Session secret key | (required) |

## IAM Policy

The system requires minimal AWS permissions:

- **Read access** to build-artifacts-bucket:
  - `s3:ListBucket`
  - `s3:GetObject`
  - `s3:GetObjectVersion`

- **Full deployment access** to deploy-webui-bucket:
  - `s3:ListBucket`
  - `s3:GetObject`
  - `s3:PutObject`
  - `s3:DeleteObject`

See `aws/iam-policy.json` for the complete policy.

## API Endpoints

### GET `/api/health`
Health check endpoint

### GET `/api/version`
Get current version and history

### GET `/api/check-access`
Check bucket access permissions

### GET `/api/artifacts?prefix=<path>`
List build artifacts in specified path

### GET `/api/deployed?prefix=<path>`
List deployed files

### POST `/api/deploy`
Deploy selected artifacts
```json
{
  "artifactKeys": ["path/to/file.zip"],
  "clearBefore": true,
  "extractZip": true,
  "targetPrefix": "v1.0.0/"
}
```

### POST `/api/clear-deploy`
Clear deploy bucket
```json
{
  "prefix": "optional/path/"
}
```

### POST `/api/version/bump`
Bump version
```json
{
  "type": "patch|minor|major",
  "changes": ["Change description"]
}
```

## Project Structure

```
wds-manager/
├── src/
│   ├── app.js                 # Main application
│   ├── config/
│   │   └── aws.js            # AWS configuration
│   ├── routes/
│   │   ├── index.js          # Web routes
│   │   └── api.js            # API routes
│   ├── services/
│   │   ├── s3Service.js      # S3 operations
│   │   └── deployService.js  # Deployment logic
│   └── utils/
│       ├── logger.js         # Winston logger
│       └── versionManager.js # Version management
├── public/
│   ├── index.html            # Web UI
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js            # Frontend logic
├── aws/
│   ├── iam-policy.json       # IAM policy definition
│   └── setup-iam.sh          # IAM setup script
├── logs/                      # Application logs
├── version.json              # Version history
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Docker Compose setup
├── build-and-deploy.sh       # Multi-arch build script
└── package.json              # Dependencies

```

## Version Management

The system maintains version history in `version.json`. Version format: `MAJOR.MINOR.PATCH`

- **PATCH**: Bug fixes, minor changes
- **MINOR**: New features, backward compatible
- **MAJOR**: Breaking changes

Bump version via API:
```bash
curl -X POST http://localhost:3000/api/version/bump \
  -H "Content-Type: application/json" \
  -d '{"type": "patch", "changes": ["Fixed deployment bug"]}'
```

## Deployment Workflow

1. **Browse Artifacts**: Navigate through subdirectories in build bucket
2. **Select Files**: Choose files to deploy (supports multi-select and select-all)
3. **Configure Options**:
   - Clear bucket before deploy (recommended)
   - Extract ZIP files automatically
   - Set target prefix (optional)
4. **Deploy**: Click "Deploy Now" to start deployment
5. **Monitor**: Watch deployment progress and results

## Docker Build Options

### Build locally
```bash
docker build -t wds-manager:1.0.1 .
```

### Build multi-arch with buildx
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag wds-manager:1.0.1 \
  --push \
  .
```

### Using the build script
```bash
./build-and-deploy.sh
```

## Logging

Logs are stored in the `logs/` directory:
- `combined.log`: All logs
- `error.log`: Error logs only

View logs:
```bash
# Local
tail -f logs/combined.log

# Docker
docker-compose logs -f wds-manager
```

## Security

- Uses Helmet.js for security headers
- Session-based authentication support
- Non-root user in Docker container
- Read-only AWS credentials mount
- Least-privilege IAM policy
- Environment variable configuration

## Troubleshooting

### Cannot access S3 buckets
- Check AWS credentials: `aws s3 ls --profile gemini-pro_ck`
- Verify IAM policy is attached
- Check bucket names in `.env`

### Docker build fails
- Ensure Docker buildx is available: `docker buildx version`
- Try removing existing builder: `docker buildx rm wds-builder`

### Deployment fails
- Check logs: `docker-compose logs wds-manager`
- Verify bucket permissions
- Ensure ZIP files are valid

## Development

### Run tests
```bash
npm test
```

### Code structure
- Follow existing patterns
- Use async/await for promises
- Log important operations
- Handle errors gracefully

### Adding features
1. Update version in `package.json`
2. Add changes to `version.json`
3. Implement feature
4. Test locally
5. Build and deploy

## License

ISC

## Support

For issues and questions, please check:
1. Application logs
2. AWS CloudWatch (if enabled)
3. Docker logs
4. GitHub issues

## Version History

See `version.json` for complete version history.

Current version: **1.0.1**
