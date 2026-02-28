// ─── Toast Notification System ──────────────────────────────
// Lightweight stacking notifications for achievements and alerts

export class Toast {
    static container = null;

    static init() {
        if (Toast.container) return;
        Toast.container = document.createElement('div');
        Toast.container.id = 'toast-container';
        document.body.appendChild(Toast.container);
    }

    /**
     * Show a toast notification.
     * @param {Object} options
     * @param {string} options.icon - Emoji or short text
     * @param {string} options.title - Achievement name or notification title
     * @param {string} options.subtitle - Description
     * @param {string} options.color - Accent color (hex)
     * @param {number} options.duration - Auto-dismiss in ms (default 4000)
     */
    static show({ icon = '🏆', title = '', subtitle = '', color = '#0ea5e9', duration = 4000 } = {}) {
        Toast.init();

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.setProperty('--toast-color', color);
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-body">
                <div class="toast-label">ACHIEVEMENT UNLOCKED</div>
                <div class="toast-title">${title}</div>
                <div class="toast-subtitle">${subtitle}</div>
            </div>
        `;

        // Insert at top
        Toast.container.prepend(toast);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-enter');
        });

        // Auto-dismiss
        setTimeout(() => {
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        }, duration);

        // Click to dismiss
        toast.addEventListener('click', () => {
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        });
    }

    /**
     * Show achievement toast with specific styling.
     */
    static showAchievement(def) {
        Toast.show({
            icon: def.icon,
            title: def.name,
            subtitle: def.desc,
            color: def.color,
            duration: 5000,
        });
    }

    /**
     * Clear all active toasts.
     */
    static clearAll() {
        if (!Toast.container) return;
        Toast.container.innerHTML = '';
    }
}
