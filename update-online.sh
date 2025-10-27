#!/usr/bin/env bash
# 更新線上 WDS Manager 服務
set -euo pipefail

# 顏色設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 檢查是否提供了服務器地址
if [[ $# -lt 1 ]]; then
    echo "使用方法: $0 <server-address> [ssh-user]"
    echo ""
    echo "範例："
    echo "  $0 wds-manager.ftgaming.cc"
    echo "  $0 wds-manager.ftgaming.cc ubuntu"
    echo "  $0 192.168.1.100 root"
    echo ""
    exit 1
fi

SERVER="$1"
SSH_USER="${2:-root}"  # 默認使用 root
TARGET_VERSION="1.20.0"

show_header "線上 WDS Manager 更新腳本 v${TARGET_VERSION}"

log_info "目標服務器: ${SSH_USER}@${SERVER}"
log_info "目標版本: ${TARGET_VERSION}"
echo ""

# SSH 密鑰路徑
SSH_KEY="${SSH_KEY:-$HOME/.ssh/hk-devops.pem}"
SSH_OPTS="-i ${SSH_KEY} -o ConnectTimeout=5 -o StrictHostKeyChecking=no"

# 測試 SSH 連接
log_info "測試 SSH 連接..."
if ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "echo 'SSH 連接成功'" 2>/dev/null; then
    log_success "SSH 連接正常"
else
    log_error "無法連接到服務器"
    log_info "請確認："
    echo "  1. 服務器地址正確"
    echo "  2. SSH 密鑰已配置 (${SSH_KEY})"
    echo "  3. 用戶名正確 (當前: ${SSH_USER})"
    exit 1
fi

# 檢查遠端 Docker
log_info "檢查遠端 Docker..."
if ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker --version" >/dev/null 2>&1; then
    DOCKER_VERSION=$(ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker --version" | cut -d' ' -f3 | tr -d ',')
    log_success "Docker 已安裝: ${DOCKER_VERSION}"
else
    log_error "遠端服務器未安裝 Docker"
    exit 1
fi

# 檢查當前運行的容器
log_info "檢查當前運行的容器..."
CURRENT_CONTAINER=$(ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker ps --filter name=wds-manager --format '{{.ID}}:{{.Image}}:{{.Status}}'" 2>/dev/null || echo "")

if [[ -n "${CURRENT_CONTAINER}" ]]; then
    CONTAINER_ID=$(echo "${CURRENT_CONTAINER}" | cut -d':' -f1)
    CONTAINER_IMAGE=$(echo "${CURRENT_CONTAINER}" | cut -d':' -f2)
    CONTAINER_STATUS=$(echo "${CURRENT_CONTAINER}" | cut -d':' -f3-)
    log_success "發現運行中的容器"
    echo "  ID: ${CONTAINER_ID}"
    echo "  Image: ${CONTAINER_IMAGE}"
    echo "  Status: ${CONTAINER_STATUS}"
else
    log_warning "未發現運行中的 wds-manager 容器"
fi

# 檢查遠端工作目錄
log_info "檢查遠端工作目錄..."
REMOTE_DIR=$(ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "find /root /home -name 'wds-manager' -type d 2>/dev/null | head -1" || echo "")

if [[ -z "${REMOTE_DIR}" ]]; then
    log_error "無法找到遠端 wds-manager 目錄"
    read -p "請輸入遠端工作目錄路徑: " REMOTE_DIR
fi

log_info "使用工作目錄: ${REMOTE_DIR}"

# 確認更新
echo ""
log_warning "準備執行以下操作："
echo "  1. 登入 AWS ECR"
echo "  2. 拉取最新映像: ${TARGET_VERSION}"
echo "  3. 停止並移除現有容器"
echo "  4. 啟動新容器"
echo ""
read -p "$(echo -e ${YELLOW}確認執行? [y/N]: ${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "取消更新"
    exit 0
fi

# 執行更新
show_header "開始更新"

log_info "步驟 1/5: 登入 AWS ECR..."
ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "AWS_PROFILE=gemini-pro_ck aws ecr get-login-password --region ap-east-1 | docker login --username AWS --password-stdin 470013648166.dkr.ecr.ap-east-1.amazonaws.com" || {
    log_error "ECR 登入失敗"
    exit 1
}
log_success "ECR 登入成功"

log_info "步驟 2/5: 拉取最新映像..."
ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker pull 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:${TARGET_VERSION}" || {
    log_error "映像拉取失敗"
    exit 1
}
log_success "映像拉取成功"

log_info "步驟 3/5: 停止現有容器..."
ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker stop wds-manager 2>/dev/null || true"
log_success "容器已停止"

log_info "步驟 4/5: 移除現有容器..."
ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker rm wds-manager 2>/dev/null || true"
log_success "容器已移除"

log_info "步驟 5/5: 啟動新容器..."
ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "cd ${REMOTE_DIR} && bash run.sh" || {
    log_error "容器啟動失敗"
    log_info "正在檢查錯誤日誌..."
    ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker logs --tail 50 wds-manager 2>&1" || true
    exit 1
}
log_success "容器已啟動"

# 等待服務啟動
log_info "等待服務啟動..."
sleep 10

# 驗證更新
show_header "驗證更新"

log_info "檢查容器狀態..."
UPDATED_CONTAINER=$(ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker ps --filter name=wds-manager --format '{{.ID}}:{{.Image}}:{{.Status}}'" 2>/dev/null || echo "")

if [[ -n "${UPDATED_CONTAINER}" ]]; then
    CONTAINER_ID=$(echo "${UPDATED_CONTAINER}" | cut -d':' -f1)
    CONTAINER_IMAGE=$(echo "${UPDATED_CONTAINER}" | cut -d':' -f2)
    CONTAINER_STATUS=$(echo "${UPDATED_CONTAINER}" | cut -d':' -f3-)
    log_success "容器運行中"
    echo "  ID: ${CONTAINER_ID}"
    echo "  Image: ${CONTAINER_IMAGE}"
    echo "  Status: ${CONTAINER_STATUS}"
else
    log_error "容器未運行"
    exit 1
fi

log_info "檢查服務響應..."
if ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3015" | grep -q "200\|302"; then
    log_success "服務響應正常"
else
    log_warning "服務可能尚未完全啟動"
fi

log_info "檢查版本..."
ONLINE_VERSION=$(ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "curl -s http://localhost:3015/api/version | grep -o '\"version\":\"[^\"]*\"' | cut -d'\"' -f4" 2>/dev/null || echo "unknown")

if [[ "${ONLINE_VERSION}" == "${TARGET_VERSION}" ]]; then
    log_success "線上版本正確: ${ONLINE_VERSION}"
else
    log_warning "線上版本: ${ONLINE_VERSION} (預期: ${TARGET_VERSION})"
fi

log_info "顯示最新日誌..."
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}最近 30 行容器日誌：${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
ssh ${SSH_OPTS} "${SSH_USER}@${SERVER}" "docker logs --tail 30 wds-manager"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 完成
show_header "更新完成"

echo -e "${GREEN}✨ 線上服務已更新到 v${TARGET_VERSION}${NC}"
echo ""
echo -e "${BLUE}📊 摘要：${NC}"
echo "  • 服務器: ${SSH_USER}@${SERVER}"
echo "  • 版本: ${ONLINE_VERSION}"
echo "  • 容器 ID: ${CONTAINER_ID}"
echo "  • 狀態: ${CONTAINER_STATUS}"
echo ""
echo -e "${BLUE}🔗 連結：${NC}"
echo "  • https://wds-manager.ftgaming.cc"
echo ""
echo -e "${BLUE}📝 有用的命令：${NC}"
echo "  • 查看日誌: ssh ${SSH_USER}@${SERVER} 'docker logs -f wds-manager'"
echo "  • 檢查狀態: ssh ${SSH_USER}@${SERVER} 'docker ps --filter name=wds-manager'"
echo "  • 重啟服務: ssh ${SSH_USER}@${SERVER} 'cd ${REMOTE_DIR} && ./run.sh'"
echo ""
log_success "更新完成！"
