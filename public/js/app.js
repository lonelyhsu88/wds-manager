// WebUI Deployment System Manager - Frontend Application

class DeploymentManager {
    constructor() {
        this.currentPrefix = '';
        this.selectedFiles = new Set();
        this.allFiles = [];
        this.viewMode = 'category'; // 'list', 'category', or 'card'
        this.searchFilter = null;
        this.presetManager = null;

        // Load view mode preference from localStorage
        const savedViewMode = localStorage.getItem('viewMode');
        if (savedViewMode && ['list', 'category', 'card'].includes(savedViewMode)) {
            this.viewMode = savedViewMode;
        }

        this.init();
    }

    // Get custom bucket headers from sessionStorage
    getCustomBucketHeaders() {
        const headers = {};
        const customBuildBucket = sessionStorage.getItem('customBuildBucket');
        const customDeployBucket = sessionStorage.getItem('customDeployBucket');

        if (customBuildBucket) {
            headers['X-Custom-Build-Bucket'] = customBuildBucket;
        }
        if (customDeployBucket) {
            headers['X-Custom-Deploy-Bucket'] = customDeployBucket;
        }

        return headers;
    }

    init() {
        this.loadUserInfo();
        this.setupEventListeners();
        this.checkBucketAccess();
        this.loadVersion();
        this.restoreViewMode();
        this.loadArtifacts();

        // Initialize search and filter system
        if (window.SearchFilter) {
            this.searchFilter = new SearchFilter(this);
        }

        // Initialize preset manager
        if (window.PresetManager) {
            this.presetManager = new PresetManager(this);
        }
    }

    restoreViewMode() {
        // Set button states based on saved view mode
        const listBtn = document.getElementById('view-list-btn');
        const categoryBtn = document.getElementById('view-category-btn');
        const cardBtn = document.getElementById('view-card-btn');

        listBtn.classList.remove('active');
        categoryBtn.classList.remove('active');
        cardBtn.classList.remove('active');

        if (this.viewMode === 'list') {
            listBtn.classList.add('active');
        } else if (this.viewMode === 'card') {
            cardBtn.classList.add('active');
        } else {
            categoryBtn.classList.add('active');
        }
    }

    async loadUserInfo() {
        try {
            const response = await fetch('/auth/status');
            const data = await response.json();

            if (data.authenticated && data.user) {
                // Update user name
                document.getElementById('user-name').textContent = data.user.displayName || data.user.email.split('@')[0];

                // Update user email
                document.getElementById('user-email').textContent = data.user.email;

                // Update user photo if available
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

    setupEventListeners() {
        // View toggle buttons
        document.getElementById('view-list-btn').addEventListener('click', () => {
            this.switchView('list');
        });

        document.getElementById('view-category-btn').addEventListener('click', () => {
            this.switchView('category');
        });

        document.getElementById('view-card-btn').addEventListener('click', () => {
            this.switchView('card');
        });

        // Refresh button
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadArtifacts(this.currentPrefix);
        });

        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            this.navigateBack();
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

        // Delete selected button
        document.getElementById('delete-selected-btn').addEventListener('click', () => {
            this.deleteSelected();
        });

        // Version modal
        const versionModal = document.getElementById('versionModal');
        versionModal.addEventListener('show.bs.modal', () => {
            this.loadVersionHistory();
        });

        // Bucket selector buttons
        document.getElementById('change-build-bucket-btn').addEventListener('click', () => {
            this.showBucketSelector('build');
        });

        document.getElementById('change-deploy-bucket-btn').addEventListener('click', () => {
            this.showBucketSelector('deploy');
        });

        // Bucket selector modal handlers
        document.getElementById('use-default-bucket-btn').addEventListener('click', () => {
            this.useDefaultBucket();
        });

        document.getElementById('apply-bucket-btn').addEventListener('click', () => {
            this.applyBucketChange();
        });

    }

    async checkBucketAccess() {
        try {
            const response = await fetch('/api/check-access', {
                headers: this.getCustomBucketHeaders()
            });
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
            window.toast.error('Failed to check bucket access');
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

    switchView(mode) {
        this.viewMode = mode;

        // Save preference to localStorage
        localStorage.setItem('viewMode', mode);

        // Update button states
        const listBtn = document.getElementById('view-list-btn');
        const categoryBtn = document.getElementById('view-category-btn');
        const cardBtn = document.getElementById('view-card-btn');

        listBtn.classList.remove('active');
        categoryBtn.classList.remove('active');
        cardBtn.classList.remove('active');

        if (mode === 'list') {
            listBtn.classList.add('active');
        } else if (mode === 'category') {
            categoryBtn.classList.add('active');
        } else if (mode === 'card') {
            cardBtn.classList.add('active');
        }

        // Reload artifacts with new view mode
        this.loadArtifacts(this.currentPrefix);
    }

    async loadArtifacts(prefix = '') {
        const fileList = document.getElementById('file-list');
        const categoryView = document.getElementById('category-view');
        const cardView = document.getElementById('card-view');

        // Show loading state
        const loadingHtml = '<div class="text-center text-muted py-5"><div class="spinner-border" role="status"></div><p class="mt-2">Loading...</p></div>';

        if (this.viewMode === 'category') {
            categoryView.innerHTML = loadingHtml;
            categoryView.style.display = 'block';
            fileList.style.display = 'none';
            cardView.style.display = 'none';
        } else if (this.viewMode === 'card') {
            cardView.innerHTML = loadingHtml;
            cardView.style.display = 'grid';
            fileList.style.display = 'none';
            categoryView.style.display = 'none';
        } else {
            fileList.innerHTML = loadingHtml;
            fileList.style.display = 'block';
            categoryView.style.display = 'none';
            cardView.style.display = 'none';
        }

        try {
            const categorizeParam = (this.viewMode === 'category' || this.viewMode === 'card') ? '&categorize=true' : '';
            const response = await fetch(`/api/artifacts?prefix=${encodeURIComponent(prefix)}${categorizeParam}`, {
                headers: this.getCustomBucketHeaders()
            });
            const data = await response.json();

            this.currentPrefix = prefix;
            this.allFiles = data.files;

            this.updateBreadcrumb(prefix);

            if (this.viewMode === 'category' && data.categories) {
                this.renderCategoryView(data.categories);
            } else if (this.viewMode === 'card' && data.categories) {
                this.renderCardView(data.categories);
            } else {
                this.renderFileList(data);
            }
        } catch (error) {
            console.error('Error loading artifacts:', error);
            const errorHtml = '<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load artifacts</p></div>';
            if (this.viewMode === 'category') {
                categoryView.innerHTML = errorHtml;
            } else if (this.viewMode === 'card') {
                cardView.innerHTML = errorHtml;
            } else {
                fileList.innerHTML = errorHtml;
            }
        }
    }

    updateBreadcrumb(prefix) {
        const breadcrumb = document.getElementById('breadcrumb');
        const backBtn = document.getElementById('back-btn');
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

        // Show/hide back button based on whether we're at root
        if (prefix && prefix.length > 0) {
            backBtn.style.display = 'inline-block';
        } else {
            backBtn.style.display = 'none';
        }

        // Add click handlers
        breadcrumb.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const prefix = e.target.getAttribute('data-prefix');
                this.loadArtifacts(prefix);
            });
        });
    }

    navigateBack() {
        // Split current prefix and remove the last part to go to parent
        const parts = this.currentPrefix.split('/').filter(p => p);
        if (parts.length > 0) {
            parts.pop(); // Remove last directory
            const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
            this.loadArtifacts(parentPrefix);
        }
    }

    parseVersion(filename) {
        // Parse version from filenames like "MultiPlayerAviator-prd-1.0.26.zip"
        // Matches patterns like: 1.0.26, v1.0.26, 2.3.4-beta, etc.
        const versionMatch = filename.match(/[-_](\d+\.\d+\.\d+(?:[-.][\w]+)?)/);
        return versionMatch ? versionMatch[1] : 'N/A';
    }

    getCategoryIcon(categoryName) {
        const icons = {
            'Hash Games': 'bi-hash',
            'Bingo Games': 'bi-grid-3x3-gap-fill',
            'Arcade Games': 'bi-joystick',
            'Resources': 'bi-box-seam',
            'Dashboard': 'bi-speedometer2',
            'Event': 'bi-calendar-event',
            'Jump Page': 'bi-box-arrow-up-right',
            'Game Demo': 'bi-controller',
            'External Management': 'bi-gear',
            'Other': 'bi-collection'
        };
        return icons[categoryName] || 'bi-folder';
    }

    getCategoryColor(categoryName) {
        const colors = {
            'Hash Games': 'primary',
            'Bingo Games': 'success',
            'Arcade Games': 'warning',
            'Resources': 'info',
            'Dashboard': 'danger',
            'Event': 'purple',
            'Jump Page': 'teal',
            'Game Demo': 'indigo',
            'External Management': 'dark',
            'Other': 'secondary'
        };
        return colors[categoryName] || 'secondary';
    }

    renderCategoryView(categories) {
        const categoryView = document.getElementById('category-view');
        const accordion = document.getElementById('categoryAccordion');

        if (!categories || Object.keys(categories).length === 0) {
            categoryView.innerHTML = '<div class="empty-state"><i class="bi bi-folder-x"></i><p>No games found</p></div>';
            return;
        }

        let html = '';
        let index = 0;

        // Order categories: Hash Games, Bingo Games, Arcade Games, Resources, Dashboard, Event, Jump Page, Game Demo, External Management, Other
        const categoryOrder = ['Hash Games', 'Bingo Games', 'Arcade Games', 'Resources', 'Dashboard', 'Event', 'Jump Page', 'Game Demo', 'External Management', 'Other'];
        const sortedCategories = categoryOrder.filter(cat => categories[cat]);

        sortedCategories.forEach(categoryName => {
            const games = categories[categoryName];
            const icon = this.getCategoryIcon(categoryName);
            const color = this.getCategoryColor(categoryName);
            const collapseId = `collapse${index}`;
            const isFirst = index === 0;

            html += `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="heading${index}">
                        <button class="accordion-button ${isFirst ? '' : 'collapsed'}" type="button"
                                data-bs-toggle="collapse" data-bs-target="#${collapseId}"
                                aria-expanded="${isFirst}" aria-controls="${collapseId}">
                            <i class="bi ${icon} me-2"></i>
                            ${categoryName}
                            <span class="badge bg-${color} ms-2">${games.length}</span>
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse ${isFirst ? 'show' : ''}"
                         aria-labelledby="heading${index}" data-bs-parent="#categoryAccordion">
                        <div class="accordion-body p-0">
                            ${this.renderCategoryGames(games)}
                        </div>
                    </div>
                </div>
            `;
            index++;
        });

        accordion.innerHTML = html;

        // Add event listeners for file selection
        this.attachCategoryEventListeners();
    }

    renderCategoryGames(games) {
        let html = '<div class="list-group list-group-flush">';

        games.forEach(file => {
            const isSelected = this.selectedFiles.has(file.fullPath);
            const fileSize = this.formatFileSize(file.size);
            const fileIcon = file.isZip ? 'bi-file-earmark-zip' : 'bi-file-earmark';
            const lastModified = new Date(file.lastModified).toLocaleString();

            html += `
                <div class="list-group-item list-group-item-action file-item-category ${isSelected ? 'selected' : ''}"
                     data-key="${file.fullPath}">
                    <div class="d-flex align-items-center">
                        <div class="form-check me-3">
                            <input type="checkbox" class="form-check-input"
                                   ${isSelected ? 'checked' : ''}>
                        </div>
                        <i class="bi ${fileIcon} fs-4 me-3 text-primary"></i>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-center">
                                <h6 class="mb-1">${file.name}</h6>
                                ${file.isZip ? '<span class="badge bg-primary">ZIP</span>' : ''}
                            </div>
                            <div class="text-muted small">
                                <span class="me-3"><i class="bi bi-hdd"></i> ${fileSize}</span>
                                <span><i class="bi bi-clock"></i> ${lastModified}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    attachCategoryEventListeners() {
        document.querySelectorAll('.file-item-category').forEach(item => {
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
    }


    
    renderCardView(categories) {
        const cardView = document.getElementById('card-view');
    
        if (!categories || Object.keys(categories).length === 0) {
            cardView.innerHTML = '<div class="empty-state"><i class="bi bi-folder-x"></i><p>No games found</p></div>';
            return;
        }
    
        let html = '';
    
        const categoryOrder = ['Hash Games', 'Bingo Games', 'Arcade Games', 'Resources', 'Dashboard', 'Event', 'Jump Page', 'Game Demo', 'External Management', 'Other'];
        const sortedCategories = categoryOrder.filter(cat => categories[cat]);

        sortedCategories.forEach(categoryName => {
            const games = categories[categoryName];
            const categoryClass = categoryName.toLowerCase().replace(' ', '-');
    
            games.forEach(file => {
                const isSelected = this.selectedFiles.has(file.fullPath);
                const fileSize = this.formatFileSize(file.size);
                const lastModified = new Date(file.lastModified).toLocaleDateString();
                const gameName = file.name.replace(/\.(zip|tar\.gz)$/i, '');
                const firstLetter = gameName.charAt(0).toUpperCase();
    
                const version = this.parseVersion(file.name);
    
                html += `
                    <div class="game-card ${isSelected ? 'selected' : ''}" data-key="${file.fullPath}">
                        <div class="game-card-header ${categoryClass}">
                            <div class="game-card-icon">${firstLetter}</div>
                            <input type="checkbox" class="form-check-input game-card-checkbox"
                                   ${isSelected ? 'checked' : ''}>
                        </div>
                        <div class="game-card-body">
                            <div class="game-card-title" title="${gameName}">${gameName}</div>
                            <div class="game-card-meta">
                                <div><i class="bi bi-hdd"></i> ${fileSize}</div>
                                <div><i class="bi bi-clock"></i> ${lastModified}</div>
                            </div>
                            <div class="game-card-badges">
                                ${version !== 'N/A' ? `<span class="badge bg-info">${version}</span>` : ''}
                                <span class="badge bg-${this.getCategoryColor(categoryName)}">${categoryName}</span>
                                ${file.isZip ? '<span class="badge bg-primary">ZIP</span>' : ''}
                            </div>
                            <div class="game-card-actions">
                                <button class="btn btn-sm btn-primary card-deploy-btn" data-key="${file.fullPath}">
                                    <i class="bi bi-rocket-takeoff"></i> Deploy
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        });
    
        cardView.innerHTML = html;
    
        this.attachCardEventListeners();
    }
    
    attachCardEventListeners() {
        document.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('card-deploy-btn') ||
                    e.target.closest('.card-deploy-btn') ||
                    e.target.type === 'checkbox') {
                    return; // Don't toggle selection if clicking deploy button or checkbox directly
                }
                const checkbox = card.querySelector('.game-card-checkbox');
                checkbox.checked = !checkbox.checked;
                this.toggleFileSelection(card);
            });
    
            card.querySelector('.game-card-checkbox').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFileSelection(card);
            });
    
            const deployBtn = card.querySelector('.card-deploy-btn');
            if (deployBtn) {
                deployBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const key = deployBtn.getAttribute('data-key');
                    this.selectedFiles.clear();
                    this.selectedFiles.add(key);
                    this.updateSelectionCount();
                    this.deploy();
                });
            }
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
        // Update both list view and category view items
        const allItems = document.querySelectorAll('.file-item, .file-item-category');
        allItems.forEach(item => {
            const key = item.getAttribute('data-key');
            const checkbox = item.querySelector('input[type="checkbox"]');
            const isSelected = this.selectedFiles.has(key);

            if (checkbox) {
                checkbox.checked = isSelected;
            }
            item.classList.toggle('selected', isSelected);
        });
    }

    updateSelectionCount() {
        const count = this.selectedFiles.size;
        document.getElementById('selected-count').textContent = count;
        document.getElementById('deploy-btn').disabled = count === 0;
        document.getElementById('clear-selection-btn').disabled = count === 0;
        document.getElementById('delete-selected-btn').disabled = count === 0;
    }

    async deploy() {
        if (this.selectedFiles.size === 0) {
            window.toast.warning('Please select at least one file to deploy');
            return;
        }

        const customPrefix = document.getElementById('custom-prefix').value.trim();

        // Step 1: Check versions
        try {
            const versionCheckResponse = await fetch('/api/check-versions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getCustomBucketHeaders()
                },
                body: JSON.stringify({
                    artifactKeys: Array.from(this.selectedFiles)
                })
            });

            const versionCheck = await versionCheckResponse.json();

            // If there are version warnings, show them to the user
            if (versionCheck.hasWarnings && versionCheck.warnings.length > 0) {
                const warningMessages = versionCheck.warnings.map(w =>
                    `${w.gameName}: ${w.artifactVersion} → ${w.deployedVersion} (older)`
                ).join('\n');

                const warningMsg = `⚠️  VERSION WARNING ⚠️\n\n` +
                    `The following artifacts are OLDER than currently deployed versions:\n\n` +
                    `${warningMessages}\n\n` +
                    `Do you want to continue with deployment?`;

                if (!confirm(warningMsg)) {
                    return;
                }
            }
        } catch (error) {
            console.error('Version check error:', error);
            // Continue with deployment even if version check fails
        }

        // Step 2: Normal deployment confirmation
        const confirmMsg = `Deploy ${this.selectedFiles.size} file(s)?\n\nThis will:\n` +
            `${document.getElementById('clear-before-deploy').checked ? '• Delete existing files in target directory\n' : ''}` +
            `${document.getElementById('extract-zip').checked ? '• Extract ZIP files\n' : ''}` +
            `• Upload to: ${customPrefix || 'Auto-parsed game directories'}`;

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
                    'Content-Type': 'application/json',
                    ...this.getCustomBucketHeaders()
                },
                body: JSON.stringify({
                    artifactKeys: Array.from(this.selectedFiles),
                    clearBefore: document.getElementById('clear-before-deploy').checked,
                    extractZip: document.getElementById('extract-zip').checked,
                    customPrefix: customPrefix
                })
            });

            const result = await response.json();

            if (result.success) {
                deployMessage.textContent = `Deployment completed! ${result.totalFiles} files deployed in ${result.duration}`;
                setTimeout(() => {
                    deployStatus.style.display = 'none';
                }, 5000);
                window.toast.success(`Successfully deployed ${result.totalFiles} files!`);
            } else {
                throw new Error(result.message || 'Deployment failed');
            }
        } catch (error) {
            console.error('Deployment error:', error);
            deployMessage.textContent = `Deployment failed: ${error.message}`;
            window.toast.error(`Deployment failed: ${error.message}`);
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
                    'Content-Type': 'application/json',
                    ...this.getCustomBucketHeaders()
                },
                body: JSON.stringify({
                    prefix: document.getElementById('target-prefix').value
                })
            });

            const result = await response.json();

            if (result.success) {
                window.toast.success(`Deleted ${result.deletedCount} files from deploy bucket`);
            } else {
                throw new Error('Failed to clear deploy bucket');
            }
        } catch (error) {
            console.error('Error clearing deploy bucket:', error);
            window.toast.error('Failed to clear deploy bucket');
        }
    }

    async deleteSelected() {
        if (this.selectedFiles.size === 0) {
            window.toast.warning('Please select files to delete');
            return;
        }

        const selectedArray = Array.from(this.selectedFiles);
        const itemCount = selectedArray.length;

        if (!confirm(`Are you sure you want to delete ${itemCount} selected item(s)?\n\nThis action cannot be undone!`)) {
            return;
        }

        const deleteBtn = document.getElementById('delete-selected-btn');
        const originalText = deleteBtn.innerHTML;

        try {
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';

            const response = await fetch('/api/artifacts/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getCustomBucketHeaders()
                },
                body: JSON.stringify({
                    artifactKeys: selectedArray
                })
            });

            const result = await response.json();

            if (result.success) {
                const totalSize = this.formatFileSize(result.totalSize);
                window.toast.success(`Successfully deleted ${result.deleted} item(s) (${totalSize})`);

                // Clear selection
                this.selectedFiles.clear();

                // Reload artifacts
                await this.loadArtifacts(this.currentPrefix);
            } else {
                const message = result.failed > 0
                    ? `Deleted ${result.deleted} items, but ${result.failed} failed`
                    : 'Delete operation failed';

                if (result.deleted > 0) {
                    window.toast.warning(message);
                } else {
                    window.toast.error(message);
                }

                // Reload anyway to reflect any changes
                await this.loadArtifacts(this.currentPrefix);
            }
        } catch (error) {
            console.error('Delete error:', error);
            window.toast.error('Failed to delete selected items');
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Bucket Selector Methods

    async showBucketSelector(type) {
        // type: 'build' or 'deploy'
        this.currentBucketType = type;

        const modal = new bootstrap.Modal(document.getElementById('bucketSelectorModal'));
        const titleEl = document.getElementById('bucketSelectorTitle');
        const selectEl = document.getElementById('bucket-name-select');
        const defaultNameEl = document.getElementById('default-bucket-name');
        const filterInput = document.getElementById('bucket-filter-input');

        // Reset filter
        filterInput.value = '';

        try {
            // Load bucket list and default info
            const [accessResponse, bucketsResponse] = await Promise.all([
                fetch('/api/check-access', { headers: this.getCustomBucketHeaders() }),
                fetch('/api/list-buckets', { headers: this.getCustomBucketHeaders() })
            ]);

            const accessData = await accessResponse.json();
            const bucketsData = await bucketsResponse.json();

            // Set title and default bucket
            if (type === 'build') {
                titleEl.textContent = 'Change Build Artifacts Bucket';
                defaultNameEl.textContent = accessData.buildArtifactsBucket.name;
                this.defaultBuildBucket = accessData.buildArtifactsBucket.name;
            } else {
                titleEl.textContent = 'Change Deploy WebUI Bucket';
                defaultNameEl.textContent = accessData.deployWebUIBucket.name;
                this.defaultDeployBucket = accessData.deployWebUIBucket.name;
            }

            // Populate dropdown with all buckets
            this.populateBucketDropdown(bucketsData.buckets, type);

            // Set current selection
            const currentBucket = type === 'build'
                ? (sessionStorage.getItem('customBuildBucket') || accessData.buildArtifactsBucket.name)
                : (sessionStorage.getItem('customDeployBucket') || accessData.deployWebUIBucket.name);
            selectEl.value = currentBucket;

            // Setup filter
            this.setupBucketFilter(bucketsData.buckets);

            modal.show();
        } catch (error) {
            console.error('Error loading bucket info:', error);
            window.toast.error('Failed to load bucket list');
        }
    }

    populateBucketDropdown(buckets, type) {
        const selectEl = document.getElementById('bucket-name-select');
        selectEl.innerHTML = '';

        if (!buckets || buckets.length === 0) {
            selectEl.innerHTML = '<option value="">No buckets available</option>';
            return;
        }

        buckets.forEach(bucket => {
            const option = document.createElement('option');
            option.value = bucket.name;
            option.textContent = bucket.name;

            // Mark default buckets
            if (bucket.isDefault) {
                option.textContent += ' (default)';
                option.classList.add('fw-bold');
            }

            selectEl.appendChild(option);
        });

        // Store all buckets for filtering
        this.allBuckets = buckets;
    }

    setupBucketFilter(buckets) {
        const filterInput = document.getElementById('bucket-filter-input');
        const selectEl = document.getElementById('bucket-name-select');

        filterInput.addEventListener('input', (e) => {
            const filterText = e.target.value.toLowerCase();
            const currentValue = selectEl.value;

            // Filter buckets
            const filteredBuckets = buckets.filter(bucket =>
                bucket.name.toLowerCase().includes(filterText)
            );

            // Repopulate dropdown
            selectEl.innerHTML = '';
            filteredBuckets.forEach(bucket => {
                const option = document.createElement('option');
                option.value = bucket.name;
                option.textContent = bucket.name;

                if (bucket.isDefault) {
                    option.textContent += ' (default)';
                    option.classList.add('fw-bold');
                }

                selectEl.appendChild(option);
            });

            // Try to maintain selection
            if (filteredBuckets.find(b => b.name === currentValue)) {
                selectEl.value = currentValue;
            }
        });
    }

    useDefaultBucket() {
        const selectEl = document.getElementById('bucket-name-select');
        if (this.currentBucketType === 'build') {
            selectEl.value = this.defaultBuildBucket;
        } else {
            selectEl.value = this.defaultDeployBucket;
        }
    }

    async applyBucketChange() {
        const selectEl = document.getElementById('bucket-name-select');
        const bucketName = selectEl.value.trim();

        if (!bucketName) {
            window.toast.error('Please select a bucket');
            return;
        }

        try {
            // Save to session storage
            if (this.currentBucketType === 'build') {
                sessionStorage.setItem('customBuildBucket', bucketName);
            } else {
                sessionStorage.setItem('customDeployBucket', bucketName);
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('bucketSelectorModal'));
            modal.hide();

            // Show toast and reload
            const bucketType = this.currentBucketType === 'build' ? 'Build Artifacts' : 'Deploy WebUI';
            window.toast.success(`${bucketType} bucket changed to: ${bucketName}`);

            // Reload the page after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (error) {
            console.error('Error applying bucket change:', error);
            window.toast.error('Failed to apply bucket change');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new DeploymentManager();
});
