#!/bin/bash

# OAuth Login Diagnosis Script
# 帮助诊断 Google OAuth 登录问题

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3015"

echo -e "${BLUE}=========================================="
echo -e "   OAuth 登录问题诊断工具"
echo -e "==========================================${NC}"
echo ""

# Check 1: Server is running
echo -e "${BLUE}[检查 1] 服务器运行状态${NC}"
if curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/health | grep -q "200"; then
    echo -e "${GREEN}✓ 服务器正在运行${NC}"
else
    echo -e "${RED}✗ 服务器未运行！请先启动服务器: npm start${NC}"
    exit 1
fi
echo ""

# Check 2: Environment variables
echo -e "${BLUE}[检查 2] 环境变量配置${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env 文件不存在！${NC}"
    exit 1
fi

# Check required OAuth variables
REQUIRED_VARS=("GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_CALLBACK_URL")
MISSING=0

for VAR in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${VAR}=" .env; then
        VALUE=$(grep "^${VAR}=" .env | cut -d'=' -f2-)
        if [ -n "$VALUE" ] && [ "$VALUE" != "your-client-id-here" ] && [ "$VALUE" != "your-client-secret-here" ]; then
            echo -e "${GREEN}✓ ${VAR} 已配置${NC}"
        else
            echo -e "${RED}✗ ${VAR} 未正确配置！${NC}"
            MISSING=1
        fi
    else
        echo -e "${RED}✗ ${VAR} 缺失！${NC}"
        MISSING=1
    fi
done

if [ $MISSING -eq 1 ]; then
    echo -e "${YELLOW}请检查 .env 文件中的 OAuth 配置${NC}"
fi
echo ""

# Check 3: OAuth redirect
echo -e "${BLUE}[检查 3] OAuth 重定向配置${NC}"
REDIRECT=$(curl -s -I $BASE_URL/auth/google | grep -i "location:" | awk '{print $2}' | tr -d '\r')
if echo "$REDIRECT" | grep -q "accounts.google.com"; then
    echo -e "${GREEN}✓ OAuth 重定向正常${NC}"
    echo -e "  重定向 URL: ${REDIRECT:0:80}..."
else
    echo -e "${RED}✗ OAuth 重定向失败${NC}"
fi
echo ""

# Check 4: Callback URL
echo -e "${BLUE}[检查 4] 回调 URL 配置${NC}"
CALLBACK_URL=$(grep "^GOOGLE_CALLBACK_URL=" .env | cut -d'=' -f2-)
echo -e "配置的回调 URL: ${GREEN}$CALLBACK_URL${NC}"
echo ""

# Check 5: Allowed domains/emails
echo -e "${BLUE}[检查 5] 允许的邮箱配置${NC}"
ALLOWED_DOMAINS=$(grep "^ALLOWED_EMAIL_DOMAINS=" .env | cut -d'=' -f2-)
ALLOWED_EMAILS=$(grep "^ALLOWED_EMAILS=" .env | cut -d'=' -f2-)

if [ -n "$ALLOWED_DOMAINS" ]; then
    echo -e "允许的邮箱域名: ${GREEN}$ALLOWED_DOMAINS${NC}"
else
    echo -e "允许的邮箱域名: ${YELLOW}未设置（允许所有域名）${NC}"
fi

if [ -n "$ALLOWED_EMAILS" ]; then
    echo -e "允许的邮箱地址: ${GREEN}$ALLOWED_EMAILS${NC}"
else
    echo -e "允许的邮箱地址: ${YELLOW}未设置（允许所有邮箱）${NC}"
fi
echo ""

# Common issues
echo -e "${BLUE}=========================================="
echo -e "   常见问题和解决方案"
echo -e "==========================================${NC}"
echo ""

echo -e "${YELLOW}问题 1: Google Console 回调 URL 未配置${NC}"
echo -e "解决方案:"
echo -e "  1. 访问 Google Cloud Console: ${BLUE}https://console.cloud.google.com/${NC}"
echo -e "  2. 选择您的项目"
echo -e "  3. 转到 APIs & Services > Credentials"
echo -e "  4. 点击您的 OAuth 2.0 客户端 ID"
echo -e "  5. 在 \"Authorized redirect URIs\" 中添加:"
echo -e "     ${GREEN}$CALLBACK_URL${NC}"
echo -e "  6. 点击 \"SAVE\""
echo ""

echo -e "${YELLOW}问题 2: 邮箱不在允许列表中${NC}"
echo -e "当前配置:"
if [ -n "$ALLOWED_DOMAINS" ]; then
    echo -e "  只允许这些域名的邮箱: ${GREEN}$ALLOWED_DOMAINS${NC}"
    echo -e "  ${YELLOW}如果您的邮箱域名不在列表中，请在 .env 中添加${NC}"
else
    echo -e "  ${GREEN}允许所有邮箱域名${NC}"
fi
if [ -n "$ALLOWED_EMAILS" ]; then
    echo -e "  只允许这些邮箱: ${GREEN}$ALLOWED_EMAILS${NC}"
    echo -e "  ${YELLOW}如果您的邮箱不在列表中，请在 .env 中添加${NC}"
else
    echo -e "  ${GREEN}允许所有邮箱（如果域名匹配）${NC}"
fi
echo ""

echo -e "${YELLOW}问题 3: Session Secret 未设置${NC}"
SESSION_SECRET=$(grep "^SESSION_SECRET=" .env | cut -d'=' -f2-)
if [ "$SESSION_SECRET" == "your-secret-key-change-this-in-production" ]; then
    echo -e "  ${YELLOW}⚠ 您还在使用默认的 Session Secret${NC}"
    echo -e "  ${YELLOW}生产环境中请修改为随机字符串${NC}"
else
    echo -e "  ${GREEN}✓ Session Secret 已自定义${NC}"
fi
echo ""

echo -e "${YELLOW}问题 4: 浏览器中看到错误信息${NC}"
echo -e "常见错误及原因:"
echo -e "  ${RED}redirect_uri_mismatch${NC}"
echo -e "    → Google Console 中的回调 URL 与 .env 中的不匹配"
echo -e "    → 检查 Google Console 配置是否包含: $CALLBACK_URL"
echo ""
echo -e "  ${RED}access_denied${NC}"
echo -e "    → 用户取消了授权"
echo -e "    → 或邮箱不在允许列表中（检查服务器日志）"
echo ""
echo -e "  ${RED}invalid_client${NC}"
echo -e "    → Client ID 或 Client Secret 错误"
echo -e "    → 请检查 .env 中的配置是否正确"
echo ""

# Test in browser
echo -e "${BLUE}=========================================="
echo -e "   手动测试步骤"
echo -e "==========================================${NC}"
echo ""
echo -e "1. 在浏览器中访问: ${GREEN}http://localhost:3015${NC}"
echo -e "2. 点击 \"Sign in with Google\" 按钮"
echo -e "3. 如果看到错误，请截图并检查以下内容:"
echo ""
echo -e "   ${BLUE}A. 错误页面的 URL${NC}"
echo -e "      记下完整的错误 URL"
echo ""
echo -e "   ${BLUE}B. 错误信息${NC}"
echo -e "      记录显示的错误消息"
echo ""
echo -e "   ${BLUE}C. 服务器日志${NC}"
echo -e "      运行以下命令查看实时日志:"
echo -e "      ${GREEN}tail -f logs/combined.log${NC}"
echo ""

echo -e "${BLUE}=========================================="
echo -e "   快速测试命令"
echo -e "==========================================${NC}"
echo ""
echo -e "测试 OAuth 流程（会打开 Google 登录页面）:"
echo -e "${GREEN}open http://localhost:3015/auth/google${NC}"
echo ""
echo -e "查看实时日志:"
echo -e "${GREEN}tail -f logs/combined.log${NC}"
echo ""
echo -e "查看最近的错误:"
echo -e "${GREEN}grep -i error logs/combined.log | tail -20${NC}"
echo ""

# Final check
echo -e "${BLUE}=========================================="
echo -e "   诊断完成"
echo -e "==========================================${NC}"
echo ""
echo -e "如果问题仍然存在，请提供以下信息："
echo -e "1. 浏览器中看到的错误消息"
echo -e "2. 服务器日志中的错误 (logs/combined.log)"
echo -e "3. Google Console 中的回调 URL 配置截图"
echo ""
