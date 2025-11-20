(() => {
    const MAX_FILES = 100;
    const API_BASE = 'https://api.modrinth.com/v2';
    const GAME_VERSIONS_ENDPOINT = `${API_BASE}/tag/game_version`;
    const SEARCH_FACETS = encodeURIComponent('[["project_type:mod"]]');
    const FALLBACK_VERSIONS = ['1.21.10', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20', '1.19.4', '1.19.2', '1.19', '1.18.2', '1.18', '1.16.5', '1.12.2', '1.8.9', '1.7.10'];
    const MIN_SUPPORTED_MAJOR = 1;
    const MIN_SUPPORTED_MINOR = 7;
    const FALLBACK_ICON = './favicon.svg';
    const SLUG_OVERRIDES = {
        'advanced-xray': 'advanced-xray-fabric',
        'advanced-xray-fabric': 'advanced-xray-fabric',
        'fullbright': 'fullbright-forge',
        'fullbright-fabric': 'fullbright-forge'
    };
    const formatNumber = new Intl.NumberFormat();
    const formatDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    const ready = callback => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    };

    const getAuthToken = () => {
        try {
            return (localStorage.getItem('modUpdaterPat') || '').trim();
        } catch (error) {
            console.warn('Unable to read Modrinth token from localStorage.', error);
            return '';
        }
    };

    const buildHeaders = () => {
        const headers = {};
        const token = getAuthToken();
        if (token) headers.Authorization = token;
        return headers;
    };

    const sanitizeSlug = value => {
        if (!value || typeof value !== 'string') return '';
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    };

    const normalizeComparable = value => {
        if (!value || typeof value !== 'string') return '';
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
    };

    const normalizeVersion = value => {
        if (!value || typeof value !== 'string') return '';
        return value.trim().toLowerCase().replace(/^v(?=\d)/, '');
    };

    const sanitizeVersionValue = value => {
        if (!value || typeof value !== 'string') return '';
        const cleaned = value.trim();
        if (!cleaned) return '';
        if (cleaned.includes('${') || cleaned.includes('}')) return '';
        if (/^@.+@$/.test(cleaned)) return '';
        return cleaned;
    };

    const deriveVersionFromName = name => {
        if (!name || typeof name !== 'string') return '';
        const base = name.replace(/\.jar$/i, '');
        const regex = /v?\d+(?:[\._-]?\d+)*(?:[0-9a-z.+-]*)?/gi;
        let best = '';
        let bestScore = -Infinity;
        let match;
        while ((match = regex.exec(base)) !== null) {
            const value = match[0];
            if (!value) continue;
            const preceding = base.slice(Math.max(0, match.index - 2), match.index).toLowerCase();
            const hasMcPrefix = preceding.includes('mc');
            const dotCount = (value.match(/\./g) || []).length;
            const score = (dotCount + 1) * 10 - (hasMcPrefix ? 5 : 0) - (match.index || 0) / 100;
            if (score > bestScore) {
                bestScore = score;
                best = value;
            }
        }
        return best;
    };

    const extractVersionCore = value => {
        if (!value) return '';
        const match = value.match(/\d+(?:\.\d+)*/);
        return match ? match[0] : value;
    };

    const versionsMatch = (left, right) => {
        const normLeft = normalizeVersion(left);
        const normRight = normalizeVersion(right);
        if (!normLeft || !normRight) return false;
        if (normLeft === normRight) return true;
        const coreLeft = extractVersionCore(normLeft);
        const coreRight = extractVersionCore(normRight);
        return Boolean(coreLeft && coreRight && coreLeft === coreRight);
    };

    const fallbackNameFromFile = file => file?.name?.replace(/\.jar$/i, '') || 'Mod';

    const guessSlugFromFilename = filename => {
        if (!filename || typeof filename !== 'string') return '';
        const base = filename.replace(/\.jar$/i, '');
        const tokens = base.split(/[-_.]+/).filter(Boolean);
        const loaderTokens = new Set(['fabric', 'forge', 'quilt', 'neoforge', 'liteloader', 'rift', 'forgefabric']);
        const slugTokens = [];
        let versionEncountered = false;
        tokens.forEach(token => {
            if (versionEncountered) return;
            const lower = token.toLowerCase();
            if (loaderTokens.has(lower)) {
                versionEncountered = true;
                return;
            }
            if (/^\d+(?:\.\d+)*(?:[a-z]*)?$/.test(lower) || /^mc\d/.test(lower)) {
                versionEncountered = true;
                return;
            }
            slugTokens.push(lower);
        });
        if (!slugTokens.length) {
            return base.split(/[-_.]+/)[0]?.toLowerCase() || '';
        }
        return slugTokens.join('-');
    };

    const normalizeZipPath = value => value?.replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase() ?? '';

    const getZipEntry = (zip, target) => {
        if (!zip || !target) return null;
        const normalizedTarget = normalizeZipPath(target);
        if (!normalizedTarget) return null;
        const entries = Object.entries(zip.files || {});
        let best = null;
        let bestDepth = Infinity;
        for (const [name, entry] of entries) {
            if (!entry || entry.dir) continue;
            const normalizedName = normalizeZipPath(name);
            if (normalizedName.endsWith(normalizedTarget)) {
                const depth = normalizedName.split('/').length;
                if (depth < bestDepth) {
                    best = entry;
                    bestDepth = depth;
                    if (depth <= 2) break;
                }
            }
        }
        return best;
    };

    const parseModsToml = text => {
        if (!text) return null;
        const modIdMatch = text.match(/modId\s*=\s*"([^"]+)"/i);
        const nameMatch = text.match(/displayName\s*=\s*"([^"]+)"/i);
        const versionMatch = text.match(/version\s*=\s*"([^"]+)"/i);
        if (!modIdMatch && !nameMatch) return null;
        const slugSource = modIdMatch ? modIdMatch[1] : nameMatch?.[1];
        return {
            slug: sanitizeSlug(slugSource),
            displayName: nameMatch ? nameMatch[1] : modIdMatch?.[1],
            version: sanitizeVersionValue(versionMatch ? versionMatch[1] : '')
        };
    };

    const extractMetadata = async file => {
        const fallbackName = fallbackNameFromFile(file);
        const fallbackSlug = sanitizeSlug(fallbackName);
        const inferredVersion = sanitizeVersionValue(deriveVersionFromName(file?.name));
        const derivedSlug = guessSlugFromFilename(file?.name);

        if (!window.JSZip || !(file instanceof File)) {
            return { file, slug: fallbackSlug, displayName: fallbackName, currentVersion: inferredVersion, derivedSlug };
        }

        try {
            const zip = await window.JSZip.loadAsync(file);
            const manifestTargets = ['fabric.mod.json', 'quilt.mod.json'];
            for (const target of manifestTargets) {
                const entry = getZipEntry(zip, target);
                if (!entry) continue;
                const content = await entry.async('string');
                try {
                    const data = JSON.parse(content);
                    if (data && (data.id || data.name)) {
                        const manifestVersion = sanitizeVersionValue(data.version);
                        return {
                            file,
                            slug: sanitizeSlug(data.id || fallbackSlug || data.name),
                            displayName: data.name || data.id || fallbackName,
                            source: target,
                            currentVersion: manifestVersion || inferredVersion,
                            derivedSlug
                        };
                    }
                } catch (error) {
                    console.warn(`Unable to parse ${target} inside ${file.name}`, error);
                }
            }

            const modsToml = getZipEntry(zip, 'META-INF/mods.toml');
            if (modsToml) {
                const text = await modsToml.async('string');
                const meta = parseModsToml(text);
                if (meta) {
                    return {
                        file,
                        slug: meta.slug || fallbackSlug,
                        displayName: meta.displayName || fallbackName,
                        source: 'mods.toml',
                        currentVersion: meta.version || inferredVersion,
                        derivedSlug
                    };
                }
            }
        } catch (error) {
            console.warn(`Unable to inspect ${file?.name || 'mod'}`, error);
        }

        return { file, slug: fallbackSlug, displayName: fallbackName, currentVersion: inferredVersion, derivedSlug };
    };

    const requestJson = async url => {
        const response = await fetch(url, { headers: buildHeaders() });
        if (!response.ok) {
            if (response.status === 404) return null;
            const error = new Error(`Request failed (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    };

    const fetchProjectByIdentifier = async identifier => {
        if (!identifier) return null;
        try {
            return await requestJson(`${API_BASE}/project/${encodeURIComponent(identifier)}`);
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    };

    const tokenizeComparable = value => {
        if (!value || typeof value !== 'string') return [];
        const stopwords = new Set([
            'fabric',
            'forge',
            'quilt',
            'neoforge',
            'liteloader',
            'rift',
            'minecraft',
            'mc',
            'edition',
            'mod'
        ]);
        return value
            .toLowerCase()
            .split(/[^a-z0-9]+/g)
            .filter(token => token && token.length >= 3 && !stopwords.has(token));
    };

    const searchProject = async (query, metadata, loader, gameVersion) => {
        if (!query) return null;
        const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&limit=10&facets=${SEARCH_FACETS}`, {
            headers: buildHeaders()
        });
        if (!response.ok) {
            console.warn('Project search failed', response.status, query);
            return null;
        }
        const data = await response.json();
        const hits = Array.isArray(data?.hits) ? data.hits : [];
        if (!hits.length) return null;

        const comparableValues = [
            metadata?.slug,
            metadata?.displayName,
            metadata?.derivedSlug,
            metadata?.file?.name ? fallbackNameFromFile(metadata.file) : null
        ].map(normalizeComparable).filter(Boolean);
        const tokenSet = new Set([
            ...tokenizeComparable(metadata?.slug),
            ...tokenizeComparable(metadata?.derivedSlug),
            ...tokenizeComparable(metadata?.displayName),
            ...tokenizeComparable(metadata?.file?.name ? fallbackNameFromFile(metadata.file) : '')
        ]);

        const scoredHits = hits
            .map(hit => {
                const slugComparable = normalizeComparable(hit.slug);
                const titleComparable = normalizeComparable(hit.title || hit.project_id || hit.slug);
                let score = 0;
                const candidateTokens = tokenizeComparable(hit.slug).concat(tokenizeComparable(hit.title));
                const tokenCoverage = [...tokenSet].every(token => !token || candidateTokens.some(c => c.includes(token)));
                if (tokenSet.size && !tokenCoverage) {
                    score -= 50;
                }
                comparableValues.forEach(value => {
                    if (!value) return;
                    if (slugComparable === value) score += 20;
                    else if (slugComparable && value.includes(slugComparable)) score += 8;
                    else if (slugComparable && slugComparable.includes(value)) score += 8;
                    if (titleComparable === value) score += 12;
                    else if (titleComparable && titleComparable.includes(value)) score += 5;
                    if (hit.project_id && normalizeComparable(hit.project_id) === value) score += 25;
                });
                if (!score && comparableValues.length) {
                    // small similarity score based on prefix
                    comparableValues.forEach(value => {
                        if (!value || !slugComparable) return;
                        if (slugComparable.startsWith(value.slice(0, 3))) score += 2;
                    });
                }
                return { hit, score, tokenCoverage };
            })
            .sort((a, b) => b.score - a.score);

        const ordered = scoredHits.length
            ? scoredHits
            : hits.map(hit => ({ hit, score: 0, tokenCoverage: true }));

        for (const { hit, tokenCoverage } of ordered) {
            if (tokenSet.size && !tokenCoverage) {
                continue;
            }
            const projectIdOrSlug = hit.project_id || hit.slug;
            const project = await fetchProjectByIdentifier(projectIdOrSlug);
            if (!project) continue;
            if (!loader && !gameVersion) {
                return project;
            }
            try {
                const version = await fetchProjectVersion(project.project_id || project.slug, loader, gameVersion);
                if (version) {
                    return project;
                }
            } catch (error) {
                console.warn('Version probe failed for candidate project', projectIdOrSlug, error);
            }
        }

        const best = scoredHits.find(entry => !tokenSet.size || entry.tokenCoverage) || scoredHits[0];
        const fallbackHit = best && best.hit;
        return fallbackHit ? fetchProjectByIdentifier(fallbackHit.project_id || fallbackHit.slug) : null;
    };

    const fetchProject = async (metadata, loader, gameVersion) => {
        const candidateFromName = metadata?.file?.name ? fallbackNameFromFile(metadata.file) : null;
        const primaryKey = sanitizeSlug(metadata?.slug || metadata?.derivedSlug || metadata?.displayName || candidateFromName);
        const overrideSlug = SLUG_OVERRIDES[primaryKey];
        if (overrideSlug) {
            const overrideProject = await fetchProjectByIdentifier(overrideSlug);
            if (overrideProject) return overrideProject;
        }

        const attempts = [];
        if (metadata?.slug) attempts.push(metadata.slug);
        if (metadata?.displayName) attempts.push(sanitizeSlug(metadata.displayName));
        if (metadata?.file?.name) attempts.push(sanitizeSlug(fallbackNameFromFile(metadata.file)));

        const visited = new Set();
        for (const identifier of attempts) {
            if (!identifier || visited.has(identifier)) continue;
            visited.add(identifier);
            const project = await fetchProjectByIdentifier(identifier);
            if (project) return project;
        }

        const searchTargets = [metadata?.displayName, metadata?.slug, metadata?.derivedSlug, metadata?.file?.name ? fallbackNameFromFile(metadata.file) : null];
        for (const query of searchTargets) {
            if (!query || visited.has(query)) continue;
            visited.add(query);
            const project = await searchProject(query, metadata, loader, gameVersion);
            if (project) return project;
        }

        return null;
    };

    const fetchProjectVersion = async (projectId, loader, gameVersion) => {
        if (!projectId) return null;
        const params = new URLSearchParams();
        if (loader) params.set('loaders', JSON.stringify([loader]));
        if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
        const url = `${API_BASE}/project/${projectId}/version?${params.toString()}`;
        const versions = await requestJson(url);
        if (!Array.isArray(versions) || !versions.length) return null;
        return versions.sort((a, b) => new Date(b.date_published || b.date_modified || 0) - new Date(a.date_published || a.date_modified || 0))[0];
    };

    const getEnvironmentLabel = (projectEnvs, versionEnvs) => {
        const all = [
            ...(Array.isArray(versionEnvs) ? versionEnvs : []),
            ...(Array.isArray(projectEnvs) ? projectEnvs : [])
        ].map(env => env?.toLowerCase()).filter(Boolean);
        const envSet = new Set(all);
        if (envSet.has('client') && envSet.has('server')) return 'Client & Server';
        if (envSet.has('server')) return 'Server';
        return 'Client';
    };

    const renderPlaceholder = (container, message) => {
        container.innerHTML = `<p class="mod-placeholder">${message}</p>`;
    };

    ready(() => {
        const dropZone = document.getElementById('modDropZone');
        if (!dropZone) return;

        const fileInput = document.getElementById('modFileInput');
        const browseButton = document.getElementById('browseModsButton');
        const selectionSummary = document.getElementById('modSelectionSummary');
        const fileList = document.getElementById('modFileList');
        const loaderSelect = document.getElementById('loaderSelect');
        const versionSelect = document.getElementById('versionSelect');
        const updateButton = document.getElementById('updateModsButton');
        const downloadAllButton = document.getElementById('downloadAllButton');
        const resetButton = document.getElementById('resetModsButton');
        const statusEl = document.getElementById('modStatus');
        const resultsContainer = document.getElementById('modResults');
        const dependencySection = document.getElementById('dependencySection');
        const dependencySummary = document.getElementById('dependencySummary');
        const dependencyList = document.getElementById('dependencyList');
        const missingSection = document.getElementById('missingModsSection');
        const missingSummary = document.getElementById('missingModsSummary');
        const missingList = document.getElementById('missingModsList');

        const state = {
            files: [],
            results: [],
            missing: [],
            dependencies: [],
            versionsLoaded: false
        };
        const knownIdentifiers = new Set();

        const recordIdentifier = value => {
            if (!value || typeof value !== 'string') return;
            knownIdentifiers.add(value.toLowerCase());
        };

        const hasIdentifier = value => {
            if (!value || typeof value !== 'string') return false;
            return knownIdentifiers.has(value.toLowerCase());
        };

        const updateSummary = () => {
            const count = state.files.length;
            selectionSummary.textContent = count ? `${count} mod${count === 1 ? '' : 's'} selected (max ${MAX_FILES})` : 'No mods selected.';
            if (!fileList) return;
            fileList.innerHTML = '';
            if (!count) return;
            const fragment = document.createDocumentFragment();
            state.files.slice(0, 8).forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fragment.appendChild(li);
            });
            if (count > 8) {
                const li = document.createElement('li');
                li.textContent = `…and ${count - 8} more mod${count - 8 === 1 ? '' : 's'}`;
                fragment.appendChild(li);
            }
            fileList.appendChild(fragment);
        };

        const setStatus = (message, tone = 'info') => {
            statusEl.textContent = message;
            statusEl.dataset.state = tone;
        };

        const RESET_CONFIRM_TIMEOUT = 12000;
        let resetConfirmTimer = null;
        let resetConfirmActive = false;

        const disableResetConfirm = () => {
            if (!resetButton) return;
            resetConfirmActive = false;
            resetButton.classList.remove('confirming');
            resetButton.textContent = 'Reset';
            if (resetConfirmTimer) {
                clearTimeout(resetConfirmTimer);
                resetConfirmTimer = null;
            }
        };

        const enableResetConfirm = () => {
            if (!resetButton) return;
            resetConfirmActive = true;
            resetButton.classList.add('confirming');
            resetButton.textContent = 'Confirm reset';
            if (resetConfirmTimer) clearTimeout(resetConfirmTimer);
            resetConfirmTimer = setTimeout(disableResetConfirm, RESET_CONFIRM_TIMEOUT);
        };

        const refreshActionState = () => {
            updateButton.disabled = !state.files.length || !state.versionsLoaded;
            downloadAllButton.disabled = !state.results.length;
            if (resetButton) {
                resetButton.disabled = !state.files.length;
                if (!state.files.length) {
                    disableResetConfirm();
                }
            }
        };

        const clearAll = () => {
            state.files = [];
            state.results = [];
            state.missing = [];
            state.dependencies = [];
            knownIdentifiers.clear();
            if (fileInput) fileInput.value = '';
            updateSummary();
            renderPlaceholder(resultsContainer, 'Drop mods above and press <strong>Update mods</strong> to fetch the latest releases.');
            missingSection.hidden = true;
            missingList.innerHTML = '';
            missingSummary.textContent = '';
            dependencySection.hidden = true;
            dependencyList.innerHTML = '';
            dependencySummary.textContent = '';
            downloadAllButton.disabled = true;
            setStatus('Upload mods to check for new releases.');
            disableResetConfirm();
            refreshActionState();
        };

        const applyBusyState = (button, label) => {
            const original = button.textContent;
            button.textContent = label;
            button.dataset.busy = 'true';
            button.disabled = true;
            return () => {
                button.textContent = original;
                button.dataset.busy = 'false';
                refreshActionState();
            };
        };

        const recordProject = (project, version) => {
            if (!project && !version) return;
            if (project?.project_id) recordIdentifier(project.project_id);
            if (project?.slug) recordIdentifier(project.slug);
            if (Array.isArray(project?.versions)) {
                project.versions.forEach(ver => recordIdentifier(ver));
            }
            if (version?.id) recordIdentifier(version.id);
            if (Array.isArray(version?.files)) {
                version.files.forEach(file => recordIdentifier(file?.filename));
            }
        };

        const normalizeFileList = source => {
            if (!source) return [];
            if (Array.isArray(source)) return source;
            if (source instanceof FileList) return Array.from(source);
            return [];
        };

        const getFilesFromDataTransfer = dataTransfer => {
            if (!dataTransfer) return [];
            const files = Array.from(dataTransfer.files || []);
            if (files.length) return files;
            const items = Array.from(dataTransfer.items || []);
            return items
                .map(item => (item.kind === 'file' ? item.getAsFile() : null))
                .filter(Boolean);
        };

        const handleFiles = (incomingList, options = {}) => {
            const { notifyWhenEmpty = false } = options;
            const incoming = normalizeFileList(incomingList);
            if (!incoming.length) {
                if (notifyWhenEmpty) {
                    setStatus('No files detected. Please drop actual .jar files from your mods folder.', 'warning');
                }
                return;
            }
            const valid = incoming.filter(file => /\.jar$/i.test(file.name));
            const ignored = incoming.length - valid.length;
            if (!valid.length) {
                setStatus('Only .jar mod files are supported. Nothing was added.', 'error');
                return;
            }
            if (ignored) {
                setStatus(`Ignored ${ignored} file${ignored === 1 ? '' : 's'} that were not .jar mods.`, 'warning');
            }
            const existingNames = new Set(state.files.map(file => file.name.toLowerCase()));
            const deduped = valid.filter(file => {
                const key = file.name.toLowerCase();
                if (existingNames.has(key)) return false;
                existingNames.add(key);
                return true;
            });
            if (!deduped.length) {
                setStatus('Those mods are already in the list.', 'warning');
                return;
            }
            const availableSlots = MAX_FILES - state.files.length;
            if (availableSlots <= 0) {
                setStatus(`Limit reached. Remove a few mods to add different ones.`, 'warning');
                return;
            }
            const accepted = deduped.slice(0, availableSlots);
            if (!accepted.length) return;
            state.files = [...state.files, ...accepted];
            updateSummary();
            setStatus(`Ready to update ${state.files.length} mod${state.files.length === 1 ? '' : 's'}.`);
            refreshActionState();
        };

        const isSupportedVersionString = version => {
            if (!version || typeof version !== 'string') return false;
            const match = version.trim().match(/^(\d+)(?:\.(\d+))?/);
            if (!match) return false;
            const major = Number(match[1]);
            const minor = Number(match[2] ?? 0);
            if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
            if (major > MIN_SUPPORTED_MAJOR) return true;
            if (major < MIN_SUPPORTED_MAJOR) return false;
            return minor >= MIN_SUPPORTED_MINOR;
        };

        const isReleaseEntry = entry => {
            const type = (entry?.version_type || entry?.type || entry?.release_type || '').toLowerCase();
            if (type) return type === 'release';
            const label = (entry?.version || '').toLowerCase();
            return !/alpha|beta|snapshot|rc|pre/i.test(label);
        };

        const loadVersions = async () => {
            try {
                const data = await requestJson(GAME_VERSIONS_ENDPOINT);
                const versions = Array.isArray(data)
                    ? data
                        .filter(item => item?.version && isReleaseEntry(item) && isSupportedVersionString(item.version))
                        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
                    : [];
                if (!versions.length) throw new Error('No versions returned');
                versionSelect.innerHTML = '';
                versions.forEach((entry, index) => {
                    const option = document.createElement('option');
                    option.value = entry.version;
                    option.textContent = entry.version;
                    if (index === 0) option.selected = true;
                    versionSelect.appendChild(option);
                });
                versionSelect.disabled = false;
                state.versionsLoaded = true;
                refreshActionState();
            } catch (error) {
                console.warn('Unable to fetch game versions, using fallback list.', error);
                versionSelect.innerHTML = '';
                FALLBACK_VERSIONS.forEach((version, index) => {
                    const option = document.createElement('option');
                    option.value = version;
                    option.textContent = version;
                    if (index === 0) option.selected = true;
                    versionSelect.appendChild(option);
                });
                versionSelect.disabled = false;
                state.versionsLoaded = true;
                refreshActionState();
            }
        };

        const renderResults = () => {
            if (!state.results.length) {
                renderPlaceholder(resultsContainer, 'No updates were found for the selected version.');
                return;
            }
            const fragment = document.createDocumentFragment();
            state.results.forEach((result, index) => {
                const card = document.createElement('article');
                card.className = 'mod-card';

                const header = document.createElement('div');
                header.className = 'mod-card-header';

                const icon = document.createElement('img');
                icon.className = 'mod-icon';
                icon.src = result.project.icon_url || '';
                icon.alt = `${result.project.title} icon`;
                header.appendChild(icon);

                const copy = document.createElement('div');
                copy.className = 'mod-card-copy';
                const titleLink = document.createElement('a');
                titleLink.className = 'mod-link';
                titleLink.href = `https://modrinth.com/mod/${result.project.slug || result.project.project_id || ''}`;
                titleLink.target = '_blank';
                titleLink.rel = 'noopener noreferrer';
                const title = document.createElement('h3');
                title.textContent = result.project.title;
                titleLink.appendChild(title);
                const description = document.createElement('p');
                description.className = 'mod-description';
                description.textContent = result.project.description || 'No description provided.';
                copy.append(titleLink, description);
                header.appendChild(copy);

                const downloadButton = document.createElement('button');
                downloadButton.className = 'primary';
                downloadButton.type = 'button';
                downloadButton.dataset.downloadIndex = String(index);
                downloadButton.textContent = 'Download latest';
                header.appendChild(downloadButton);

                card.appendChild(header);

                const meta = document.createElement('dl');
                meta.className = 'mod-meta';

                const metaItems = [
                    { label: 'Version', value: result.version.version_number },
                    {
                        label: 'Last updated',
                        value: formatDate.format(new Date(result.version.date_published || result.version.date_modified || Date.now()))
                    },
                    { label: 'Downloads', value: formatNumber.format(result.project.downloads || 0) },
                    { label: 'Environment', value: getEnvironmentLabel(result.project?.environments, result.version?.environments) }
                ];

                metaItems.forEach(item => {
                    const container = document.createElement('div');
                    const dt = document.createElement('dt');
                    dt.textContent = item.label;
                    const dd = document.createElement('dd');
                    dd.textContent = item.value;
                    container.append(dt, dd);
                    meta.appendChild(container);
                });

                card.appendChild(meta);
                fragment.appendChild(card);
            });
            resultsContainer.innerHTML = '';
            resultsContainer.appendChild(fragment);
        };

        const buildMetaEntry = (label, value) => {
            const container = document.createElement('div');
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = value;
            container.append(dt, dd);
            return container;
        };

        const renderDependencies = () => {
            if (!state.dependencies.length) {
                dependencySection.hidden = true;
                dependencyList.innerHTML = '';
                dependencySummary.textContent = '';
                return;
            }
            dependencySection.hidden = false;
            dependencySummary.textContent = `${state.dependencies.length} required dependenc${state.dependencies.length === 1 ? 'y is' : 'ies are'} missing.`;
            dependencyList.innerHTML = '';
            const fragment = document.createDocumentFragment();
            state.dependencies.forEach(entry => {
                const card = document.createElement('article');
                card.className = 'mod-card dependency-card';

                const header = document.createElement('div');
                header.className = 'mod-card-header';

                const icon = document.createElement('img');
                icon.className = 'mod-icon';
                icon.src = entry.project?.icon_url || FALLBACK_ICON;
                icon.alt = `${entry.project?.title || entry.displayName || 'Dependency'} icon`;
                header.appendChild(icon);

                const copy = document.createElement('div');
                copy.className = 'mod-card-copy';
                const title = document.createElement('h3');
                title.textContent = entry.project?.title || entry.displayName || entry.dependency?.project_id || 'Dependency';
                const description = document.createElement('p');
                description.className = 'mod-description';
                const parents = entry.parents?.length ? `Required by: ${entry.parents.join(', ')}` : 'Required dependency not provided.';
                description.textContent = parents;
                copy.append(title, description);
                header.appendChild(copy);
                card.appendChild(header);

                const metaItems = [
                    { label: 'Version', value: entry.version?.version_number || '—' },
                    {
                        label: 'Last updated',
                        value: entry.version?.date_published
                            ? formatDate.format(new Date(entry.version.date_published))
                            : entry.version?.date_modified
                                ? formatDate.format(new Date(entry.version.date_modified))
                                : '—'
                    },
                    {
                        label: 'Downloads',
                        value: formatNumber.format(entry.project?.downloads || 0)
                    },
                    { label: 'Environment', value: getEnvironmentLabel(entry.project?.environments, entry.version?.environments) }
                ];
                const meta = document.createElement('dl');
                meta.className = 'mod-meta';
                metaItems.forEach(item => meta.appendChild(buildMetaEntry(item.label, item.value)));
                card.appendChild(meta);
                fragment.appendChild(card);
            });
            dependencyList.appendChild(fragment);
        };

        const renderMissing = () => {
            if (!state.missing.length) {
                missingSection.hidden = true;
                missingList.innerHTML = '';
                return;
            }
            missingSection.hidden = false;
            missingSummary.textContent = `${state.missing.length} mod${state.missing.length === 1 ? '' : 's'} were skipped (no compatible release for ${versionSelect.value} or already current).`;
            missingList.innerHTML = '';
            const fragment = document.createDocumentFragment();
            state.missing.forEach(entry => {
                const card = document.createElement('article');
                card.className = 'mod-card missing-card';

                const header = document.createElement('div');
                header.className = 'mod-card-header';

                const icon = document.createElement('img');
                icon.className = 'mod-icon';
                icon.src = entry.project?.icon_url || FALLBACK_ICON;
                icon.alt = `${entry.displayName || entry.file?.name || 'Mod'} icon`;
                header.appendChild(icon);

                const copy = document.createElement('div');
                copy.className = 'mod-card-copy';
                const title = document.createElement('h3');
                title.textContent = entry.displayName || entry.file?.name || entry.slug || 'Unknown mod';
                const description = document.createElement('p');
                description.className = 'mod-description';
                description.textContent = entry.reason || 'No compatible release found.';
                copy.append(title, description);
                header.appendChild(copy);

                card.appendChild(header);

                const metaItems = [
                    { label: 'Version', value: entry.version?.version_number || entry.currentVersion || '—' },
                    {
                        label: 'Last updated',
                        value: entry.version?.date_published
                            ? formatDate.format(new Date(entry.version.date_published))
                            : entry.version?.date_modified
                                ? formatDate.format(new Date(entry.version.date_modified))
                                : entry.project?.date_modified
                                    ? formatDate.format(new Date(entry.project.date_modified))
                                    : entry.project?.date_created
                                        ? formatDate.format(new Date(entry.project.date_created))
                                        : '—'
                    },
                    { label: 'Downloads', value: formatNumber.format(entry.project?.downloads || 0) },
                    { label: 'Environment', value: getEnvironmentLabel(entry.project?.environments, entry.version?.environments) }
                ];

                const meta = document.createElement('dl');
                meta.className = 'mod-meta';
                metaItems.forEach(item => {
                    meta.appendChild(buildMetaEntry(item.label, item.value));
                });
                card.appendChild(meta);

                fragment.appendChild(card);
            });
            missingList.appendChild(fragment);
        };

        const downloadSingle = result => {
            if (!result?.file?.url) return;
            const link = document.createElement('a');
            link.href = result.file.url;
            link.download = result.file.filename || `${result.project.slug || result.project.project_id}.jar`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        };

        const downloadAll = async () => {
            if (!state.results.length || !window.JSZip) return;
            const releaseBusy = applyBusyState(downloadAllButton, 'Preparing…');
            try {
                const zip = new window.JSZip();
                for (const result of state.results) {
                    if (!result?.file?.url) continue;
                    try {
                        const response = await fetch(result.file.url);
                        if (!response.ok) continue;
                        const buffer = await response.arrayBuffer();
                        const filename = result.file.filename || `${result.project.slug || result.project.project_id}-${result.version.version_number}.jar`;
                        zip.file(filename, buffer);
                    } catch (error) {
                        console.warn('Unable to download', result?.project?.title, error);
                    }
                }
                const entries = Object.keys(zip.files || {});
                if (!entries.length) {
                    setStatus('Unable to download any mod files.', 'error');
                    return;
                }
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'mods.zip';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setStatus(`Downloaded ${entries.length} mod${entries.length === 1 ? '' : 's'} in a single .zip.`, 'success');
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Download all failed', error);
                setStatus('Unable to build the zip file.', 'error');
            } finally {
                releaseBusy();
            }
        };

        const runUpdate = async () => {
            if (!state.files.length) {
                setStatus('Upload at least one mod to continue.', 'error');
                return;
            }
            const gameVersion = versionSelect.value;
            if (!gameVersion) {
                setStatus('Select a Minecraft version first.', 'error');
                return;
            }
            const loader = loaderSelect.value || 'fabric';
            const releaseBusy = applyBusyState(updateButton, 'Updating…');
            downloadAllButton.disabled = true;
            setStatus('Reading mod metadata…');

            try {
                const metadata = await Promise.all(state.files.map(file => extractMetadata(file)));
                const results = [];
                const missing = [];
                const dependencyCandidates = new Map();

                const enqueueDependency = (dependency, parentProject) => {
                    if (!dependency || dependency.dependency_type !== 'required') return;
                    const key = dependency.project_id || dependency.project_slug || dependency.version_id || dependency.file_name;
                    if (!key) return;
                    const idMatches = [dependency.project_id, dependency.project_slug, dependency.version_id, dependency.file_name].some(hasIdentifier);
                    if (idMatches) return;
                    const entry = dependencyCandidates.get(key) || {
                        dependency,
                        parents: new Set(),
                        projectId: dependency.project_id || null,
                        projectSlug: dependency.project_slug || null,
                        versionId: dependency.version_id || null,
                        fileName: dependency.file_name || null
                    };
                    if (dependency.project_id) entry.projectId = dependency.project_id;
                    if (dependency.project_slug) entry.projectSlug = dependency.project_slug;
                    if (dependency.version_id) entry.versionId = dependency.version_id;
                    if (dependency.file_name) entry.fileName = dependency.file_name;
                    if (parentProject) entry.parents.add(parentProject.title || parentProject.slug || parentProject.project_id || 'Your mod');
                    dependencyCandidates.set(key, entry);
                };

                let index = 0;
                for (const entry of metadata) {
                    index += 1;
                    setStatus(`Checking ${entry.displayName || entry.slug || entry.file?.name} (${index}/${metadata.length})…`);
                    let project = null;
                    let version = null;
                    recordIdentifier(entry.slug);
                    if (entry.file?.name) recordIdentifier(entry.file.name);
                    try {
                        project = await fetchProject(entry, loader, gameVersion);
                        if (!project) {
                            missing.push({ ...entry, reason: 'No Modrinth project found.' });
                            continue;
                        }
                        recordProject(project);
                        version = await fetchProjectVersion(project.project_id || project.slug, loader, gameVersion);
                        if (!version) {
                            missing.push({
                                ...entry,
                                displayName: project.title || entry.displayName,
                                project,
                                reason: 'No releases for this loader/version.'
                            });
                            continue;
                        }
                        recordProject(project, version);
                        (version.dependencies || []).forEach(dep => enqueueDependency(dep, project));
                        const file = version.files?.find(f => f.primary) || version.files?.[0];
                        if (!file) {
                            missing.push({
                                ...entry,
                                displayName: project.title || entry.displayName,
                                project,
                                version,
                                reason: 'No downloadable files on Modrinth release.'
                            });
                            continue;
                        }
                        const remoteFilename = file.filename ? file.filename.toLowerCase() : '';
                        const localFilename = entry.file?.name ? entry.file.name.toLowerCase() : '';
                        const alreadyHasLatestFile = remoteFilename && localFilename && remoteFilename === localFilename;

                        if (alreadyHasLatestFile || versionsMatch(entry.currentVersion, version.version_number)) {
                            missing.push({
                                ...entry,
                                displayName: project.title || entry.displayName,
                                project,
                                version,
                                reason: alreadyHasLatestFile
                                    ? 'Latest file already installed.'
                                    : version.version_number
                                        ? `Latest version (${version.version_number}) already installed.`
                                        : 'Latest version already installed.'
                            });
                            continue;
                        }
                        results.push({
                            project,
                            version,
                            file,
                            displayName: project.title || entry.displayName,
                            currentVersion: entry.currentVersion || ''
                        });
                    } catch (error) {
                        console.error('Mod update failed', error);
                        missing.push({
                            ...entry,
                            ...(project ? { project } : {}),
                            ...(version ? { version } : {}),
                            reason: 'Unexpected error while contacting Modrinth.'
                        });
                    }
                }
                state.results = results;
                state.missing = missing;
                const dependencyResults = [];
                for (const candidate of dependencyCandidates.values()) {
                    const identifierMatches = [
                        candidate.projectId,
                        candidate.projectSlug,
                        candidate.versionId,
                        candidate.fileName
                    ].some(hasIdentifier);
                    if (identifierMatches) {
                        continue;
                    }
                    try {
                        const dependencyProject = await fetchProjectByIdentifier(candidate.projectId || candidate.projectSlug || candidate.versionId);
                        let dependencyVersion = null;
                        if (dependencyProject) {
                            dependencyVersion = await fetchProjectVersion(
                                dependencyProject.project_id || dependencyProject.slug,
                                loader,
                                gameVersion
                            );
                        }
                        if (dependencyProject) {
                            const alreadySatisfied = hasIdentifier(dependencyProject.project_id) || hasIdentifier(dependencyProject.slug);
                            recordProject(dependencyProject, dependencyVersion);
                            if (alreadySatisfied) {
                                continue;
                            }
                            dependencyResults.push({
                                dependency: candidate.dependency,
                                project: dependencyProject,
                                version: dependencyVersion,
                                parents: Array.from(candidate.parents),
                                displayName: dependencyProject.title
                            });
                        } else {
                            dependencyResults.push({
                                dependency: candidate.dependency,
                                project: null,
                                version: null,
                                parents: Array.from(candidate.parents),
                                displayName: candidate.dependency?.project_id || candidate.dependency?.project_slug || 'Dependency'
                            });
                        }
                    } catch (error) {
                        console.warn('Unable to fetch dependency project', candidate, error);
                    }
                }
                state.dependencies = dependencyResults;
                renderResults();
                renderDependencies();
                renderMissing();
                if (results.length) {
                    setStatus(`Found ${results.length} update${results.length === 1 ? '' : 's'} for ${gameVersion}.`, 'success');
                } else {
                    setStatus('No updates found for the selected loader/version.', 'warning');
                }
            } catch (error) {
                console.error('Unable to update mods', error);
                setStatus('Unable to complete the update. Please try again.', 'error');
            } finally {
                releaseBusy();
                refreshActionState();
            }
        };

        const preventDefaults = event => {
            event.preventDefault();
            event.stopPropagation();
        };

        const highlightDropZone = () => dropZone.classList.add('is-dragover');
        const unhighlightDropZone = () => dropZone.classList.remove('is-dragover');

        dropZone.addEventListener('click', () => fileInput?.click());
        dropZone.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                preventDefaults(event);
                fileInput?.click();
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, event => {
                preventDefaults(event);
                highlightDropZone();
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, event => {
                preventDefaults(event);
                unhighlightDropZone();
            });
        });

        dropZone.addEventListener('drop', event => {
            const files = getFilesFromDataTransfer(event.dataTransfer);
            handleFiles(files, { notifyWhenEmpty: true });
        });

        browseButton?.addEventListener('click', event => {
            event?.preventDefault();
            event?.stopPropagation();
            fileInput?.click();
        });

        fileInput?.addEventListener('change', event => {
            handleFiles(event.target.files);
            event.target.value = '';
        });

        resetButton?.addEventListener('click', event => {
            event.preventDefault();
            if (!state.files.length) return;
            if (!resetConfirmActive) {
                enableResetConfirm();
                return;
            }
            disableResetConfirm();
            clearAll();
        });
        updateButton?.addEventListener('click', runUpdate);
        downloadAllButton?.addEventListener('click', downloadAll);

        resultsContainer?.addEventListener('click', event => {
            const button = event.target.closest('[data-download-index]');
            if (!button) return;
            const index = Number(button.dataset.downloadIndex);
            const result = state.results[index];
            downloadSingle(result);
        });

        loadVersions();
        clearAll();
    });
})();
