# WebUI Deployment System Manager - 快速啟動指南

## 系統簡介

WebUI Deployment System Manager 是一個用於管理和部署 AWS S3 建置產物的網頁系統。

### 主要功能

1. 瀏覽 AWS S3 build-artifacts-bucket 中的檔案
2. 選擇子目錄和多個檔案
3. 自動解壓 ZIP 檔案並部署到 deploy-webui-bucket
4. 版本管理（從 1.0.1 開始）
5. 使用 Docker buildx 支援多架構部署

## 前置要求

- Node.js 18+ 或 Docker
- AWS CLI 已配置 profile: `gemini-pro_ck`
- 兩個 S3 buckets（需要在 .env 中配置實際名稱）

## 快速開始

### 1. 配置環境變數

所有配置都在 `.env` 檔案中：

```bash
# 已經創建好 .env 檔案，請根據實際情況修改：

# Application Configuration
APP_VERSION=1.0.1              # 當前版本號

# AWS Configuration
AWS_PROFILE=gemini-pro_ck      # AWS credentials profile
AWS_REGION=ap-northeast-1      # AWS 區域

# S3 Buckets（請修改為實際的 bucket 名稱）
BUILD_ARTIFACTS_BUCKET=build-artifacts-bucket  # 來源 bucket
DEPLOY_WEBUI_BUCKET=deploy-webui-bucket       # 目標 bucket

# Server Configuration
PORT=3015                      # 服務埠號
NODE_ENV=development           # 環境（development/production）

# Session Configuration
SESSION_SECRET=<自動生成>      # Session 密鑰

# Deployment Configuration
DEFAULT_CLEAR_BEFORE_DEPLOY=true  # 部署前清空目標 bucket
DEFAULT_EXTRACT_ZIP=true          # 自動解壓 ZIP 檔案

# Docker Configuration
DOCKER_IMAGE_NAME=wds-manager     # Docker 映像名稱
BUILD_PLATFORMS=linux/amd64,linux/arm64  # 建置平台
```

### 2. 設置 IAM 權限（首次使用）

```bash
cd aws
chmod +x setup-iam.sh
./setup-iam.sh
```

這將創建具有最小權限的 IAM policy：
- 讀取 build-artifacts-bucket
- 完整管理 deploy-webui-bucket

### 3. 本地開發模式

```bash
# 安裝依賴
npm install

# 啟動開發伺服器（支援熱重載）
npm run dev

# 或直接啟動
npm start
```

訪問：http://localhost:3015

### 4. Docker 部署模式

#### 方法 A：使用 docker-compose（推薦）

```bash
# 啟動服務
docker-compose up -d

# 查看日誌
docker-compose logs -f wds-manager

# 停止服務
docker-compose down
```

#### 方法 B：使用 buildx 建置多架構映像

```bash
# 自動化建置和部署腳本
chmod +x build-and-deploy.sh
./build-and-deploy.sh
```

這個腳本會：
1. 從 .env 讀取配置（版本號、平台等）
2. 創建 buildx builder
3. 建置 linux/amd64 和 linux/arm64 映像
4. 可選擇推送到 registry 或本地載入
5. 啟動 docker-compose

## 使用界面

### 瀏覽檔案

1. 主畫面會顯示 build-artifacts-bucket 的根目錄
2. 點擊資料夾圖示進入子目錄
3. 使用麵包屑導航返回上層目錄

### 選擇檔案

- 點擊檔案項目或勾選框選擇單個檔案
- 使用「全選」按鈕選擇當前目錄所有檔案
- 使用「取消全選」清除選擇
- 右側面板顯示已選檔案數量

### 部署選項

- **清空 bucket**：部署前刪除目標 bucket 所有檔案（建議開啟）
- **解壓 ZIP**：自動解壓 ZIP 檔案（建議開啟）
- **目標前綴**：可選，將檔案部署到特定子目錄

### 執行部署

1. 選擇要部署的檔案
2. 配置部署選項
3. 點擊「立即部署」
4. 確認部署訊息
5. 等待部署完成

## 版本管理

### 查看版本

- 右下角顯示當前版本
- 點擊「查看歷史」查看完整版本記錄

### Bump 版本

每次修改程式碼都應該更新版本：

```bash
# 透過 API bump 版本
curl -X POST http://localhost:3015/api/version/bump \
  -H "Content-Type: application/json" \
  -d '{
    "type": "patch",
    "changes": ["修復部署錯誤"]
  }'
```

版本類型：
- `patch`: 1.0.1 → 1.0.2（錯誤修復）
- `minor`: 1.0.1 → 1.1.0（新功能）
- `major`: 1.0.1 → 2.0.0（重大變更）

記得更新 .env 中的 `APP_VERSION`。

## 常用指令

### 本地開發

```bash
npm run dev              # 開發模式（支援熱重載）
npm start                # 生產模式
```

### Docker 操作

```bash
# 啟動
docker-compose up -d

# 查看日誌
docker-compose logs -f

# 重啟服務
docker-compose restart

# 停止並移除
docker-compose down

# 重新建置
docker-compose up -d --build
```

### 建置多架構映像

```bash
# 使用腳本（推薦）
./build-and-deploy.sh

# 或手動建置
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag wds-manager:1.0.1 \
  --push \
  .
```

## 檢查狀態

### 檢查服務健康

```bash
curl http://localhost:3015/api/health
```

### 檢查版本資訊

```bash
curl http://localhost:3015/api/version
```

### 檢查 Bucket 訪問權限

```bash
curl http://localhost:3015/api/check-access
```

## 故障排除

### Bucket 無法訪問

1. 檢查 AWS credentials：
   ```bash
   aws s3 ls --profile gemini-pro_ck
   ```

2. 確認 bucket 名稱正確（在 .env 中）

3. 確認 IAM policy 已附加到使用者或角色

### Port 已被佔用

修改 .env 中的 `PORT` 值，然後重啟服務。

### Docker 建置失敗

```bash
# 移除現有 builder
docker buildx rm wds-builder

# 重新執行腳本
./build-and-deploy.sh
```

## 日誌位置

- 本地模式：`logs/combined.log`
- Docker 模式：`docker-compose logs wds-manager`

## 安全注意事項

1. **不要提交 .env 到版本控制**（已在 .gitignore 中）
2. **使用強密碼**作為 SESSION_SECRET
3. **IAM policy** 遵循最小權限原則
4. **生產環境**設置 `NODE_ENV=production`

## 項目結構

```
wds-manager/
├── .env                    # 環境配置（所有參數都在這裡）
├── .env.example            # 環境配置範例
├── package.json            # Node.js 依賴
├── version.json            # 版本歷史記錄
├── Dockerfile              # Docker 映像定義
├── docker-compose.yml      # Docker Compose 配置
├── build-and-deploy.sh     # 建置和部署腳本
├── aws/
│   ├── iam-policy.json     # IAM 權限定義
│   └── setup-iam.sh        # IAM 設置腳本
├── src/                    # 後端原始碼
│   ├── app.js              # 主應用
│   ├── config/             # 配置
│   ├── routes/             # 路由
│   ├── services/           # 服務層
│   └── utils/              # 工具函式
├── public/                 # 前端靜態檔案
│   ├── index.html          # 主頁面
│   ├── css/                # 樣式
│   └── js/                 # JavaScript
└── logs/                   # 日誌目錄
```

## 下一步

1. 修改 .env 中的 bucket 名稱為實際的 S3 buckets
2. 執行 IAM 設置腳本配置權限
3. 啟動服務並測試功能
4. 開始使用部署系統

## 支援

如有問題，請查看：
1. 應用日誌：`logs/combined.log`
2. Docker 日誌：`docker-compose logs wds-manager`
3. README.md 詳細文檔

---

**當前版本：1.0.1**
**服務埠號：3015**
**AWS Profile：gemini-pro_ck**
