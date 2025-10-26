// Search and Filter System for WDS-Manager

class SearchFilter {
    constructor(deploymentManager) {
        this.deploymentManager = deploymentManager;
        this.searchTerm = '';
        this.activeCategory = 'all'; // 'all', 'hash', 'bingo', 'arcade', 'resources', 'dashboard', 'event', 'jump-page', 'game-demo', 'ex-mgmt'
        this.favorites = this.loadFavorites();
        this.showFavoritesOnly = false;
        this.init();
    }

    init() {
        this.initSearchBox();
        this.setupCategoryFilters();
        this.setupFavoritesToggle();
        this.setupKeyboardShortcuts();
    }

    /**
     * Initialize search input box
     */
    initSearchBox() {
        const searchBox = document.getElementById('global-search-input');
        if (!searchBox) return;

        // Real-time search as user types
        let debounceTimer;
        searchBox.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.searchTerm = e.target.value.trim().toLowerCase();
                this.applyFilters();
            }, 300); // Debounce for 300ms
        });

        // Clear button
        const clearBtn = document.getElementById('clear-search-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchBox.value = '';
                this.searchTerm = '';
                this.applyFilters();
                searchBox.focus();
            });
        }
    }

    /**
     * Setup category filter buttons
     */
    setupCategoryFilters() {
        const filterButtons = document.querySelectorAll('.category-filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.setActiveCategory(category);
            });
        });
    }

    /**
     * Set active category filter
     */
    setActiveCategory(category) {
        this.activeCategory = category;

        // Update button states
        document.querySelectorAll('.category-filter-btn').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.applyFilters();
    }

    /**
     * Setup favorites toggle button
     */
    setupFavoritesToggle() {
        const favBtn = document.getElementById('favorites-toggle-btn');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                this.showFavoritesOnly = !this.showFavoritesOnly;
                favBtn.classList.toggle('active', this.showFavoritesOnly);
                this.applyFilters();

                if (this.showFavoritesOnly && this.favorites.size === 0) {
                    window.toast.info('No favorites yet. Click the star icon on games to add favorites.');
                }
            });
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const searchBox = document.getElementById('global-search-input');
                if (searchBox) {
                    searchBox.focus();
                    searchBox.select();
                }
            }

            // Escape to clear search
            if (e.key === 'Escape') {
                const searchBox = document.getElementById('global-search-input');
                if (searchBox && document.activeElement === searchBox) {
                    searchBox.value = '';
                    this.searchTerm = '';
                    this.applyFilters();
                    searchBox.blur();
                }
            }
        });
    }

    /**
     * Apply all active filters
     */
    applyFilters() {
        const categoryView = document.getElementById('category-view');
        const accordion = document.getElementById('categoryAccordion');

        if (!accordion) return;

        let visibleCount = 0;
        let totalMatchCount = 0;

        // Get all accordion items (categories)
        const accordionItems = accordion.querySelectorAll('.accordion-item');

        accordionItems.forEach(item => {
            const categoryButton = item.querySelector('.accordion-button');
            const categoryText = categoryButton.textContent.trim();
            const categoryKey = this.getCategoryKeyFromText(categoryText);

            // Check if category matches filter
            const categoryMatches = this.activeCategory === 'all' || this.activeCategory === categoryKey;

            if (!categoryMatches) {
                item.style.display = 'none';
                return;
            }

            // Get all game items in this category
            const gameItems = item.querySelectorAll('.file-item-category');
            let categoryVisibleCount = 0;

            gameItems.forEach(gameItem => {
                const gameName = gameItem.querySelector('h6')?.textContent.trim() || '';
                const gameKey = gameItem.dataset.key;

                // Apply search filter
                const searchMatches = this.searchMatches(gameName);

                // Apply favorites filter
                const favoriteMatches = !this.showFavoritesOnly || this.favorites.has(gameKey);

                // Show/hide based on all filters
                if (searchMatches && favoriteMatches) {
                    gameItem.style.display = '';
                    categoryVisibleCount++;

                    // Highlight search matches
                    if (this.searchTerm) {
                        this.highlightMatches(gameItem, this.searchTerm);
                    } else {
                        this.clearHighlights(gameItem);
                    }
                } else {
                    gameItem.style.display = 'none';
                }
            });

            // Update category badge with visible count
            const badge = categoryButton.querySelector('.badge');
            if (badge && categoryVisibleCount > 0) {
                badge.textContent = categoryVisibleCount;
            }

            // Show/hide category based on whether it has visible items
            if (categoryVisibleCount > 0) {
                item.style.display = '';
                visibleCount++;
                totalMatchCount += categoryVisibleCount;
            } else {
                item.style.display = 'none';
            }
        });

        // Update search results count
        this.updateSearchResultsCount(totalMatchCount);

        // Show empty state if no results
        if (visibleCount === 0) {
            this.showEmptyState();
        } else {
            this.hideEmptyState();
        }
    }

    /**
     * Check if search term matches game name (fuzzy matching)
     */
    searchMatches(gameName) {
        if (!this.searchTerm) return true;

        const name = gameName.toLowerCase();
        const term = this.searchTerm;

        // Exact match
        if (name.includes(term)) return true;

        // Fuzzy match: check if all characters in search term appear in order
        let termIndex = 0;
        for (let i = 0; i < name.length && termIndex < term.length; i++) {
            if (name[i] === term[termIndex]) {
                termIndex++;
            }
        }
        return termIndex === term.length;
    }

    /**
     * Highlight matching text in game items
     */
    highlightMatches(gameItem, term) {
        const h6 = gameItem.querySelector('h6');
        if (!h6) return;

        const originalText = h6.textContent;
        const lowerText = originalText.toLowerCase();
        const lowerTerm = term.toLowerCase();

        // Find match position
        const matchIndex = lowerText.indexOf(lowerTerm);
        if (matchIndex === -1) return;

        // Create highlighted HTML
        const beforeMatch = originalText.substring(0, matchIndex);
        const match = originalText.substring(matchIndex, matchIndex + term.length);
        const afterMatch = originalText.substring(matchIndex + term.length);

        h6.innerHTML = `${this.escapeHtml(beforeMatch)}<mark class="search-highlight">${this.escapeHtml(match)}</mark>${this.escapeHtml(afterMatch)}`;
    }

    /**
     * Clear highlights from game items
     */
    clearHighlights(gameItem) {
        const h6 = gameItem.querySelector('h6');
        if (!h6) return;

        const mark = h6.querySelector('mark.search-highlight');
        if (mark) {
            h6.textContent = h6.textContent; // Reset to plain text
        }
    }

    /**
     * Update search results count display
     */
    updateSearchResultsCount(count) {
        const countElement = document.getElementById('search-results-count');
        if (!countElement) return;

        if (this.searchTerm || this.showFavoritesOnly || this.activeCategory !== 'all') {
            countElement.style.display = 'inline';
            countElement.textContent = `${count} result${count !== 1 ? 's' : ''}`;
        } else {
            countElement.style.display = 'none';
        }
    }

    /**
     * Show empty state when no results
     */
    showEmptyState() {
        let emptyState = document.getElementById('search-empty-state');
        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.id = 'search-empty-state';
            emptyState.className = 'empty-state';
            document.getElementById('category-view').appendChild(emptyState);
        }

        let message = 'No games found';
        if (this.searchTerm) {
            message = `No games found matching "${this.searchTerm}"`;
        } else if (this.showFavoritesOnly) {
            message = 'No favorite games. Click the star icon to add favorites.';
        }

        emptyState.innerHTML = `
            <i class="bi bi-search"></i>
            <p>${this.escapeHtml(message)}</p>
        `;
        emptyState.style.display = 'block';
    }

    /**
     * Hide empty state
     */
    hideEmptyState() {
        const emptyState = document.getElementById('search-empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    /**
     * Get category key from category text
     */
    getCategoryKeyFromText(text) {
        if (text.includes('Hash')) return 'hash';
        if (text.includes('Bingo')) return 'bingo';
        if (text.includes('Arcade')) return 'arcade';
        if (text.includes('Resources')) return 'resources';
        if (text.includes('Dashboard')) return 'dashboard';
        if (text.includes('Event')) return 'event';
        if (text.includes('Jump Page')) return 'jump-page';
        if (text.includes('Game Demo')) return 'game-demo';
        if (text.includes('External Management')) return 'ex-mgmt';
        return 'other';
    }

    /**
     * Toggle favorite status for a game
     */
    toggleFavorite(gameKey) {
        if (this.favorites.has(gameKey)) {
            this.favorites.delete(gameKey);
            window.toast.info('Removed from favorites');
        } else {
            this.favorites.add(gameKey);
            window.toast.success('Added to favorites');
        }
        this.saveFavorites();
        this.updateFavoriteIcons();
    }

    /**
     * Update favorite icons in UI
     */
    updateFavoriteIcons() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            const gameKey = btn.dataset.gameKey;
            const isFavorite = this.favorites.has(gameKey);
            const icon = btn.querySelector('i');

            if (isFavorite) {
                icon.classList.remove('bi-star');
                icon.classList.add('bi-star-fill');
                btn.classList.add('active');
            } else {
                icon.classList.remove('bi-star-fill');
                icon.classList.add('bi-star');
                btn.classList.remove('active');
            }
        });
    }

    /**
     * Load favorites from localStorage
     */
    loadFavorites() {
        try {
            const stored = localStorage.getItem('wds-favorites');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch (error) {
            console.error('Error loading favorites:', error);
            return new Set();
        }
    }

    /**
     * Save favorites to localStorage
     */
    saveFavorites() {
        try {
            localStorage.setItem('wds-favorites', JSON.stringify(Array.from(this.favorites)));
        } catch (error) {
            console.error('Error saving favorites:', error);
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
window.SearchFilter = SearchFilter;
