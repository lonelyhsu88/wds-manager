# SSO Development Setup

## 問題說明

在開發環境中測試 SSO 功能時，會出現 "SSO Verification Failed" 錯誤，這是因為：

1. 沒有真正的 Operations Portal 可以驗證 token
2. 或者網路無法連接到 Operations Portal

## 解決方案：啟用 Mock SSO

### 選項 1: 使用 Docker Compose（本地構建）

1. **更新 `.env` 文件**:
```bash
# 設定 Mock SSO Email
MOCK_SSO_EMAIL=lonely.h@jvd.tw
NODE_ENV=development
```

2. **使用本地構建而非 ECR 映像**:

編輯 `docker-compose.yml`，註解掉 ECR 映像，啟用本地構建：

```yaml
services:
  wds-manager:
    # 註解掉 ECR 映像
    # image: ${DOCKER_REGISTRY:-470013648166.dkr.ecr.ap-east-1.amazonaws.com}/wds-manager:${APP_VERSION:-latest}

    # 啟用本地構建
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - VERSION=${APP_VERSION:-1.19.0}
```

3. **重新構建並啟動**:
```bash
docker compose down
docker compose up -d --build
```

### 選項 2: 使用 run.sh（從 ECR）

如果使用 `./run.sh` 從 ECR 拉取映像，容器內的 `.env` 文件不會自動更新。

**建議**：在生產環境使用 ECR 映像，在開發環境使用本地構建。

### 選項 3: 直接使用 Docker Run（開發測試）

```bash
# 停止現有容器
docker stop wds-manager
docker rm wds-manager

# 使用環境變數運行
docker run -d \
  --name wds-manager \
  --restart unless-stopped \
  --env-file .env \
  -e MOCK_SSO_EMAIL=lonely.h@jvd.tw \
  -e NODE_ENV=development \
  -p 3015:3015 \
  -v ~/.aws:/home/nodejs/.aws:ro \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/version.json:/app/version.json \
  wds-manager:1.19.0
```

## Mock SSO 工作原理

當設定 `MOCK_SSO_EMAIL` 並且 `NODE_ENV=development` 時：

1. **SSO 路由** (`/auth/sso?token=任何值`) 會繞過 Operations Portal 驗證
2. **自動創建用戶**：
   - Email: `MOCK_SSO_EMAIL` 的值
   - 角色: 從 `src/data/role-mappings.json` 讀取
   - Login Method: `OPS_PORTAL_SSO`

3. **測試方式**：
```bash
# 訪問任何 token 都會成功
http://localhost:3015/auth/sso?token=test123

# 會自動登入為 lonely.h@jvd.tw（Admin 角色）
```

## 測試 SSO

### 1. Mock SSO (開發環境)

```bash
# 設定環境變數
echo "MOCK_SSO_EMAIL=lonely.h@jvd.tw" >> .env
echo "NODE_ENV=development" >> .env

# 重新構建
docker compose down
docker compose up -d --build

# 測試
curl -L "http://localhost:3015/auth/sso?token=test"
# 應該重定向到首頁
```

### 2. 真實 SSO (生產環境)

```bash
# 移除 Mock SSO
MOCK_SSO_EMAIL=
NODE_ENV=production

# 使用 ECR 映像
./run.sh

# 通過 Operations Portal 登入
# https://ops.ftgaming.cc → 選擇 WDS Manager → 自動重定向
```

## 檢查 Mock SSO 是否啟用

查看容器日誌：

```bash
docker logs wds-manager | grep -i "mock"
```

如果看到：
```
Using MOCK SSO user for development: lonely.h@jvd.tw
```

表示 Mock SSO 已啟用。

## 故障排除

### 問題 1: Mock SSO 沒有啟用

**檢查環境變數**:
```bash
docker exec wds-manager env | grep MOCK_SSO_EMAIL
docker exec wds-manager env | grep NODE_ENV
```

**解決方案**:
```bash
# 確保環境變數正確
docker stop wds-manager
docker rm wds-manager

# 使用 -e 明確傳遞環境變數
docker run -d --name wds-manager \
  --env-file .env \
  -e MOCK_SSO_EMAIL=lonely.h@jvd.tw \
  -e NODE_ENV=development \
  ... (其他參數)
```

### 問題 2: "SSO Verification Failed"

如果仍然失敗：

1. 檢查 `src/routes/auth.js` line 42-44：
```javascript
if (config.sso.mockEmail && config.app.nodeEnv === 'development') {
  logger.warn('Using mock SSO for development');
  user = await ssoService.buildMockSsoUser(config.sso.mockEmail);
}
```

2. 檢查日誌：
```bash
docker logs wds-manager --tail 50 | grep -i "sso\|mock"
```

### 問題 3: 容器使用舊的環境變數

**解決方案**：重新構建映像
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## 推薦開發流程

### 開發環境（本地）
```bash
# 1. 編輯 .env
MOCK_SSO_EMAIL=lonely.h@jvd.tw
NODE_ENV=development

# 2. 編輯 docker-compose.yml（啟用 build）
# 3. 啟動
docker compose up -d --build

# 4. 測試
curl -L "http://localhost:3015/auth/sso?token=test"
```

### 生產環境（ECR）
```bash
# 1. 編輯 .env
MOCK_SSO_EMAIL=          # 留空
NODE_ENV=production

# 2. 使用 ECR 映像
./run.sh

# 3. 通過 Operations Portal 登入
```

## 角色配置

Mock SSO 用戶的角色來自 `src/data/role-mappings.json`:

```json
{
  "emailRoleMapping": {
    "lonely.h@jvd.tw": ["Admin"]
  },
  "domainDefaultRoles": {
    "jvd.tw": ["Viewer"],
    "default": ["Viewer"]
  }
}
```

修改此文件後需要重啟容器。

---

**建議**: 開發時使用本地構建 + Mock SSO，生產時使用 ECR 映像 + 真實 SSO。
