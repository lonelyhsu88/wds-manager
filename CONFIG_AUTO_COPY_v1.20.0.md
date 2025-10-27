# Config Auto-Copy Feature (v1.20.0)

## Overview

This feature implements automatic copying of configuration files (like `hashconfig.json`, `bingoconfig.json`, `arcadeconfig.json`) to deployed game directories in S3. When games are deployed, their corresponding configuration files are automatically copied to ensure they always have the correct configuration.

## Features

### 1. Environment-Based Configuration

Configure which config files should be copied to which games using `.env` variables:

```bash
# Copy hashconfig.json to all hash games
CONFIG_MAPPING_HASH=*

# Copy bingoconfig.json to all bingo games
CONFIG_MAPPING_BINGO=*

# Copy arcadeconfig.json to all arcade games (will be renamed to hashconfig.json)
CONFIG_MAPPING_ARCADE=*

# Or specify individual games (comma-separated)
# CONFIG_MAPPING_HASH=MultiPlayerAviator,MultiPlayerCrash,StandAloneDice
```

### 2. Special Cases

- **Arcade Games**: When copying `arcadeconfig.json` to arcade games, it is automatically renamed to `hashconfig.json` in the target directory (matching the behavior of the legacy deployment script)

### 3. Automatic Deployment Integration

Config files are automatically copied after successful deployment:

1. Deploy artifacts (extract and upload files)
2. Update version.txt files
3. **Copy configuration files** ← New step
4. Record deployment history

### 4. Manual Config Copy

You can manually trigger config copy for specific games via API:

```bash
# Example: Copy configs to specific games
curl -X POST http://localhost:3015/api/config/copy \
  -H "Content-Type: application/json" \
  -d '{"games": ["MultiPlayerAviator", "ArcadeBingo"]}'
```

### 5. View Current Mappings

Check current configuration mappings via API:

```bash
curl http://localhost:3015/api/config/mappings
```

Response:
```json
{
  "mappings": {
    "hash": {
      "configFile": "config/hashconfig.json",
      "targetGames": ["MultiPlayerAviator", "MultiPlayerCrash", ...],
      "gameCount": 41
    },
    "bingo": {
      "configFile": "config/bingoconfig.json",
      "targetGames": ["ArcadeBingo", "BonusBingo", ...],
      "gameCount": 11
    },
    "arcade": {
      "configFile": "config/arcadeconfig.json",
      "targetGames": ["MultiPlayerBoomersGR", "StandAloneForestTeaParty", ...],
      "gameCount": 4
    }
  }
}
```

## Implementation Details

### New Service: `configCopyService.js`

Located at: `src/services/configCopyService.js`

Key methods:
- `loadConfigMappings()` - Load mappings from environment variables
- `copyConfigsForDeployedGames(games, progressCallback, req)` - Copy configs after deployment
- `copyConfigsForGames(games, req)` - Manual copy for specific games
- `getMappings()` - Get current configuration mappings

### Integration Points

1. **Deploy Service** (`src/services/deployService.js:384-401`)
   - Added config copy step after version updates
   - Automatically copies configs for all deployed games

2. **API Routes** (`src/routes/api.js:509-562`)
   - `GET /api/config/mappings` - View current mappings
   - `POST /api/config/copy` - Manual copy trigger

3. **Environment Configuration** (`.env`)
   - `CONFIG_MAPPING_HASH` - Hash games mapping
   - `CONFIG_MAPPING_BINGO` - Bingo games mapping
   - `CONFIG_MAPPING_ARCADE` - Arcade games mapping
   - `CONFIG_CUSTOM_<NAME>` - Custom mappings (optional)

## Configuration File Structure

Config files are located in `/config` directory:

```
config/
├── hashconfig.json       # Hash games configuration
├── bingoconfig.json      # Bingo games configuration
├── arcadeconfig.json     # Arcade games configuration
└── game-categories.json  # Game category definitions
```

### Example: hashconfig.json
```json
{
  "wssUrl": "wss://hash-gate.geminiservice.cc",
  "resourceUrl": "https://resource.shuangtzu6688.com",
  "gameInfoUrl": "https://gameinfo-api.geminiservice.cc"
}
```

## Deployment Flow

```
1. User triggers deployment
   ↓
2. Clear old files (if enabled)
   ↓
3. Download artifacts from S3
   ↓
4. Extract and upload files
   ↓
5. Update version.txt files
   ↓
6. Copy configuration files ← NEW
   ├─ Identify deployed games
   ├─ Match games to config mappings
   ├─ Copy config files to S3
   └─ Log results
   ↓
7. Record deployment history
   ↓
8. Complete
```

## Game Category Mappings

Based on `config/game-categories.json`:

### Hash Games (41 games)
- MultiPlayerAviator, MultiPlayerAviator2, MultiPlayerCrash, etc.
- StandAloneDice, StandAloneMines, StandAlonePlinko, etc.

### Bingo Games (11 games)
- ArcadeBingo, BonusBingo, CaribbeanBingo, etc.
- MagicBingo, Steampunk, etc.

### Arcade Games (4 games)
- MultiPlayerBoomersGR
- StandAloneForestTeaParty
- StandAloneWildDigGR
- StandAloneGoldenClover

## Error Handling

- **Config file not found**: Logs warning, skips that config, continues with others
- **Upload failure**: Logs error, marks as failed, continues with other games
- **Deployment not blocked**: Config copy failures don't block deployment

## Progress Tracking

During deployment, progress updates are emitted:

```javascript
{
  phase: 'config_copy',
  message: 'Copying configuration files...',
  percentage: 90
}
```

## Logging

All config copy operations are logged:

```
[INFO] Starting config copy for 3 deployed games
[INFO] Copied config config/hashconfig.json to MultiPlayerAviator/hashconfig.json
[INFO] Copied config config/arcadeconfig.json to MultiPlayerBoomersGR/hashconfig.json
[INFO] Config copy completed: 3 success, 0 failed, 0 skipped
```

## Audit Trail

Manual config copy operations are logged to audit log:

```json
{
  "user": "user@example.com",
  "action": "config_copy",
  "details": {
    "games": ["MultiPlayerAviator", "ArcadeBingo"],
    "timestamp": "2025-10-27T08:00:00.000Z"
  }
}
```

## Custom Config Mappings (Advanced)

You can define custom config mappings for specific use cases:

```bash
# Example: Copy a special config to specific games
CONFIG_CUSTOM_SPECIAL=config/special.json:GameA,GameB,GameC
```

This will copy `config/special.json` to GameA, GameB, and GameC directories.

## Migration Notes

This feature is **backward compatible**:
- Existing deployments continue to work
- Config copying is automatic and non-blocking
- No changes needed to existing deployment workflows

## Testing

### Test Config Loading
```bash
node -e "const configCopyService = require('./src/services/configCopyService'); console.log(configCopyService.getMappings());"
```

### Test Syntax
```bash
node -c src/services/configCopyService.js
node -c src/routes/api.js
node -c src/services/deployService.js
```

## Performance Impact

- **Minimal**: Config files are small (< 1KB each)
- **Parallel**: Not parallelized (sequential copying)
- **Progress**: 90-95% stage of deployment
- **Time**: Approximately 1-2 seconds per 10 games

## Future Enhancements

Possible improvements:
1. Parallel config copying for faster performance
2. Config file validation before copying
3. Config versioning and rollback
4. UI for managing config mappings
5. Config file preview in deployment UI

## Version History

- **v1.20.0** (2025-10-27)
  - Initial implementation of config auto-copy feature
  - Support for hash, bingo, and arcade game categories
  - Special handling for arcade games (rename to hashconfig.json)
  - Integration with deployment flow
  - Manual copy API endpoints
  - Environment-based configuration

## Related Files

- `src/services/configCopyService.js` - Main service implementation
- `src/services/deployService.js` - Integration point
- `src/routes/api.js` - API endpoints
- `config/hashconfig.json` - Hash games config
- `config/bingoconfig.json` - Bingo games config
- `config/arcadeconfig.json` - Arcade games config
- `config/game-categories.json` - Game category definitions
- `.env` - Configuration mappings

## API Reference

### GET /api/config/mappings

Get current configuration mappings.

**Authentication**: Required

**Response**:
```json
{
  "mappings": {
    "hash": { "configFile": "...", "targetGames": [...], "gameCount": 41 },
    "bingo": { "configFile": "...", "targetGames": [...], "gameCount": 11 },
    "arcade": { "configFile": "...", "targetGames": [...], "gameCount": 4 }
  }
}
```

### POST /api/config/copy

Manually copy config files to specific games.

**Authentication**: Required

**Request Body**:
```json
{
  "games": ["MultiPlayerAviator", "ArcadeBingo", "MultiPlayerBoomersGR"]
}
```

**Response**:
```json
{
  "message": "Config copy completed",
  "results": {
    "total": 3,
    "success": 3,
    "failed": 0,
    "skipped": 0
  },
  "details": [
    {
      "success": true,
      "source": "config/hashconfig.json",
      "target": "MultiPlayerAviator/hashconfig.json",
      "gameName": "MultiPlayerAviator"
    },
    ...
  ]
}
```

## Troubleshooting

### Config files not being copied

1. Check `.env` configuration:
   ```bash
   cat .env | grep CONFIG_MAPPING
   ```

2. Verify config files exist:
   ```bash
   ls -la config/*.json
   ```

3. Check logs:
   ```bash
   grep "config copy" logs/app.log
   ```

### Arcade games not working

Ensure arcade games receive `hashconfig.json` (not `arcadeconfig.json`). This is handled automatically by the `getTargetConfigFileName()` method.

### Manual copy not working

1. Check authentication
2. Verify game names are correct (case-sensitive)
3. Check API response for detailed error messages

## Summary

The Config Auto-Copy feature simplifies deployment by automatically managing game configuration files. It's flexible, environment-based, and integrates seamlessly with the existing deployment flow. The feature matches the behavior of the legacy deployment script while providing a more maintainable and scalable solution.
