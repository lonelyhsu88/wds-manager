# 線上環境部署指南 (v1.19.3)

## 問題診斷

根據你提供的線上環境資訊，發現以下問題：

### 1. ❌ 版本顯示 `vundefined`
**原因**: 線上的 `version.json` 格式錯誤或不完整

**解決方案**: 刪除舊的 version.json，讓 run.sh 自動創建正確格式

### 2. ❌ Buckets 顯示 "Not Accessible"
**可能原因**:
- AWS 憑證問題
- IAM 權限不足
- NODE_ENV 設置為 development 而非 production

### 3. ⚠️ 環境變數配置問題
- `NODE_ENV=development` 應該改為 `production`
- `FORCE_SECURE_COOKIE=false` 應該改為 `true`
- `APP_VERSION=1.19.2` 應該更新為 `1.19.3`

---

## 完整部署步驟

### 步驟 1: 備份現有配置

```bash
# SSH 到線上伺服器
ssh your-server

# 進入專案目錄
cd /path/to/wds-manager

# 備份現有配置
cp .env .env.backup.$(date +%Y%m%d)
cp version.json version.json.backup.$(date +%Y%m%d) 2>/dev/null || true
```

### 步驟 2: 更新 .env 文件

```bash
# 編輯 .env 文件
nano .env
```

**必須修改的項目**:
```bash
# 1. 更新版本
APP_VERSION=1.19.3

# 2. 設置為生產環境
NODE_ENV=production

# 3. 啟用安全 Cookie
FORCE_SECURE_COOKIE=true

# 4. 確認 MOCK_SSO_EMAIL 為空（生產環境不使用 Mock SSO）
MOCK_SSO_EMAIL=

# 5. 確認域名正確
GOOGLE_CALLBACK_URL=https://wds-manager.ftgaming.cc/auth/google/callback
ALLOWED_ORIGINS=https://wds-manager.ftgaming.cc
```

### 步驟 3: 修復 version.json

**選項 A: 刪除讓 run.sh 重新創建** (簡單但會失去歷史記錄)
```bash
rm version.json
```

**選項 B: 從本地複製正確的 version.json** (推薦)
```bash
# 在本地執行
scp version.json your-server:/path/to/wds-manager/

# 或在線上手動創建正確格式
cat > version.json << 'EOF'
{
  "version": "1.19.3",
  "history": [
    {
      "version": "1.19.3",
      "date": "2025-10-27",
      "changes": [
        "Fixed run.sh to create proper version.json format when file is missing",
        "Added diagnose-deployment.sh script for troubleshooting",
        "Improved version.json initialization with correct structure (version + history)"
      ]
    }
  ]
}
EOF
```

### 步驟 4: 檢查 AWS 憑證

```bash
# 檢查 AWS 憑證目錄是否存在
ls -la ~/.aws/

# 應該看到:
# - ~/.aws/credentials
# - ~/.aws/config

# 測試 AWS 連接
AWS_PROFILE=gemini-pro_ck aws s3 ls s3://jenkins-build-artfs/ --region ap-east-1 | head -5

# 如果失敗，檢查憑證配置
cat ~/.aws/credentials
cat ~/.aws/config
```

### 步驟 5: 部署新版本

```bash
# 登入 ECR
AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | \
  docker login --username AWS --password-stdin 470013648166.dkr.ecr.ap-east-1.amazonaws.com

# 停止並刪除舊容器
docker stop wds-manager
docker rm wds-manager

# 使用 run.sh 部署
./run.sh

# 或手動指定版本
./run.sh 1.19.3
```

### 步驟 6: 驗證部署

```bash
# 1. 檢查容器狀態
docker ps --filter name=wds-manager

# 應該看到: STATUS 為 "Up ... (healthy)"

# 2. 檢查版本 API
curl -s http://localhost:3015/api/version | python3 -m json.tool

# 應該返回:
# {
#   "version": "1.19.3",
#   "history": [...]
# }

# 3. 檢查健康狀態
curl -s http://localhost:3015/api/health | python3 -m json.tool

# 應該返回:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "version": "1.19.3"
# }

# 4. 檢查 bucket 連接
curl -s http://localhost:3015/api/check-access | python3 -m json.tool

# 應該返回兩個 bucket 都是 accessible: true

# 5. 查看日誌
docker logs wds-manager --tail 50

# 應該看到:
# - "WebUI Deployment System Manager started on port 3015"
# - "Environment: production"
# - "Build artifacts bucket (jenkins-build-artfs): accessible"
# - "Deploy WebUI bucket (deploy-webui-bucket): accessible"
```

### 步驟 7: 運行診斷腳本（可選）

```bash
# 複製診斷腳本到線上
scp diagnose-deployment.sh your-server:/path/to/wds-manager/

# 在線上執行
chmod +x diagnose-deployment.sh
./diagnose-deployment.sh
```

---

## 常見問題排查

### 問題 1: version.json 格式錯誤

**症狀**: 版本顯示 `vundefined`，API 返回 `{"history": []}`

**診斷**:
```bash
cat version.json | python3 -m json.tool
```

**修復**:
```bash
# 刪除錯誤的文件
rm version.json

# 從本地複製或讓 run.sh 重新創建
./run.sh
```

### 問題 2: Buckets 顯示 "Not Accessible"

**症狀**: 前端顯示 bucket status 為 "Not Accessible"

**可能原因**:
1. AWS 憑證問題
2. IAM 權限不足
3. Bucket 名稱錯誤
4. 網路/防火牆問題

**診斷步驟**:

```bash
# 1. 測試 AWS CLI 連接
AWS_PROFILE=gemini-pro_ck aws sts get-caller-identity

# 2. 測試 S3 訪問
AWS_PROFILE=gemini-pro_ck aws s3 ls s3://jenkins-build-artfs/ --region ap-east-1
AWS_PROFILE=gemini-pro_ck aws s3 ls s3://deploy-webui-bucket/ --region ap-east-1

# 3. 檢查容器內的 AWS 憑證
docker exec wds-manager ls -la /home/nodejs/.aws/

# 4. 檢查容器環境變數
docker exec wds-manager env | grep AWS

# 5. 查看容器日誌中的 S3 錯誤
docker logs wds-manager 2>&1 | grep -i "s3\|bucket\|access"
```

**修復方案**:

**方案 A: 重新掛載 AWS 憑證**
```bash
# 確保 ~/.aws 目錄存在且有正確的檔案
ls -la ~/.aws/

# 重啟容器
docker restart wds-manager
```

**方案 B: 使用 EC2 IAM Role** (如果在 EC2 上運行)
```bash
# 編輯 run.sh，移除 AWS Profile 要求
# 或在 .env 中刪除 AWS_PROFILE

# 重新部署
./run.sh
```

**方案 C: 檢查 IAM 權限**
- 確保 IAM 用戶/角色有以下權限:
  - `s3:ListBucket` on jenkins-build-artfs
  - `s3:GetObject` on jenkins-build-artfs/*
  - `s3:ListBucket` on deploy-webui-bucket
  - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on deploy-webui-bucket/*

### 問題 3: SSO 登入失敗

**症狀**: 從 Operations Portal 登入後顯示 "SSO Verification Failed"

**診斷**:
```bash
# 查看 SSO 相關日誌
docker logs wds-manager 2>&1 | grep -i "sso\|verify"
```

**檢查項目**:
1. `NODE_ENV=production` (不是 development)
2. `MOCK_SSO_EMAIL=` (空值)
3. `OPS_PORTAL_URL=https://ops.ftgaming.cc`

### 問題 4: Cookie/Session 問題

**症狀**: 登入後立即被登出，或無法保持登入狀態

**檢查**:
```bash
# 確認以下環境變數
grep -E "NODE_ENV|FORCE_SECURE_COOKIE|ALLOWED_ORIGINS" .env
```

**必須設置**:
```bash
NODE_ENV=production
FORCE_SECURE_COOKIE=true
ALLOWED_ORIGINS=https://wds-manager.ftgaming.cc
```

---

## 完整的 .env 範本（生產環境）

```bash
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
```

---

## 驗證檢查清單

部署完成後，請確認以下項目：

- [ ] 容器狀態為 `healthy`
- [ ] 版本 API 返回 `1.19.3`
- [ ] Build Artifacts Bucket 顯示 "Accessible"
- [ ] Deploy WebUI Bucket 顯示 "Accessible"
- [ ] 可以從 Operations Portal SSO 登入
- [ ] 右上角版本號顯示 `v1.19.3`
- [ ] Dashboard 可以正常加載統計數據
- [ ] 可以瀏覽 artifacts
- [ ] 可以執行部署操作

---

## 支援

如果遇到問題：

1. **查看日誌**: `docker logs wds-manager --tail 100`
2. **運行診斷**: `./diagnose-deployment.sh`
3. **檢查健康**: `curl http://localhost:3015/api/health`
4. **測試 AWS**: `AWS_PROFILE=gemini-pro_ck aws s3 ls`

---

**最後更新**: 2025-10-27
**當前版本**: 1.19.3
