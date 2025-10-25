#!/bin/bash

echo "🧪 WebUI Deployment System - 測試腳本"
echo "====================================="
echo ""

# 1. 測試健康狀態
echo "1️⃣ 檢查服務健康狀態..."
curl -s http://localhost:3015/api/health | python3 -m json.tool
echo ""

# 2. 檢查 bucket 訪問
echo "2️⃣ 檢查 Bucket 訪問權限..."
curl -s http://localhost:3015/api/check-access | python3 -m json.tool
echo ""

# 3. 列出 20250625 目錄的檔案
echo "3️⃣ 列出 20250625 目錄的 artifacts..."
curl -s 'http://localhost:3015/api/artifacts?prefix=20250625/' | python3 -m json.tool | head -30
echo ""

# 4. 檢查部署 bucket 的檔案數量
echo "4️⃣ 檢查部署 bucket 當前檔案數量..."
FILE_COUNT=$(curl -s 'http://localhost:3015/api/deployed' | python3 -c "import sys, json; print(len(json.load(sys.stdin)['files']))")
echo "當前檔案數: $FILE_COUNT"
echo ""

echo "✅ 測試完成！"
echo ""
echo "📌 下一步："
echo "   1. 在瀏覽器訪問: http://localhost:3015"
echo "   2. 進入 20250625 目錄"
echo "   3. 選擇一個 ZIP 檔案"
echo "   4. 點擊「立即部署」"
echo "   5. 重新執行此腳本查看變化"
