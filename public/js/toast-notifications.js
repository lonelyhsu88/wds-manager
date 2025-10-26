// Toast Notification System for WDS-Manager

class ToastManager {
    constructor() {
        this.queue = [];
        this.maxToasts = 5;
        this.container = null;
        this.init();
    }

    init() {
        // Create toast container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in milliseconds (default: 4000)
     */
    show(message, type = 'info', duration = 4000) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Get icon based on type
        const icon = this.getIcon(type);

        // Set toast content
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="bi ${icon}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Close">
                <i class="bi bi-x"></i>
            </button>
        `;

        // Add to queue
        this.queue.push(toast);

        // If too many toasts, remove oldest
        if (this.queue.length > this.maxToasts) {
            const oldestToast = this.queue.shift();
            this.removeToast(oldestToast, true);
        }

        // Add to DOM with animation
        this.container.appendChild(toast);

        // Trigger reflow for animation
        toast.offsetHeight;

        // Add show class for slide-in animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Setup close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });

        // Auto dismiss after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }

        return toast;
    }

    /**
     * Remove a toast with animation
     * @param {HTMLElement} toast - The toast element to remove
     * @param {boolean} immediate - Skip animation if true
     */
    removeToast(toast, immediate = false) {
        if (!toast || !toast.parentElement) return;

        if (immediate) {
            toast.remove();
            const index = this.queue.indexOf(toast);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
            return;
        }

        // Add hiding class for slide-out animation
        toast.classList.add('hiding');

        // Remove from DOM after animation
        setTimeout(() => {
            toast.remove();
            const index = this.queue.indexOf(toast);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
        }, 300);
    }

    /**
     * Get Bootstrap icon based on toast type
     */
    getIcon(type) {
        const icons = {
            success: 'bi-check-circle-fill',
            error: 'bi-x-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            info: 'bi-info-circle-fill'
        };
        return icons[type] || icons.info;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show success toast
     */
    success(message, duration = 4000) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error toast
     */
    error(message, duration = 6000) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning toast
     */
    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info toast
     */
    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        this.queue.forEach(toast => this.removeToast(toast, true));
        this.queue = [];
    }
}

// Create global instance
window.toast = new ToastManager();
