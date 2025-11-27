class SiteFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <footer class="site-footer">
                <div class="container footer-shell">
                    <a class="footer-link" href="https://github.com/bradlot/bradlot.github.io" target="_blank" rel="noopener noreferrer" aria-label="Open GitHub repository">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M8 .198a8 8 0 0 0-2.53 15.597c.4.074.546-.174.546-.386 0-.19-.007-.693-.01-1.36-2.225.483-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.727-.497.055-.487.055-.487.804.057 1.227.826 1.227.826.715 1.225 1.874.871 2.33.666.073-.518.28-.872.508-1.073-1.777-.202-3.644-.888-3.644-3.955 0-.873.312-1.588.824-2.148-.083-.203-.357-1.018.078-2.122 0 0 .67-.215 2.195.82a7.54 7.54 0 0 1 4 0c1.523-1.035 2.192-.82 2.192-.82.437 1.104.162 1.919.08 2.122.514.56.823 1.275.823 2.148 0 3.075-1.87 3.75-3.652 3.948.288.247.543.735.543 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.145.463.55.384A8 8 0 0 0 8.001.198Z"></path>
                        </svg>
                    </a>
                </div>
            </footer>
        `;
    }
}

customElements.define('site-footer', SiteFooter);
