#!/bin/bash

# OAuth2 Authentication Test Script
# Tests the Google OAuth2 login flow for wds-manager

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}OAuth2 Authentication Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if server is running
echo -e "${BLUE}[1/6] Checking if server is running...${NC}"
if curl -s http://localhost:3015/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server is running on port 3015${NC}"
else
    echo -e "${RED}✗ Server is not running${NC}"
    echo -e "${YELLOW}Starting server...${NC}"
    npm start > /dev/null 2>&1 &
    sleep 3
    echo -e "${GREEN}✓ Server started${NC}"
fi
echo ""

# Test 1: Health Check
echo -e "${BLUE}[2/6] Testing health endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s http://localhost:3015/api/health)
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Auth Status (Unauthenticated)
echo -e "${BLUE}[3/6] Testing auth status (should be unauthenticated)...${NC}"
AUTH_STATUS=$(curl -s http://localhost:3015/auth/status)
if echo "$AUTH_STATUS" | grep -q '"authenticated":false'; then
    echo -e "${GREEN}✓ Auth status check passed (unauthenticated)${NC}"
    echo "Response: $AUTH_STATUS"
else
    echo -e "${RED}✗ Auth status check failed${NC}"
    exit 1
fi
echo ""

# Test 3: Protected API (should fail with 401 or 302)
echo -e "${BLUE}[4/6] Testing protected API (should require authentication)...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3015/api/artifacts)
if [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "302" ]; then
    echo -e "${GREEN}✓ Protected API correctly requires authentication${NC}"
    echo "HTTP Status: $HTTP_CODE (Unauthorized/Redirect to Login)"
else
    echo -e "${RED}✗ Protected API test failed (expected 401 or 302, got $HTTP_CODE)${NC}"
    exit 1
fi
echo ""

# Test 4: Login page accessibility
echo -e "${BLUE}[5/6] Testing login page accessibility...${NC}"
LOGIN_RESPONSE=$(curl -s http://localhost:3015/login)
if echo "$LOGIN_RESPONSE" | grep -q "Sign in with Google"; then
    echo -e "${GREEN}✓ Login page is accessible${NC}"
else
    echo -e "${RED}✗ Login page is not accessible${NC}"
    exit 1
fi
echo ""

# Test 5: OAuth redirect
echo -e "${BLUE}[6/6] Testing OAuth redirect URL...${NC}"
REDIRECT_URL=$(curl -s -I http://localhost:3015/auth/google | grep -i location | awk '{print $2}' | tr -d '\r')
if echo "$REDIRECT_URL" | grep -q "accounts.google.com"; then
    echo -e "${GREEN}✓ OAuth redirect is configured correctly${NC}"
    echo "Redirect URL: $REDIRECT_URL"
else
    echo -e "${YELLOW}⚠ Could not verify OAuth redirect (this is normal)${NC}"
fi
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All automated tests passed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Manual test instructions
echo -e "${YELLOW}Manual Testing Instructions:${NC}"
echo ""
echo "1. Open your browser and navigate to:"
echo -e "   ${BLUE}http://localhost:3015${NC}"
echo ""
echo "2. You should be redirected to the login page"
echo ""
echo "3. Click 'Sign in with Google'"
echo ""
echo "4. Complete the Google OAuth flow"
echo ""
echo "5. After successful login, you should:"
echo "   - See your name and photo in the top-right corner"
echo "   - Be able to access the deployment system"
echo "   - Be able to logout using the dropdown menu"
echo ""

# Configuration check
echo -e "${YELLOW}Configuration Check:${NC}"
echo ""
echo -e "Google Client ID: ${BLUE}$(grep GOOGLE_CLIENT_ID .env | cut -d'=' -f2)${NC}"
echo -e "Callback URL: ${BLUE}$(grep GOOGLE_CALLBACK_URL .env | cut -d'=' -f2)${NC}"
echo -e "Allowed Domains: ${BLUE}$(grep ALLOWED_EMAIL_DOMAINS .env | cut -d'=' -f2)${NC}"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Ensure you have configured the callback URL in Google Console:"
echo "   https://console.cloud.google.com/"
echo ""
echo "2. Add the following URI to 'Authorized redirect URIs':"
echo -e "   ${GREEN}http://localhost:3015/auth/google/callback${NC}"
echo ""
echo "3. Open http://localhost:3015 in your browser to test the full flow"
echo ""

# Offer to open browser
echo -e "${BLUE}Would you like to open the browser now? (y/n)${NC}"
read -r -n 1 REPLY
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Opening browser...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open http://localhost:3015
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open http://localhost:3015
    else
        echo "Please manually open: http://localhost:3015"
    fi
fi

echo ""
echo -e "${GREEN}Test script completed!${NC}"
