(() => {
    const PIN_STORAGE_KEY = 'bradlotPinnedApps';
    const PIN_MEMORY_KEY = '__bradlotPinnedMemory';

    class Navbar extends HTMLElement {
        constructor() {
            super();
            this.refreshPins = this.refreshPins.bind(this);
            this.handlePinEvent = this.handlePinEvent.bind(this);
            this.lastAction = null;
            this.lastToolId = null;
        }

        connectedCallback() {
            this.render();
            window.addEventListener('bradlot:pins-updated', this.handlePinEvent);
            window.addEventListener('storage', this.refreshPins);
        }

        disconnectedCallback() {
            window.removeEventListener('bradlot:pins-updated', this.handlePinEvent);
            window.removeEventListener('storage', this.refreshPins);
        }

        handlePinEvent(event) {
            const detail = event.detail || {};
            if (detail.action === 'remove' && detail.tool?.id) {
                const target = this.querySelector(`.nav-link[data-tool-id="${detail.tool.id}"]`);
                if (target) {
                    target.classList.add('nav-link-pop-out');
                    target.addEventListener('animationend', () => this.render(), { once: true });
                    return;
                }
            }

            this.lastAction = detail.action || null;
            this.lastToolId = detail.tool?.id || null;
            this.render();
        }

        getPinnedApps() {
            try {
                const stored = localStorage.getItem(PIN_STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        window[PIN_MEMORY_KEY] = parsed;
                        return parsed.filter(pin => pin && pin.href && pin.label);
                    }
                }
            } catch (error) {
                console.error('Unable to load pinned apps', error);
            }

            const fallback = window[PIN_MEMORY_KEY];
            if (Array.isArray(fallback)) {
                return fallback.filter(pin => pin && pin.href && pin.label);
            }

            return [];
        }

        refreshPins() {
            this.lastAction = null;
            this.lastToolId = null;
            this.render();
        }

        render() {
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            const isHomeActive = currentPage === 'index.html';
            const pins = this.getPinnedApps();
            const pinnedMarkup = pins.length
                ? pins.map(pin => {
                    const isActive = pin.href === currentPage;
                    const aria = isActive ? 'aria-current="page"' : '';
                    const activeClass = isActive ? 'active' : '';
                    return `
                    <a class="nav-link ${activeClass}" data-tool-id="${pin.id}" href="${pin.href}" title="${pin.label}" ${aria}>
                        ${pin.label}
                    </a>
                `;
                }).join('')
                : '<span class="nav-empty">Pin favorite apps from the home page.</span>';

            this.innerHTML = `
                <header class="site-nav">
                    <div class="container nav-shell">
                        <a class="nav-link nav-home-link ${isHomeActive ? 'active' : ''}" href="index.html" ${isHomeActive ? 'aria-current="page"' : ''}>
                            Home
                        </a>
                        <nav class="nav-links" aria-label="Pinned apps">
                            ${pinnedMarkup}
                        </nav>
                    </div>
                </header>
            `;

            this.applyPendingAnimation();
        }

        applyPendingAnimation() {
            if (this.lastAction === 'add' && this.lastToolId) {
                const link = this.querySelector(`.nav-link[data-tool-id="${this.lastToolId}"]`);
                if (link) {
                    link.classList.add('nav-link-pop-in');
                    link.addEventListener('animationend', () => link.classList.remove('nav-link-pop-in'), { once: true });
                }
            }

            this.lastAction = null;
            this.lastToolId = null;
        }
    }

    customElements.define('nav-bar', Navbar);
})();
