# WDS Manager v1.16.3 - 完整前後端測試計劃

## 版本信息
- **當前版本**: v1.16.3
- **測試日期**: 2025-10-27
- **測試目的**: 驗證自定義 bucket 選擇功能完整性（前端+後端）

---

## 問題回顧

### v1.16.2 問題
- ✅ 後端代碼已修復（s3Service, deployService 接受 req 參數）
- ❌ **前端未發送自定義 bucket headers**
- 結果：部署時仍使用默認 bucket，出現 NoSuchKey 錯誤

### v1.16.3 修復
- ✅ 前端所有部署相關 API 請求添加自定義 bucket headers
- ✅ 完整的端到端自定義 bucket 選擇功能

---

## 測試計劃

### 階段 1: 後端 API 測試 (無需認證)

#### Test 1.1: Health Check ✅
```bash
curl -s http://localhost:3015/api/health | python3 -m json.tool
```
**預期結果**:
```json
{
    "status": "ok",
    "timestamp": "...",
    "version": "1.16.3"
}
```
**實際結果**: 待測試

---

#### Test 1.2: Version API ✅
```bash
curl -s http://localhost:3015/api/version | python3 -m json.tool | head -20
```
**預期結果**: 顯示 v1.16.3 版本信息和變更記錄
**實際結果**: 待測試

---

### 階段 2: 前端界面測試 (需要登入)

#### Test 2.1: 登入功能 ⏳
**步驟**:
1. 打開 http://localhost:3015
2. 點擊 Google 登入
3. 使用 lonely.h@jvd.tw 登入

**預期結果**: 成功登入，顯示用戶信息
**實際結果**: 待測試

---

#### Test 2.2: Bucket 狀態檢查 ⏳
**步驟**:
1. 登入後查看主頁
2. 檢查 "Build Artifacts Bucket" 卡片
3. 檢查 "Deploy WebUI Bucket" 卡片

**預期結果**:
- Build: jenkins-build-artfs (accessible ✓)
- Deploy: deploy-webui-bucket (accessible ✓)

**實際結果**: 待測試

---

#### Test 2.3: 列出所有 S3 Buckets ⏳
**步驟**:
1. 點擊 "Build Artifacts Bucket" 卡片上的編輯按鈕 (鉛筆圖標)
2. 觀察 bucket 選擇器彈窗

**預期結果**:
- 下拉選單顯示所有 S3 buckets
- Buckets 按字母順序排列
- 默認 bucket 標記為 "(default)"
- 可以使用 filter 輸入框搜索

**實際結果**: 待測試

---

#### Test 2.4: 切換到 release-webui Bucket ⏳
**步驟**:
1. 在 bucket 選擇器中選擇 "release-webui"
2. 點擊 "Change Bucket"
3. 頁面自動重新載入

**預期結果**:
- Bucket 狀態卡片更新為 "release-webui"
- sessionStorage 保存 customBuildBucket = "release-webui"

**實際結果**: 待測試

**驗證命令** (在瀏覽器 console):
```javascript
sessionStorage.getItem('customBuildBucket')
// 應該返回: "release-webui"
```

---

#### Test 2.5: 瀏覽 release-webui Bucket 中的 Artifacts ⏳
**步驟**:
1. 確認已切換到 release-webui bucket
2. 點擊 "Browse Build Artifacts"
3. 查看顯示的 artifacts

**預期結果**:
- 顯示 release-webui bucket 中的文件
- 應該看到 i18n-prd-1.0.26.zip
- 應該看到 bundle-i18n-prd-1.0.18.zip
- 應該看到各種遊戲 ZIP 文件

**實際結果**: 待測試

**後端日誌驗證**:
```bash
tail -f logs/combined.log | grep "custom build bucket"
```
應該看到: `"Using custom build bucket: release-webui"`

---

### 階段 3: 部署功能測試 (關鍵測試)

#### Test 3.1: 選擇 Artifact 進行部署 ⏳
**步驟**:
1. 確認仍在 release-webui bucket
2. 選擇 "i18n-prd-1.0.26.zip"
3. 點擊 "Deploy Selected"

**預期結果**: 出現部署確認對話框

**實際結果**: 待測試

---

#### Test 3.2: 執行部署並監控日誌 🔴 **關鍵測試**
**步驟**:
1. 確認部署
2. 同時監控後端日誌

**監控命令** (在另一個終端):
```bash
tail -f /Users/lonelyhsu/gemini/claude-project/wds-manager/logs/combined.log | grep -E "custom build bucket|Processing artifact|NoSuchKey|Deployment"
```

**預期結果**:
```
✅ 應該看到: "Using custom build bucket: release-webui"
✅ 應該看到: "Processing artifact: i18n-prd-1.0.26.zip"
✅ 應該看到: "Deployment completed: success" 或 "partial_success"
✅ 應該看到檔案上傳日誌
❌ 不應該看到: NoSuchKey 錯誤
```

**實際結果**: 待測試

---

#### Test 3.3: 驗證自定義 Bucket Headers 發送 🔴 **關鍵驗證**
**步驟**:
1. 在部署過程中查看網路請求 (瀏覽器 DevTools > Network)
2. 找到 `/api/deploy` POST 請求
3. 檢查 Request Headers

**預期 Request Headers**:
```
Content-Type: application/json
X-Custom-Build-Bucket: release-webui
```

**實際結果**: 待測試

---

#### Test 3.4: 驗證部署成功 ⏳
**步驟**:
1. 等待部署完成
2. 檢查部署狀態消息
3. 查看 "Recent Activity"

**預期結果**:
- 部署狀態顯示成功
- Recent Activity 顯示新的部署記錄
- 記錄包含用戶信息 (lonely.h@jvd.tw)
- 記錄顯示部署的文件數量

**實際結果**: 待測試

---

#### Test 3.5: 切換回默認 Bucket 並測試 ⏳
**步驟**:
1. 點擊 "Use default" 按鈕切換回 jenkins-build-artfs
2. 瀏覽 artifacts
3. 嘗試部署一個文件

**預期結果**:
- 成功切換回默認 bucket
- 可以看到 jenkins-build-artfs 中的文件
- 部署使用默認 bucket
- 日誌不顯示 "custom build bucket"

**實際結果**: 待測試

---

### 階段 4: 其他功能測試

#### Test 4.1: Version Check API ⏳
**步驟**:
1. 選擇多個 artifacts
2. 點擊 "Deploy Selected"
3. 觀察 version check 警告（如果有）

**驗證後端日誌**:
```bash
tail -f logs/combined.log | grep "check-versions"
```

**預期結果**:
- /api/check-versions 請求包含自定義 bucket headers
- 如果有舊版本，顯示警告

**實際結果**: 待測試

---

#### Test 4.2: Delete Artifacts ⏳
**步驟**:
1. 切換到測試 bucket (如果有)
2. 選擇一個測試文件
3. 點擊 "Delete Selected"
4. 確認刪除

**預期結果**:
- 刪除請求包含自定義 bucket headers
- 從正確的 bucket 刪除文件

**實際結果**: 待測試

---

#### Test 4.3: Clear Deploy Bucket ⏳
**步驟**:
1. 點擊 "Clear Deploy Bucket"
2. 確認操作

**預期結果**:
- 請求包含自定義 bucket headers
- 清除指定的 deploy bucket

**實際結果**: 待測試

---

## 成功標準

### 必須通過的測試
1. ✅ Health check 顯示 v1.16.3
2. ✅ 可以列出所有 S3 buckets
3. ✅ 可以切換到 release-webui bucket
4. ✅ 瀏覽 release-webui 顯示正確的文件
5. 🔴 **部署時發送 X-Custom-Build-Bucket header**
6. 🔴 **部署時後端使用 release-webui bucket**
7. 🔴 **部署成功，無 NoSuchKey 錯誤**
8. ✅ 可以切換回默認 bucket
9. ✅ 所有部署相關 API 都發送自定義 headers

### 預期修復驗證
**v1.16.3 應該解決的問題**:
- ❌ v1.16.2: 前端不發送 headers → **v1.16.3: 前端發送 headers** ✅
- ❌ v1.16.2: 部署使用默認 bucket → **v1.16.3: 部署使用自定義 bucket** ✅

---

## 測試記錄

### Test 1.1: Health Check
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **版本**: _______________
- **備註**: _______________

### Test 1.2: Version API
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **備註**: _______________

### Test 2.1: 登入功能
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **用戶**: _______________
- **備註**: _______________

### Test 2.2: Bucket 狀態檢查
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **Build Bucket**: _______________
- **Deploy Bucket**: _______________
- **備註**: _______________

### Test 2.3: 列出所有 S3 Buckets
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **Bucket 數量**: _______________
- **備註**: _______________

### Test 2.4: 切換到 release-webui
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **sessionStorage**: _______________
- **備註**: _______________

### Test 2.5: 瀏覽 release-webui Artifacts
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **後端日誌**: _______________
- **備註**: _______________

### Test 3.1: 選擇 Artifact
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **Artifact**: _______________
- **備註**: _______________

### Test 3.2: 執行部署 🔴 **關鍵**
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **後端日誌 - Custom Bucket**: _______________
- **後端日誌 - Processing**: _______________
- **後端日誌 - Status**: _______________
- **NoSuchKey 錯誤**: YES / NO
- **備註**: _______________

### Test 3.3: 驗證 Headers 🔴 **關鍵**
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **X-Custom-Build-Bucket**: _______________
- **備註**: _______________

### Test 3.4: 驗證部署成功
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **部署狀態**: _______________
- **文件數量**: _______________
- **備註**: _______________

### Test 3.5: 切換回默認 Bucket
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **備註**: _______________

### Test 4.1: Version Check API
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **備註**: _______________

### Test 4.2: Delete Artifacts
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **備註**: _______________

### Test 4.3: Clear Deploy Bucket
- **執行時間**: _______________
- **結果**: PASS / FAIL
- **備註**: _______________

---

## 最終結論

**總測試數**: _____ / _____
**通過率**: _____%

**關鍵功能狀態**:
- [ ] 自定義 bucket 瀏覽
- [ ] 自定義 bucket 部署
- [ ] Headers 正確發送
- [ ] 端到端功能完整

**建議**: _______________

**測試人員**: _______________
**測試日期**: _______________
**簽名**: _______________
