# SSO Integration Guide v1.19.0

**Date**: 2025-10-27
**Version**: 1.19.0
**Purpose**: Complete SSO (Single Sign-On) integration with Operations Portal and Role-Based Access Control

---

## 📋 Overview

WDS Manager now supports **two authentication methods**:

1. **Operations Portal SSO** - Primary method for production use
2. **Google OAuth2** - Alternative authentication method

Both methods are integrated with a **Role-Based Access Control (RBAC)** system that provides three permission levels:
- **Admin** - Full system access
- **Operator** - Deployment and configuration management
- **Viewer** - Read-only access

---

## 🏗️ Architecture

### Authentication Flow

```
┌─────────────────────────────────────────────────────────┐
│                   User Access Request                    │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   SSO Route                Google OAuth
 /auth/sso?token=...      /auth/google
        │                       │
        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ SSO Service      │    │ Passport Google  │
│ verifySSOToken() │    │ Strategy         │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │ Role Mapping Service  │
         │ getRolesForEmail()    │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Create Session        │
         │ Set Cookie            │
         │ Redirect to Home      │
         └───────────────────────┘
```

---

## 📁 File Structure

### New Files Created

```
wds-manager/
├── src/
│   ├── config/
│   │   ├── env.js                    # Centralized configuration
│   │   └── roles.js                  # Role definitions and permissions
│   ├── services/
│   │   ├── sso-service.js            # SSO token verification
│   │   └── role-mapping-service.js   # Role assignment logic
│   ├── middleware/
│   │   └── require-role.js           # RBAC middleware
│   └── data/
│       └── role-mappings.json        # Email-to-role mappings
└── SSO_INTEGRATION_v1.19.0.md        # This document
```

### Modified Files

```
wds-manager/
├── src/
│   ├── app.js                        # Updated session configuration
│   ├── config/passport.js            # Added role assignment
│   └── routes/auth.js                # Added SSO endpoints
├── .env                              # Added SSO configuration
├── package.json                      # Version bump to 1.19.0
└── public/index.html                 # Version badge updated
```

---

## 🔐 SSO Configuration

### Environment Variables

Added to `.env`:

```bash
# SSO Configuration (Operations Portal)
OPS_PORTAL_URL=https://ops.ftgaming.cc
SSO_VERIFY_PATH=/api/sso/verify
SSO_VERIFY_TIMEOUT_MS=5000
# For development: set mock SSO email to bypass portal verification
MOCK_SSO_EMAIL=

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3015

# Security
FORCE_SECURE_COOKIE=false
```

### SSO Service (`src/services/sso-service.js`)

**Key Functions:**

1. **`verifySSOToken(token)`**
   - Sends token to Operations Portal for verification
   - Endpoint: `POST ${OPS_PORTAL_URL}/api/sso/verify`
   - Returns user data: `{ email, displayName, googleId, image, ... }`
   - Handles errors: expired token, already used, connection issues

2. **`formatUserFromSSO(ssoUserData)`**
   - Formats user data for session storage
   - Calls `getRolesForEmail()` to assign roles
   - Returns standardized user object

3. **`buildMockSsoUser(email)`**
   - For development/testing
   - Bypasses portal verification
   - Enabled when `MOCK_SSO_EMAIL` is set in development mode

---

## 👥 Role-Based Access Control (RBAC)

### Role Definitions (`src/config/roles.js`)

| Role | Level | Permissions |
|------|-------|-------------|
| **Admin** | 3 | All permissions (`*`) |
| **Operator** | 2 | `deploy:*`, `artifact:*`, `bucket:*`, `version:*`, `preset:*` |
| **Viewer** | 1 | `deploy:read`, `artifact:read`, `bucket:read`, `version:read`, `preset:read` |

**Permission Format**: `resource:action`
- Examples: `deploy:create`, `artifact:delete`, `bucket:clear`

**Utility Functions**:
- `hasPermission(roleName, permission)` - Check if role has specific permission
- `hasRole(userRoles, requiredRole)` - Check if user meets minimum role level
- `getHighestRoleLevel(userRoles)` - Get user's highest role level
- `isValidRole(roleName)` - Validate role name

### Role Mapping Service (`src/services/role-mapping-service.js`)

**Data Structure** (`src/data/role-mappings.json`):

```json
{
  "emailRoleMapping": {
    "lonely.h@jvd.tw": ["Admin"],
    "operator@jvd.tw": ["Operator"],
    "viewer@jvd.tw": ["Viewer"]
  },
  "domainDefaultRoles": {
    "jvd.tw": ["Viewer"],
    "default": ["Viewer"]
  }
}
```

**Role Assignment Logic**:
1. Check email-specific mapping first
2. Fall back to domain-based default roles
3. Use global default (Viewer) if no match

**Key Functions**:
- `getRolesForEmail(email)` - Get roles for user
- `setRolesForEmail(email, roles)` - Update email-specific roles
- `setDomainDefaultRoles(domain, roles)` - Update domain defaults
- `getAllMappings()` - Get all mappings (for management UI)
- `updateAllMappings(mappings)` - Bulk update (validates at least one Admin exists)

### RBAC Middleware (`src/middleware/require-role.js`)

**Middleware Functions**:

```javascript
// Generic role check
requireRole('Admin')      // Requires Admin
requireRole('Operator')   // Requires Operator or Admin
requireRole('Viewer')     // Requires any authenticated user

// Convenience functions
requireAdmin()            // Admin only
requireOperator()         // Operator or Admin
requireViewer()           // Any authenticated user

// Permission-based check
requirePermission('deploy:create')  // Requires specific permission
```

**Usage Example**:

```javascript
const { requireOperator, requireAdmin } = require('./middleware/require-role');

// Operator can deploy
router.post('/api/deploy', requireOperator(), async (req, res) => {
  // Deployment logic
});

// Only Admin can manage roles
router.put('/api/roles', requireAdmin(), async (req, res) => {
  // Role management logic
});
```

---

## 🔗 Authentication Routes

### SSO Login

**Endpoint**: `GET /auth/sso?token=<jwt-token>`

**Flow**:
1. User authenticates with Operations Portal
2. Portal redirects to: `http://wds-manager.example.com/auth/sso?token=<jwt>`
3. WDS Manager verifies token with portal
4. Portal returns user data
5. WDS Manager assigns roles via `getRolesForEmail()`
6. Creates session and sets cookie
7. Redirects to home page

**Error Handling**:
- No token: 400 error with HTML page
- Expired token: 401 with specific error message
- Already used: 401 with specific error message
- Connection error: 401 with specific error message

**Cookie Configuration**:
```javascript
{
  name: 'wds-manager.sid',
  httpOnly: true,
  secure: true (production),
  sameSite: 'lax',
  maxAge: 8 hours,
  rolling: true
}
```

### Google OAuth Login

**Endpoints**:
- `GET /auth/google` - Initiate OAuth flow
- `GET /auth/google/callback` - OAuth callback

**Flow**:
1. User clicks "Sign in with Google"
2. Redirected to Google consent screen
3. Google redirects back to callback
4. Passport Google Strategy validates user
5. Assigns roles via `getRolesForEmail()`
6. Creates session and sets cookie
7. Redirects to home page

**Updated User Object**:

```javascript
{
  googleId: '...',
  email: 'user@example.com',
  displayName: 'User Name',
  firstName: 'User',
  lastName: 'Name',
  image: 'https://...',
  roles: ['Operator'],         // NEW
  loginMethod: 'OAuth2',       // NEW
  lastLogin: '2025-10-27T...'  // NEW
}
```

### Logout

**Endpoint**: `GET /auth/logout`

Destroys session and redirects to login page.

### User Info

**Endpoints**:

1. **`GET /auth/status`** - Basic authentication check
   ```json
   {
     "authenticated": true,
     "user": {
       "email": "user@example.com",
       "displayName": "User Name",
       "image": "https://...",
       "roles": ["Operator"],
       "loginMethod": "OPS_PORTAL_SSO",
       "lastLogin": "2025-10-27T..."
     }
   }
   ```

2. **`GET /auth/me`** - Detailed user information
   ```json
   {
     "email": "user@example.com",
     "displayName": "User Name",
     "firstName": "User",
     "lastName": "Name",
     "image": "https://...",
     "roles": ["Operator"],
     "loginMethod": "OPS_PORTAL_SSO",
     "lastLogin": "2025-10-27T..."
   }
   ```

---

## 🔧 Session Configuration

### Updated Session Settings (`src/app.js`)

```javascript
app.use(session({
  secret: config.sessionSecret,
  resave: true,
  saveUninitialized: false,
  name: 'wds-manager.sid',
  cookie: {
    httpOnly: true,
    secure: isProduction || process.env.FORCE_SECURE_COOKIE === 'true',
    sameSite: 'lax',    // Allow SSO redirects
    maxAge: 8 hours,
    path: '/',
    domain: undefined
  },
  proxy: true,
  rolling: true         // Reset maxAge on every request
}));
```

**Key Changes**:
- Cookie name: `wds-manager.sid` (was default `connect.sid`)
- SameSite: `lax` (allows SSO redirects while protecting against CSRF)
- Rolling: `true` (extends session on each request)
- MaxAge: 8 hours (was 24 hours)
- Resave: `true` (required for rolling sessions)

### Manual Cookie Setting

Due to Passport.js behavior, cookies are manually set in auth routes:

```javascript
const { sign } = require('cookie-signature');

// After successful login
const sessionCookie = req.sessionID;
const signedCookie = 's:' + sign(sessionCookie, config.sessionSecret);

res.cookie('wds-manager.sid', signedCookie, {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 8,
  path: '/',
  domain: undefined
});
```

---

## 🧪 Testing

### Development Mode with Mock SSO

Set in `.env`:

```bash
NODE_ENV=development
MOCK_SSO_EMAIL=lonely.h@jvd.tw
```

**Behavior**:
- Bypasses Operations Portal verification
- Creates mock user with specified email
- Assigns roles based on `role-mappings.json`
- Logs warning: "Using MOCK SSO user for development"

### Testing SSO Integration

**Test with Operations Portal**:

1. Ensure Operations Portal is running
2. Configure WDS Manager in portal as redirect target
3. Login through portal
4. Portal should redirect to: `http://localhost:3015/auth/sso?token=<jwt>`
5. Verify successful login and role assignment

**Test Google OAuth**:

1. Navigate to `http://localhost:3015/auth/google`
2. Select Google account
3. Verify successful login and role assignment

**Test Role Assignments**:

```bash
# Check current user roles
curl http://localhost:3015/auth/me \
  -H "Cookie: wds-manager.sid=<session-cookie>"

# Expected response
{
  "email": "lonely.h@jvd.tw",
  "roles": ["Admin"],
  "loginMethod": "OPS_PORTAL_SSO"
}
```

---

## 🚀 Deployment Checklist

### Before Deploying to Production

- [ ] Update `OPS_PORTAL_URL` to production URL
- [ ] Set strong `SESSION_SECRET` (32+ characters)
- [ ] Remove or empty `MOCK_SSO_EMAIL`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Update `role-mappings.json` with production users
- [ ] Ensure at least one Admin user exists
- [ ] Test SSO flow from Operations Portal
- [ ] Test Google OAuth flow
- [ ] Verify session cookies are `secure=true`
- [ ] Check HTTPS is enabled

### Environment Variables for Production

```bash
# Application
APP_VERSION=1.19.0
NODE_ENV=production

# Session
SESSION_SECRET=<strong-random-secret-32-chars>

# SSO
OPS_PORTAL_URL=https://ops.ftgaming.cc
SSO_VERIFY_PATH=/api/sso/verify
SSO_VERIFY_TIMEOUT_MS=5000
MOCK_SSO_EMAIL=  # Must be empty in production

# CORS
ALLOWED_ORIGINS=https://wds-manager.ftgaming.cc,https://ops.ftgaming.cc

# Security
FORCE_SECURE_COOKIE=true
```

---

## 🔐 Security Features

### Session Security
- **HttpOnly cookies** - Prevent XSS attacks
- **Secure flag** - HTTPS only in production
- **SameSite 'lax'** - CSRF protection while allowing SSO
- **8-hour expiration** - Auto-logout inactive users
- **Rolling sessions** - Extends timeout on activity

### Role-Based Access
- **Email-based role mapping** - Fine-grained control
- **Domain defaults** - Automatic role assignment
- **Admin protection** - At least one Admin must exist
- **Permission validation** - Invalid roles rejected

### SSO Token Verification
- **Token expiration** - Tokens expire after use
- **One-time use** - Tokens cannot be reused
- **Timeout protection** - 5-second verification timeout
- **Error handling** - Specific error messages for debugging

---

## 📚 API Reference

### Role Management APIs (Future Enhancement)

Potential endpoints for role management UI:

```javascript
// Get all role mappings (Admin only)
GET /api/roles/mappings
Response: { emailRoleMapping: {...}, domainDefaultRoles: {...} }

// Update all role mappings (Admin only)
PUT /api/roles/mappings
Request: { emailRoleMapping: {...}, domainDefaultRoles: {...} }

// Update specific email roles (Admin only)
PUT /api/roles/mappings/email/:email
Request: { roles: ["Operator"] }

// Remove email mapping (Admin only)
DELETE /api/roles/mappings/email/:email

// Get available roles
GET /api/roles
Response: [{ key: "Admin", name: "Admin", level: 3, ... }]
```

---

## 🐛 Troubleshooting

### SSO Login Fails

**Symptom**: "SSO verification failed" error

**Solutions**:
1. Check `OPS_PORTAL_URL` is correct
2. Verify Operations Portal is accessible
3. Check network connectivity
4. Review logs for detailed error message

### Session Not Persisting

**Symptom**: Logged out immediately after login

**Solutions**:
1. Check cookie `sameSite` setting
2. Verify `secure` flag matches HTTPS usage
3. Check `SESSION_SECRET` is set
4. Review cookie domain configuration

### Role Assignment Issues

**Symptom**: User has wrong roles or no roles

**Solutions**:
1. Check `role-mappings.json` syntax
2. Verify email address matches exactly
3. Check domain default roles
4. Review logs for role assignment

### Development Mock SSO Not Working

**Symptom**: Still trying to verify with portal in development

**Solutions**:
1. Ensure `NODE_ENV=development`
2. Set `MOCK_SSO_EMAIL` in `.env`
3. Restart application after changing `.env`

---

## 📝 Change Log

### v1.19.0 (2025-10-27)

**Added:**
- SSO integration with Operations Portal
- Role-Based Access Control (RBAC) system
- Role mapping service with email and domain defaults
- RBAC middleware for route protection
- SSO service for token verification
- Centralized configuration (`config/env.js`)
- Role definitions (`config/roles.js`)
- Enhanced auth routes with SSO support
- Manual cookie setting for Passport.js compatibility
- Mock SSO for development

**Changed:**
- Session configuration (8-hour sessions, rolling, SameSite 'lax')
- Google OAuth integration (now assigns roles)
- User object structure (added roles, loginMethod, lastLogin)
- Auth status endpoint (returns role information)

**Dependencies:**
- Added: `axios` (for SSO verification)
- Added: `cookie-signature` (for manual cookie signing)

---

## 🎯 Next Steps

### Recommended Enhancements

1. **Role Management UI**
   - Admin interface to manage email-to-role mappings
   - Domain default role configuration
   - User list with current roles

2. **Audit Logging**
   - Log all authentication events
   - Track role changes
   - Monitor permission checks

3. **Frontend Integration**
   - Display user roles in UI
   - Show/hide features based on permissions
   - Add SSO login button to login page

4. **Permission Enforcement**
   - Apply RBAC middleware to API routes
   - Restrict deployment operations by role
   - Control artifact deletion permissions

5. **Documentation**
   - User guide for role system
   - Admin guide for role management
   - SSO integration guide for Ops Portal

---

## 📞 Support

For issues or questions about SSO integration:

1. Check this documentation first
2. Review application logs: `docker logs wds-manager`
3. Verify configuration in `.env`
4. Check `role-mappings.json` syntax
5. Test with mock SSO in development

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-27
**Author**: Claude Code
**Status**: Complete and Ready for Testing
