const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const s3Service = require('./s3Service');

class StatsService {
  constructor() {
    this.versionFile = path.join(__dirname, '../../version.json');
  }

  async getDeploymentStats() {
    try {
      const versionData = await this.readVersionData();
      const deployments = versionData.deployments || [];

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Filter deployments by time period
      const last30Days = deployments.filter(d => new Date(d.timestamp) >= thirtyDaysAgo);
      const last7Days = deployments.filter(d => new Date(d.timestamp) >= sevenDaysAgo);
      const last24Hours = deployments.filter(d => new Date(d.timestamp) >= oneDayAgo);

      return {
        total: deployments.length,
        last30Days: last30Days.length,
        last7Days: last7Days.length,
        last24Hours: last24Hours.length,
        deployments: last30Days
      };
    } catch (error) {
      logger.error('Error getting deployment stats:', error);
      return {
        total: 0,
        last30Days: 0,
        last7Days: 0,
        last24Hours: 0,
        deployments: []
      };
    }
  }

  async getSuccessRate() {
    try {
      const versionData = await this.readVersionData();
      const deployments = versionData.deployments || [];

      if (deployments.length === 0) {
        return {
          successRate: 0,
          successful: 0,
          failed: 0,
          total: 0
        };
      }

      const successful = deployments.filter(d => d.status === 'success').length;
      const failed = deployments.filter(d => d.status === 'failure').length;
      const total = deployments.length;
      const successRate = Math.round((successful / total) * 100);

      return {
        successRate,
        successful,
        failed,
        total
      };
    } catch (error) {
      logger.error('Error getting success rate:', error);
      return {
        successRate: 0,
        successful: 0,
        failed: 0,
        total: 0
      };
    }
  }

  async getDeploymentTimes() {
    try {
      const versionData = await this.readVersionData();
      const deployments = versionData.deployments || [];

      if (deployments.length === 0) {
        return {
          average: 0,
          min: 0,
          max: 0
        };
      }

      const times = deployments
        .filter(d => d.duration)
        .map(d => {
          // Parse duration string like "1.5s" or "150ms"
          const match = d.duration.match(/(\d+\.?\d*)([ms]+)/);
          if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2];
            return unit === 's' ? value * 1000 : value; // Convert to ms
          }
          return 0;
        })
        .filter(t => t > 0);

      if (times.length === 0) {
        return {
          average: 0,
          min: 0,
          max: 0
        };
      }

      const average = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      return {
        average: Math.round(average / 1000 * 10) / 10, // Convert to seconds with 1 decimal
        min: Math.round(min / 1000 * 10) / 10,
        max: Math.round(max / 1000 * 10) / 10
      };
    } catch (error) {
      logger.error('Error getting deployment times:', error);
      return {
        average: 0,
        min: 0,
        max: 0
      };
    }
  }

  async getTopGames() {
    try {
      const versionData = await this.readVersionData();
      const deployments = versionData.deployments || [];

      // Count deployments per game
      const gameCounts = {};

      deployments.forEach(d => {
        if (d.artifacts && Array.isArray(d.artifacts)) {
          d.artifacts.forEach(artifact => {
            // Extract game name from artifact path
            const gameName = this.extractGameName(artifact);
            if (gameName) {
              gameCounts[gameName] = (gameCounts[gameName] || 0) + 1;
            }
          });
        }
      });

      // Sort by count and get top 10
      const topGames = Object.entries(gameCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return topGames;
    } catch (error) {
      logger.error('Error getting top games:', error);
      return [];
    }
  }

  async getSystemHealth() {
    try {
      const { buckets } = require('../config/aws');

      // Get bucket usage info
      const buildArtifacts = await s3Service.listBuildArtifacts('');
      const deployedFiles = await s3Service.listDeployedFiles('');

      // Calculate total sizes
      const buildSize = buildArtifacts.files?.reduce((sum, file) => sum + (file.size || 0), 0) || 0;
      const deploySize = deployedFiles?.reduce((sum, file) => sum + (file.size || 0), 0) || 0;

      // Get recent errors from version data
      const versionData = await this.readVersionData();
      const recentDeployments = (versionData.deployments || []).slice(0, 10);
      const recentErrors = recentDeployments
        .filter(d => d.status === 'failure')
        .map(d => ({
          timestamp: d.timestamp,
          user: d.user?.email || 'Unknown',
          error: d.errors?.[0] || 'Unknown error'
        }));

      return {
        buckets: {
          buildArtifacts: {
            name: buckets.buildArtifacts,
            fileCount: buildArtifacts.files?.length || 0,
            totalSize: buildSize,
            totalSizeFormatted: this.formatBytes(buildSize)
          },
          deployWebUI: {
            name: buckets.deployWebUI,
            fileCount: deployedFiles?.length || 0,
            totalSize: deploySize,
            totalSizeFormatted: this.formatBytes(deploySize)
          }
        },
        recentErrors: recentErrors.slice(0, 5),
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Error getting system health:', error);
      return {
        buckets: {
          buildArtifacts: { name: 'N/A', fileCount: 0, totalSize: 0, totalSizeFormatted: '0 B' },
          deployWebUI: { name: 'N/A', fileCount: 0, totalSize: 0, totalSizeFormatted: '0 B' }
        },
        recentErrors: [],
        uptime: 0
      };
    }
  }

  async getDeploymentTrend() {
    try {
      const versionData = await this.readVersionData();
      const deployments = versionData.deployments || [];

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Group deployments by day
      const dailyCounts = {};

      // Initialize all 30 days with 0
      for (let i = 0; i < 30; i++) {
        const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        dailyCounts[dateStr] = { total: 0, success: 0, failure: 0 };
      }

      // Count deployments per day
      deployments.forEach(d => {
        const date = new Date(d.timestamp);
        if (date >= thirtyDaysAgo) {
          const dateStr = date.toISOString().split('T')[0];
          if (dailyCounts[dateStr]) {
            dailyCounts[dateStr].total++;
            if (d.status === 'success') {
              dailyCounts[dateStr].success++;
            } else if (d.status === 'failure') {
              dailyCounts[dateStr].failure++;
            }
          }
        }
      });

      // Convert to array and sort by date
      const trend = Object.entries(dailyCounts)
        .map(([date, counts]) => ({
          date,
          ...counts
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return trend;
    } catch (error) {
      logger.error('Error getting deployment trend:', error);
      return [];
    }
  }

  async getActiveGames() {
    try {
      const deployedFiles = await s3Service.listDeployedFiles('');

      // Extract unique game directories
      const gameSet = new Set();
      deployedFiles.forEach(file => {
        // Extract first path segment as game name
        const parts = file.key.split('/');
        if (parts.length > 1 && parts[0]) {
          gameSet.add(parts[0]);
        }
      });

      return gameSet.size;
    } catch (error) {
      logger.error('Error getting active games:', error);
      return 0;
    }
  }

  // Helper methods
  async readVersionData() {
    try {
      const data = await fs.readFile(this.versionFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error reading version data:', error);
      return { deployments: [] };
    }
  }

  extractGameName(artifactPath) {
    // Extract game name from paths like "MultiPlayerCrash-prd-1.0.0.zip"
    const filename = path.basename(artifactPath);
    const match = filename.match(/^([A-Za-z]+(?:[A-Z][a-z]+)*)/);
    return match ? match[1] : filename.replace(/[-_].*$/, '');
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new StatsService();
