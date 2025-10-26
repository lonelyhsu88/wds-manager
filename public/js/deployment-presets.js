// Deployment Presets System for WDS-Manager

class PresetManager {
    constructor(deploymentManager) {
        this.deploymentManager = deploymentManager;
        this.presets = this.loadPresets();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createBuiltInPresets();
    }

    /**
     * Setup event listeners for preset buttons
     */
    setupEventListeners() {
        // Save preset button
        const saveBtn = document.getElementById('save-preset-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.showSavePresetModal());
        }

        // Load preset button
        const loadBtn = document.getElementById('load-preset-btn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.showLoadPresetModal());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S to save preset
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
                const searchBox = document.getElementById('global-search-input');
                // Only trigger if search box is not focused
                if (document.activeElement !== searchBox) {
                    e.preventDefault();
                    this.showSavePresetModal();
                }
            }

            // Ctrl/Cmd + L to load preset
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this.showLoadPresetModal();
            }
        });
    }

    /**
     * Create built-in presets
     */
    createBuiltInPresets() {
        // Built-in presets are templates, not saved in localStorage
        this.builtInPresets = {
            'all-hash-games': {
                name: 'All Hash Games',
                description: 'Deploy all hash game artifacts',
                category: 'hash',
                builtIn: true
            },
            'all-bingo-games': {
                name: 'All Bingo Games',
                description: 'Deploy all bingo game artifacts',
                category: 'bingo',
                builtIn: true
            },
            'all-arcade-games': {
                name: 'All Arcade Games',
                description: 'Deploy all arcade game artifacts',
                category: 'arcade',
                builtIn: true
            }
        };
    }

    /**
     * Show save preset modal
     */
    showSavePresetModal() {
        // Check if files are selected
        if (this.deploymentManager.selectedFiles.size === 0) {
            window.toast.warning('Please select files first before saving a preset');
            return;
        }

        const modal = document.getElementById('savePresetModal');
        if (!modal) {
            this.createSavePresetModal();
            this.showSavePresetModal();
            return;
        }

        // Reset form
        document.getElementById('preset-name').value = '';
        document.getElementById('preset-description').value = '';

        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
    }

    /**
     * Create save preset modal
     */
    createSavePresetModal() {
        const modalHtml = `
            <div class="modal fade" id="savePresetModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-save"></i> Save Deployment Preset
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label for="preset-name" class="form-label">Preset Name *</label>
                                <input type="text" class="form-control" id="preset-name"
                                       placeholder="e.g., Production Update Q4" required>
                            </div>
                            <div class="mb-3">
                                <label for="preset-description" class="form-label">Description</label>
                                <textarea class="form-control" id="preset-description" rows="2"
                                          placeholder="Optional description of this preset"></textarea>
                            </div>
                            <div class="alert alert-info">
                                <small>
                                    <i class="bi bi-info-circle"></i>
                                    This preset will save ${this.deploymentManager.selectedFiles.size} selected file(s)
                                    and current deployment options.
                                </small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirm-save-preset-btn">
                                <i class="bi bi-save"></i> Save Preset
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Setup save button
        document.getElementById('confirm-save-preset-btn').addEventListener('click', () => {
            this.savePreset();
        });
    }

    /**
     * Save current selection as preset
     */
    savePreset() {
        const nameInput = document.getElementById('preset-name');
        const descInput = document.getElementById('preset-description');
        const name = nameInput.value.trim();
        const description = descInput.value.trim();

        if (!name) {
            window.toast.warning('Please enter a preset name');
            nameInput.focus();
            return;
        }

        // Check if preset already exists
        if (this.presets[name]) {
            if (!confirm(`A preset named "${name}" already exists. Do you want to overwrite it?`)) {
                return;
            }
        }

        // Get current deployment options
        const options = {
            clearBefore: document.getElementById('clear-before-deploy')?.checked || true,
            extractZip: document.getElementById('extract-zip')?.checked || true,
            customPrefix: document.getElementById('custom-prefix')?.value.trim() || ''
        };

        // Create preset
        const preset = {
            name: name,
            description: description,
            artifacts: Array.from(this.deploymentManager.selectedFiles),
            options: options,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0
        };

        // Save preset
        this.presets[name] = preset;
        this.savePresetsToStorage();

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('savePresetModal'));
        modal.hide();

        window.toast.success(`Preset "${name}" saved successfully`);
    }

    /**
     * Show load preset modal
     */
    showLoadPresetModal() {
        const modal = document.getElementById('loadPresetModal');
        if (!modal) {
            this.createLoadPresetModal();
            this.showLoadPresetModal();
            return;
        }

        // Render preset list
        this.renderPresetList();

        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
    }

    /**
     * Create load preset modal
     */
    createLoadPresetModal() {
        const modalHtml = `
            <div class="modal fade" id="loadPresetModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-box-arrow-in-down"></i> Load Deployment Preset
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="preset-list-container">
                                <!-- Preset list will be rendered here -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * Render preset list in modal
     */
    renderPresetList() {
        const container = document.getElementById('preset-list-container');
        if (!container) return;

        const userPresets = Object.values(this.presets);
        const builtInPresets = Object.values(this.builtInPresets);

        let html = '';

        // Built-in presets section
        if (builtInPresets.length > 0) {
            html += '<h6 class="text-muted mb-3"><i class="bi bi-star-fill"></i> Built-in Presets</h6>';
            html += '<div class="list-group mb-4">';

            builtInPresets.forEach(preset => {
                html += this.renderBuiltInPresetItem(preset);
            });

            html += '</div>';
        }

        // User presets section
        if (userPresets.length > 0) {
            html += '<h6 class="text-muted mb-3"><i class="bi bi-person-fill"></i> My Presets</h6>';
            html += '<div class="list-group">';

            userPresets.forEach(preset => {
                html += this.renderPresetItem(preset);
            });

            html += '</div>';
        } else {
            html += '<div class="alert alert-info">No custom presets saved yet.</div>';
        }

        container.innerHTML = html;

        // Attach event listeners
        this.attachPresetListeners();
    }

    /**
     * Render a built-in preset item
     */
    renderBuiltInPresetItem(preset) {
        return `
            <div class="list-group-item preset-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">
                            <i class="bi bi-star-fill text-warning"></i>
                            ${this.escapeHtml(preset.name)}
                        </h6>
                        <p class="mb-1 text-muted small">${this.escapeHtml(preset.description)}</p>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-primary load-builtin-preset-btn"
                                data-category="${preset.category}">
                            <i class="bi bi-play-fill"></i> Load
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render a user preset item
     */
    renderPresetItem(preset) {
        const createdDate = new Date(preset.createdAt).toLocaleDateString();
        const lastUsed = preset.lastUsed ? new Date(preset.lastUsed).toLocaleDateString() : 'Never';

        return `
            <div class="list-group-item preset-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${this.escapeHtml(preset.name)}</h6>
                        ${preset.description ? `<p class="mb-1 text-muted small">${this.escapeHtml(preset.description)}</p>` : ''}
                        <div class="small text-muted">
                            <span class="me-3">
                                <i class="bi bi-files"></i> ${preset.artifacts.length} file(s)
                            </span>
                            <span class="me-3">
                                <i class="bi bi-calendar"></i> Created: ${createdDate}
                            </span>
                            <span class="me-3">
                                <i class="bi bi-clock-history"></i> Last used: ${lastUsed}
                            </span>
                            <span>
                                <i class="bi bi-graph-up"></i> Used: ${preset.usageCount} time(s)
                            </span>
                        </div>
                    </div>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-primary load-preset-btn"
                                data-preset-name="${this.escapeHtml(preset.name)}">
                            <i class="bi bi-play-fill"></i> Load
                        </button>
                        <button class="btn btn-sm btn-danger delete-preset-btn"
                                data-preset-name="${this.escapeHtml(preset.name)}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners to preset items
     */
    attachPresetListeners() {
        // Load preset buttons
        document.querySelectorAll('.load-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetName = e.currentTarget.dataset.presetName;
                this.loadPreset(presetName);
            });
        });

        // Load built-in preset buttons
        document.querySelectorAll('.load-builtin-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.loadBuiltInPreset(category);
            });
        });

        // Delete preset buttons
        document.querySelectorAll('.delete-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const presetName = e.currentTarget.dataset.presetName;
                this.deletePreset(presetName);
            });
        });
    }

    /**
     * Load a preset
     */
    async loadPreset(name) {
        const preset = this.presets[name];
        if (!preset) {
            window.toast.error('Preset not found');
            return;
        }

        // Update usage stats
        preset.lastUsed = new Date().toISOString();
        preset.usageCount++;
        this.savePresetsToStorage();

        // Apply preset
        this.applyPreset(preset);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('loadPresetModal'));
        modal.hide();

        window.toast.success(`Loaded preset: ${name}`);
    }

    /**
     * Load a built-in preset
     */
    async loadBuiltInPreset(category) {
        // Get all files in the category
        const allFiles = this.deploymentManager.allFiles;
        const categoryFiles = allFiles.filter(file => {
            const gameName = file.name.toLowerCase();

            switch (category) {
                case 'hash':
                    return this.isHashGame(gameName);
                case 'bingo':
                    return this.isBingoGame(gameName);
                case 'arcade':
                    return this.isArcadeGame(gameName);
                default:
                    return false;
            }
        });

        if (categoryFiles.length === 0) {
            window.toast.warning(`No ${category} games found`);
            return;
        }

        // Create preset with selected files
        const preset = {
            name: `All ${category} Games`,
            artifacts: categoryFiles.map(f => f.fullPath),
            options: {
                clearBefore: true,
                extractZip: true,
                customPrefix: ''
            }
        };

        // Apply preset
        this.applyPreset(preset);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('loadPresetModal'));
        modal.hide();

        window.toast.success(`Selected ${categoryFiles.length} ${category} game(s)`);
    }

    /**
     * Apply preset to current selection
     */
    applyPreset(preset) {
        // Clear current selection
        this.deploymentManager.deselectAll();

        // Select preset artifacts
        preset.artifacts.forEach(artifactKey => {
            this.deploymentManager.selectedFiles.add(artifactKey);
        });

        // Apply deployment options
        if (preset.options) {
            const clearBeforeCheckbox = document.getElementById('clear-before-deploy');
            const extractZipCheckbox = document.getElementById('extract-zip');
            const customPrefixInput = document.getElementById('custom-prefix');

            if (clearBeforeCheckbox) {
                clearBeforeCheckbox.checked = preset.options.clearBefore;
            }
            if (extractZipCheckbox) {
                extractZipCheckbox.checked = preset.options.extractZip;
            }
            if (customPrefixInput) {
                customPrefixInput.value = preset.options.customPrefix || '';
            }
        }

        // Update UI
        this.deploymentManager.updateFileListSelection();
        this.deploymentManager.updateSelectionCount();
    }

    /**
     * Delete a preset
     */
    deletePreset(name) {
        if (!confirm(`Are you sure you want to delete the preset "${name}"?`)) {
            return;
        }

        delete this.presets[name];
        this.savePresetsToStorage();

        // Refresh list
        this.renderPresetList();

        window.toast.success(`Deleted preset: ${name}`);
    }

    /**
     * Check if game is a hash game
     */
    isHashGame(name) {
        const hashGames = ['crash', 'dice', 'aviator', 'mines', 'plinko', 'tower', 'wheel', 'keno'];
        return hashGames.some(game => name.includes(game));
    }

    /**
     * Check if game is a bingo game
     */
    isBingoGame(name) {
        const bingoGames = ['bingo', 'arcade', 'bonus', 'caribbean', 'calaveras', 'festive', 'irish', 'safari'];
        return bingoGames.some(game => name.includes(game));
    }

    /**
     * Check if game is an arcade game
     */
    isArcadeGame(name) {
        const arcadeGames = ['multiboomer', 'forest', 'tea', 'party'];
        return arcadeGames.some(game => name.includes(game));
    }

    /**
     * Load presets from localStorage
     */
    loadPresets() {
        try {
            const stored = localStorage.getItem('wds-presets');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error loading presets:', error);
            return {};
        }
    }

    /**
     * Save presets to localStorage
     */
    savePresetsToStorage() {
        try {
            localStorage.setItem('wds-presets', JSON.stringify(this.presets));
        } catch (error) {
            console.error('Error saving presets:', error);
            window.toast.error('Failed to save preset');
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in main app
window.PresetManager = PresetManager;
