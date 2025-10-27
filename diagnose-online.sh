#!/usr/bin/env bash
# 診斷線上 WDS Manager 配置和狀態
set -euo pipefail

# 顏色設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

show_header() {
    echo ""
    echo -e "${CYAN}${BOLD}========================================${NC}"
    echo -e "${CYAN}${BOLD}$1${NC}"
    echo -e "${CYAN}${BOLD}========================================${NC}"
    echo ""
}

show_section() {
    echo ""
    echo -e "${BLUE}──────────────────────────────────────${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}──────────────────────────────────────${NC}"
}

# 線上服務 URL
ONLINE_URL="https://wds-manager.ftgaming.cc"
LOCAL_URL="http://localhost:3015"
EXPECTED_VERSION="1.19.14"

show_header "WDS Manager 線上診斷工具"

echo -e "${CYAN}目標服務：${NC}"
echo "  • 線上: ${ONLINE_URL}"
echo "  • 本地: ${LOCAL_URL}"
echo "  • 預期版本: ${EXPECTED_VERSION}"
echo ""

# ============================================
# 1. 檢查線上服務連通性
# ============================================
show_section "1. 線上服務連通性"

log_info "測試線上服務 HTTP 響應..."
ONLINE_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "${ONLINE_URL}" 2>/dev/null || echo "000")

if [[ "${ONLINE_HTTP_CODE}" == "200" ]]; then
    log_success "線上服務響應正常 (HTTP ${ONLINE_HTTP_CODE})"
elif [[ "${ONLINE_HTTP_CODE}" == "302" ]] || [[ "${ONLINE_HTTP_CODE}" == "301" ]]; then
    log_success "線上服務重定向 (HTTP ${ONLINE_HTTP_CODE}) - 可能需要認證"
else
    log_error "線上服務無響應或異常 (HTTP ${ONLINE_HTTP_CODE})"
fi

log_info "測試線上 API 端點..."
ONLINE_API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${ONLINE_URL}/api/health" 2>/dev/null || echo "000")

if [[ "${ONLINE_API_CODE}" == "200" ]]; then
    log_success "API 端點響應正常 (HTTP ${ONLINE_API_CODE})"
else
    log_warning "API 端點響應異常 (HTTP ${ONLINE_API_CODE})"
fi

log_info "測試 DNS 解析..."
ONLINE_IP=$(dig +short wds-manager.ftgaming.cc 2>/dev/null | head -1 || echo "unknown")
if [[ "${ONLINE_IP}" != "unknown" ]] && [[ -n "${ONLINE_IP}" ]]; then
    log_success "DNS 解析成功: ${ONLINE_IP}"
else
    log_warning "DNS 解析失敗或未配置"
fi

log_info "測試 SSL 證書..."
SSL_INFO=$(echo | openssl s_client -servername wds-manager.ftgaming.cc -connect wds-manager.ftgaming.cc:443 2>/dev/null | grep "Verify return code" || echo "")
if echo "${SSL_INFO}" | grep -q "0 (ok)"; then
    log_success "SSL 證書有效"
    SSL_EXPIRY=$(echo | openssl s_client -servername wds-manager.ftgaming.cc -connect wds-manager.ftgaming.cc:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "unknown")
    echo "  到期時間: ${SSL_EXPIRY}"
else
    log_warning "SSL 證書可能有問題或使用自簽證書"
fi

# ============================================
# 2. 檢查版本資訊
# ============================================
show_section "2. 版本資訊"

log_info "檢查線上版本..."
ONLINE_VERSION=$(curl -s "${ONLINE_URL}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")

if [[ "${ONLINE_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    log_success "線上版本正確: ${ONLINE_VERSION}"
elif [[ "${ONLINE_VERSION}" == "unknown" ]]; then
    log_error "無法獲取線上版本（API 可能需要認證）"
else
    log_warning "線上版本: ${ONLINE_VERSION} (預期: ${EXPECTED_VERSION})"
    log_warning "線上服務可能需要更新"
fi

log_info "檢查本地版本..."
if docker ps --filter name=wds-manager --format "{{.Status}}" | grep -q "Up"; then
    LOCAL_VERSION=$(curl -s "${LOCAL_URL}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")

    if [[ "${LOCAL_VERSION}" == "${EXPECTED_VERSION}" ]]; then
        log_success "本地版本正確: ${LOCAL_VERSION}"
    else
        log_warning "本地版本: ${LOCAL_VERSION} (預期: ${EXPECTED_VERSION})"
    fi
else
    log_warning "本地容器未運行"
    LOCAL_VERSION="not running"
fi

echo ""
echo -e "${CYAN}版本對比：${NC}"
printf "  %-15s %-15s %-15s\n" "來源" "當前版本" "狀態"
printf "  %-15s %-15s " "線上" "${ONLINE_VERSION}"
if [[ "${ONLINE_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "${GREEN}✓ 正確${NC}"
else
    echo -e "${YELLOW}⚠ 需更新${NC}"
fi
printf "  %-15s %-15s " "本地" "${LOCAL_VERSION}"
if [[ "${LOCAL_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "${GREEN}✓ 正確${NC}"
else
    echo -e "${YELLOW}⚠ 需更新${NC}"
fi

# ============================================
# 3. 檢查本地 Docker 配置
# ============================================
show_section "3. 本地 Docker 配置"

log_info "檢查 Docker 容器狀態..."
if docker ps --filter name=wds-manager --format "{{.ID}}" | grep -q .; then
    CONTAINER_ID=$(docker ps --filter name=wds-manager --format "{{.ID}}")
    CONTAINER_IMAGE=$(docker ps --filter name=wds-manager --format "{{.Image}}")
    CONTAINER_STATUS=$(docker ps --filter name=wds-manager --format "{{.Status}}")
    CONTAINER_PORTS=$(docker ps --filter name=wds-manager --format "{{.Ports}}")

    log_success "容器運行中"
    echo "  ID: ${CONTAINER_ID}"
    echo "  Image: ${CONTAINER_IMAGE}"
    echo "  Status: ${CONTAINER_STATUS}"
    echo "  Ports: ${CONTAINER_PORTS}"

    # 檢查容器映像版本
    IMAGE_TAG=$(echo "${CONTAINER_IMAGE}" | grep -o ':[^:]*$' | tr -d ':')
    if [[ "${IMAGE_TAG}" == "${EXPECTED_VERSION}" ]] || [[ "${IMAGE_TAG}" == "latest" ]]; then
        log_success "容器映像標籤: ${IMAGE_TAG}"
    else
        log_warning "容器映像標籤: ${IMAGE_TAG} (預期: ${EXPECTED_VERSION} 或 latest)"
    fi

    # 檢查容器健康狀態
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' wds-manager 2>/dev/null || echo "no healthcheck")
    if [[ "${HEALTH_STATUS}" == "healthy" ]]; then
        log_success "容器健康檢查: ${HEALTH_STATUS}"
    elif [[ "${HEALTH_STATUS}" == "no healthcheck" ]]; then
        log_info "容器健康檢查: 未配置"
    else
        log_warning "容器健康檢查: ${HEALTH_STATUS}"
    fi
else
    log_error "容器未運行"
fi

log_info "檢查 Docker 映像..."
if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "wds-manager:${EXPECTED_VERSION}"; then
    log_success "本地存在映像: wds-manager:${EXPECTED_VERSION}"
    IMAGE_INFO=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep "wds-manager:${EXPECTED_VERSION}")
    echo "  ${IMAGE_INFO}"
else
    log_warning "本地不存在映像: wds-manager:${EXPECTED_VERSION}"
fi

if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "wds-manager:latest"; then
    log_success "本地存在映像: wds-manager:latest"
    IMAGE_INFO=$(docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | grep "wds-manager:latest")
    echo "  ${IMAGE_INFO}"
fi

# ============================================
# 4. 檢查本地文件配置
# ============================================
show_section "4. 本地文件配置"

log_info "檢查版本文件一致性..."
PACKAGE_VERSION=$(node -pe "require('./package.json').version" 2>/dev/null || echo "unknown")
ENV_VERSION=$(grep "APP_VERSION=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "unknown")
VERSION_JSON=$(node -pe "require('./version.json').version" 2>/dev/null || echo "unknown")

echo ""
printf "  %-20s %-15s %-15s\n" "文件" "版本" "狀態"
printf "  %-20s %-15s " "package.json" "${PACKAGE_VERSION}"
if [[ "${PACKAGE_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

printf "  %-20s %-15s " ".env" "${ENV_VERSION}"
if [[ "${ENV_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

printf "  %-20s %-15s " "version.json" "${VERSION_JSON}"
if [[ "${VERSION_JSON}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

log_info "檢查關鍵文件存在性..."
CRITICAL_FILES=(
    "Dockerfile"
    "run.sh"
    ".env"
    "package.json"
    "version.json"
    "src/app.js"
    "src/services/s3Service.js"
    "src/services/deployService.js"
    "public/js/app.js"
)

ALL_FILES_OK=true
for file in "${CRITICAL_FILES[@]}"; do
    if [[ -f "${file}" ]]; then
        echo -e "  ${GREEN}✓${NC} ${file}"
    else
        echo -e "  ${RED}✗${NC} ${file} (缺失)"
        ALL_FILES_OK=false
    fi
done

if [[ "${ALL_FILES_OK}" == "true" ]]; then
    log_success "所有關鍵文件存在"
else
    log_error "部分關鍵文件缺失"
fi

# ============================================
# 5. 檢查 Socket.IO 修復
# ============================================
show_section "5. Socket.IO 修復驗證"

log_info "檢查 DeploymentManager 中的 Socket.IO 初始化..."
if grep -q "this.socket = io()" public/js/app.js; then
    log_success "Socket.IO 初始化已存在"

    # 顯示相關代碼行
    SOCKET_LINE=$(grep -n "this.socket = io()" public/js/app.js | head -1 | cut -d: -f1)
    echo "  位置: public/js/app.js:${SOCKET_LINE}"
else
    log_error "Socket.IO 初始化缺失！"
    log_warning "這會導致 Clear Deploy Bucket 卡在 'Initializing...'"
fi

log_info "檢查 clearDeployBucket 方法..."
if grep -q "async clearDeployBucket()" public/js/app.js; then
    log_success "clearDeployBucket 方法存在"

    if grep -q "this.socket.on('clear-bucket-progress'" public/js/app.js; then
        log_success "Socket.IO 事件監聽器已配置"
    else
        log_warning "Socket.IO 事件監聽器可能缺失"
    fi
else
    log_error "clearDeployBucket 方法不存在"
fi

log_info "檢查後端 progress callback..."
if grep -q "progressCallback" src/services/s3Service.js; then
    log_success "s3Service.js 有 progress callback 支持"
else
    log_warning "s3Service.js 可能缺少 progress callback"
fi

if grep -q "clear-bucket-progress" src/routes/api.js; then
    log_success "API 路由有 Socket.IO 事件發送"
else
    log_warning "API 路由可能缺少 Socket.IO 事件"
fi

# ============================================
# 6. 檢查容器日誌
# ============================================
show_section "6. 容器日誌檢查"

if docker ps --filter name=wds-manager --format "{{.ID}}" | grep -q .; then
    log_info "檢查最近的錯誤日誌..."
    ERROR_COUNT=$(docker logs --tail 100 wds-manager 2>&1 | grep -i "error" | wc -l | tr -d ' ')
    WARN_COUNT=$(docker logs --tail 100 wds-manager 2>&1 | grep -i "warn" | wc -l | tr -d ' ')

    if [[ ${ERROR_COUNT} -eq 0 ]]; then
        log_success "最近 100 行日誌無錯誤"
    else
        log_warning "最近 100 行日誌有 ${ERROR_COUNT} 個錯誤"
    fi

    if [[ ${WARN_COUNT} -eq 0 ]]; then
        log_success "最近 100 行日誌無警告"
    else
        log_info "最近 100 行日誌有 ${WARN_COUNT} 個警告"
    fi

    log_info "最近 20 行日誌："
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    docker logs --tail 20 wds-manager 2>&1 | while IFS= read -r line; do
        if echo "$line" | grep -qi "error"; then
            echo -e "${RED}${line}${NC}"
        elif echo "$line" | grep -qi "warn"; then
            echo -e "${YELLOW}${line}${NC}"
        else
            echo "$line"
        fi
    done
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
    log_warning "容器未運行，無法查看日誌"
fi

# ============================================
# 7. AWS 配置檢查
# ============================================
show_section "7. AWS 配置檢查"

log_info "檢查 AWS Profile..."
if grep -q "AWS_PROFILE=gemini-pro_ck" .env 2>/dev/null; then
    log_success ".env 中配置了 AWS_PROFILE"
else
    log_warning ".env 中未找到 AWS_PROFILE"
fi

log_info "檢查 AWS CLI..."
if command -v aws >/dev/null 2>&1; then
    AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1)
    log_success "AWS CLI 已安裝: ${AWS_VERSION}"

    log_info "檢查 AWS Profile..."
    if AWS_PROFILE=gemini-pro_ck aws sts get-caller-identity >/dev/null 2>&1; then
        CALLER_ID=$(AWS_PROFILE=gemini-pro_ck aws sts get-caller-identity --query "Account" --output text 2>/dev/null)
        log_success "AWS Profile 'gemini-pro_ck' 有效 (Account: ${CALLER_ID})"
    else
        log_warning "AWS Profile 'gemini-pro_ck' 無法驗證或無權限"
    fi
else
    log_warning "AWS CLI 未安裝"
fi

log_info "檢查 ECR 登入狀態..."
if docker info 2>/dev/null | grep -q "470013648166.dkr.ecr.ap-east-1.amazonaws.com"; then
    log_success "已登入 ECR"
else
    log_warning "未登入 ECR 或登入已過期"
    echo "  提示: 運行 'AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | docker login --username AWS --password-stdin 470013648166.dkr.ecr.ap-east-1.amazonaws.com'"
fi

# ============================================
# 8. 網絡配置檢查
# ============================================
show_section "8. 網絡配置檢查"

log_info "檢查埠號占用..."
PORT=3015
if lsof -Pi :${PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    PID=$(lsof -Pi :${PORT} -sTCP:LISTEN -t)
    PROCESS=$(ps -p ${PID} -o comm= 2>/dev/null || echo "unknown")
    log_success "埠號 ${PORT} 正在使用中 (PID: ${PID}, Process: ${PROCESS})"
else
    log_warning "埠號 ${PORT} 未被使用"
fi

log_info "檢查 Docker 網絡..."
if docker network ls | grep -q "wds-manager"; then
    log_success "Docker 網絡 'wds-manager' 存在"
else
    log_info "Docker 網絡 'wds-manager' 不存在（可能使用默認網絡）"
fi

# ============================================
# 總結報告
# ============================================
show_header "診斷總結"

echo -e "${CYAN}${BOLD}關鍵指標：${NC}"
echo ""

# 計算總分
TOTAL_SCORE=0
MAX_SCORE=10

# 1. 線上服務連通性 (2分)
if [[ "${ONLINE_HTTP_CODE}" == "200" ]] || [[ "${ONLINE_HTTP_CODE}" == "302" ]]; then
    echo -e "  ${GREEN}✓${NC} 線上服務可訪問"
    ((TOTAL_SCORE+=2))
else
    echo -e "  ${RED}✗${NC} 線上服務不可訪問"
fi

# 2. 線上版本正確 (2分)
if [[ "${ONLINE_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "  ${GREEN}✓${NC} 線上版本正確 (${ONLINE_VERSION})"
    ((TOTAL_SCORE+=2))
else
    echo -e "  ${YELLOW}⚠${NC} 線上版本需更新 (${ONLINE_VERSION} → ${EXPECTED_VERSION})"
fi

# 3. 本地容器運行 (1分)
if docker ps --filter name=wds-manager --format "{{.ID}}" | grep -q .; then
    echo -e "  ${GREEN}✓${NC} 本地容器運行中"
    ((TOTAL_SCORE+=1))
else
    echo -e "  ${RED}✗${NC} 本地容器未運行"
fi

# 4. 本地版本正確 (1分)
if [[ "${LOCAL_VERSION}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "  ${GREEN}✓${NC} 本地版本正確 (${LOCAL_VERSION})"
    ((TOTAL_SCORE+=1))
else
    echo -e "  ${YELLOW}⚠${NC} 本地版本不符 (${LOCAL_VERSION} → ${EXPECTED_VERSION})"
fi

# 5. Socket.IO 修復 (2分)
if grep -q "this.socket = io()" public/js/app.js; then
    echo -e "  ${GREEN}✓${NC} Socket.IO 初始化已修復"
    ((TOTAL_SCORE+=2))
else
    echo -e "  ${RED}✗${NC} Socket.IO 初始化缺失"
fi

# 6. 文件版本一致 (1分)
if [[ "${PACKAGE_VERSION}" == "${EXPECTED_VERSION}" ]] && \
   [[ "${ENV_VERSION}" == "${EXPECTED_VERSION}" ]] && \
   [[ "${VERSION_JSON}" == "${EXPECTED_VERSION}" ]]; then
    echo -e "  ${GREEN}✓${NC} 所有文件版本一致"
    ((TOTAL_SCORE+=1))
else
    echo -e "  ${YELLOW}⚠${NC} 文件版本不一致"
fi

# 7. 容器無錯誤 (1分)
if docker ps --filter name=wds-manager --format "{{.ID}}" | grep -q .; then
    if [[ ${ERROR_COUNT} -eq 0 ]]; then
        echo -e "  ${GREEN}✓${NC} 容器日誌無錯誤"
        ((TOTAL_SCORE+=1))
    else
        echo -e "  ${YELLOW}⚠${NC} 容器日誌有錯誤"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} 無法檢查日誌"
fi

echo ""
echo -e "${CYAN}${BOLD}總體評分：${TOTAL_SCORE}/${MAX_SCORE}${NC}"
echo ""

if [[ ${TOTAL_SCORE} -ge 9 ]]; then
    log_success "配置良好！系統運行正常"
elif [[ ${TOTAL_SCORE} -ge 7 ]]; then
    log_warning "配置基本正常，有少數問題需要關注"
elif [[ ${TOTAL_SCORE} -ge 5 ]]; then
    log_warning "配置有多個問題，建議盡快修復"
else
    log_error "配置存在嚴重問題，需要立即處理"
fi

echo ""
echo -e "${CYAN}${BOLD}建議操作：${NC}"

if [[ "${ONLINE_VERSION}" != "${EXPECTED_VERSION}" ]]; then
    echo "  1. 更新線上服務到 v${EXPECTED_VERSION}"
    echo "     方法：SSH 到線上服務器並執行更新腳本"
fi

if ! grep -q "this.socket = io()" public/js/app.js; then
    echo "  2. 修復 Socket.IO 初始化"
    echo "     方法：執行 ./fix-and-verify.sh"
fi

if [[ "${LOCAL_VERSION}" != "${EXPECTED_VERSION}" ]]; then
    echo "  3. 更新本地容器"
    echo "     方法：執行 ./run.sh"
fi

if [[ "${PACKAGE_VERSION}" != "${EXPECTED_VERSION}" ]] || \
   [[ "${ENV_VERSION}" != "${EXPECTED_VERSION}" ]] || \
   [[ "${VERSION_JSON}" != "${EXPECTED_VERSION}" ]]; then
    echo "  4. 統一文件版本號"
    echo "     方法：執行 ./fix-and-verify.sh"
fi

echo ""
log_success "診斷完成！"
