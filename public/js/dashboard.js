// Dashboard functionality
class Dashboard {
  constructor() {
    this.charts = {};
    this.init();
  }

  async init() {
    await this.loadUserInfo();
    await this.loadVersion();
    await this.loadStats();
    this.setupEventListeners();
  }

  async loadUserInfo() {
    try {
      const response = await fetch('/auth/status');
      const data = await response.json();

      if (data.authenticated && data.user) {
        document.getElementById('user-name').textContent = data.user.displayName || data.user.email.split('@')[0];
        document.getElementById('user-email').textContent = data.user.email;

        if (data.user.photo) {
          const userPhoto = document.getElementById('user-photo');
          const userIcon = document.getElementById('user-icon');
          userPhoto.src = data.user.photo;
          userPhoto.style.display = 'inline-block';
          userIcon.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  }

  async loadVersion() {
    try {
      const response = await fetch('/api/version');
      const data = await response.json();
      document.getElementById('version-badge').textContent = `v${data.version}`;
    } catch (error) {
      console.error('Error loading version:', error);
    }
  }

  async loadStats() {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();

      this.updateHeaderCards(data);
      this.updateRecentActivity(data.deploymentStats.deployments);
      this.updateSystemHealth(data.systemHealth);
      this.createCharts(data);
    } catch (error) {
      console.error('Error loading stats:', error);
      this.showError('Failed to load statistics');
    }
  }

  updateHeaderCards(data) {
    // Total Deployments
    document.getElementById('total-deployments').textContent = data.deploymentStats.total;
    document.getElementById('trend-value').textContent = data.deploymentStats.last30Days;

    // Success Rate
    document.getElementById('success-rate').textContent = data.successRate.successRate + '%';
    document.getElementById('success-count').textContent = data.successRate.successful;

    // Avg Deploy Time
    if (data.deploymentTimes.average > 0) {
      document.getElementById('avg-deploy-time').textContent = data.deploymentTimes.average + 's';
      document.getElementById('time-range').textContent =
        `${data.deploymentTimes.min}s - ${data.deploymentTimes.max}s`;
    } else {
      document.getElementById('avg-deploy-time').textContent = 'N/A';
      document.getElementById('time-range').textContent = 'N/A';
    }

    // Active Games
    document.getElementById('active-games').textContent = data.activeGames;
  }

  updateRecentActivity(deployments) {
    const container = document.getElementById('recent-activity');

    if (!deployments || deployments.length === 0) {
      container.innerHTML = '<p class="text-muted text-center">No recent deployments</p>';
      return;
    }

    const recent = deployments.slice(0, 5);
    let html = '';

    recent.forEach(deployment => {
      const statusIcon = deployment.status === 'success'
        ? '<i class="bi bi-check-circle-fill text-success"></i>'
        : '<i class="bi bi-x-circle-fill text-danger"></i>';

      const statusClass = deployment.status === 'success' ? 'success' : 'danger';
      const date = new Date(deployment.timestamp).toLocaleString();
      const artifactCount = deployment.artifacts?.length || 0;

      html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center mb-1">
                ${statusIcon}
                <strong class="ms-2">${artifactCount} artifact(s) deployed</strong>
              </div>
              <small class="text-muted d-block">${date}</small>
              <small class="text-muted">By: ${deployment.user?.email || 'Unknown'}</small>
            </div>
            <span class="badge bg-${statusClass}">${deployment.status}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  updateSystemHealth(health) {
    if (!health) return;

    // Build Artifacts Bucket
    const buildSize = health.buckets.buildArtifacts.totalSizeFormatted;
    const buildCount = health.buckets.buildArtifacts.fileCount;
    const buildPercent = Math.min((health.buckets.buildArtifacts.totalSize / (10 * 1024 * 1024 * 1024)) * 100, 100); // Assuming 10GB max

    document.getElementById('build-bucket-size').textContent = buildSize;
    document.getElementById('build-bucket-count').textContent = `${buildCount} files`;
    document.getElementById('build-bucket-bar').style.width = buildPercent + '%';

    // Deploy WebUI Bucket
    const deploySize = health.buckets.deployWebUI.totalSizeFormatted;
    const deployCount = health.buckets.deployWebUI.fileCount;
    const deployPercent = Math.min((health.buckets.deployWebUI.totalSize / (5 * 1024 * 1024 * 1024)) * 100, 100); // Assuming 5GB max

    document.getElementById('deploy-bucket-size').textContent = deploySize;
    document.getElementById('deploy-bucket-count').textContent = `${deployCount} files`;
    document.getElementById('deploy-bucket-bar').style.width = deployPercent + '%';

    // Recent Errors
    const errorsContainer = document.getElementById('recent-errors');
    if (health.recentErrors && health.recentErrors.length > 0) {
      let html = '';
      health.recentErrors.forEach(error => {
        const date = new Date(error.timestamp).toLocaleString();
        html += `
          <div class="alert alert-danger alert-sm mb-2 p-2">
            <small>
              <strong>${date}</strong><br>
              ${error.user}: ${error.error}
            </small>
          </div>
        `;
      });
      errorsContainer.innerHTML = html;
    } else {
      errorsContainer.innerHTML = '<p class="text-success mb-0"><i class="bi bi-check-circle"></i> No recent errors</p>';
    }

    // Uptime
    const uptimeSeconds = health.uptime;
    const uptimeFormatted = this.formatUptime(uptimeSeconds);
    document.getElementById('uptime').textContent = uptimeFormatted;
  }

  createCharts(data) {
    this.createTrendChart(data.deploymentTrend);
    this.createSuccessChart(data.successRate);
    this.createTopGamesChart(data.topGames);
  }

  createTrendChart(trendData) {
    const ctx = document.getElementById('trendChart');

    if (this.charts.trend) {
      this.charts.trend.destroy();
    }

    const labels = trendData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const totalData = trendData.map(d => d.total);
    const successData = trendData.map(d => d.success);
    const failureData = trendData.map(d => d.failure);

    this.charts.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total Deployments',
            data: totalData,
            borderColor: 'rgb(13, 110, 253)',
            backgroundColor: 'rgba(13, 110, 253, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Successful',
            data: successData,
            borderColor: 'rgb(25, 135, 84)',
            backgroundColor: 'rgba(25, 135, 84, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Failed',
            data: failureData,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }

  createSuccessChart(successRate) {
    const ctx = document.getElementById('successChart');

    if (this.charts.success) {
      this.charts.success.destroy();
    }

    this.charts.success = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Successful', 'Failed'],
        datasets: [{
          data: [successRate.successful, successRate.failed],
          backgroundColor: [
            'rgb(25, 135, 84)',
            'rgb(220, 53, 69)'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return `${label}: ${value} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  createTopGamesChart(topGames) {
    const ctx = document.getElementById('topGamesChart');

    if (this.charts.topGames) {
      this.charts.topGames.destroy();
    }

    if (!topGames || topGames.length === 0) {
      ctx.parentElement.innerHTML = '<p class="text-muted text-center">No game deployment data available</p>';
      return;
    }

    const labels = topGames.map(g => g.name);
    const data = topGames.map(g => g.count);

    this.charts.topGames = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Deployments',
          data: data,
          backgroundColor: [
            'rgba(13, 110, 253, 0.8)',
            'rgba(25, 135, 84, 0.8)',
            'rgba(255, 193, 7, 0.8)',
            'rgba(220, 53, 69, 0.8)',
            'rgba(13, 202, 240, 0.8)',
            'rgba(111, 66, 193, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Deployments: ${context.parsed.x}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  }

  setupEventListeners() {
    // Download audit log
    document.getElementById('download-audit-btn').addEventListener('click', () => {
      window.location.href = '/deployments.html';
    });

    // Auto-refresh every 30 seconds
    setInterval(() => {
      this.loadStats();
    }, 30000);
  }

  showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
    alert.style.zIndex = '9999';
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new Dashboard();
});
