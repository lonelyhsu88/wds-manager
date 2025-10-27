# Deployment Configuration Guide v1.18.0

**Date**: 2025-10-27
**Purpose**: 配置 wds-manager 以支持 Resource 和 Game 配置文件的特殊部署需求

---

## 📋 部署需求總結

### 1. Resource 部署（已實現）

根據 `/Users/lonelyhsu/gemini/toolkits/Deploy-UI/resource-ui/02_deploy-resource-ui.sh`

| Resource | 目標目錄 | 清空目錄？ | 特殊處理 |
|----------|---------|-----------|---------|
| **i18n** | `resource/i18n` | ✅ Yes | 標準部署 |
| **bundle-i18n** | `resource/bundle/Bundle_i18n`<br>`resource/bundle-freebet/Bundle_i18n` | ✅ Yes | • 多目標部署<br>• 需找到內部 `Bundle_i18n` 目錄 |
| **bundle-common** | `resource/bundle` | ✅ Yes | 標準部署 |
| **bundle-common-freeBonus** | `resource/bundle-freebet` | ✅ Yes | 標準部署 |
| **game-webview** | `resource/game-webview` | ✅ Yes | 標準部署 |
| **game-configs** | `resource/` (root) | ❌ **No** | • 部署到 root<br>• **保留其他文件** |

---

### 2. 遊戲配置文件部署（待實現）

根據 `/Users/lonelyhsu/gemini/toolkits/Deploy-UI/Games-UI/02_Deploy-Games-UI.sh`

#### 配置文件映射

| 本地配置文件 | 遊戲類型 | 部署到遊戲目錄 | 目標檔名 |
|-------------|---------|--------------|---------|
| `config/bingoconfig.json` | Bingo | 所有 bingo 遊戲 | `bingoconfig.json` |
| `config/arcadeconfig.json` | Arcade | 所有 arcade 遊戲 | `hashconfig.json` ⚠️ |
| `config/hashconfig.json` | Hash | 所有 hash 遊戲 | `hashconfig.json` |

⚠️ **注意**: Arcade 遊戲使用 `arcadeconfig.json`，但部署時檔名改為 `hashconfig.json`

#### 遊戲列表

**Bingo Games** (11 個):
```
ArcadeBingo, BonusBingo, CaribbeanBingo, CaveBingo, EggHuntBingo,
LostRuins, MagicBingo, MapleBingo, OdinBingo, Steampunk, Steampunk2
```

**Arcade Games** (4 個):
```
MultiPlayerBoomersGR, StandAloneForestTeaParty,
StandAloneWildDigGR, StandAloneGoldenClover
```

**Hash Games** (48 個):
```
MultiPlayerAviator, MultiPlayerAviator2, MultiPlayerAviator2XIN,
MultiPlayerCrash, MultiPlayerCrashCL, MultiPlayerCrashGR, MultiPlayerCrashNE,
MultiPlayerMultiHilo, StandAloneDiamonds, StandAloneDice, StandAloneDragonTower,
... (完整列表見 config/game-categories.json)
```

---

## 🔧 已實現的功能

### 1. Resource Deployment Rules

**配置文件**: `config/resource-deploy-rules.json`

```json
{
  "resourceDeploymentRules": {
    "bundle-i18n": {
      "targetPrefix": "bundle/Bundle_i18n",
      "additionalTargets": ["bundle-freebet/Bundle_i18n"],
      "clearBeforeDeploy": true,
      "findInternalDir": "Bundle_i18n"
    },
    "game-configs": {
      "targetPrefix": "",
      "clearBeforeDeploy": false,
      "preserveOtherFiles": true
    }
  }
}
```

### 2. Resource Deploy Rules 工具

**文件**: `src/utils/resourceDeployRules.js`

**功能**:
- `getDeploymentRule(gameName)` - 獲取部署規則
- `getAllTargets(gameName)` - 獲取所有部署目標（包括額外目標）
- `shouldClearBefore(gameName)` - 是否清空目錄
- `shouldPreserveOtherFiles(gameName)` - 是否保留其他文件
- `getInternalDirToFind(gameName)` - 獲取需要查找的內部目錄

### 3. DeployService 修改

**文件**: `src/services/deployService.js`

**改進**:
- 支持多目標部署（bundle-i18n）
- 支持保留其他文件（game-configs）
- 智能清除目錄邏輯
- Resource 類型檢測

---

## 🚧 待實現的功能

### Feature 1: 遊戲配置文件自動部署

#### 需求
當部署遊戲時，自動將對應的配置文件複製到遊戲目錄。

#### 實現方案

**1. 創建配置文件映射**

`config/game-config-files.json`:
```json
{
  "bingoGames": {
    "configFile": "bingoconfig.json",
    "targetFileName": "bingoconfig.json",
    "games": [
      "ArcadeBingo",
      "BonusBingo",
      "CaribbeanBingo",
      ...
    ]
  },
  "arcadeGames": {
    "configFile": "arcadeconfig.json",
    "targetFileName": "hashconfig.json",
    "games": [
      "MultiPlayerBoomersGR",
      "StandAloneForestTeaParty",
      ...
    ]
  },
  "hashGames": {
    "configFile": "hashconfig.json",
    "targetFileName": "hashconfig.json",
    "games": [
      "MultiPlayerAviator",
      "MultiPlayerCrash",
      ...
    ]
  }
}
```

**2. 配置文件存儲**

將配置文件存儲在 S3：
```
s3://deploy-webui-bucket/
  _configs/
    bingoconfig.json
    arcadeconfig.json
    hashconfig.json
```

或本地目錄：
```
/wds-manager/
  config/
    game-configs/
      bingoconfig.json
      arcadeconfig.json
      hashconfig.json
```

**3. 部署流程修改**

在 `extractAndUploadZip` 完成後：

```javascript
// After deploying game files
const gameName = this.extractGameName(artifactKey);
const gameCategory = gameCategories.getCategoryForGame(gameName);

// Check if this game needs a config file
const configFile = this.getConfigFileForGame(gameName, gameCategory);

if (configFile) {
  // Upload config file to game directory
  await this.deployConfigFile(configFile, gameName, targetPrefix);
}
```

**4. 新增方法**

```javascript
class DeployService {
  /**
   * Get config file for a game based on its category
   */
  getConfigFileForGame(gameName, category) {
    const configMapping = {
      'bingo': {
        file: 'bingoconfig.json',
        targetName: 'bingoconfig.json'
      },
      'arcade': {
        file: 'arcadeconfig.json',
        targetName: 'hashconfig.json' // Special case!
      },
      'hash': {
        file: 'hashconfig.json',
        targetName: 'hashconfig.json'
      }
    };

    return configMapping[category.key] || null;
  }

  /**
   * Deploy config file to game directory
   */
  async deployConfigFile(configInfo, gameName, targetPrefix) {
    const configPath = path.join(__dirname, '../../config/game-configs', configInfo.file);
    const configData = fs.readFileSync(configPath);

    const targetKey = `${targetPrefix}${configInfo.targetName}`;

    await s3Service.uploadToDeployBucket(targetKey, configData, {
      ContentType: 'application/json'
    });

    logger.info(`Deployed config ${configInfo.file} -> ${targetKey}`);
  }
}
```

---

### Feature 2: 批量配置文件更新

#### 需求
更新配置文件並批量部署到所有相關遊戲。

#### API 設計

**POST /api/deploy-config**

Request:
```json
{
  "configType": "bingo",  // bingo | arcade | hash
  "configFile": "...",    // Base64 encoded config content
  "deployToGames": true   // Deploy to all games of this type
}
```

Response:
```json
{
  "success": true,
  "updatedGames": [
    "ArcadeBingo",
    "BonusBingo",
    ...
  ],
  "totalGames": 11,
  "duration": "2.5s"
}
```

---

## 📊 部署流程圖

### Resource 部署流程

```
┌─────────────────────────────────────────┐
│ 1. 用戶選擇 resource artifacts         │
│    (e.g., bundle-i18n-prd-1.0.1.zip)   │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 2. extractGameName()                    │
│    → gameName = "bundle-i18n"           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 3. resourceDeployRules.getAllTargets()  │
│    → ["bundle/Bundle_i18n",             │
│       "bundle-freebet/Bundle_i18n"]     │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 4. Download & Extract ZIP               │
│    → Find internal "Bundle_i18n" dir    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 5. Deploy to Multiple Targets           │
│    ✓ resource/bundle/Bundle_i18n/       │
│    ✓ resource/bundle-freebet/Bundle_... │
└─────────────────────────────────────────┘
```

### 遊戲 + 配置文件部署流程

```
┌─────────────────────────────────────────┐
│ 1. 用戶選擇 game artifacts              │
│    (e.g., ArcadeBingo-prd-1.0.5.zip)   │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 2. extractGameName()                    │
│    → gameName = "ArcadeBingo"           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 3. getCategoryForGame()                 │
│    → category = "bingo"                 │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 4. Deploy Game Files                    │
│    → games-ui/ArcadeBingo/*             │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 5. getConfigFileForGame()               │
│    → { file: "bingoconfig.json",        │
│        targetName: "bingoconfig.json" } │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ 6. deployConfigFile()                   │
│    → games-ui/ArcadeBingo/bingoconfig...│
└─────────────────────────────────────────┘
```

---

## 🧪 測試場景

### Test 1: bundle-i18n 多目標部署

```bash
# 部署 bundle-i18n
POST /api/deploy
{
  "artifactKeys": ["20250602/bundle-i18n-prd-1.0.11.zip"],
  "clearBefore": true,
  "extractZip": true
}

# 驗證
檢查以下目錄都有文件：
- s3://deploy-webui-bucket/resource/bundle/Bundle_i18n/
- s3://deploy-webui-bucket/resource/bundle-freebet/Bundle_i18n/
```

### Test 2: game-configs 保留其他文件

```bash
# 部署 game-configs（不清空 root）
POST /api/deploy
{
  "artifactKeys": ["20250602/game-configs-prd-1.0.1.zip"],
  "clearBefore": true,  # 會被 rule 覆蓋為 false
  "extractZip": true
}

# 驗證
root 目錄下的其他 resource 目錄沒有被刪除：
- resource/i18n/ (保留)
- resource/bundle/ (保留)
- resource/game-webview/ (保留)
```

### Test 3: Bingo 遊戲 + 配置文件（待實現）

```bash
# 部署 ArcadeBingo
POST /api/deploy
{
  "artifactKeys": ["20250602/ArcadeBingo-prd-1.0.5.zip"],
  "clearBefore": true,
  "extractZip": true
}

# 驗證
檢查以下文件存在：
- games-ui/ArcadeBingo/index.html
- games-ui/ArcadeBingo/bingoconfig.json  # 自動部署的配置
```

---

## 📝 實現清單

### ✅ 已完成

- [x] Resource deployment rules 配置
- [x] resourceDeployRules 工具類
- [x] deployService 支持多目標部署
- [x] deployService 支持保留其他文件
- [x] 智能清除目錄邏輯

### 🚧 進行中

- [ ] 完成 extractAndUploadZip 的 resource 特殊處理
- [ ] 測試 bundle-i18n 多目標部署
- [ ] 測試 game-configs 保留文件功能

### 📋 待實現

- [ ] 遊戲配置文件映射配置（game-config-files.json）
- [ ] getConfigFileForGame() 方法
- [ ] deployConfigFile() 方法
- [ ] 批量配置文件更新 API
- [ ] 配置文件管理 UI
- [ ] 配置文件版本追蹤

---

## 🔍 關鍵代碼位置

| 功能 | 文件路徑 | 行數 |
|------|---------|-----|
| Resource rules 配置 | `config/resource-deploy-rules.json` | - |
| Resource rules 工具 | `src/utils/resourceDeployRules.js` | - |
| Game categories | `config/game-categories.json` | - |
| Deploy service | `src/services/deployService.js` | - |
| 清除目錄邏輯 | `src/services/deployService.js` | 151-204 |
| 目標prefix處理 | `src/services/deployService.js` | 219-239 |

---

## 🎯 下一步行動

### 立即執行

1. **完成 resource 部署邏輯**
   - 修改 `extractAndUploadZip` 支持多目標
   - 實現 bundle-i18n 的內部目錄查找

2. **測試 resource 部署**
   - 測試 bundle-i18n 多目標部署
   - 測試 game-configs 保留文件
   - 驗證所有 resource types

### 短期（1-2 天）

3. **實現配置文件自動部署**
   - 創建 game-config-files.json
   - 實現 getConfigFileForGame()
   - 實現 deployConfigFile()
   - 整合到部署流程

4. **創建配置文件管理 UI**
   - 上傳配置文件界面
   - 批量更新功能
   - 配置文件預覽

### 中期（3-7 天）

5. **增強功能**
   - 配置文件版本控制
   - 配置文件差異比較
   - 回滾配置文件

---

## 📞 問題和建議

### Q: 配置文件應該存在哪裡？
**A**: 建議方案：
- **方案 1**: S3 bucket `_configs/` 目錄
  - 優點：中央管理，容易同步
  - 缺點：需要額外 S3 操作

- **方案 2**: wds-manager 本地 `config/game-configs/`
  - 優點：部署簡單，無需 S3
  - 缺點：需要重新部署 wds-manager 來更新

**建議**: 使用方案 2（本地存儲）+ API 更新功能

### Q: Arcade 為什麼使用 hashconfig.json？
**A**: 根據原始腳本，arcade 遊戲使用與 hash 遊戲相同的配置格式，因此重用同一配置結構。

---

**文檔版本**: 1.0.0
**最後更新**: 2025-10-27
**負責人**: Claude Code
