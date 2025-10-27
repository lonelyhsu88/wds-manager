# 線上環境部署說明

**域名**: https://wds-manager.ftgaming.cc

---

## 🚀 快速部署（推薦）

在線上伺服器執行一鍵修復腳本：

```bash
cd /path/to/wds-manager
./fix-production.sh
```

這個腳本會自動：
1. ✅ 備份現有配置
2. ✅ 修復 AWS 憑證權限問題
3. ✅ 創建正確的 version.json
4. ✅ 更新 .env 為生產環境配置
5. ✅ 部署 v1.19.3
6. ✅ 驗證部署結果

---

## 📋 手動部署步驟

如果需要手動部署，請按以下步驟操作：

### 1. 修復 AWS 憑證權限

```bash
chmod -R 755 ~/.aws
chmod 644 ~/.aws/credentials
chmod 644 ~/.aws/config
```

### 2. 創建正確的 version.json

```bash
# 刪除舊的
rm version.json

# 從本地複製，或者讓 run.sh 自動創建
```

### 3. 更新 .env 配置

編輯 `.env` 文件，確保以下設置正確：

```bash
# 必須修改的設置
APP_VERSION=1.19.3
NODE_ENV=production
FORCE_SECURE_COOKIE=true

# 域名設置
GOOGLE_CALLBACK_URL=https://wds-manager.ftgaming.cc/auth/google/callback
ALLOWED_ORIGINS=https://wds-manager.ftgaming.cc

# SSO 設置
MOCK_SSO_EMAIL=  # 必須為空
```

### 4. 部署新版本

```bash
# 停止舊容器
docker stop wds-manager
docker rm wds-manager

# 登入 ECR
AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | \
  docker login --username AWS --password-stdin 470013648166.dkr.ecr.ap-east-1.amazonaws.com

# 啟動新版本
./run.sh
```

### 5. 驗證部署

```bash
# 檢查容器狀態
docker ps --filter name=wds-manager

# 檢查版本
curl http://localhost:3015/api/version

# 檢查健康狀態
curl http://localhost:3015/api/health

# 查看日誌
docker logs wds-manager --tail 50
```

---

## 🔍 問題排查

### 如果版本顯示 vundefined

**原因**: version.json 格式錯誤

**解決**:
```bash
rm version.json
./run.sh
```

### 如果 Bucket 顯示 Not Accessible

**原因**: AWS 憑證權限問題

**解決**:
```bash
# 修復權限
chmod -R 755 ~/.aws
chmod 644 ~/.aws/credentials
chmod 644 ~/.aws/config

# 重啟容器
docker restart wds-manager
```

### 如果 SSO 登入失敗

**檢查項目**:
1. `NODE_ENV=production`
2. `MOCK_SSO_EMAIL=` (必須為空)
3. `ALLOWED_ORIGINS=https://wds-manager.ftgaming.cc`

---

## 📊 驗證檢查清單

部署完成後，請確認：

- [ ] 容器狀態為 `healthy`
- [ ] 訪問 https://wds-manager.ftgaming.cc 正常
- [ ] 右上角版本號顯示 `v1.19.3`
- [ ] Build Artifacts Bucket 顯示 "Accessible"
- [ ] Deploy WebUI Bucket 顯示 "Accessible"
- [ ] 可以從 https://ops.ftgaming.cc SSO 登入
- [ ] Dashboard 可以正常顯示統計數據
- [ ] 可以瀏覽和部署 artifacts

---

## 🛠️ 診斷工具

如果遇到問題，使用診斷腳本：

```bash
./diagnose-deployment.sh
```

---

## 📞 常用命令

```bash
# 查看日誌
docker logs -f wds-manager

# 重啟服務
docker restart wds-manager

# 檢查狀態
docker ps --filter name=wds-manager

# 進入容器
docker exec -it wds-manager sh

# 查看環境變數
docker exec wds-manager env | grep -E "NODE_ENV|AWS_"
```

---

**最後更新**: 2025-10-27
**當前版本**: 1.19.3
**域名**: https://wds-manager.ftgaming.cc
