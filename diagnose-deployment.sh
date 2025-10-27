#!/usr/bin/env bash
# WDS Manager 部署診斷腳本

echo "=== WDS Manager 部署診斷 ==="
echo ""

# 1. 檢查容器狀態
echo "1. 容器狀態:"
docker ps --filter name=wds-manager --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" || echo "容器未運行"
echo ""

# 2. 檢查版本 API
echo "2. 版本 API 回應:"
curl -s http://localhost:3015/api/version | python3 -m json.tool || echo "無法連接到服務"
echo ""

# 3. 檢查健康狀態
echo "3. 健康檢查:"
curl -s http://localhost:3015/api/health | python3 -m json.tool || echo "健康檢查失敗"
echo ""

# 4. 檢查 version.json 文件
echo "4. 檢查本地 version.json:"
if [[ -f version.json ]]; then
    echo "✅ version.json 存在"
    echo "版本: $(grep -m 1 '"version"' version.json | cut -d'"' -f4)"
else
    echo "❌ version.json 不存在"
fi
echo ""

# 5. 檢查容器內的 version.json
echo "5. 檢查容器內 version.json:"
docker exec wds-manager cat /app/version.json 2>/dev/null | python3 -m json.tool | head -20 || echo "無法讀取容器內 version.json"
echo ""

# 6. 檢查 AWS 憑證
echo "6. 檢查 AWS 憑證掛載:"
docker exec wds-manager ls -la /home/nodejs/.aws 2>/dev/null || echo "容器內無 AWS 憑證目錄"
echo ""

# 7. 檢查環境變數
echo "7. 容器環境變數:"
docker exec wds-manager env | grep -E "AWS_|NODE_ENV|PORT" || echo "無法讀取環境變數"
echo ""

# 8. 檢查最近的錯誤日誌
echo "8. 最近的錯誤日誌:"
docker logs wds-manager --tail 20 2>&1 | grep -i "error\|fail\|warn" || echo "無錯誤日誌"
echo ""

echo "=== 診斷完成 ==="
