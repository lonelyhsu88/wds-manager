#!/usr/bin/env bash
# 利用 ECR 映像啟動 WDS Manager 容器
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

get_env_value() {
  local target="$1"
  local line
  line=$(awk -v key="$target" '
    $0 ~ /^[[:space:]]*#/ {next}
    $0 ~ /^[[:space:]]*$/ {next}
    {
      pos = index($0, "=")
      if (pos == 0) next
      k = substr($0, 1, pos - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
      if (k == key) {
        v = substr($0, pos + 1)
        gsub(/^[[:space:]]+/, "", v)
        gsub(/[[:space:]]+$/, "", v)
        val = v
      }
    }
    END {
      if (length(val)) printf "%s", val
    }
  ' "${ENV_FILE}")
  if [[ -z "${line:-}" ]]; then
    return 1
  fi

  line="${line%$'\r'}"

  local first_char="${line:0:1}"
  local last_char="${line: -1}"

  if [[ ${#line} -ge 2 && "$first_char" == '"' && "$last_char" == '"' ]]; then
    line="${line:1:-1}"
  elif [[ ${#line} -ge 2 && "$first_char" == "'" && "$last_char" == "'" ]]; then
    line="${line:1:-1}"
  fi

  printf '%s' "$line"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "請先安裝 Docker" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "請先安裝並設定 AWS CLI" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "找不到 ${ENV_FILE}，請先建立並填寫部署參數" >&2
  exit 1
fi

if [[ -z "${AWS_PROFILE:-}" ]]; then
  AWS_PROFILE="$(get_env_value "AWS_PROFILE" || true)"
fi
if [[ -n "${AWS_PROFILE:-}" ]]; then
  export AWS_PROFILE
  echo "使用 AWS Profile: ${AWS_PROFILE}"
else
  echo "未設定 AWS_PROFILE，將使用 EC2 IAM Role 或預設憑證"
fi

if [[ -z "${AWS_ACCOUNT_ID:-}" ]]; then
  AWS_ACCOUNT_ID="$(get_env_value "AWS_ACCOUNT_ID" || true)"
fi

if [[ -z "${AWS_REGION:-}" ]]; then
  AWS_REGION="$(get_env_value "AWS_REGION" || true)"
fi
if [[ -z "${AWS_REGION}" ]]; then
  AWS_REGION="ap-east-1"
fi

if [[ -z "${AWS_ACCOUNT_ID:-}" ]]; then
  set +e
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  status=$?
  set -e
  if [[ ${status} -ne 0 || -z "${AWS_ACCOUNT_ID}" ]]; then
    echo "無法自動取得 AWS_ACCOUNT_ID，請確認 AWS CLI 設定或於 ${ENV_FILE} 中加入 AWS_ACCOUNT_ID" >&2
    exit 1
  fi
fi

REPO_NAME="wds-manager"

if [[ $# -gt 0 ]]; then
  VERSION_TAG="$1"
else
  # 優先從 .env 讀取版本號
  VERSION_TAG="$(get_env_value "APP_VERSION" || true)"

  # 如果沒有，嘗試從 package.json 讀取
  if [[ -z "${VERSION_TAG}" && -f "${ROOT_DIR}/package.json" ]]; then
    VERSION_TAG="$(node -pe "require('./package.json').version" 2>/dev/null || echo '')"
  fi

  # 如果還是沒有，使用 latest
  if [[ -z "${VERSION_TAG}" ]]; then
    VERSION_TAG="latest"
  fi
fi

IMAGE_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:${VERSION_TAG}"
CONTAINER_NAME="wds-manager"

# 讀取 PORT 配置
PORT="$(get_env_value "PORT" || echo "3015")"

echo "登入 AWS ECR (${AWS_REGION})..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

set +e
docker ps -a --format '{{.Names}}' | grep -w "${CONTAINER_NAME}" >/dev/null 2>&1
EXIST=$?
set -e

if [[ ${EXIST} -eq 0 ]]; then
  echo "發現既有容器 ${CONTAINER_NAME}，先行停止並移除..."
  docker rm -f "${CONTAINER_NAME}"
fi

echo "拉取映像：${IMAGE_URL}"
docker pull "${IMAGE_URL}"

# 建立必要的目錄
LOGS_DIR="${ROOT_DIR}/logs"
DATA_DIR="${ROOT_DIR}/data"
mkdir -p "${LOGS_DIR}"
mkdir -p "${DATA_DIR}"

# 確保 version.json 存在且是最新版本
if [[ ! -f "${ROOT_DIR}/version.json" || "${VERSION_TAG}" != "latest" ]]; then
  echo "從容器中提取最新的 version.json..."

  # 臨時啟動容器以提取 version.json
  TMP_CONTAINER="wds-manager-tmp-$$"
  docker run --name "${TMP_CONTAINER}" --rm "${IMAGE_URL}" cat /app/version.json > "${ROOT_DIR}/version.json" 2>/dev/null || {
    echo "警告: 無法從容器提取 version.json，創建預設版本..."
    cat > "${ROOT_DIR}/version.json" << 'EOF'
{
  "version": "1.0.0",
  "history": [
    {
      "version": "1.0.0",
      "date": "2025-10-27",
      "changes": ["Initial version"]
    }
  ]
}
EOF
  }
fi

# 確保 version.json 有正確的權限 (容器內 nodejs 用戶可寫)
chmod 666 "${ROOT_DIR}/version.json"

echo "啟動容器..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --env-file "${ENV_FILE}" \
  -p "${PORT}:${PORT}" \
  -v "${HOME}/.aws:/home/nodejs/.aws:ro" \
  -v "${LOGS_DIR}:/app/logs" \
  -v "${DATA_DIR}:/app/data" \
  -v "${ROOT_DIR}/version.json:/app/version.json" \
  --health-cmd="node -e \"require('http').get('http://localhost:${PORT}/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\"" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  --health-start-period=10s \
  "${IMAGE_URL}"

echo ""
echo "✅ 啟動完成！"
echo ""
echo "📊 服務資訊："
echo "  - 版本: ${VERSION_TAG}"
echo "  - 容器: ${CONTAINER_NAME}"
echo "  - 埠號: ${PORT}"
echo "  - 日誌: ${LOGS_DIR}"
echo "  - 資料: ${DATA_DIR}"
echo ""
echo "🌐 存取方式："
echo "  - 本地: http://localhost:${PORT}"
echo "  - 遠端: https://wds-manager.ftgaming.cc (若有對應 DNS/反向代理)"
echo ""
echo "📝 查看日誌: docker logs -f ${CONTAINER_NAME}"
echo "🔍 檢查狀態: docker ps --filter name=${CONTAINER_NAME}"
echo "🛑 停止服務: docker stop ${CONTAINER_NAME}"
echo ""
