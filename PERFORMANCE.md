# 高速上傳優化指南

## 概述

WebUI Deployment System Manager 實現了多項優化策略來提升 AWS S3 上傳速度：

1. **並行上傳**：同時上傳多個檔案
2. **Managed Upload**：使用 AWS SDK 的分段上傳
3. **Transfer Acceleration**：支援 S3 Transfer Acceleration（可選）
4. **連線優化**：優化 HTTP 連線參數

## 配置參數

所有高速上傳配置都在 `.env` 檔案中：

```bash
# High-Speed Upload Configuration
UPLOAD_CONCURRENCY=10           # 並行上傳數量（建議 5-20）
UPLOAD_PART_SIZE=10485760       # 分段上傳大小 10MB (bytes)
USE_ACCELERATE_ENDPOINT=false   # 是否使用 S3 Transfer Acceleration
```

### 參數說明

#### 1. UPLOAD_CONCURRENCY（並行上傳數量）

控制同時上傳的檔案數量。

- **預設值**：10
- **建議範圍**：5-20
- **影響因素**：
  - 網路頻寬：頻寬越大，可設定越高
  - 系統資源：CPU 和記憶體資源
  - 檔案大小：小檔案可設定較高並發

**調整建議**：
- 100Mbps 網路：5-10
- 1Gbps 網路：10-20
- 10Gbps 網路：15-30

#### 2. UPLOAD_PART_SIZE（分段大小）

用於 AWS S3 Managed Upload 的分段大小。

- **預設值**：10485760 (10MB)
- **最小值**：5MB (AWS 限制)
- **最大值**：5GB (AWS 限制)
- **建議值**：
  - 小檔案 (<50MB)：5-10MB
  - 中檔案 (50-500MB)：10-20MB
  - 大檔案 (>500MB)：20-100MB

**注意**：較大的分段可以減少請求數，但會增加記憶體使用。

#### 3. USE_ACCELERATE_ENDPOINT（Transfer Acceleration）

啟用 AWS S3 Transfer Acceleration 來加速長距離傳輸。

- **預設值**：false
- **何時啟用**：
  - 跨國傳輸（例如：台灣到美國）
  - 網路延遲高的環境
  - 需要最高傳輸速度

**注意事項**：
1. 需要在 S3 bucket 上啟用 Transfer Acceleration
2. 會產生額外費用（約為標準傳輸的 2 倍）
3. 不適用於同區域傳輸

## 啟用 S3 Transfer Acceleration

### 1. 在 AWS Console 啟用

```bash
# 使用 AWS CLI 啟用
aws s3api put-bucket-accelerate-configuration \
  --bucket deploy-webui-bucket \
  --accelerate-configuration Status=Enabled \
  --profile gemini-pro_ck
```

### 2. 更新 .env 配置

```bash
USE_ACCELERATE_ENDPOINT=true
```

### 3. 重啟服務

```bash
# 本地模式
npm run dev

# Docker 模式
docker-compose restart
```

## 效能測試

### 測試方法

1. 準備測試檔案：
   ```bash
   # 創建測試 ZIP（例如 100MB）
   dd if=/dev/zero of=test.dat bs=1M count=100
   zip test.zip test.dat
   ```

2. 上傳到 build-artifacts-bucket

3. 使用 WebUI 部署並記錄時間

4. 調整 `UPLOAD_CONCURRENCY` 並重複測試

### 基準測試範例

測試環境：
- 檔案：100MB ZIP 包含 100 個檔案
- 網路：1Gbps
- 區域：ap-northeast-1

結果：

| 並發數 | 上傳時間 | 速度 | CPU 使用率 |
|--------|----------|------|------------|
| 1      | 45s      | 22MB/s | 10% |
| 5      | 12s      | 83MB/s | 25% |
| 10     | 8s       | 125MB/s | 40% |
| 20     | 7s       | 143MB/s | 60% |
| 30     | 7s       | 143MB/s | 80% |

**結論**：並發數 10-20 為最佳平衡點。

## 優化建議

### 1. 網路頻寬充足

```bash
UPLOAD_CONCURRENCY=15
UPLOAD_PART_SIZE=20971520  # 20MB
USE_ACCELERATE_ENDPOINT=false
```

### 2. 跨國傳輸

```bash
UPLOAD_CONCURRENCY=10
UPLOAD_PART_SIZE=10485760  # 10MB
USE_ACCELERATE_ENDPOINT=true
```

### 3. 資源有限環境

```bash
UPLOAD_CONCURRENCY=5
UPLOAD_PART_SIZE=5242880   # 5MB
USE_ACCELERATE_ENDPOINT=false
```

### 4. 大檔案部署（>1GB）

```bash
UPLOAD_CONCURRENCY=8
UPLOAD_PART_SIZE=52428800  # 50MB
USE_ACCELERATE_ENDPOINT=true
```

## 監控和日誌

### 查看上傳進度

檢查日誌以監控上傳狀態：

```bash
# 本地模式
tail -f logs/combined.log

# Docker 模式
docker-compose logs -f wds-manager
```

### 關鍵日誌訊息

```
info: Extracting 150 files from artifact.zip with concurrency 10
info: Uploaded: static/js/main.js (256 KB)
info: Upload completed: 150 succeeded, 0 failed
info: Deployment completed! 150 files deployed in 8s
```

## 進階優化

### 1. 調整 AWS SDK HTTP 參數

在 `src/config/aws.js` 中：

```javascript
const awsConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-1',
  maxRetries: 3,
  httpOptions: {
    timeout: 300000,      // 5 分鐘（可調整）
    connectTimeout: 10000 // 10 秒（可調整）
  }
};
```

### 2. 增加 Node.js 記憶體限制

對於大量檔案部署：

```bash
# 設定 Node.js 記憶體限制為 4GB
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

或在 Docker Compose 中：

```yaml
services:
  wds-manager:
    environment:
      - NODE_OPTIONS=--max-old-space-size=4096
```

### 3. 啟用 HTTP Keep-Alive

AWS SDK 已預設啟用，但可以調整：

```javascript
const AWS = require('aws-sdk');
const https = require('https');

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10
});

const s3 = new AWS.S3({
  httpOptions: { agent }
});
```

## 故障排除

### 問題：上傳速度慢

**可能原因**：
1. 並發數太低
2. 網路頻寬限制
3. 分段大小不適合

**解決方法**：
1. 逐步增加 `UPLOAD_CONCURRENCY`
2. 測試網路速度：`speedtest-cli`
3. 調整 `UPLOAD_PART_SIZE`

### 問題：記憶體不足

**可能原因**：
1. 並發數太高
2. 處理大檔案
3. Node.js 記憶體限制

**解決方法**：
1. 降低 `UPLOAD_CONCURRENCY`
2. 增加 Node.js 記憶體限制
3. 使用 Stream 處理大檔案

### 問題：連線超時

**可能原因**：
1. 網路不穩定
2. 超時設定太短
3. 檔案太大

**解決方法**：
1. 增加 `httpOptions.timeout`
2. 啟用 Transfer Acceleration
3. 減小 `UPLOAD_PART_SIZE`

## 成本考量

### Transfer Acceleration 費用

- **標準傳輸**：$0.09 per GB（亞太區域）
- **加速傳輸**：$0.04-0.08 per GB（額外費用）

範例：傳輸 1TB 資料
- 標準：$90
- 加速：$130-170（增加 $40-80）

### 建議

1. **測試先行**：先測試標準傳輸速度
2. **按需啟用**：只在必要時啟用 Acceleration
3. **監控成本**：使用 AWS Cost Explorer 追蹤費用

## 總結

### 快速設定建議

大多數情況下，使用這個配置即可：

```bash
UPLOAD_CONCURRENCY=10
UPLOAD_PART_SIZE=10485760
USE_ACCELERATE_ENDPOINT=false
```

### 何時調整

- **上傳慢**：增加並發數
- **記憶體高**：降低並發數或分段大小
- **跨國慢**：啟用 Transfer Acceleration
- **成本敏感**：使用最低可接受的設定

### 持續優化

1. 定期監控上傳效能
2. 根據實際使用情況調整
3. 關注 AWS 新功能和最佳實踐
4. 記錄和分析部署日誌

---

**最後更新：2025-10-26**
**版本：1.0.1**
