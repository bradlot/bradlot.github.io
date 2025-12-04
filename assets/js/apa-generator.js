const DEFAULT_STATUS = 'Waiting for input.';
const PROXY_PREFIX = 'https://r.jina.ai/';
const HISTORY_STORAGE_KEY = 'apaCitationHistory';
let siteMappings = {};

const toHostKey = input => {
    if (input === undefined || input === null) return '';
    let value = String(input).trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
        try {
            const { hostname } = new URL(value);
            value = hostname || value;
        } catch (error) {
            value = value.replace(/^https?:\/\//i, '');
        }
    }
    return value.replace(/^www\./i, '').toLowerCase();
};

const normalizeLabelValue = value => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
        const best = value.label || value.name || value.title || value.value || value.display;
        return best ? String(best).trim() : '';
    }
    return String(value).trim();
};

const extractSiteMappingEntries = raw => {
    const pairs = [];
    if (!raw) return pairs;
    const addPair = (host, label) => {
        if (!host || !label) return;
        if (!pairs.some(([existing]) => existing === host)) {
            pairs.push([host, label]);
        }
    };

    if (Array.isArray(raw)) {
        raw.forEach(entry => {
            if (!entry) return;
            if (Array.isArray(entry)) {
                addPair(toHostKey(entry[0]), normalizeLabelValue(entry[1]));
                return;
            }
            if (typeof entry === 'object') {
                const host = entry.host || entry.hostname || entry.domain || entry.url || entry.site || entry.key;
                const label = entry.label || entry.name || entry.title || entry.display || entry.value;
                addPair(toHostKey(host), normalizeLabelValue(label));
            }
        });
        return pairs;
    }

    if (typeof raw === 'object') {
        Object.entries(raw).forEach(([key, value]) => {
            addPair(toHostKey(key), normalizeLabelValue(value));
        });
    }
    return pairs;
};

const siteMappingsReady = fetch('./assets/data/site-mappings.json')
    .then(response => response.json())
    .then(data => {
        const entries = extractSiteMappingEntries(data);
        siteMappings = Object.fromEntries(entries);
    })
    .catch(() => {
        siteMappings = {};
    });
const MONTHS = [
    { value: '', label: 'Month' },
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
];

document.addEventListener('DOMContentLoaded', () => {
    const lookupInput = document.getElementById('lookupInput');
    const lookupButton = document.getElementById('lookupButton');
    const clearButton = document.getElementById('clearLookupButton');
    const pasteButton = document.getElementById('pasteLookupButton');
    const statusEl = document.getElementById('lookupStatus');
    const referenceOutput = document.getElementById('referenceOutput');
    const inTextOutput = document.getElementById('inTextOutput');
    const copyButtons = document.querySelectorAll('[data-copy-target]');
    const manualPanel = document.getElementById('manualPanel');
    const manualReason = document.getElementById('manualReason');
    const openManualButton = document.getElementById('openManualButton');
    const manualBackButton = document.getElementById('manualBackButton');
    const manualForm = document.getElementById('manualForm');
    const manualTitleInput = document.getElementById('manualTitle');
    const manualWebsiteInput = document.getElementById('manualWebsite');
    const manualPublisherInput = document.getElementById('manualPublisher');
    const manualUrlInput = document.getElementById('manualUrl');
    const manualShowUrlToggle = document.getElementById('manualShowUrl');
    const manualPublishedDayInput = document.getElementById('manualPublishedDay');
    const manualPublishedMonthSelect = document.getElementById('manualPublishedMonth');
    const manualPublishedYearInput = document.getElementById('manualPublishedYear');
    const manualAccessedDayInput = document.getElementById('manualAccessedDay');
    const manualAccessedMonthSelect = document.getElementById('manualAccessedMonth');
    const manualAccessedYearInput = document.getElementById('manualAccessedYear');
    const fillAccessedTodayButton = document.getElementById('fillAccessedToday');
    const manualResetButton = document.getElementById('manualResetButton');
    const contributorList = document.getElementById('contributorList');
    const addContributorButton = document.getElementById('addContributorButton');
    const outputPanel = document.getElementById('outputPanel');
    const startOverButton = document.getElementById('startOverButton');
    const outputBackButton = document.getElementById('outputBackButton');
    const openHistoryButton = document.getElementById('openHistoryButton');
    const historyList = document.getElementById('referenceHistory');
    const deleteSelectedButton = document.getElementById('deleteSelectedButton');
    const clearHistoryButton = document.getElementById('clearHistoryButton');

    const defaultLookupLabel = lookupButton.textContent;
    const monthSelects = [manualPublishedMonthSelect, manualAccessedMonthSelect];
    const suffixCandidates = ['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V'];
    const stepPanels = {
        builder: document.querySelector('[data-step="builder"]'),
        manual: manualPanel,
        output: outputPanel
    };
    let historyEntries = [];

    const copyValue = async (value, successMessage = 'Copied to clipboard.') => {
        if (!value) {
            setStatus('Nothing to copy yet — generate a citation first.', 'muted');
            return false;
        }
        try {
            await navigator.clipboard.writeText(value);
            setStatus(successMessage, 'success');
            return true;
        } catch (error) {
            console.error(error);
            setStatus('Clipboard access was blocked. Select the text manually.', 'error');
            return false;
        }
    };

    const setActiveStep = step => {
        Object.entries(stepPanels).forEach(([key, panel]) => {
            if (!panel) return;
            panel.classList.toggle('hidden', key !== step);
        });
        if (step === 'builder') {
            manualReason.textContent = 'Fill in any missing APA fields below.';
            lookupInput.focus();
        } else if (step === 'manual') {
            manualTitleInput.focus();
        }
        if (step === 'output') {
            referenceOutput.focus();
        }
    };

    const updateMonthSelectState = select => {
        if (!select) return;
        if (select.value) select.classList.add('filled');
        else select.classList.remove('filled');
    };

    const populateMonthSelect = select => {
        if (!select) return;
        select.innerHTML = MONTHS.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
        updateMonthSelectState(select);
        select.addEventListener('change', () => updateMonthSelectState(select));
    };

    monthSelects.forEach(populateMonthSelect);

    const loadHistory = () => {
        try {
            const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
            historyEntries = stored ? JSON.parse(stored) : [];
        } catch (error) {
            historyEntries = [];
        }
        historyEntries = historyEntries.map(entry => ({
            ...entry,
            sortKey: entry.sortKey || buildSortKeyFromData(entry.source, entry.reference)
        }));
        sortHistoryEntries();
    };

    const persistHistory = () => {
        try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
        } catch (error) {
            console.error('Unable to persist history', error);
        }
    };

    const sortHistoryEntries = () => {
        historyEntries.sort((a, b) => {
            const keyA = a.sortKey || '';
            const keyB = b.sortKey || '';
            return keyA.localeCompare(keyB, undefined, { sensitivity: 'base' });
        });
    };

    const updateHistoryControls = () => {
        if (!historyEntries.length) {
            if (deleteSelectedButton) deleteSelectedButton.disabled = true;
            if (clearHistoryButton) clearHistoryButton.disabled = true;
            return;
        }
        if (clearHistoryButton) clearHistoryButton.disabled = false;
        if (deleteSelectedButton) {
            const hasSelection = Boolean(historyList?.querySelector('input[data-history-select]:checked'));
            deleteSelectedButton.disabled = !hasSelection;
        }
    };

    const renderHistory = (highlightId = null) => {
        if (!historyList) return;
        historyList.innerHTML = '';
        if (!historyEntries.length) {
            historyList.classList.add('empty');
            const emptyState = document.createElement('li');
            emptyState.className = 'history-empty';
            emptyState.textContent = 'No references stored yet.';
            historyList.appendChild(emptyState);
            updateHistoryControls();
            return;
        }
        historyList.classList.remove('empty');
        historyEntries.forEach((entry, index) => {
            const item = document.createElement('li');
            item.className = 'history-item';
            item.dataset.historyId = entry.id;

            const selector = document.createElement('label');
            selector.className = 'history-select';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.historySelect = 'true';
            checkbox.value = String(index);
            selector.appendChild(checkbox);

            const body = document.createElement('div');
            body.className = 'history-body';

            const referenceParagraph = document.createElement('p');
            referenceParagraph.className = 'history-reference';
            if (entry.display) {
                referenceParagraph.innerHTML = entry.display;
            } else {
                referenceParagraph.textContent = entry.reference;
            }

            const inTextParagraph = document.createElement('p');
            inTextParagraph.className = 'history-intext';
            const label = document.createElement('strong');
            label.textContent = 'In-text:';
            inTextParagraph.appendChild(label);
            inTextParagraph.append(` ${entry.inText}`);

            const metaParagraph = document.createElement('div');
            metaParagraph.className = 'history-meta';
            const timestamp = new Date(entry.createdAt || Date.now());
            const dateChip = document.createElement('span');
            dateChip.className = 'viewer-file-chip history-date-chip';
            dateChip.textContent = timestamp.toLocaleString();
            metaParagraph.append(dateChip);

            const actionBar = document.createElement('div');
            actionBar.className = 'history-actions';

            const copyReferenceButton = document.createElement('button');
            copyReferenceButton.type = 'button';
            copyReferenceButton.className = 'ghost small-button';
            copyReferenceButton.dataset.historyAction = 'copy-reference';
            copyReferenceButton.dataset.index = String(index);
            copyReferenceButton.textContent = 'Copy reference';

            const copyInTextButton = document.createElement('button');
            copyInTextButton.type = 'button';
            copyInTextButton.className = 'ghost small-button';
            copyInTextButton.dataset.historyAction = 'copy-intext';
            copyInTextButton.dataset.index = String(index);
            copyInTextButton.textContent = 'Copy in-text';

            actionBar.append(copyReferenceButton, copyInTextButton);
            body.append(referenceParagraph, inTextParagraph, metaParagraph, actionBar);
            item.append(selector, body);
            historyList.appendChild(item);

            if (highlightId && entry.id === highlightId) {
                item.classList.add('highlight');
                setTimeout(() => item.classList.remove('highlight'), 1200);
            }
        });
        updateHistoryControls();
    };

    const addReferenceToHistory = entry => {
        historyEntries.push({
            ...entry,
            sortKey: entry.sortKey || buildSortKeyFromData(entry.source, entry.reference),
            createdAt: entry.createdAt || new Date().toISOString(),
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        });
        const highlightId = historyEntries[historyEntries.length - 1].id;
        sortHistoryEntries();
        persistHistory();
        renderHistory(highlightId);
    };

    const deleteHistoryEntry = index => {
        historyEntries.splice(index, 1);
        persistHistory();
        renderHistory();
    };

    const clearHistory = () => {
        historyEntries = [];
        persistHistory();
        renderHistory();
    };

    const createContributorRow = (values = {}) => {
        const row = document.createElement('div');
        row.className = 'contributor-row';
        row.innerHTML = `
            <input type="text" data-field="first" placeholder="First" value="${values.first || ''}">
            <input type="text" data-field="middle" placeholder="Middle" value="${values.middle || ''}">
            <input type="text" data-field="last" placeholder="Last" value="${values.last || ''}">
            <input type="text" data-field="suffix" placeholder="Suffix" value="${values.suffix || ''}">
            <button type="button" class="remove-contributor" aria-label="Remove contributor">✕</button>
        `;
        const removeButton = row.querySelector('.remove-contributor');
        removeButton.addEventListener('click', () => {
            if (contributorList.children.length > 1) {
                row.remove();
            } else {
                row.querySelectorAll('input').forEach(input => {
                    input.value = '';
                });
            }
        });
        return row;
    };

    const ensureContributorRow = () => {
        if (!contributorList.children.length) {
            contributorList.appendChild(createContributorRow());
        }
    };

    const setDateInputs = (prefix, parts) => {
        if (!parts) return;
        const dayInput = prefix === 'Published' ? manualPublishedDayInput : manualAccessedDayInput;
        const monthSelect = prefix === 'Published' ? manualPublishedMonthSelect : manualAccessedMonthSelect;
        const yearInput = prefix === 'Published' ? manualPublishedYearInput : manualAccessedYearInput;
        if (parts.day !== undefined) dayInput.value = parts.day || '';
        if (parts.month !== undefined) monthSelect.value = parts.month ? String(parts.month) : '';
        if (parts.year !== undefined) yearInput.value = parts.year || '';
        updateMonthSelectState(monthSelect);
    };

    const resetManualForm = () => {
        if (!manualForm) return;
        manualForm.reset();
        contributorList.innerHTML = '';
        contributorList.appendChild(createContributorRow());
        manualShowUrlToggle.checked = true;
        monthSelects.forEach(select => {
            if (select) select.value = '';
        });
        manualReason.textContent = 'Fill in any missing APA fields below.';
        manualForm.dataset.workType = 'web';
    };

    const applyManualDefaults = defaults => {
        if (!defaults) return;
        manualForm.dataset.workType = defaults.workType || manualForm.dataset.workType || 'web';
        if (defaults.title !== undefined) manualTitleInput.value = defaults.title;
        if (defaults.website !== undefined) manualWebsiteInput.value = defaults.website;
        if (defaults.publisher !== undefined) manualPublisherInput.value = defaults.publisher;
        if (defaults.url !== undefined) manualUrlInput.value = defaults.url;
        if (defaults.showUrl !== undefined) manualShowUrlToggle.checked = Boolean(defaults.showUrl);
        if (defaults.published) setDateInputs('Published', defaults.published);
        if (defaults.accessed) setDateInputs('Accessed', defaults.accessed);
        if (Array.isArray(defaults.contributors)) {
            contributorList.innerHTML = '';
            if (defaults.contributors.length) {
                defaults.contributors.forEach(contributor => {
                    contributorList.appendChild(createContributorRow(contributor));
                });
            } else {
                contributorList.appendChild(createContributorRow());
            }
        } else {
            ensureContributorRow();
        }
    };

    const showManualPanel = ({ reason, defaults = {}, clear = false } = {}) => {
        if (!manualPanel) return;
        if (clear) resetManualForm();
        if (reason) {
            manualReason.textContent = reason;
        } else if (!manualReason.textContent.trim()) {
            manualReason.textContent = 'Fill in any missing APA fields below.';
        }
        applyManualDefaults(defaults);
        setActiveStep('manual');
        manualPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    resetManualForm();
    setActiveStep('builder');
    loadHistory();
    renderHistory();

    const setStatus = (message, state = 'muted') => {
        if (!statusEl) return;
        statusEl.textContent = message || DEFAULT_STATUS;
        statusEl.dataset.state = state;
    };

    const toggleLoading = isLoading => {
        lookupButton.disabled = isLoading;
        lookupButton.textContent = isLoading ? 'Looking up…' : defaultLookupLabel;
    };

    const sanitizeIsbn = value => (value || '').replace(/[^0-9Xx]/g, '').toUpperCase();

    const findIsbn = text => {
        if (!text) return '';
        const pattern = /(?:ISBN(?:-1[03])?:?\s*)?((?:97[89][\d\-\s]{10,16})|(?:\d[\d\-\s]{8,}[0-9Xx]))/gi;
        let match;
        while ((match = pattern.exec(text))) {
            const candidate = sanitizeIsbn(match[1]);
            if (candidate.length === 10 || candidate.length === 13) return candidate;
        }
        const fallback = sanitizeIsbn(text);
        return (fallback.length === 10 || fallback.length === 13) ? fallback : '';
    };

    const cleanUrl = value => value ? value.trim().replace(/[)\],.]+$/, '') : '';

    const normalizeUrl = rawValue => {
        const trimmed = cleanUrl(rawValue);
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
        return '';
    };

    const findUrl = raw => {
        if (!raw) return '';
        const text = raw.trim();
        const match = text.match(/https?:\/\/[^\s]+/i);
        if (match) return cleanUrl(match[0]);
        const wwwMatch = text.match(/www\.[^\s]+/i);
        if (wwwMatch) return normalizeUrl(wwwMatch[0]);
        const bareMatch = text.match(/^(([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)\.)+[A-Za-z]{2,}(?:\/[\w\-./?=&%+]+)?$/i);
        if (bareMatch) return normalizeUrl(bareMatch[0]);
        return '';
    };

    const buildProxyUrl = url => url.startsWith(PROXY_PREFIX) ? url : `${PROXY_PREFIX}${url}`;

    const fetchWithProxyFallback = async (url, options = {}) => {
        const attempt = async target => {
            const response = await fetch(target, options).catch(() => null);
            if (!response) throw new Error('NETWORK');
            if (response.status === 404) throw new Error('NOT_FOUND');
            if (!response.ok) throw new Error('NETWORK');
            return response;
        };

        try {
            return await attempt(url);
        } catch (error) {
            if (error.message === 'NOT_FOUND') throw error;
            if (url.startsWith(PROXY_PREFIX)) throw new Error('NETWORK');
            return attempt(buildProxyUrl(url));
        }
    };

    const fetchJson = async url => {
        const response = await fetchWithProxyFallback(url, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        });
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error('NETWORK');
        }
    };

    const fetchHtml = async url => {
        const response = await fetchWithProxyFallback(url, {
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        return response.text();
    };

    const normalizePublishers = value => {
        if (typeof value === 'string') return value;
        if (value && typeof value.name === 'string') return value.name;
        return '';
    };

    const mergeUniqueEntities = (existing = [], additional = []) => {
        const seen = new Set(existing.map(entry => (entry?.name || '').toLowerCase()));
        additional.forEach(entry => {
            const name = (entry?.name || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            existing.push({ name });
            seen.add(key);
        });
        return existing;
    };

    const preferValue = (current, incoming) => current || incoming || '';

    const mergeBookEntries = entries => {
        const merged = {
            title: '',
            subtitle: '',
            publish_date: '',
            publish_year: '',
            edition_name: '',
            authors: [],
            publishers: []
        };

        entries.forEach(entry => {
            if (!entry) return;
            merged.title = preferValue(merged.title, entry.title);
            merged.subtitle = preferValue(merged.subtitle, entry.subtitle);
            merged.publish_date = preferValue(merged.publish_date, entry.publish_date);
            merged.publish_year = preferValue(merged.publish_year, entry.publish_year);
            merged.edition_name = preferValue(merged.edition_name, entry.edition_name);
            merged.authors = mergeUniqueEntities(merged.authors, entry.authors || []);
            merged.publishers = mergeUniqueEntities(merged.publishers, entry.publishers || []);
        });

        return merged;
    };

    const fetchOpenLibraryEditionMetadata = async isbn => {
        const book = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`);

        const authorRecords = Array.isArray(book.authors)
            ? await Promise.all(
                book.authors
                    .map(authorRef => authorRef?.key)
                    .filter(Boolean)
                    .map(async key => {
                        try {
                            const author = await fetchJson(`https://openlibrary.org${key}.json`);
                            return author?.name ? { name: author.name } : null;
                        } catch (error) {
                            if (error.message === 'NOT_FOUND') return null;
                            throw error;
                        }
                    })
            )
            : [];

        let work = null;
        const workRefs = Array.isArray(book.works) ? book.works : book.works ? [book.works] : [];
        if (workRefs.length) {
            const workKey = workRefs[0]?.key || workRefs[0];
            if (workKey) {
                try {
                    work = await fetchJson(`https://openlibrary.org${workKey}.json`);
                } catch (error) {
                    if (error.message !== 'NOT_FOUND') throw error;
                }
            }
        }

        const publishers = Array.isArray(book.publishers)
            ? book.publishers.map(normalizePublishers).filter(Boolean).map(name => ({ name }))
            : [];

        return {
            title: book.title || work?.title || '',
            subtitle: book.subtitle || '',
            publish_date: book.publish_date || '',
            publish_year: book.publish_year || work?.first_publish_date || '',
            edition_name: book.edition_name || '',
            authors: authorRecords.filter(Boolean),
            publishers
        };
    };

    const fetchOpenLibraryDataApiMetadata = async isbn => {
        const payload = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        const entry = payload[`ISBN:${isbn}`];
        if (!entry) throw new Error('NOT_FOUND');
        return {
            title: entry.title || '',
            subtitle: entry.subtitle || '',
            publish_date: entry.publish_date || '',
            publish_year: entry.publish_year || '',
            edition_name: entry.edition_name || '',
            authors: Array.isArray(entry.authors)
                ? entry.authors.map(author => ({ name: author?.name || '' })).filter(author => author.name)
                : [],
            publishers: Array.isArray(entry.publishers)
                ? entry.publishers.map(pub => ({ name: pub?.name || '' })).filter(pub => pub.name)
                : []
        };
    };

    const fetchGoogleBooksMetadata = async isbn => {
        const payload = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const volume = payload.items?.[0]?.volumeInfo;
        if (!volume) throw new Error('NOT_FOUND');
        return {
            title: volume.title || '',
            subtitle: volume.subtitle || '',
            publish_date: volume.publishedDate || '',
            publish_year: volume.publishedDate || '',
            edition_name: volume.edition || '',
            authors: Array.isArray(volume.authors)
                ? volume.authors.map(name => ({ name })).filter(author => author.name)
                : [],
            publishers: volume.publisher ? [{ name: volume.publisher }] : []
        };
    };

    const parseAuthorsFromString = text => {
        if (!text) return [];
        return text
            .split(/,| and | & /i)
            .map(name => name.trim())
            .filter(Boolean)
            .map(name => ({ name }));
    };

    const fetchBookFinderMetadata = async isbn => {
        const url = `https://www.bookfinder.com/search/?isbn=${isbn}&st=xl&ac=qr`;
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.content || '';
        const description = doc.querySelector('meta[name="description"]')?.content || '';

        let rawTitle = ogTitle;
        let rawAuthor = '';
        if (ogTitle.toLowerCase().includes(' by ')) {
            const parts = ogTitle.split(/ by /i);
            rawTitle = parts[0];
            rawAuthor = parts.slice(1).join(' by ');
        }

        if (!rawTitle) rawTitle = description.split(' by ')[0] || '';
        const authors = rawAuthor ? parseAuthorsFromString(rawAuthor) : [];

        const publisherMatch = description.match(/Publisher:\s*([^.,]+)/i);
        const publishDateMatch = description.match(/Published:\s*([^.,]+)/i);

        return {
            title: rawTitle.trim(),
            subtitle: '',
            publish_date: publishDateMatch ? publishDateMatch[1].trim() : '',
            publish_year: publishDateMatch ? publishDateMatch[1].trim() : '',
            edition_name: '',
            authors,
            publishers: publisherMatch ? [{ name: publisherMatch[1].trim() }] : []
        };
    };

    const fetchValoreBooksMetadata = async isbn => {
        const url = `https://www.valore.com/browse/ISBN:${isbn}`;
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const title = doc.querySelector('meta[property="og:title"]')?.content ||
            doc.querySelector('h1')?.textContent || '';
        const author = doc.querySelector('[data-testid="author-name"], .item-author')?.textContent || '';
        const publisher = doc.querySelector('[data-testid="publisher"], .item-publisher')?.textContent || '';
        const copyright = doc.querySelector('[data-testid="copyright"], .item-copyright')?.textContent || '';

        return {
            title: title.replace(/by\s+.+$/i, '').trim(),
            subtitle: '',
            publish_date: copyright?.trim() || '',
            publish_year: copyright?.trim() || '',
            edition_name: '',
            authors: author ? parseAuthorsFromString(author) : [],
            publishers: publisher ? [{ name: publisher.trim() }] : []
        };
    };

    const parseYearFromText = text => {
        if (!text) return '';
        const match = text.match(/(19|20)\d{2}/);
        return match ? match[0] : '';
    };

    const fetchPubMedMetadata = async isbn => {
        const url = `https://pubmed.ncbi.nlm.nih.gov/?term=${isbn}`;
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const first = doc.querySelector('article.full-docsum, .docsum-content, .results-articles article');
        if (!first) throw new Error('NOT_FOUND');
        const title = first.querySelector('.docsum-title, h1, h2')?.textContent?.trim();
        if (!title) throw new Error('NOT_FOUND');
        const authorText = first.querySelector('.docsum-authors.full-authors, .docsum-authors.short-authors')?.textContent || '';
        const journalText = first.querySelector('.docsum-journal-citation.full-journal-citation')?.textContent || '';
        const dateText = parseYearFromText(journalText);
        return {
            title,
            subtitle: '',
            publish_date: journalText.trim(),
            publish_year: dateText,
            edition_name: '',
            authors: parseAuthorsFromString(authorText),
            publishers: journalText ? [{ name: journalText.split('. ')[0].trim() }] : []
        };
    };

    const fetchScienceDirectMetadata = async isbn => {
        const url = `https://www.sciencedirect.com/search?qs=${isbn}`;
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const first = doc.querySelector('article[data-testid="result-item"], .result-item-content');
        if (!first) throw new Error('NOT_FOUND');
        const title = first.querySelector('h2, h3, a')?.textContent?.trim();
        if (!title) throw new Error('NOT_FOUND');
        const authorText = first.querySelector('[data-testid="author-list"], .Authors, .result-item-author')?.textContent || '';
        const publisher = 'ScienceDirect';
        const dateText = parseYearFromText(first.textContent);
        return {
            title,
            subtitle: '',
            publish_date: dateText,
            publish_year: dateText,
            edition_name: '',
            authors: parseAuthorsFromString(authorText),
            publishers: [{ name: publisher }]
        };
    };

    const fetchIsbndbMetadata = async isbn => {
        const url = `https://isbndb.com/search/books/${isbn}`;
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const first = doc.querySelector('.book-list .book-link, .book-info');
        if (!first) throw new Error('NOT_FOUND');
        const title = first.querySelector('.book-title, h2, h3')?.textContent?.trim();
        if (!title) throw new Error('NOT_FOUND');
        const authorText = first.querySelector('.book-author, .author')?.textContent || '';
        const publisherText = first.textContent.includes('Publisher')
            ? (first.textContent.match(/Publisher:?\s*([^\n]+)/i)?.[1] || '')
            : '';
        const year = parseYearFromText(first.textContent);
        return {
            title,
            subtitle: '',
            publish_date: year,
            publish_year: year,
            edition_name: '',
            authors: parseAuthorsFromString(authorText),
            publishers: publisherText ? [{ name: publisherText.trim() }] : []
        };
    };

    const fetchAmazonBooksMetadata = async isbn => {
        const url = `https://www.amazon.com/s?k=${isbn}`;
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const first = doc.querySelector('div[data-component-type="s-search-result"]');
        if (!first) throw new Error('NOT_FOUND');
        const title = first.querySelector('h2 a span')?.textContent?.trim();
        if (!title) throw new Error('NOT_FOUND');
        const author = first.querySelector('.a-color-secondary .a-size-base+ .a-size-base, .a-row.a-size-base.a-color-secondary .a-size-base')?.textContent || '';
        const publisher = 'Amazon Books';
        return {
            title: title.replace(/\s*\([^)]*\)$/g, '').trim(),
            subtitle: '',
            publish_date: '',
            publish_year: '',
            edition_name: '',
            authors: parseAuthorsFromString(author),
            publishers: [{ name: publisher }]
        };
    };

    const fetchOpenAlexMetadata = async isbn => {
        const payload = await fetchJson(`https://api.openalex.org/works?filter=isbn:${isbn}`);
        const record = Array.isArray(payload.results) ? payload.results[0] : null;
        if (!record) throw new Error('NOT_FOUND');
        const authors = Array.isArray(record.authorships)
            ? record.authorships
                .map(authorship => authorship.author?.display_name || '')
                .filter(Boolean)
                .map(name => ({ name }))
            : [];
        const publisher =
            record.host_venue?.publisher ||
            record.host_venue?.display_name ||
            record.primary_location?.source?.display_name ||
            '';
        return {
            title: record.title || '',
            subtitle: '',
            publish_date: record.publication_date || record.from_publication_date || '',
            publish_year: record.publication_year || '',
            edition_name: '',
            authors,
            publishers: publisher ? [{ name: publisher }] : []
        };
    };

    const fetchBookMetadata = async isbn => {
        const sources = [
            fetchOpenLibraryEditionMetadata,
            fetchOpenLibraryDataApiMetadata,
            fetchOpenAlexMetadata,
            fetchGoogleBooksMetadata,
            fetchBookFinderMetadata,
            fetchValoreBooksMetadata,
            fetchPubMedMetadata,
            fetchScienceDirectMetadata,
            fetchIsbndbMetadata,
            fetchAmazonBooksMetadata
        ];
        const collected = [];
        let sawNetworkFailure = false;
        for (const source of sources) {
            try {
                const data = await source(isbn);
                if (data) collected.push(data);
            } catch (error) {
                if (error.message === 'NETWORK') {
                    sawNetworkFailure = true;
                }
                continue;
            }
        }

        const merged = mergeBookEntries(collected);
        const hasData =
            Boolean(merged.title) ||
            Boolean(merged.subtitle) ||
            Boolean(merged.publish_date) ||
            merged.authors.length > 0;

        if (hasData) return merged;
        if (sawNetworkFailure) throw new Error('NETWORK');
        throw new Error('NOT_FOUND');
    };

    const sentenceCase = value => {
        if (!value) return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        let result = trimmed.toLowerCase();
        const firstAlpha = result.search(/[A-Za-z]/);
        if (firstAlpha >= 0) {
            result =
                result.slice(0, firstAlpha) +
                result.charAt(firstAlpha).toUpperCase() +
                result.slice(firstAlpha + 1);
        }
        result = result.replace(/([:-]\s*)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
        return result;
    };

    const extractYear = entry => {
        const candidates = [
            entry.publish_date,
            Array.isArray(entry.publish_year) ? entry.publish_year[0] : entry.publish_year,
            entry.first_publish_year
        ].filter(Boolean);
        const yearSource = candidates[0] || '';
        const match = String(yearSource).match(/(\d{4})/);
        return match ? match[1] : 'n.d.';
    };

    const getAuthorNames = entry => {
        if (!Array.isArray(entry.authors)) return [];
        return entry.authors.map(author => author?.name || '').filter(Boolean);
    };

    const formatAuthorName = fullName => {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const lastName = parts.pop();
        const initials = parts
            .map(part => part[0] ? `${part[0].toUpperCase()}.` : '')
            .filter(Boolean)
            .join(' ');
        return initials ? `${lastName}, ${initials}` : lastName;
    };

    const joinAuthors = names => {
        const filtered = names.filter(Boolean);
        if (!filtered.length) return '';
        if (filtered.length === 1) return filtered[0];
        if (filtered.length === 2) return `${filtered[0]} & ${filtered[1]}`;
        if (filtered.length <= 20) {
            const firstPart = filtered.slice(0, -1).join(', ');
            return `${firstPart}, & ${filtered[filtered.length - 1]}`;
        }
        return `${filtered.slice(0, 19).join(', ')}, ... ${filtered[filtered.length - 1]}`;
    };

    const buildTitleSegment = entry => {
        const segments = [entry.title, entry.subtitle].map(value => (value || '').trim()).filter(Boolean);
        if (!segments.length) return '';
        const rawTitle = segments.join(': ');
        return sentenceCase(rawTitle);
    };

    const buildReference = (entry, isbn) => {
        const authors = getAuthorNames(entry);
        const formattedAuthors = joinAuthors(authors.map(formatAuthorName));
        const year = extractYear(entry);
        const title = buildTitleSegment(entry) || `ISBN ${isbn}`;
        const edition = typeof entry.edition_name === 'string' ? entry.edition_name.trim() : '';
        const publishers = Array.isArray(entry.publishers) ? entry.publishers.map(pub => pub?.name || '').filter(Boolean) : [];
        const publisher = publishers.join(', ');

        const titleWithEdition = edition ? `${title} (${edition})` : title;
        const segments = [];
        if (formattedAuthors) {
            segments.push(`${formattedAuthors} (${year}).`);
            segments.push(`${titleWithEdition}.`);
        } else {
            segments.push(`${titleWithEdition}. (${year}).`);
        }

        if (publisher) {
            segments.push(`${publisher}.`);
        }

        return joinReferenceSegments(segments);
    };

    const buildInTextCitation = entry => {
        const authors = getAuthorNames(entry);
        const surnames = authors.map(name => {
            const parts = name.trim().split(/\s+/);
            return parts[parts.length - 1];
        }).filter(Boolean);
        const year = extractYear(entry);

        if (!surnames.length) {
            const shortTitle = entry.title ? sentenceCase(entry.title).split(/:|\./)[0] : 'Title';
            return `(${shortTitle}, ${year})`;
        }

        if (surnames.length === 1) return `(${surnames[0]}, ${year})`;
        if (surnames.length === 2) return `(${surnames[0]} & ${surnames[1]}, ${year})`;
        return `(${surnames[0]} et al., ${year})`;
    };

    const parseDate = value => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const formatFullDate = date => {
        if (!date) return 'n.d.';
        const year = date.getUTCFullYear();
        const formatter = new Intl.DateTimeFormat('en-US', {
            month: 'long',
            day: 'numeric'
        });
        return `${year}, ${formatter.format(date)}`;
    };

    const getMonthName = value => {
        const monthIndex = parseInt(value, 10);
        if (!monthIndex || monthIndex < 1 || monthIndex > 12) return '';
        const month = MONTHS.find(option => parseInt(option.value, 10) === monthIndex);
        return month ? month.label : '';
    };

    const parseDatePartsValue = value => {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return {
                day: value.getUTCDate(),
                month: value.getUTCMonth() + 1,
                year: value.getUTCFullYear()
            };
        }
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return {
                day: date.getUTCDate(),
                month: date.getUTCMonth() + 1,
                year: date.getUTCFullYear()
            };
        }
        const yearMatch = String(value).match(/(\d{4})/);
        if (yearMatch) {
            return { year: parseInt(yearMatch[1], 10) };
        }
        return null;
    };

    const formatManualDateParts = parts => {
        if (!parts || !parts.year) return 'n.d.';
        const monthName = getMonthName(parts.month);
        if (monthName && parts.day) return `${parts.year}, ${monthName} ${parts.day}`;
        if (monthName) return `${parts.year}, ${monthName}`;
        return String(parts.year);
    };

    const formatManualDatePartsLong = parts => {
        if (!parts || !parts.year) return '';
        const monthName = getMonthName(parts.month);
        if (monthName && parts.day) return `${monthName} ${parts.day}, ${parts.year}`;
        if (monthName) return `${monthName}, ${parts.year}`;
        return String(parts.year);
    };

    const parseNameToParts = name => {
        if (!name) return { first: '', middle: '', last: '', suffix: '' };
        const tokens = name.trim().split(/\s+/);
        if (!tokens.length) return { first: '', middle: '', last: '', suffix: '' };
        let suffix = '';
        if (tokens.length > 1 && suffixCandidates.includes(tokens[tokens.length - 1])) {
            suffix = tokens.pop();
        }
        const first = tokens.shift() || '';
        const last = tokens.pop() || '';
        const middle = tokens.join(' ');
        return { first, middle, last, suffix };
    };

    const formatWebAuthor = author => {
        if (!author) return '';
        const trimmed = author.trim();
        if (!trimmed) return '';
        const isPersonalName = /^[A-Za-z ,.'-]+$/.test(trimmed) && trimmed.split(/\s+/).length <= 4;
        if (!isPersonalName) return trimmed;
        return formatAuthorName(trimmed);
    };

    const extractMetaContent = (doc, selectors = []) => {
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (!element) continue;
            if (element.content) return element.content.trim();
            if (element.getAttribute) {
                const value =
                    element.getAttribute('content') ||
                    element.getAttribute('value') ||
                    element.getAttribute('datetime');
                if (value) return value.trim();
            }
            if (element.textContent) return element.textContent.trim();
        }
        return '';
    };

    const fallbackTitleFromUrl = url => {
        try {
            const { pathname } = new URL(url);
            const rawSegments = pathname.split('/').filter(Boolean);
            if (!rawSegments.length) return '';
            const disallowed = new Set(['default', 'index', 'home', 'landing', 'content', 'page']);
            for (let i = rawSegments.length - 1; i >= 0; i -= 1) {
                const raw = decodeURIComponent(rawSegments[i]);
                const trimmed = raw.replace(/\.(html?|aspx|php)$/i, '').replace(/[-_]*\d+$/, '');
                const slug = trimmed.replace(/[-_]+/g, ' ').trim();
                if (!slug) continue;
                if (disallowed.has(slug.toLowerCase())) continue;
                return slug;
            }
            const fallback = decodeURIComponent(rawSegments[rawSegments.length - 1])
                .replace(/\.(html?|aspx|php)$/i, '')
                .replace(/[-_]+/g, ' ')
                .trim();
            return fallback;
        } catch (error) {
            return '';
        }
    };

    const GENERIC_SECTIONS = new Set([
        'investor relations',
        'investors',
        'press',
        'press room',
        'press releases',
        'newsroom',
        'news',
        'media',
        'default',
        'home',
        'landing',
        'blog',
        'article'
    ]);

    const deriveTitleAndSite = value => {
        if (!value) return null;
        const separators = [' - ', ' | ', ' • ', ' — ', ' – ', ' :: '];
        for (const separator of separators) {
            if (!value.includes(separator)) continue;
            const parts = value.split(separator).map(part => part.trim()).filter(Boolean);
            if (parts.length < 2) continue;
            const siteCandidate = parts.pop();
            const titleCandidate = parts.join(separator).trim();
            if (!titleCandidate || !siteCandidate) continue;
            if (!/\s/.test(siteCandidate) && !/[A-Za-z]/.test(siteCandidate)) continue;
            const siteLower = siteCandidate.toLowerCase();
            if (GENERIC_SECTIONS.has(siteLower) && titleCandidate) {
                return { title: siteCandidate, site: titleCandidate };
            }
            return { title: titleCandidate, site: siteCandidate };
        }
        return null;
    };

    const fetchArticleMetadata = async url => {
        const html = await fetchHtml(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const metaTitle =
            extractMetaContent(doc, [
                'meta[property="og:title"]',
                'meta[name="twitter:title"]'
            ]);

        const headerTitle = (() => {
            const candidates = Array.from(
                doc.querySelectorAll('meta[name="title"], h1, .releaseTitle, .articleTitle, .page-title, .entry-title')
            );
            const text = candidates
                .map(node => node.textContent?.trim())
                .find(value => value && value.length >= 20);
            return text || '';
        })();

        const title =
            metaTitle ||
            (doc.querySelector('title')?.textContent || '').trim() ||
            headerTitle ||
            fallbackTitleFromUrl(url) ||
            'Untitled article';

        const author =
            extractMetaContent(doc, [
                'meta[name="author"]',
                'meta[property="article:author"]',
                'meta[name="byline"]',
                'meta[name="byl"]',
                'meta[name="dc.creator"]'
            ]);

        const fallbackHost = (() => {
            try {
                const { hostname } = new URL(url);
                return hostname.replace(/^www\./i, '');
            } catch (error) {
                return '';
            }
        })();

        let siteName =
            extractMetaContent(doc, [
                'meta[property="og:site_name"]',
                'meta[name="application-name"]'
            ]) || fallbackHost;

        let normalizedTitle = title;
        const derived = deriveTitleAndSite(title);
        if (derived) {
            normalizedTitle = derived.title;
            if (!siteName || siteName === fallbackHost || /^[\w.-]+$/.test(siteName)) {
                siteName = derived.site;
            }
        }

        const publishedRaw =
            extractMetaContent(doc, [
                'meta[property="article:published_time"]',
                'meta[name="article:published_time"]',
                'meta[name="pubdate"]',
                'meta[name="date"]',
                'meta[name="publication_date"]',
                'meta[itemprop="datePublished"]',
                'meta[name="dc.date"]',
                'meta[name="dc.date.issued"]',
                'time[datetime]'
            ]) || doc.querySelector('time')?.getAttribute('datetime');

        return {
            url,
            title: normalizedTitle,
            author,
            siteName,
            published: parseDate(publishedRaw)
        };
    };

    const buildArticleReference = metadata => {
        const contributor = formatWebAuthor(metadata.author);
        const date = formatFullDate(metadata.published);
        const title = sentenceCase(metadata.title || metadata.siteName || metadata.url || 'Untitled article');
        const segments = [];

        if (contributor) {
            segments.push(`${contributor} (${date}).`);
            segments.push(`${title}.`);
        } else {
            segments.push(`${title}. (${date}).`);
        }

        if (metadata.siteName) {
            segments.push(`${metadata.siteName}.`);
        }

        if (metadata.url) {
            segments.push(metadata.url);
        }

        return joinReferenceSegments(segments);
    };

    const buildArticleInText = metadata => {
        const label = (() => {
            const author = metadata.author?.trim();
            if (author) {
                const parts = author.split(/\s+/);
                return parts[parts.length - 1];
            }
            const site = metadata.siteName?.trim();
            if (site) return site;
            const title = metadata.title?.trim();
            if (title) return title;
            if (metadata.url) {
                try {
                    return new URL(metadata.url).hostname.replace(/^www\./i, '');
                } catch (error) {
                    return metadata.url;
                }
            }
            return 'Source';
        })();
        const year = metadata.published ? metadata.published.getUTCFullYear() : 'n.d.';
        return `(${label}, ${year})`;
    };

    const formatManualContributor = contributor => {
        if (!contributor) return '';
        const last = (contributor.last || contributor.first || '').trim();
        if (!last) return '';
        const initials = [contributor.first, contributor.middle]
            .filter(Boolean)
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => `${part[0].toUpperCase()}.`)
            .join(' ');
        const suffix = contributor.suffix ? `, ${contributor.suffix.replace(/\.?$/, '.')}` : '';
        return initials ? `${last}, ${initials}${suffix}` : `${last}${suffix}`;
    };

    const contributorsToAuthorList = contributors => {
        if (!Array.isArray(contributors)) return [];
        return contributors
            .map(formatManualContributor)
            .filter(Boolean);
    };

    const readDateInputs = prefix => {
        const dayInput = prefix === 'Published' ? manualPublishedDayInput : manualAccessedDayInput;
        const monthSelect = prefix === 'Published' ? manualPublishedMonthSelect : manualAccessedMonthSelect;
        const yearInput = prefix === 'Published' ? manualPublishedYearInput : manualAccessedYearInput;
        const day = parseInt(dayInput.value, 10);
        const month = parseInt(monthSelect.value, 10);
        const year = parseInt(yearInput.value, 10);
        if (!day && !month && !year) return null;
        return {
            day: Number.isNaN(day) ? '' : day,
            month: Number.isNaN(month) ? '' : month,
            year: Number.isNaN(year) ? '' : year
        };
    };

    const escapeHtml = value =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const joinReferenceSegments = segments =>
        segments
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+\./g, '.')
            .trim();

    const formatManualReference = data => {
        const authors = contributorsToAuthorList(data.contributors);
        const formattedAuthors = joinAuthors(authors);
        const dateText = formatManualDateParts(data.published) || 'n.d.';
        const title = sentenceCase(data.title || 'Untitled work');
        const site = data.website?.trim() || '';
        const publisher = data.publisher && data.publisher !== site ? data.publisher.trim() : '';
        const includeUrl = data.showUrl && data.url;
        const retrievedText = data.accessed ? formatManualDatePartsLong(data.accessed) : '';

        const segments = [];
        const htmlSegments = [];

        if (formattedAuthors) {
            segments.push(`${formattedAuthors} (${dateText}).`);
            htmlSegments.push(`${escapeHtml(formattedAuthors)} (${escapeHtml(dateText)}).`);
            segments.push(`${title}.`);
            htmlSegments.push(`<em>${escapeHtml(title)}</em>.`);
        } else {
            const plainTitle = `${title}. (${dateText}).`;
            segments.push(plainTitle);
            htmlSegments.push(`<em>${escapeHtml(title)}</em> (${escapeHtml(dateText)}).`);
        }

        if (site) {
            segments.push(`${site}.`);
            htmlSegments.push(`${escapeHtml(site)}.`);
        }
        if (publisher) {
            segments.push(`${publisher}.`);
            htmlSegments.push(`${escapeHtml(publisher)}.`);
        }

        if (includeUrl && data.url) {
            if (retrievedText) {
                segments.push(`Retrieved ${retrievedText} from ${data.url}`);
                htmlSegments.push(
                    `Retrieved ${escapeHtml(retrievedText)} from <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.url)}</a>`
                );
            } else {
                segments.push(data.url);
                htmlSegments.push(
                    `<a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.url)}</a>`
                );
            }
        } else if (retrievedText) {
            segments.push(`Retrieved ${retrievedText}.`);
            htmlSegments.push(`Retrieved ${escapeHtml(retrievedText)}.`);
        }

        return {
            plain: joinReferenceSegments(segments),
            html: joinReferenceSegments(htmlSegments)
        };
    };

    const getSurnamesFromContributors = contributors => {
        if (!Array.isArray(contributors)) return [];
        return contributors
            .map(contributor => (contributor.last || contributor.first || '').trim())
            .filter(Boolean);
    };

    const formatManualInText = data => {
        const surnames = getSurnamesFromContributors(data.contributors);
        const year = data.published?.year ? data.published.year : 'n.d.';
        if (surnames.length === 1) return `(${surnames[0]}, ${year})`;
        if (surnames.length === 2) return `(${surnames[0]} & ${surnames[1]}, ${year})`;
        if (surnames.length > 2) return `(${surnames[0]} et al., ${year})`;
        const label = sentenceCase(data.website || data.publisher || data.title || 'Source');
        return `(${label}, ${year})`;
    };

    const buildSortKeyFromData = (data, reference = '') => {
        const year = data?.published?.year ? String(data.published.year).padStart(4, '0') : '0000';
        if (data?.contributors?.length) {
            const last = data.contributors[0].last || data.contributors[0].first || '';
            if (last) return `${last.toLowerCase()}_${year}`;
        }
        if (data?.website) return `${data.website.toLowerCase()}_${year}`;
        if (data?.publisher) return `${data.publisher.toLowerCase()}_${year}`;
        if (data?.title) return `${data.title.toLowerCase()}_${year}`;
        return `${reference.toLowerCase()}_${year}`;
    };

    const convertNamesToContributors = names => {
        if (!Array.isArray(names) || !names.length) return [];
        return names.map(name => parseNameToParts(name));
    };

    const parsePublisherName = entry => {
        if (!Array.isArray(entry.publishers) || !entry.publishers.length) return '';
        return entry.publishers[0]?.name || entry.publishers[0] || '';
    };

    const createManualDefaultsFromBook = (entry, isbn) => ({
        title: sentenceCase(entry.title || entry.subtitle || `ISBN ${isbn}`),
        publisher: parsePublisherName(entry),
        website: '',
        url: '',
        showUrl: false,
        contributors: convertNamesToContributors(getAuthorNames(entry)),
        published: parseDatePartsValue(entry.publish_date || entry.publish_year),
        accessed: null,
        workType: 'book'
    });

    const fallbackSiteName = url => {
        try {
            const { hostname } = new URL(url);
            return hostname.replace(/^www\./i, '');
        } catch (error) {
            return '';
        }
    };

const lookupSiteMapping = host => {
    const normalized = toHostKey(host);
    if (!normalized) return '';
    if (siteMappings[normalized]) return siteMappings[normalized];
    const segments = normalized.split('.');
    for (let i = 1; i < segments.length - 1; i += 1) {
        const candidate = segments.slice(i).join('.');
        if (siteMappings[candidate]) return siteMappings[candidate];
    }
    return '';
};

const normalizeSiteName = (siteName, url) => {
    const host = fallbackSiteName(url);
    const mappedHost = lookupSiteMapping(host);
    if (mappedHost) return mappedHost;
    if (siteName) {
        const mappedProvidedName = lookupSiteMapping(siteName);
        if (mappedProvidedName) return mappedProvidedName;
    }
    return siteName && siteName.trim() ? siteName.trim() : host;
};

    const createManualDefaultsFromArticle = metadata => {
        const siteName = normalizeSiteName(metadata.siteName, metadata.url);
        return {
            title: sentenceCase(metadata.title || siteName || 'Untitled article'),
            website: siteName || '',
            publisher: siteName || '',
            url: metadata.url || '',
            showUrl: true,
            contributors: metadata.author ? [parseNameToParts(metadata.author)] : [],
            published: metadata.published ? parseDatePartsValue(metadata.published) : null,
            accessed: parseDatePartsValue(new Date()),
            workType: 'web'
        };
    };

    const missingBookFields = entry => {
        const missing = [];
        if (!(entry.title || entry.subtitle)) missing.push('title');
        if (!getAuthorNames(entry).length) missing.push('authors');
        if (!parsePublisherName(entry)) missing.push('publisher');
        if (extractYear(entry) === 'n.d.') missing.push('year');
        return missing;
    };

    const missingArticleFields = metadata => {
        const missing = [];
        if (!metadata.title) missing.push('title');
        if (!(metadata.author || metadata.siteName)) missing.push('author');
        if (!metadata.published) missing.push('date');
        return missing;
    };

    const buildManualReason = (missingFields, fallbackMessage) => {
        if (Array.isArray(missingFields) && missingFields.length) {
            return 'Complete the citation manually.';
        }
        return fallbackMessage || 'Complete the citation manually.';
    };

    const getContributorsFromInputs = () => {
        return Array.from(contributorList.querySelectorAll('.contributor-row')).map(row => {
            const first = row.querySelector('[data-field="first"]')?.value.trim() || '';
            const middle = row.querySelector('[data-field="middle"]')?.value.trim() || '';
            const last = row.querySelector('[data-field="last"]')?.value.trim() || '';
            const suffix = row.querySelector('[data-field="suffix"]')?.value.trim() || '';
            return { first, middle, last, suffix };
        }).filter(contributor => contributor.first || contributor.last);
    };

    const collectManualData = () => ({
        title: manualTitleInput.value.trim(),
        website: manualWebsiteInput.value.trim(),
        publisher: manualPublisherInput.value.trim(),
        url: manualUrlInput.value.trim(),
        showUrl: Boolean(manualShowUrlToggle.checked),
        contributors: getContributorsFromInputs(),
        published: readDateInputs('Published'),
        accessed: readDateInputs('Accessed'),
        workType: manualForm.dataset.workType || 'web'
    });

    const buildBasicArticleMetadata = url => {
        try {
            const parsed = new URL(url);
            const siteName = parsed.hostname.replace(/^www\./i, '');
            const title = fallbackTitleFromUrl(url) || siteName || url;
            return {
                url,
                title,
                author: '',
                siteName,
                published: null
            };
        } catch (error) {
            return {
                url,
                title: url,
                author: '',
                siteName: '',
                published: null
            };
        }
    };

    const handleIsbnLookup = async isbn => {
        toggleLoading(true);
        setStatus(`Looking up ISBN ${isbn}…`, 'info');
        try {
            const metadata = await fetchBookMetadata(isbn);
            const defaults = createManualDefaultsFromBook(metadata, isbn);
            const reason = buildManualReason(
                missingBookFields(metadata),
                'Review the details we found and make any tweaks before generating.'
            );
            showManualPanel({
                reason,
                defaults,
                clear: true
            });
            setStatus('Metadata found. Continue to Step 2 to confirm the citation.', 'success');
        } catch (error) {
            console.error(error);
            if (error.message === 'NOT_FOUND') {
                setStatus('No catalog record was found for that ISBN. Enter the details manually.', 'error');
            } else {
                setStatus('Unable to contact the catalog services right now. Check your connection and try again.', 'error');
            }
            showManualPanel({
                reason: 'We could not find enough metadata for that ISBN. Enter the details manually.',
                defaults: {
                    title: `ISBN ${isbn}`,
                    showUrl: false
                },
                clear: true
            });
        } finally {
            toggleLoading(false);
        }
    };

    const handleUrlLookup = async url => {
        toggleLoading(true);
        setStatus('Fetching article metadata…', 'info');
        try {
            const metadata = await fetchArticleMetadata(url);
            await siteMappingsReady;
            const defaults = createManualDefaultsFromArticle(metadata);
            const reason = buildManualReason(
                missingArticleFields(metadata),
                'We pre-filled everything we found. Confirm the details below.'
            );
            showManualPanel({
                reason,
                defaults,
                clear: true
            });
            setStatus('Metadata found. Continue to Step 2 to confirm the citation.', 'success');
        } catch (error) {
            console.error(error);
            const fallbackMetadata = buildBasicArticleMetadata(url);
            await siteMappingsReady;
            showManualPanel({
                reason: 'Complete the citation manually.',
                defaults: createManualDefaultsFromArticle(fallbackMetadata),
                clear: true
            });
            setStatus('Used basic URL metadata. Please verify before submitting.', 'info');
        } finally {
            toggleLoading(false);
        }
    };

    const handleLookup = async () => {
        const rawInput = lookupInput.value.trim();
        if (!rawInput) {
            setStatus('Please paste a link or type an ISBN first.', 'error');
            return;
        }

        const url = findUrl(rawInput);
        if (url) {
            await handleUrlLookup(url);
            return;
        }

        const isbn = findIsbn(rawInput);
        if (isbn) {
            await handleIsbnLookup(isbn);
            return;
        }

        setStatus('Could not find an ISBN or valid URL in what you pasted.', 'error');
    };

    lookupButton.addEventListener('click', handleLookup);

    lookupInput.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            handleLookup();
        }
    });

    lookupInput.addEventListener('input', () => {
        if (!lookupInput.value.trim()) {
            setStatus(DEFAULT_STATUS, 'muted');
            return;
        }
        setStatus('Ready to generate your citation.', 'info');
    });

    clearButton.addEventListener('click', () => {
        lookupInput.value = '';
        referenceOutput.value = '';
        inTextOutput.value = '';
        resetManualForm();
        setActiveStep('builder');
        setStatus(DEFAULT_STATUS, 'muted');
    });

    pasteButton.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                lookupInput.value = text.trim();
                setStatus('Clipboard contents pasted. Generate when ready.', 'info');
            } else {
                setStatus('Clipboard was empty.', 'muted');
            }
        } catch (error) {
            console.error(error);
            setStatus('Browser blocked clipboard access. Paste manually (⌘/Ctrl + V).', 'error');
        }
    });

    copyButtons.forEach(button => {
        const originalLabel = button.textContent;
        button.addEventListener('click', async () => {
            const target = document.getElementById(button.dataset.copyTarget);
            if (!target) return;
            const value = (target.value || target.textContent || '').trim();
            const copied = await copyValue(value);
            if (!copied) return;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalLabel;
            }, 2000);
        });
    });

    if (addContributorButton) {
        addContributorButton.addEventListener('click', () => {
            contributorList.appendChild(createContributorRow());
        });
    }

    if (manualForm) {
        manualForm.addEventListener('submit', event => {
            event.preventDefault();
            const data = collectManualData();
            const referenceParts = formatManualReference(data);
            const inText = formatManualInText(data);
            referenceOutput.value = referenceParts.plain;
            inTextOutput.value = inText;
            addReferenceToHistory({
                reference: referenceParts.plain,
                display: referenceParts.html,
                inText,
                source: data,
                sortKey: buildSortKeyFromData(data, referenceParts.plain)
            });
            setActiveStep('output');
            setStatus('APA citation generated and saved to history.', 'success');
        });
    }

    if (manualResetButton) {
        manualResetButton.addEventListener('click', () => {
            resetManualForm();
        });
    }

    if (fillAccessedTodayButton) {
        fillAccessedTodayButton.addEventListener('click', () => {
            const today = new Date();
            setDateInputs('Accessed', {
                day: today.getUTCDate(),
                month: today.getUTCMonth() + 1,
                year: today.getUTCFullYear()
            });
        });
    }

    const resetWorkflow = () => {
        lookupInput.value = '';
        referenceOutput.value = '';
        inTextOutput.value = '';
        resetManualForm();
        setActiveStep('builder');
        setStatus(DEFAULT_STATUS, 'muted');
        lookupInput.focus();
    };

    if (openManualButton) {
        openManualButton.addEventListener('click', () => {
            showManualPanel({
                reason: 'Enter the citation details manually.',
                clear: true
            });
            setStatus('Fill out the manual form to continue.', 'info');
        });
    }

    if (openHistoryButton) {
        openHistoryButton.addEventListener('click', () => {
            setActiveStep('output');
            setStatus('Viewing saved references (Step 3).', 'muted');
        });
    }

    if (manualBackButton) {
        manualBackButton.addEventListener('click', () => {
            setActiveStep('builder');
            setStatus('Returned to Step 1. Paste a link or ISBN to continue.', 'muted');
        });
    }

    const getSelectedHistoryIndices = () => {
        if (!historyList) return [];
        return Array.from(historyList.querySelectorAll('input[data-history-select]:checked'))
            .map(input => parseInt(input.value, 10))
            .filter(index => !Number.isNaN(index));
    };

    if (historyList) {
        historyList.addEventListener('change', event => {
            if (event.target.dataset.historySelect !== undefined) {
                updateHistoryControls();
            }
        });

        historyList.addEventListener('click', async event => {
            const action = event.target.dataset.historyAction;
            if (!action) return;
            const index = parseInt(event.target.dataset.index, 10);
            if (Number.isNaN(index) || !historyEntries[index]) return;
            const entry = historyEntries[index];
            if (action === 'copy-reference') {
                const copied = await copyValue(entry.reference, 'Reference copied to clipboard.');
                if (copied) {
                    const original = event.target.textContent;
                    event.target.textContent = 'Copied!';
                    setTimeout(() => (event.target.textContent = original), 2000);
                }
            } else if (action === 'copy-intext') {
                const copied = await copyValue(entry.inText, 'In-text citation copied to clipboard.');
                if (copied) {
                    const original = event.target.textContent;
                    event.target.textContent = 'Copied!';
                    setTimeout(() => (event.target.textContent = original), 2000);
                }
            }
        });
    }

    if (deleteSelectedButton) {
        deleteSelectedButton.addEventListener('click', () => {
            const indices = getSelectedHistoryIndices().sort((a, b) => b - a);
            if (!indices.length) return;
            indices.forEach(index => {
                if (historyEntries[index]) historyEntries.splice(index, 1);
            });
            persistHistory();
            renderHistory();
        });
    }

    if (clearHistoryButton) {
        clearHistoryButton.addEventListener('click', () => {
            clearHistory();
        });
    }

    if (startOverButton) {
        startOverButton.addEventListener('click', resetWorkflow);
    }

    if (outputBackButton) {
        outputBackButton.addEventListener('click', () => {
            setActiveStep('manual');
            setStatus('Returned to Step 2 to make edits.', 'info');
        });
    }
});
