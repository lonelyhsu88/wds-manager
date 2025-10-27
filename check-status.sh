#!/usr/bin/env bash
# WDS Manager 快速狀態檢查
set -euo pipefail

# 顏色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "${BLUE}${BOLD}WDS Manager 狀態檢查${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}\n"

EXPECTED_VERSION="1.19.14"
ONLINE_URL="https://wds-manager.ftgaming.cc"
LOCAL_URL="http://localhost:3015"

# 1. 版本檢查
echo -e "${BLUE}[1] 版本檢查${NC}"
echo "─────────────────────────────────"

# 線上版本
ONLINE_VER=$(curl -s "${ONLINE_URL}/api/version" 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).version" 2>/dev/null || echo "無法取得")
echo -n "  線上版本: ${ONLINE_VER} "
if [[ "${ONLINE_VER}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠ (預期: ${EXPECTED_VERSION})${NC}"
fi

# 本地版本
if docker ps --filter name=wds-manager -q | grep -q .; then
    LOCAL_VER=$(curl -s "${LOCAL_URL}/api/version" 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).version" 2>/dev/null || echo "無法取得")
    echo -n "  本地版本: ${LOCAL_VER} "
    if [[ "${LOCAL_VER}" == "${EXPECTED_VERSION}" ]]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠ (預期: ${EXPECTED_VERSION})${NC}"
    fi
else
    echo -e "  本地版本: ${RED}容器未運行${NC}"
fi

# package.json
PKG_VER=$(node -pe "require('./package.json').version" 2>/dev/null || echo "unknown")
echo -n "  package.json: ${PKG_VER} "
[[ "${PKG_VER}" == "${EXPECTED_VERSION}" ]] && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}⚠${NC}"

# .env
ENV_VER=$(grep "APP_VERSION=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "unknown")
echo -n "  .env: ${ENV_VER} "
[[ "${ENV_VER}" == "${EXPECTED_VERSION}" ]] && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}⚠${NC}"

# version.json
JSON_VER=$(node -pe "require('./version.json').version" 2>/dev/null || echo "unknown")
echo -n "  version.json: ${JSON_VER} "
[[ "${JSON_VER}" == "${EXPECTED_VERSION}" ]] && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}⚠${NC}"

echo ""

# 2. 服務狀態
echo -e "${BLUE}[2] 服務狀態${NC}"
echo "─────────────────────────────────"

# 線上服務
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${ONLINE_URL}" 2>/dev/null || echo "000")
echo -n "  線上服務: "
if [[ "${HTTP_CODE}" == "200" ]] || [[ "${HTTP_CODE}" == "302" ]]; then
    echo -e "${GREEN}✓ 正常 (HTTP ${HTTP_CODE})${NC}"
else
    echo -e "${RED}✗ 異常 (HTTP ${HTTP_CODE})${NC}"
fi

# 本地容器
if docker ps --filter name=wds-manager -q | grep -q .; then
    CONTAINER_STATUS=$(docker ps --filter name=wds-manager --format "{{.Status}}")
    echo -e "  本地容器: ${GREEN}✓ ${CONTAINER_STATUS}${NC}"

    # 健康檢查
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' wds-manager 2>/dev/null || echo "no healthcheck")
    echo -n "  容器健康: "
    if [[ "${HEALTH}" == "healthy" ]]; then
        echo -e "${GREEN}✓ ${HEALTH}${NC}"
    elif [[ "${HEALTH}" == "no healthcheck" ]]; then
        echo -e "${BLUE}ℹ 未配置${NC}"
    else
        echo -e "${YELLOW}⚠ ${HEALTH}${NC}"
    fi
else
    echo -e "  本地容器: ${RED}✗ 未運行${NC}"
fi

echo ""

# 3. Socket.IO 修復
echo -e "${BLUE}[3] Socket.IO 修復${NC}"
echo "─────────────────────────────────"

if grep -q "this.socket = io()" public/js/app.js; then
    echo -e "  Socket.IO 初始化: ${GREEN}✓ 已修復${NC}"
else
    echo -e "  Socket.IO 初始化: ${RED}✗ 缺失${NC}"
    echo -e "    ${YELLOW}⚠ 會導致 Clear Deploy Bucket 卡在 'Initializing...'${NC}"
fi

if grep -q "this.socket.on('clear-bucket-progress'" public/js/app.js; then
    echo -e "  事件監聽器: ${GREEN}✓ 已配置${NC}"
else
    echo -e "  事件監聽器: ${YELLOW}⚠ 可能缺失${NC}"
fi

if grep -q "progressCallback" src/services/s3Service.js; then
    echo -e "  後端 callback: ${GREEN}✓ 已配置${NC}"
else
    echo -e "  後端 callback: ${YELLOW}⚠ 可能缺失${NC}"
fi

echo ""

# 4. Docker 配置
echo -e "${BLUE}[4] Docker 配置${NC}"
echo "─────────────────────────────────"

if docker ps --filter name=wds-manager -q | grep -q .; then
    CONTAINER_IMAGE=$(docker ps --filter name=wds-manager --format "{{.Image}}")
    IMAGE_TAG=$(echo "${CONTAINER_IMAGE}" | grep -o ':[^:]*$' | tr -d ':')
    echo "  映像版本: ${IMAGE_TAG}"

    if [[ "${IMAGE_TAG}" == "${EXPECTED_VERSION}" ]] || [[ "${IMAGE_TAG}" == "latest" ]]; then
        echo -e "  映像標籤: ${GREEN}✓ ${IMAGE_TAG}${NC}"
    else
        echo -e "  映像標籤: ${YELLOW}⚠ ${IMAGE_TAG} (預期: ${EXPECTED_VERSION})${NC}"
    fi

    PORTS=$(docker ps --filter name=wds-manager --format "{{.Ports}}")
    echo "  端口映射: ${PORTS}"
fi

# 檢查是否有最新映像
if docker images 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:${EXPECTED_VERSION} -q | grep -q .; then
    echo -e "  本地映像: ${GREEN}✓ ${EXPECTED_VERSION} 已存在${NC}"
else
    echo -e "  本地映像: ${YELLOW}⚠ ${EXPECTED_VERSION} 不存在${NC}"
fi

echo ""

# 5. 最近日誌
if docker ps --filter name=wds-manager -q | grep -q .; then
    echo -e "${BLUE}[5] 最近日誌 (最後 10 行)${NC}"
    echo "─────────────────────────────────"
    docker logs --tail 10 wds-manager 2>&1 | while IFS= read -r line; do
        if echo "$line" | grep -qi "error"; then
            echo -e "${RED}  $line${NC}"
        elif echo "$line" | grep -qi "warn"; then
            echo -e "${YELLOW}  $line${NC}"
        else
            echo "  $line"
        fi
    done
    echo ""
fi

# 6. 總結
echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "${BLUE}${BOLD}總結${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}\n"

# 計算得分
SCORE=0
MAX_SCORE=6

# 檢查項
[[ "${ONLINE_VER}" == "${EXPECTED_VERSION}" ]] && ((SCORE++))
[[ "${LOCAL_VER}" == "${EXPECTED_VERSION}" ]] && ((SCORE++)) || true
[[ "${HTTP_CODE}" == "200" ]] || [[ "${HTTP_CODE}" == "302" ]] && ((SCORE++))
docker ps --filter name=wds-manager -q | grep -q . && ((SCORE++)) || true
grep -q "this.socket = io()" public/js/app.js && ((SCORE++))
[[ "${PKG_VER}" == "${EXPECTED_VERSION}" ]] && [[ "${ENV_VER}" == "${EXPECTED_VERSION}" ]] && [[ "${JSON_VER}" == "${EXPECTED_VERSION}" ]] && ((SCORE++))

echo -e "  總體評分: ${BOLD}${SCORE}/${MAX_SCORE}${NC}"
echo ""

if [[ ${SCORE} -ge 5 ]]; then
    echo -e "${GREEN}✅ 系統狀態良好！${NC}"
elif [[ ${SCORE} -ge 3 ]]; then
    echo -e "${YELLOW}⚠️  系統基本正常，但有問題需要關注${NC}"
else
    echo -e "${RED}❌ 系統存在多個問題，需要修復${NC}"
fi

echo ""
echo -e "${BLUE}快速操作：${NC}"
echo "  • 修復本地配置: ./fix-and-verify.sh"
echo "  • 重啟容器: ./run.sh"
echo "  • 查看完整日誌: docker logs -f wds-manager"
echo "  • 詳細診斷: ./diagnose-online.sh"
echo ""
