(() => {
    const ready = callback => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    };

    ready(() => {
        const buttons = document.querySelectorAll('[data-confirm-button]');
        buttons.forEach(button => {
            const defaultLabel = button.getAttribute('data-confirm-default') || button.textContent.trim();
            const confirmLabel = button.getAttribute('data-confirm-label') || 'Confirm';
            const timeout = Number(button.getAttribute('data-confirm-timeout')) || 30000;
            let timerId = null;
            let docHandler = null;

            const clearWatchers = () => {
                if (timerId) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                if (docHandler) {
                    document.removeEventListener('click', docHandler);
                    docHandler = null;
                }
            };

            const resetVisual = () => {
                button.dataset.confirming = '';
                button.classList.remove('confirming');
                button.textContent = defaultLabel;
            };

            const resetState = () => {
                if (button.dataset.confirming !== 'true') return;
                resetVisual();
                clearWatchers();
            };

            const startConfirm = () => {
                button.dataset.confirming = 'true';
                button.classList.add('confirming');
                button.textContent = confirmLabel;
                timerId = window.setTimeout(resetState, timeout);
                docHandler = event => {
                    if (event.target === button) return;
                    if (!button.contains(event.target)) {
                        resetState();
                    }
                };
                document.addEventListener('click', docHandler);
            };

            button.addEventListener('click', event => {
                if (button.disabled) return;
                if (button.dataset.confirming === 'true') {
                    clearWatchers();
                    queueMicrotask(resetVisual);
                    return;
                }
                event.preventDefault();
                event.stopImmediatePropagation();
                startConfirm();
            }, true);
        });
    });
})();
