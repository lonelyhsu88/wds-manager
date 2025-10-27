#!/usr/bin/env bash
# WDS Manager 線上環境一鍵修復腳本
# 域名: https://wds-manager.ftgaming.cc

set -e

echo "=== WDS Manager 線上環境修復腳本 ==="
echo ""
echo "此腳本將修復以下問題："
echo "  1. version.json 格式錯誤"
echo "  2. AWS 憑證權限問題"
echo "  3. 更新到 v1.19.3"
echo "  4. 設置為生產環境模式"
echo ""
read -p "確定要繼續嗎？ (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo ""
echo "📋 步驟 1: 備份現有配置"
echo "----------------------------------------"
BACKUP_DIR="backup.$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/.env" 2>/dev/null || echo "⚠️  .env 不存在"
cp version.json "$BACKUP_DIR/version.json" 2>/dev/null || echo "⚠️  version.json 不存在"
echo "✅ 備份完成: $BACKUP_DIR"

echo ""
echo "🔧 步驟 2: 修復 AWS 憑證權限"
echo "----------------------------------------"
if [[ -d ~/.aws ]]; then
    chmod -R 755 ~/.aws
    chmod 644 ~/.aws/credentials 2>/dev/null || true
    chmod 644 ~/.aws/config 2>/dev/null || true
    echo "✅ AWS 憑證權限已修復"
else
    echo "⚠️  找不到 ~/.aws 目錄"
fi

echo ""
echo "📝 步驟 3: 創建正確的 version.json"
echo "----------------------------------------"
cat > version.json << 'EOF'
{
  "version": "1.19.3",
  "history": [
    {
      "version": "1.19.3",
      "date": "2025-10-27",
      "changes": [
        "Fixed run.sh to create proper version.json format when file is missing",
        "Fixed AWS credentials permission issues",
        "Updated production environment configuration",
        "Added diagnose-deployment.sh script for troubleshooting"
      ]
    },
    {
      "version": "1.19.2",
      "date": "2025-10-27",
      "changes": [
        "Updated all HTML version badges to display correct version",
        "Fixed version display consistency across all pages"
      ]
    },
    {
      "version": "1.19.1",
      "date": "2025-10-27",
      "changes": [
        "Fixed SSO verification with Operations Portal",
        "Updated SSO service to correctly parse Portal response",
        "SSO login from https://ops.ftgaming.cc now works correctly"
      ]
    },
    {
      "version": "1.19.0",
      "date": "2025-10-27",
      "changes": [
        "Added SSO integration with Operations Portal",
        "Implemented complete RBAC system",
        "Multi-platform Docker image support"
      ]
    }
  ]
}
EOF
echo "✅ version.json 已創建"

# 確保 version.json 有正確的權限
chmod 666 version.json
echo "✅ version.json 權限已設置 (666)"

echo ""
echo "⚙️  步驟 4: 更新 .env 配置為生產環境"
echo "----------------------------------------"
cat > .env << 'EOF'
# Application Configuration
APP_NAME=webui-deployment-system-manager
APP_VERSION=1.19.3

# AWS Configuration
AWS_PROFILE=gemini-pro_ck
AWS_REGION=ap-east-1

# S3 Buckets
BUILD_ARTIFACTS_BUCKET=jenkins-build-artfs
DEPLOY_WEBUI_BUCKET=deploy-webui-bucket

# Server Configuration
PORT=3015
NODE_ENV=production
LOG_LEVEL=info

# Session Configuration
SESSION_SECRET=2bfd44d5fe53f75dd6da379fe13ba2d36ce55f81c964ecf08408723bb71b50ff

# Google OAuth2 Configuration
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_CALLBACK_URL=https://wds-manager.ftgaming.cc/auth/google/callback
ALLOWED_EMAIL_DOMAINS=jvd.tw
ALLOWED_EMAILS=

# SSO Configuration (Operations Portal)
OPS_PORTAL_URL=https://ops.ftgaming.cc
SSO_VERIFY_PATH=/api/sso/verify
SSO_VERIFY_TIMEOUT_MS=5000
MOCK_SSO_EMAIL=

# CORS Configuration
ALLOWED_ORIGINS=https://wds-manager.ftgaming.cc

# Security
FORCE_SECURE_COOKIE=true

# Deployment Configuration
DEFAULT_CLEAR_BEFORE_DEPLOY=true
DEFAULT_EXTRACT_ZIP=true
DEFAULT_TARGET_PREFIX=

# High-Speed Upload Configuration
UPLOAD_CONCURRENCY=20
UPLOAD_PART_SIZE=10485760
USE_ACCELERATE_ENDPOINT=false
MAX_PARALLEL_ARTIFACTS=5

# Docker Registry Configuration
DOCKER_REGISTRY=470013648166.dkr.ecr.ap-east-1.amazonaws.com
DOCKER_IMAGE_NAME=wds-manager
BUILD_PLATFORMS=linux/amd64,linux/arm64
EOF
echo "✅ .env 已更新為生產環境配置"

echo ""
echo "🐳 步驟 5: 停止舊容器"
echo "----------------------------------------"
if docker ps -q --filter name=wds-manager | grep -q .; then
    docker stop wds-manager
    docker rm wds-manager
    echo "✅ 舊容器已停止並移除"
else
    echo "ℹ️  沒有運行中的容器"
fi

echo ""
echo "🔐 步驟 6: 登入 AWS ECR"
echo "----------------------------------------"
AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | \
  docker login --username AWS --password-stdin 470013648166.dkr.ecr.ap-east-1.amazonaws.com
echo "✅ ECR 登入成功"

echo ""
echo "🚀 步驟 7: 拉取並啟動新版本 (1.19.3)"
echo "----------------------------------------"
./run.sh

echo ""
echo "⏳ 等待容器啟動..."
sleep 5

echo ""
echo "🔍 步驟 8: 驗證部署"
echo "----------------------------------------"

# 檢查容器狀態
echo "容器狀態:"
docker ps --filter name=wds-manager --format "  {{.Names}}: {{.Status}}"

# 檢查版本 API
echo ""
echo "版本 API:"
VERSION_RESPONSE=$(curl -s http://localhost:3015/api/version)
VERSION=$(echo "$VERSION_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('version', 'N/A'))" 2>/dev/null || echo "N/A")
echo "  當前版本: $VERSION"

# 檢查健康狀態
echo ""
echo "健康檢查:"
HEALTH_RESPONSE=$(curl -s http://localhost:3015/api/health)
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'N/A'))" 2>/dev/null || echo "N/A")
echo "  健康狀態: $HEALTH_STATUS"

# 檢查日誌中的錯誤
echo ""
echo "檢查錯誤日誌:"
ERROR_COUNT=$(docker logs wds-manager 2>&1 | grep -i "error\|fail" | grep -v "npm warn" | wc -l | tr -d ' ')
if [[ "$ERROR_COUNT" -gt 0 ]]; then
    echo "  ⚠️  發現 $ERROR_COUNT 個錯誤，查看日誌:"
    echo "  docker logs wds-manager --tail 50"
else
    echo "  ✅ 無錯誤"
fi

echo ""
echo "========================================="
echo "✅ 修復完成！"
echo "========================================="
echo ""
echo "📊 部署資訊:"
echo "  - 版本: 1.19.3"
echo "  - 環境: production"
echo "  - 域名: https://wds-manager.ftgaming.cc"
echo "  - 本地: http://localhost:3015"
echo ""
echo "🔍 驗證步驟:"
echo "  1. 訪問: https://wds-manager.ftgaming.cc"
echo "  2. 檢查右上角版本號應顯示 v1.19.3"
echo "  3. 檢查 Build Artifacts Bucket 狀態"
echo "  4. 檢查 Deploy WebUI Bucket 狀態"
echo "  5. 測試 SSO 登入: https://ops.ftgaming.cc"
echo ""
echo "📝 查看日誌:"
echo "  docker logs -f wds-manager"
echo ""
echo "🔧 如果仍有問題，運行診斷:"
echo "  ./diagnose-deployment.sh"
echo ""
