# WebUI Deployment System Manager - 部署檢查清單

## 使用說明

在部署到生產環境前，請逐項檢查以下清單並打勾。

---

## 前置準備 ✅

### AWS 配置

- [ ] AWS CLI 已安裝並配置
- [ ] AWS Profile `gemini-pro_ck` 已設定
- [ ] 已創建 `build-artifacts-bucket` (或更新為實際名稱)
- [ ] 已創建 `deploy-webui-bucket` (或更新為實際名稱)
- [ ] 兩個 buckets 都在正確的 region

### IAM 權限

- [ ] 執行 `aws/setup-iam.sh` 創建 IAM policy
- [ ] Policy 已附加到 IAM user 或 role
- [ ] 測試 bucket 訪問權限：
  ```bash
  aws s3 ls s3://build-artifacts-bucket --profile gemini-pro_ck
  aws s3 ls s3://deploy-webui-bucket --profile gemini-pro_ck
  ```

### 環境配置

- [ ] 複製 `.env.example` 到 `.env`
- [ ] 更新 `BUILD_ARTIFACTS_BUCKET` 為實際名稱
- [ ] 更新 `DEPLOY_WEBUI_BUCKET` 為實際名稱
- [ ] 設定強密碼給 `SESSION_SECRET`
- [ ] 確認 `PORT=3015` 沒有被佔用
- [ ] 設定 `NODE_ENV=production` (生產環境)
- [ ] 設定 `LOG_LEVEL=info` (或 `warn`)

---

## 本地測試 🧪

### 功能測試

- [ ] 執行 `npm install` 安裝依賴
- [ ] 執行 `npm start` 啟動服務
- [ ] 訪問 `http://localhost:3015`
- [ ] 測試健康檢查：
  ```bash
  curl http://localhost:3015/api/health
  ```
- [ ] 測試版本 API：
  ```bash
  curl http://localhost:3015/api/version
  ```
- [ ] 測試 bucket 訪問：
  ```bash
  curl http://localhost:3015/api/check-access
  ```
- [ ] 測試列出 artifacts（如果 bucket 有內容）：
  ```bash
  curl http://localhost:3015/api/artifacts
  ```

### 介面測試

- [ ] 開啟瀏覽器訪問 `http://localhost:3015`
- [ ] 檢查 bucket 狀態顯示為「Accessible」
- [ ] 測試瀏覽 artifacts（如果有）
- [ ] 測試選擇檔案功能
- [ ] 測試全選/取消全選
- [ ] 測試版本歷史顯示

### 部署測試（可選）

- [ ] 上傳測試 ZIP 到 build-artifacts-bucket
- [ ] 在介面上選擇測試檔案
- [ ] 執行部署
- [ ] 驗證檔案已上傳到 deploy-webui-bucket
- [ ] 檢查日誌無錯誤

---

## Docker 測試 🐳

### Docker Compose 測試

- [ ] 確認 `.env` 已配置
- [ ] 執行 `docker-compose up -d`
- [ ] 檢查容器狀態：
  ```bash
  docker-compose ps
  ```
- [ ] 檢查健康狀態：
  ```bash
  docker inspect wds-manager | grep -A 5 "Health"
  ```
- [ ] 查看日誌：
  ```bash
  docker-compose logs wds-manager
  ```
- [ ] 測試 API 端點（同本地測試）
- [ ] 停止並清理：
  ```bash
  docker-compose down
  ```

### Multi-arch 建置測試

- [ ] 檢查 Docker Buildx 可用：
  ```bash
  docker buildx version
  ```
- [ ] 執行建置腳本：
  ```bash
  ./build-and-deploy.sh
  ```
- [ ] 選擇本地載入（測試用）
- [ ] 確認映像已建立：
  ```bash
  docker images | grep wds-manager
  ```
- [ ] 使用 docker-compose 啟動並測試

---

## 安全檢查 🔒

### 配置安全

- [ ] `.env` 已加入 `.gitignore`
- [ ] `.env` 不包含在版本控制中
- [ ] `SESSION_SECRET` 使用強密碼（至少 32 字元）
- [ ] 生產環境設定 `NODE_ENV=production`
- [ ] Docker compose 中 AWS credentials 為唯讀掛載

### 網路安全

- [ ] CORS 設定正確（如需限制來源）
- [ ] Helmet.js 已啟用
- [ ] 考慮添加身份驗證（見 RECOMMENDATIONS.md）
- [ ] 考慮添加 Rate Limiting（見 RECOMMENDATIONS.md）

### IAM 安全

- [ ] 使用最小權限 policy
- [ ] 不使用 root account credentials
- [ ] 定期審查 IAM permissions
- [ ] 啟用 CloudTrail 記錄 S3 操作（可選）

---

## 效能優化 ⚡

### 上傳設定

- [ ] 根據網路頻寬調整 `UPLOAD_CONCURRENCY`
  - 100Mbps: 5-10
  - 1Gbps: 10-20
  - 10Gbps: 15-30
- [ ] 根據檔案大小調整 `UPLOAD_PART_SIZE`
  - 小檔案 (<50MB): 5-10MB
  - 中檔案 (50-500MB): 10-20MB
  - 大檔案 (>500MB): 20-100MB
- [ ] 跨國傳輸考慮啟用 `USE_ACCELERATE_ENDPOINT=true`
  - 需在 S3 bucket 上啟用 Transfer Acceleration

### 資源限制

- [ ] 設定 Node.js 記憶體限制（大量檔案部署）：
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096"
  ```
- [ ] Docker 記憶體限制（可選）：
  ```yaml
  deploy:
    resources:
      limits:
        memory: 2G
  ```

---

## 監控和日誌 📊

### 日誌配置

- [ ] 確認 `logs/` 目錄存在且可寫入
- [ ] 設定日誌輪轉（見 RECOMMENDATIONS.md）
- [ ] 配置日誌收集（可選）：
  - CloudWatch Logs
  - Elasticsearch
  - Splunk

### 監控設定

- [ ] 設定健康檢查監控
- [ ] 配置告警（部署失敗、記憶體不足等）
- [ ] 設定 Metrics 收集（可選）：
  - Prometheus
  - CloudWatch Metrics
  - Datadog

---

## 部署流程 🚀

### 生產部署選項

選擇以下其中一種部署方式：

#### 選項 A：Docker Compose 部署

- [ ] 更新 `.env` 為生產環境配置
- [ ] 執行：
  ```bash
  docker-compose up -d
  ```
- [ ] 驗證服務運行
- [ ] 檢查日誌無錯誤

#### 選項 B：Multi-arch Docker 部署

- [ ] 設定 `DOCKER_REGISTRY` 在 `.env`
- [ ] 執行建置腳本：
  ```bash
  ./build-and-deploy.sh
  ```
- [ ] 選擇推送到 registry
- [ ] 在目標伺服器上 pull 映像
- [ ] 使用 docker-compose 啟動

#### 選項 C：PM2 部署（本地）

- [ ] 安裝 PM2：
  ```bash
  npm install -g pm2
  ```
- [ ] 啟動服務：
  ```bash
  pm2 start src/app.js --name wds-manager
  ```
- [ ] 設定開機自動啟動：
  ```bash
  pm2 startup
  pm2 save
  ```

---

## 部署後驗證 ✓

### 功能驗證

- [ ] 訪問應用 URL
- [ ] 測試 API 端點：
  ```bash
  curl https://your-domain.com/api/health
  curl https://your-domain.com/api/version
  ```
- [ ] 測試完整部署流程
- [ ] 驗證檔案正確部署到目標 bucket
- [ ] 檢查日誌無錯誤

### 效能驗證

- [ ] 測試部署速度符合預期
- [ ] 檢查記憶體使用量正常
- [ ] 檢查 CPU 使用量正常
- [ ] 測試並發部署（如需要）

### 安全驗證

- [ ] 確認無敏感資訊洩漏
- [ ] 測試錯誤處理（不暴露內部資訊）
- [ ] 驗證 bucket 權限正確
- [ ] 檢查日誌無敏感資訊

---

## 文檔確認 📚

### 必要文檔

- [ ] README.md - 完整文檔
- [ ] QUICKSTART.md - 快速啟動指南
- [ ] PERFORMANCE.md - 效能優化指南
- [ ] RECOMMENDATIONS.md - 優化建議
- [ ] PROJECT_SUMMARY.md - 專案總結
- [ ] DEPLOYMENT_CHECKLIST.md - 本檢查清單

### 運維文檔

- [ ] 記錄部署日期和版本
- [ ] 記錄配置參數
- [ ] 建立故障排除手冊（可選）
- [ ] 建立運維手冊（可選）

---

## 備份和災難恢復 💾

### 備份計劃

- [ ] 備份 `.env` 到安全位置（加密）
- [ ] 備份 `version.json`
- [ ] 設定定期備份腳本（可選）
- [ ] 測試還原流程

### 災難恢復計劃

- [ ] 記錄部署步驟
- [ ] 準備回滾方案
- [ ] 測試快速恢復流程
- [ ] 建立聯絡清單

---

## 後續維護計劃 🔧

### 定期任務

- [ ] **每週**：
  - [ ] 檢查日誌檔案大小
  - [ ] 審查錯誤日誌
  - [ ] 檢查磁碟空間

- [ ] **每月**：
  - [ ] 審查部署歷史
  - [ ] 檢查效能指標
  - [ ] 更新文檔

- [ ] **每季**：
  - [ ] 更新 npm 依賴
  - [ ] 審查安全設定
  - [ ] 效能優化評估

- [ ] **每年**：
  - [ ] 審查 IAM 權限
  - [ ] 評估新功能需求
  - [ ] 架構審查

### 升級計劃

- [ ] 追蹤 Node.js LTS 版本
- [ ] 追蹤 AWS SDK 更新
- [ ] 追蹤 Docker 映像更新
- [ ] 實作 RECOMMENDATIONS.md 建議

---

## 簽核

### 開發團隊

- [ ] 開發完成
- [ ] 程式碼審查通過
- [ ] 單元測試通過
- [ ] 整合測試通過
- [ ] 文檔完整

**簽核人**：________________
**日期**：________________

### 運維團隊

- [ ] 環境準備完成
- [ ] 部署測試通過
- [ ] 監控配置完成
- [ ] 備份計劃確認
- [ ] 運維文檔確認

**簽核人**：________________
**日期**：________________

### 安全團隊（可選）

- [ ] 安全審查通過
- [ ] IAM 權限審查
- [ ] 網路安全確認
- [ ] 合規性檢查

**簽核人**：________________
**日期**：________________

---

## 緊急聯絡

### 關鍵聯絡人

- **專案負責人**：________________
- **技術負責人**：________________
- **運維負責人**：________________
- **24/7 值班**：________________

### 支援資源

- **文檔位置**：`/docs` 或專案 README
- **日誌位置**：`./logs/` 或 CloudWatch
- **監控面板**：________________
- **問題追蹤**：________________

---

## 附註

### 部署日期

**預定部署日期**：________________
**實際部署日期**：________________

### 環境資訊

**環境名稱**：________________
**伺服器位置**：________________
**訪問 URL**：________________
**版本號**：1.0.1

### 特殊說明

```
（記錄任何特殊配置或注意事項）




```

---

**檢查清單版本**：1.0
**最後更新**：2025-10-26
**專案版本**：1.0.1
