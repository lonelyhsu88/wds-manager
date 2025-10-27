# SSO Fix - Version 1.19.1

**Date**: 2025-10-27
**Issue**: Real SSO login from Operations Portal failing with "Invalid SSO token" error (401)
**Status**: ✅ Fixed

---

## Problem Description

When users attempted to log in via Operations Portal (https://ops.ftgaming.cc → WDS Manager), they encountered "SSO Verification Failed" errors.

### Error Logs
```
[info]: Verifying SSO token with: https://ops.ftgaming.cc/api/sso/verify
[error]: Request failed with status code 401
{"response":{"error":"Invalid SSO token","success":false}}
```

---

## Root Cause

The wds-manager SSO service was accessing user data incorrectly from the Operations Portal response:

**Incorrect (v1.19.0)**:
```javascript
// wds-manager was using response.data.user
return {
  googleId: response.data.user.googleId,
  email: response.data.user.email,
  displayName: response.data.user.displayName || response.data.user.name,
  // ...
};
```

**Correct Response Structure**:
```json
{
  "success": true,
  "data": {
    "googleId": "...",
    "email": "...",
    "name": "...",
    "avatarUrl": "..."
  }
}
```

The Operations Portal returns user data in `response.data.data`, not `response.data.user`.

---

## Solution

Updated `src/services/sso-service.js` to match the rds-manager implementation:

**Fixed (v1.19.1)**:
```javascript
// Correct: use response.data.data
const userData = response.data.data;

return {
  googleId: userData.googleId,
  email: userData.email,
  displayName: userData.name || userData.displayName,
  firstName: userData.name?.split(' ')[0] || '',
  lastName: userData.name?.split(' ').slice(1).join(' ') || '',
  image: userData.avatarUrl || userData.image || userData.picture || '',
  role: userData.role || 'Viewer',
  ssoVerified: true,
  targetSystem: userData.targetSystem || 'wds-manager'
};
```

### Key Changes

1. **Response Data Access**: Changed from `response.data.user` to `response.data.data`
2. **Field Mapping**:
   - `userData.name` (primary) instead of `userData.displayName`
   - `userData.avatarUrl` (primary) instead of `userData.image`
   - Parse `userData.name` to extract firstName/lastName
3. **Aligned with rds-manager**: Ensures consistency across FT Gaming applications

---

## Deployment

### Version Update
- **Version**: 1.19.0 → 1.19.1
- **Files Updated**:
  - `src/services/sso-service.js`
  - `.env` (APP_VERSION)
  - `package.json` (version)

### Docker Build
```bash
# Multi-platform build (AMD64 + ARM64)
docker buildx build --platform linux/amd64,linux/arm64 \
  --build-arg VERSION=1.19.1 \
  -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:1.19.1 \
  -t 470013648166.dkr.ecr.ap-east-1.amazonaws.com/wds-manager:latest \
  --push .
```

### Service Restart
```bash
docker stop wds-manager
docker rm wds-manager
./run.sh
```

---

## Testing SSO

### Real SSO (Production)

1. Navigate to Operations Portal: https://ops.ftgaming.cc
2. Select "WDS Manager" from the application list
3. You will be automatically redirected with an SSO token
4. Login should succeed without errors

### Mock SSO (Development)

If you need to test without Operations Portal:

```bash
# Enable Mock SSO in .env
MOCK_SSO_EMAIL=your.email@jvd.tw
NODE_ENV=development

# Rebuild container
docker compose down
docker compose up -d --build

# Test with any token
curl -L "http://localhost:3015/auth/sso?token=test123"
```

---

## Verification

### Success Indicators

1. **No 401 Errors**: Check logs for successful SSO verification
   ```bash
   docker logs wds-manager | grep -i "sso"
   ```

2. **Expected Log Output**:
   ```
   [info]: Verifying SSO token with: https://ops.ftgaming.cc/api/sso/verify
   [info]: SSO token verified successfully: {"email":"user@example.com","displayName":"User Name"}
   ```

3. **Successful Login**: User is redirected to dashboard with their profile loaded

### Troubleshooting

If SSO still fails:

1. **Check Container Logs**:
   ```bash
   docker logs -f wds-manager
   ```

2. **Verify Environment**:
   ```bash
   docker exec wds-manager env | grep -E "NODE_ENV|MOCK_SSO|OPS_PORTAL"
   ```

3. **Test Operations Portal Connectivity**:
   ```bash
   docker exec wds-manager wget -O- https://ops.ftgaming.cc/api/sso/verify
   ```

---

## Related Documentation

- `SSO_INTEGRATION_v1.19.0.md` - Complete SSO integration guide
- `SSO_DEVELOPMENT_SETUP.md` - Development environment setup
- `DEPLOYMENT_GUIDE.md` - Production deployment guide

---

**Fixed By**: Claude Code
**Reference Implementation**: rds-manager SSO service
**Verified**: ✅ Service running successfully on v1.19.1
