(() => {
    const PIN_STORAGE_KEY = 'bradlotPinnedApps';
    const PIN_MEMORY_KEY = '__bradlotPinnedMemory';

    const ready = callback => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    };

    const getPinnedApps = () => {
        try {
            const stored = localStorage.getItem(PIN_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    window[PIN_MEMORY_KEY] = parsed;
                    return parsed;
                }
            }
        } catch (error) {
            console.error('Unable to parse pinned apps', error);
        }

        const fallback = window[PIN_MEMORY_KEY];
        return Array.isArray(fallback) ? fallback : [];
    };

    const savePinnedApps = pins => {
        try {
            localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
            window[PIN_MEMORY_KEY] = pins;
        } catch (error) {
            console.warn('Unable to persist pins, using memory storage instead.', error);
            window[PIN_MEMORY_KEY] = pins;
        }
    };

    const emitPinUpdate = (detail = {}) => {
        window.dispatchEvent(new CustomEvent('bradlot:pins-updated', { detail }));
    };

    const getToolData = card => ({
        id: card.dataset.toolId,
        label: card.dataset.toolLabel || card.querySelector('h2, h1')?.textContent?.trim() || 'App',
        href: card.dataset.toolHref
    });

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const updateButtonState = (button, tool, isPinned) => {
        button.setAttribute('aria-pressed', String(isPinned));
        const statusVerb = isPinned ? 'Unpin' : 'Pin';
        const statusSuffix = isPinned ? 'from' : 'to';
        const label = `${statusVerb} ${tool.label} ${statusSuffix} navbar`;
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
    };

    const setupPinning = () => {
        const cards = document.querySelectorAll('.tool-card, .pin-enabled');
        if (!cards.length) return;

        const pruneMissingPins = () => {
            const pins = getPinnedApps();
            if (!pins.length) return;
            const validIds = new Set();
            const validHrefs = new Set();
            cards.forEach(card => {
                const tool = getToolData(card);
                if (tool.id) validIds.add(tool.id);
                if (tool.href) validHrefs.add(tool.href);
            });
            const filtered = pins.filter(pin => {
                const matchesId = pin.id && validIds.has(pin.id);
                const matchesHref = pin.href && validHrefs.has(pin.href);
                return matchesId || matchesHref;
            });
            if (filtered.length !== pins.length) {
                savePinnedApps(filtered);
                emitPinUpdate({ action: 'refresh' });
            }
        };

        const refreshButtons = () => {
            const pins = getPinnedApps();
            cards.forEach(card => {
                const button = card.querySelector('.pin-toggle');
                if (!button) return;
                const tool = getToolData(card);
                const isPinned = pins.some(pin => pin.id === tool.id || pin.href === tool.href);
                updateButtonState(button, tool, isPinned);
            });
        };

        const handleToggle = event => {
            try {
                const button = event.currentTarget;
                const card = button.closest('.tool-card') || button.closest('.pin-enabled');
                if (!card) return;
                const tool = getToolData(card);
                let pins = getPinnedApps();
                const alreadyPinned = pins.some(pin => pin.id === tool.id || pin.href === tool.href);

                if (alreadyPinned) {
                    pins = pins.filter(pin => pin.id !== tool.id && pin.href !== tool.href);
                    savePinnedApps(pins);
                    refreshButtons();
                    emitPinUpdate({ action: 'remove', tool });
                } else {
                    pins = [...pins, tool];
                    savePinnedApps(pins);
                    refreshButtons();
                    emitPinUpdate({ action: 'add', tool });
                }
            } catch (error) {
                console.error('Unable to toggle pin', error);
            }
        };

        cards.forEach(card => {
            const button = card.querySelector('.pin-toggle');
            if (!button) return;
            button.addEventListener('click', handleToggle);
        });

        window.addEventListener('storage', refreshButtons);
        pruneMissingPins();
        refreshButtons();
    };

    const setupHomeCarousel = () => {
        const grid = document.querySelector('.tool-grid');
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll('.tool-card'));
        const delayStep = 110;
        cards.forEach((card, index) => {
            card.style.setProperty('--card-delay', String(index * delayStep));
            card.style.setProperty('--card-layer', String(50 + cards.length - index));
        });

        const handleWheel = event => {
            const dominant = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
            if (!dominant) return;
            event.preventDefault();
            const max = Math.max(grid.scrollWidth - grid.clientWidth, 0);
            grid.scrollLeft = clamp(grid.scrollLeft + dominant, 0, max);
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        grid.classList.add('ready');
    };

    ready(() => {
        setupPinning();
        setupHomeCarousel();
    });
})();
