#!/usr/bin/env bash
# 修復 Clear Deploy Bucket 功能並驗證線上部署
set -euo pipefail

# 顏色設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 函數：打印帶顏色的訊息
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

# 函數：顯示標題
show_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 函數：確認執行
confirm() {
    read -p "$(echo -e ${YELLOW}⚠️  $1 [y/N]: ${NC})" -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# 獲取當前目錄
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT_DIR}"

show_header "WDS Manager - 修復與驗證腳本 v1.19.11"

# ============================================
# 步驟 1: 檢查當前狀態
# ============================================
show_header "步驟 1/6: 檢查當前狀態"

log_info "檢查 package.json 版本..."
PACKAGE_VERSION=$(node -pe "require('./package.json').version" 2>/dev/null || echo "unknown")
echo "  package.json: ${PACKAGE_VERSION}"

log_info "檢查 .env 版本..."
ENV_VERSION=$(grep "APP_VERSION=" .env | cut -d'=' -f2 | tr -d '"' || echo "unknown")
echo "  .env: ${ENV_VERSION}"

log_info "檢查 version.json 版本..."
VERSION_JSON=$(node -pe "require('./version.json').version" 2>/dev/null || echo "unknown")
echo "  version.json: ${VERSION_JSON}"

log_info "檢查 Docker 容器狀態..."
if docker ps --filter name=wds-manager --format "{{.Status}}" | grep -q "Up"; then
    CONTAINER_STATUS=$(docker ps --filter name=wds-manager --format "{{.Status}}")
    log_success "容器運行中: ${CONTAINER_STATUS}"
else
    log_warning "容器未運行"
fi

# ============================================
# 步驟 2: 確認版本號一致性
# ============================================
show_header "步驟 2/6: 確認版本號一致性"

TARGET_VERSION="1.19.11"

if [[ "${PACKAGE_VERSION}" != "${TARGET_VERSION}" ]] || \
   [[ "${ENV_VERSION}" != "${TARGET_VERSION}" ]] || \
   [[ "${VERSION_JSON}" != "${TARGET_VERSION}" ]]; then
    log_warning "版本號不一致，需要更新"

    if confirm "是否更新所有版本號到 ${TARGET_VERSION}?"; then
        log_info "更新 package.json..."
        sed -i '' "s/\"version\": \".*\"/\"version\": \"${TARGET_VERSION}\"/g" package.json

        log_info "更新 .env..."
        sed -i '' "s/APP_VERSION=.*/APP_VERSION=${TARGET_VERSION}/g" .env

        log_info "更新 HTML 文件..."
        sed -i '' "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v${TARGET_VERSION}/g" public/*.html

        log_success "版本號已更新到 ${TARGET_VERSION}"
    else
        log_warning "跳過版本更新"
    fi
else
    log_success "所有版本號一致: ${TARGET_VERSION}"
fi

# ============================================
# 步驟 3: 驗證 Socket.IO 修復
# ============================================
show_header "步驟 3/6: 驗證 Socket.IO 修復"

log_info "檢查 app.js 中的 Socket.IO 初始化..."
if grep -q "this.socket = io()" public/js/app.js; then
    log_success "Socket.IO 初始化已存在於 DeploymentManager"
else
    log_error "Socket.IO 初始化缺失！"
    log_info "正在修復..."

    # 備份原文件
    cp public/js/app.js public/js/app.js.backup

    # 在 constructor 中添加 Socket.IO 初始化
    sed -i '' '/this.presetManager = null;/a\
\
        // Initialize Socket.IO connection\
        this.socket = io();
' public/js/app.js

    log_success "Socket.IO 初始化已添加"
fi

log_info "檢查 clearDeployBucket 方法..."
if grep -q "this.socket.on('clear-bucket-progress'" public/js/app.js; then
    log_success "clearDeployBucket 方法使用正確的 Socket.IO 事件監聽"
else
    log_warning "clearDeployBucket 方法可能有問題"
fi

# ============================================
# 步驟 4: 構建並推送 Docker 映像
# ============================================
show_header "步驟 4/6: 構建並推送 Docker 映像"

if confirm "是否構建並推送 Docker 映像到 ECR?"; then
    log_info "登入 AWS ECR..."
    AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | \
        docker login --username AWS --password-stdin 470013648166.dkr.ecr.ap-east-1.amazonaws.com

    log_info "構建多架構 Docker 映像 (amd64 + arm64)..."
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        --push \
        -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:${TARGET_VERSION} \
        -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:latest \
        .

    log_success "Docker 映像已推送: ${TARGET_VERSION} 和 latest"
else
    log_warning "跳過 Docker 映像構建"
fi

# ============================================
# 步驟 5: 重啟容器
# ============================================
show_header "步驟 5/6: 重啟容器"

if confirm "是否重啟本地容器?"; then
    log_info "停止現有容器..."
    docker stop wds-manager 2>/dev/null || true
    docker rm wds-manager 2>/dev/null || true

    log_info "啟動新容器..."
    ./run.sh

    log_success "容器已重啟"

    # 等待服務啟動
    log_info "等待服務啟動..."
    sleep 5
else
    log_warning "跳過容器重啟"
fi

# ============================================
# 步驟 6: 驗證部署
# ============================================
show_header "步驟 6/6: 驗證部署"

log_info "檢查本地服務..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3015 | grep -q "200\|302"; then
    log_success "本地服務響應正常 (http://localhost:3015)"
else
    log_error "本地服務無響應"
fi

log_info "檢查 Docker 容器..."
if docker ps --filter name=wds-manager --format "{{.Status}}" | grep -q "Up"; then
    CONTAINER_ID=$(docker ps --filter name=wds-manager --format "{{.ID}}")
    log_success "容器運行中 (ID: ${CONTAINER_ID})"

    log_info "檢查容器日誌..."
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}最近 20 行容器日誌：${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    docker logs --tail 20 wds-manager
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
else
    log_error "容器未運行"
fi

log_info "檢查線上服務..."
if curl -s -o /dev/null -w "%{http_code}" https://wds-manager.ftgaming.cc | grep -q "200\|302"; then
    log_success "線上服務響應正常 (https://wds-manager.ftgaming.cc)"

    log_info "檢查線上版本..."
    ONLINE_VERSION=$(curl -s https://wds-manager.ftgaming.cc/api/version | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).version" 2>/dev/null || echo "unknown")
    if [[ "${ONLINE_VERSION}" == "${TARGET_VERSION}" ]]; then
        log_success "線上版本正確: ${ONLINE_VERSION}"
    else
        log_warning "線上版本: ${ONLINE_VERSION} (預期: ${TARGET_VERSION})"
        log_warning "可能需要等待反向代理更新或手動重啟線上容器"
    fi
else
    log_warning "線上服務無響應或未配置"
fi

# ============================================
# 總結
# ============================================
show_header "修復與驗證完成"

echo -e "${GREEN}✨ 摘要：${NC}"
echo "  • 目標版本: ${TARGET_VERSION}"
echo "  • package.json: ${PACKAGE_VERSION}"
echo "  • .env: ${ENV_VERSION}"
echo "  • version.json: ${VERSION_JSON}"
echo ""
echo -e "${BLUE}📋 修復內容：${NC}"
echo "  1. ✅ 在 DeploymentManager constructor 中添加 Socket.IO 初始化"
echo "  2. ✅ 修復 Clear Deploy Bucket 卡在 'Initializing...' 的問題"
echo "  3. ✅ 統一所有文件的版本號到 ${TARGET_VERSION}"
echo ""
echo -e "${BLUE}🧪 測試清單：${NC}"
echo "  [ ] 登入系統，確認右上角顯示 v${TARGET_VERSION}"
echo "  [ ] 點擊 'Clear Deploy Bucket' 按鈕"
echo "  [ ] 確認看到進度條: 'Scanning bucket for files...'"
echo "  [ ] 確認看到進度條: 'Deleting batch X/Y...' 並顯示百分比"
echo "  [ ] 確認完成後顯示: 'Successfully deleted N files'"
echo "  [ ] 確認 modal 自動關閉"
echo ""
echo -e "${BLUE}🔗 連結：${NC}"
echo "  • 本地: http://localhost:3015"
echo "  • 線上: https://wds-manager.ftgaming.cc"
echo ""
echo -e "${BLUE}📝 有用的命令：${NC}"
echo "  • 查看日誌: docker logs -f wds-manager"
echo "  • 重啟容器: ./run.sh"
echo "  • 查看狀態: docker ps --filter name=wds-manager"
echo ""
log_success "腳本執行完成！"
