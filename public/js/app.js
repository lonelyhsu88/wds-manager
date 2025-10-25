// WebUI Deployment System Manager - Frontend Application

class DeploymentManager {
    constructor() {
        this.currentPrefix = '';
        this.selectedFiles = new Set();
        this.allFiles = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkBucketAccess();
        this.loadVersion();
        this.loadArtifacts();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadArtifacts(this.currentPrefix);
        });

        // Select/Deselect all buttons
        document.getElementById('select-all-btn').addEventListener('click', () => {
            this.selectAll();
        });

        document.getElementById('deselect-all-btn').addEventListener('click', () => {
            this.deselectAll();
        });

        // Clear selection button
        document.getElementById('clear-selection-btn').addEventListener('click', () => {
            this.deselectAll();
        });

        // Deploy button
        document.getElementById('deploy-btn').addEventListener('click', () => {
            this.deploy();
        });

        // Clear deploy bucket button
        document.getElementById('clear-deploy-bucket-btn').addEventListener('click', () => {
            this.clearDeployBucket();
        });

        // Version modal
        const versionModal = document.getElementById('versionModal');
        versionModal.addEventListener('show.bs.modal', () => {
            this.loadVersionHistory();
        });
    }

    async checkBucketAccess() {
        try {
            const response = await fetch('/api/check-access');
            const data = await response.json();

            // Build artifacts bucket
            document.getElementById('build-bucket-name').textContent = data.buildArtifactsBucket.name;
            const buildStatus = document.getElementById('build-bucket-status');
            buildStatus.textContent = data.buildArtifactsBucket.accessible ? 'Accessible' : 'Not Accessible';
            buildStatus.className = `badge ${data.buildArtifactsBucket.accessible ? 'bg-success' : 'bg-danger'}`;

            // Deploy webui bucket
            document.getElementById('deploy-bucket-name').textContent = data.deployWebUIBucket.name;
            const deployStatus = document.getElementById('deploy-bucket-status');
            deployStatus.textContent = data.deployWebUIBucket.accessible ? 'Accessible' : 'Not Accessible';
            deployStatus.className = `badge ${data.deployWebUIBucket.accessible ? 'bg-success' : 'bg-danger'}`;
        } catch (error) {
            console.error('Error checking bucket access:', error);
            this.showAlert('Failed to check bucket access', 'danger');
        }
    }

    async loadVersion() {
        try {
            const response = await fetch('/api/version');
            const data = await response.json();
            document.getElementById('version-badge').textContent = `v${data.version}`;
            document.getElementById('current-version').textContent = data.version;
        } catch (error) {
            console.error('Error loading version:', error);
        }
    }

    async loadVersionHistory() {
        const container = document.getElementById('version-history-list');
        container.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div></div>';

        try {
            const response = await fetch('/api/version');
            const data = await response.json();

            if (data.history && data.history.length > 0) {
                container.innerHTML = data.history.map(item => `
                    <div class="version-history-item">
                        <h6>Version ${item.version}</h6>
                        <div class="date">${item.date}</div>
                        <ul>
                            ${item.changes.map(change => `<li>${change}</li>`).join('')}
                        </ul>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<p class="text-muted">No version history available</p>';
            }
        } catch (error) {
            console.error('Error loading version history:', error);
            container.innerHTML = '<p class="text-danger">Failed to load version history</p>';
        }
    }

    async loadArtifacts(prefix = '') {
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '<div class="text-center text-muted py-5"><div class="spinner-border" role="status"></div><p class="mt-2">Loading...</p></div>';

        try {
            const response = await fetch(`/api/artifacts?prefix=${encodeURIComponent(prefix)}`);
            const data = await response.json();

            this.currentPrefix = prefix;
            this.allFiles = data.files;

            this.updateBreadcrumb(prefix);
            this.renderFileList(data);
        } catch (error) {
            console.error('Error loading artifacts:', error);
            fileList.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load artifacts</p></div>';
        }
    }

    updateBreadcrumb(prefix) {
        const breadcrumb = document.getElementById('breadcrumb');
        const parts = prefix.split('/').filter(p => p);

        let html = '<li class="breadcrumb-item"><a href="#" data-prefix="">Root</a></li>';
        let currentPath = '';

        parts.forEach((part, index) => {
            currentPath += part + '/';
            const isLast = index === parts.length - 1;
            if (isLast) {
                html += `<li class="breadcrumb-item active">${part}</li>`;
            } else {
                html += `<li class="breadcrumb-item"><a href="#" data-prefix="${currentPath}">${part}</a></li>`;
            }
        });

        breadcrumb.innerHTML = html;

        // Add click handlers
        breadcrumb.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const prefix = e.target.getAttribute('data-prefix');
                this.loadArtifacts(prefix);
            });
        });
    }

    renderFileList(data) {
        const fileList = document.getElementById('file-list');

        if (data.directories.length === 0 && data.files.length === 0) {
            fileList.innerHTML = '<div class="empty-state"><i class="bi bi-folder-x"></i><p>No files or directories found</p></div>';
            return;
        }

        let html = '';

        // Render directories
        data.directories.forEach(dir => {
            html += `
                <div class="directory-item" data-prefix="${dir.fullPath}">
                    <div>
                        <i class="bi bi-folder-fill"></i>
                        <span class="ms-2">${dir.name}</span>
                    </div>
                    <i class="bi bi-chevron-right"></i>
                </div>
            `;
        });

        // Render files
        data.files.forEach(file => {
            const isSelected = this.selectedFiles.has(file.fullPath);
            const fileSize = this.formatFileSize(file.size);
            const fileIcon = file.isZip ? 'bi-file-earmark-zip' : 'bi-file-earmark';

            html += `
                <div class="file-item ${isSelected ? 'selected' : ''}" data-key="${file.fullPath}">
                    <div class="file-item-left">
                        <div class="file-item-checkbox">
                            <input type="checkbox" class="form-check-input"
                                   ${isSelected ? 'checked' : ''}>
                        </div>
                        <i class="bi ${fileIcon}"></i>
                        <div class="file-item-info">
                            <div class="file-item-name">${file.name}</div>
                            <div class="file-item-meta">
                                ${fileSize} • ${new Date(file.lastModified).toLocaleString()}
                            </div>
                        </div>
                    </div>
                    ${file.isZip ? '<span class="badge bg-primary file-item-badge">ZIP</span>' : ''}
                </div>
            `;
        });

        fileList.innerHTML = html;

        // Add event listeners
        fileList.querySelectorAll('.directory-item').forEach(dir => {
            dir.addEventListener('click', (e) => {
                const prefix = e.currentTarget.getAttribute('data-prefix');
                this.loadArtifacts(prefix);
            });
        });

        fileList.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                }
                this.toggleFileSelection(item);
            });

            item.querySelector('input[type="checkbox"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFileSelection(item);
            });
        });

        this.updateSelectionCount();
    }

    toggleFileSelection(item) {
        const key = item.getAttribute('data-key');
        const checkbox = item.querySelector('input[type="checkbox"]');

        if (checkbox.checked) {
            this.selectedFiles.add(key);
            item.classList.add('selected');
        } else {
            this.selectedFiles.delete(key);
            item.classList.remove('selected');
        }

        this.updateSelectionCount();
    }

    selectAll() {
        this.allFiles.forEach(file => {
            this.selectedFiles.add(file.fullPath);
        });
        this.updateFileListSelection();
        this.updateSelectionCount();
    }

    deselectAll() {
        this.selectedFiles.clear();
        this.updateFileListSelection();
        this.updateSelectionCount();
    }

    updateFileListSelection() {
        document.querySelectorAll('.file-item').forEach(item => {
            const key = item.getAttribute('data-key');
            const checkbox = item.querySelector('input[type="checkbox"]');
            const isSelected = this.selectedFiles.has(key);

            checkbox.checked = isSelected;
            item.classList.toggle('selected', isSelected);
        });
    }

    updateSelectionCount() {
        const count = this.selectedFiles.size;
        document.getElementById('selected-count').textContent = count;
        document.getElementById('deploy-btn').disabled = count === 0;
        document.getElementById('clear-selection-btn').disabled = count === 0;
    }

    async deploy() {
        if (this.selectedFiles.size === 0) {
            this.showAlert('Please select at least one file to deploy', 'warning');
            return;
        }

        const confirmMsg = `Deploy ${this.selectedFiles.size} file(s) to the WebUI bucket?\n\nThis will:\n` +
            `${document.getElementById('clear-before-deploy').checked ? '• Delete all existing files\n' : ''}` +
            `${document.getElementById('extract-zip').checked ? '• Extract ZIP files\n' : ''}` +
            `• Upload selected artifacts`;

        if (!confirm(confirmMsg)) {
            return;
        }

        const deployBtn = document.getElementById('deploy-btn');
        const deployStatus = document.getElementById('deployment-status');
        const deployMessage = document.getElementById('deployment-message');

        deployBtn.disabled = true;
        deployStatus.style.display = 'block';
        deployMessage.textContent = 'Starting deployment...';

        try {
            const response = await fetch('/api/deploy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    artifactKeys: Array.from(this.selectedFiles),
                    clearBefore: document.getElementById('clear-before-deploy').checked,
                    extractZip: document.getElementById('extract-zip').checked,
                    targetPrefix: document.getElementById('target-prefix').value
                })
            });

            const result = await response.json();

            if (result.success) {
                deployMessage.textContent = `Deployment completed! ${result.totalFiles} files deployed in ${result.duration}`;
                setTimeout(() => {
                    deployStatus.style.display = 'none';
                }, 5000);
                this.showAlert(`Successfully deployed ${result.totalFiles} files!`, 'success');
            } else {
                throw new Error(result.message || 'Deployment failed');
            }
        } catch (error) {
            console.error('Deployment error:', error);
            deployMessage.textContent = `Deployment failed: ${error.message}`;
            this.showAlert('Deployment failed. Check console for details.', 'danger');
        } finally {
            deployBtn.disabled = false;
        }
    }

    async clearDeployBucket() {
        if (!confirm('Are you sure you want to delete ALL files from the deploy bucket?\n\nThis action cannot be undone!')) {
            return;
        }

        try {
            const response = await fetch('/api/clear-deploy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prefix: document.getElementById('target-prefix').value
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert(`Deleted ${result.deletedCount} files from deploy bucket`, 'success');
            } else {
                throw new Error('Failed to clear deploy bucket');
            }
        } catch (error) {
            console.error('Error clearing deploy bucket:', error);
            this.showAlert('Failed to clear deploy bucket', 'danger');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    showAlert(message, type = 'info') {
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
        alert.style.zIndex = '9999';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alert);

        // Auto dismiss after 5 seconds
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new DeploymentManager();
});
