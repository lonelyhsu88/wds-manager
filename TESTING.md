# WebUI Deployment System Manager - Testing Guide

## Version: 1.16.2
## Date: 2025-10-27

---

## Automated Tests (No Auth Required)

### 1. Health Check
```bash
curl http://localhost:3015/api/health
```
**Expected**: Returns `{"status":"ok","timestamp":"...","version":"1.16.2"}`

**Status**: ✅ PASSED

---

### 2. Version History
```bash
curl http://localhost:3015/api/version
```
**Expected**: Returns current version and change history

**Status**: ✅ PASSED

---

## Manual Tests (Requires Google OAuth Login)

### 3. Bucket Access Check
**URL**: `http://localhost:3015` → Login → Check bucket status cards

**Test Steps**:
1. Navigate to http://localhost:3015
2. Login with Google OAuth
3. Check "Build Artifacts Bucket" card shows: jenkins-build-artfs (accessible ✓)
4. Check "Deploy WebUI Bucket" card shows: deploy-webui-bucket (accessible ✓)

**Expected**: Both buckets show as accessible

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 4. List All S3 Buckets
**Test Steps**:
1. Login to the application
2. Click the edit button (pencil icon) on Build Artifacts Bucket card
3. Observe the bucket selector dropdown

**Expected**:
- Dropdown shows all S3 buckets sorted alphabetically
- Default bucket marked with "(default)"
- Filter input allows searching buckets
- Can select and change to different bucket

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 5. Artifact Listing with Categorization
**URL**: Click "Browse Build Artifacts" after login

**Test Steps**:
1. Login to the application
2. Click "Browse Build Artifacts" button
3. Check that artifacts are displayed
4. Switch between "Category View" and "Card View"

**Expected**:
- Artifacts grouped by 9 categories:
  - Hash Games
  - Bingo Games
  - Arcade Games
  - Resources
  - Dashboard
  - Event (includes event-b, event-k with prefix matching)
  - Jump Page
  - Game Demo
  - External Management
- Each category shows correct count
- Category badges show correct colors

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 6. Custom Bucket Selection for Browsing
**Test Steps**:
1. Login to the application
2. Click edit button on "Build Artifacts Bucket"
3. Select "release-webui" from dropdown
4. Click "Change Bucket"
5. Page should reload automatically
6. Browse artifacts - should now show artifacts from release-webui bucket

**Expected**:
- Bucket changes successfully
- Bucket status card updates to show "release-webui"
- Artifact listing shows content from new bucket

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 7. Custom Bucket Selection for Deployment
**Test Steps**:
1. Change build bucket to a bucket with actual deployment artifacts
2. Select artifacts for deployment
3. Click "Deploy Selected"
4. Monitor deployment progress

**Expected**:
- Deployment uses the custom build bucket (NOT default)
- No "NoSuchKey" errors in logs
- Files downloaded successfully from custom bucket
- Deployment completes or shows specific errors if files don't exist

**Critical Fix**: This was broken in v1.16.1, fixed in v1.16.2
- s3Service.getArtifact() now uses dynamic bucket from req
- deployService.deploy() passes req to s3Service methods

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 8. Deployment Progress Display
**Test Steps**:
1. Select 5+ artifacts for deployment
2. Start deployment
3. Observe "Deployment Status" section

**Expected**:
- Shows up to 5 artifacts being processed in parallel
- Each artifact shows:
  - Name
  - Progress bar
  - Status (downloading/extracting/uploading)
  - Current file being processed
- Progress updates in real-time via WebSocket

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 9. Game Version History
**URL**: Click "Versions" in navigation

**Test Steps**:
1. Login to the application
2. Click "Versions" in the top navigation
3. Check that games are categorized properly

**Expected**:
- Games grouped by all 9 categories
- Shows last 3 versions for each game
- Currently deployed version marked
- Latest version marked
- Category badges match main view colors

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 10. Deployment Statistics
**URL**: Click "Dashboard" in navigation

**Test Steps**:
1. Login to the application
2. Click "Dashboard" in navigation
3. Check statistics display

**Expected**:
- Deployment stats (total, today, this week, this month)
- Success rate percentage
- Average deployment time
- Top 5 most deployed games
- System health metrics
- Deployment trend chart
- Active games list

**Status**: ⏳ REQUIRES MANUAL TESTING

---

### 11. Recent Activity
**URL**: Main page, "Recent Activity" section

**Test Steps**:
1. Login to the application
2. Check "Recent Activity" section at bottom of main page

**Expected**:
- Shows last 5 deployments
- Each entry shows:
  - Timestamp
  - Status (success/failure badge)
  - Number of artifacts deployed
  - Files deployed count
  - User who performed deployment (or "Unknown" for old records)
- Link to view full history

**Status**: ⏳ REQUIRES MANUAL TESTING

---

## Known Issues

### Fixed in v1.16.2:
- ✅ NoSuchKey errors when deploying with custom bucket selection
- ✅ Deployment not using selected custom build bucket

### Fixed in v1.16.1:
- ✅ Artifact browsing not using selected custom build bucket

### Fixed in v1.14.0:
- ✅ Jump Page and Game Demo categories not showing counts

### Expected Behavior:
- ℹ️ Older deployment records show "By: Unknown" (user field added in v1.10.0+)

---

## Testing Checklist

- [x] Health check API responds correctly
- [x] Version API shows 1.16.2
- [ ] Bucket access check works with default buckets
- [ ] List all S3 buckets endpoint returns complete list
- [ ] Artifact listing shows all 9 categories
- [ ] Category counts display correctly (including jump-page, game-demo)
- [ ] Event prefix matching works (event-b, event-k → Event category)
- [ ] Bucket selector dropdown works
- [ ] Can change to custom build bucket
- [ ] Can change to custom deploy bucket
- [ ] Artifact browsing uses custom bucket when selected
- [ ] Deployment uses custom build bucket when selected (v1.16.2 fix)
- [ ] Deployment progress shows 5 parallel items
- [ ] No NoSuchKey errors with correct bucket selection
- [ ] Version history page shows all categories
- [ ] Dashboard statistics display correctly
- [ ] Recent activity shows user information

---

## Test Environment

- **Server URL**: http://localhost:3015
- **Port**: 3015
- **AWS Profile**: gemini-pro_ck
- **Default Build Bucket**: jenkins-build-artfs
- **Default Deploy Bucket**: deploy-webui-bucket
- **Node Version**: Check with `node --version`
- **NPM Version**: Check with `npm --version`

---

## Log Monitoring

Monitor server logs in real-time:
```bash
tail -f /Users/lonelyhsu/gemini/claude-project/wds-manager/logs/combined.log
```

Check for errors:
```bash
grep -i error /Users/lonelyhsu/gemini/claude-project/wds-manager/logs/combined.log | tail -20
```

---

## Next Steps

1. Perform manual testing for all items marked "REQUIRES MANUAL TESTING"
2. Document any issues found
3. Verify deployment progress display
4. Test with actual deployment scenario
5. Verify no NoSuchKey errors occur with custom bucket selection
