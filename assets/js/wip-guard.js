document.addEventListener('DOMContentLoaded', () => {
    const wipRoot =
        document.querySelector('[data-status="wip"].pin-enabled') ||
        document.querySelector('.pin-enabled.wip') ||
        document.querySelector('[data-status="wip"]');

    if (!wipRoot) {
        return;
    }

    const main = document.querySelector('main.page');
    if (!main) {
        return;
    }

    const label =
        wipRoot.dataset.toolLabel ||
        document.querySelector('h1, h2')?.textContent?.trim() ||
        'This app';

    main.innerHTML = `
        <section class="workspace container">
            <article class="panel">
                <header class="panel-heading">
                    <h2>Under development</h2>
                    <p>${label} is still being built. Please check back soon.</p>
                </header>
            </article>
        </section>
    `;
});

