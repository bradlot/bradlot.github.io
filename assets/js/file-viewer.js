(() => {
    const ready = callback => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    };

    ready(() => {
        const rootElement = document.documentElement;
        const dropZone = document.getElementById('viewerDropZone');
        const fileInput = document.getElementById('fileInput');
        const uploadButton = document.getElementById('uploadButton');
        const clearButton = document.getElementById('clearButton');
        const dropFileLabel = document.getElementById('viewerFileName');
        const copyButton = document.getElementById('copyButton');
        const downloadButton = document.getElementById('downloadButton');
        const downloadSelectedButton = document.getElementById('downloadSelectedButton');
        const downloadZipButton = document.getElementById('downloadZipButton');
        const exportModal = document.getElementById('exportModal');
        const exportModalOverlay = document.getElementById('exportModalOverlay');
        const closeExportModalButton = document.getElementById('closeExportModal');
        const exportFileList = document.getElementById('exportFileList');
        const dropPane = document.querySelector('.viewer-drop-pane');
        const previewPane = document.querySelector('.viewer-preview-pane');
        const previewShell = document.querySelector('.preview-shell');
        const layoutMediaQuery = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
        const fileList = document.getElementById('fileList');
        const fileCount = document.getElementById('fileCount');
        const editor = document.getElementById('fileEditor');
        const activeFileName = document.getElementById('activeFileName');
        const activeFileMeta = document.getElementById('activeFileMeta');
        const selectAllCheckbox = document.getElementById('selectAllFiles');
        const clearSelectionButton = document.getElementById('clearSelectionButton');
        const selectedCountLabel = document.getElementById('selectedCount');
        const exportExtensionInput = document.getElementById('exportExtension');

        if (!dropZone || !fileInput || !editor) {
            return;
        }

        if (exportModal) {
            exportModal.setAttribute('aria-hidden', exportModal.classList.contains('hidden') ? 'true' : 'false');
        }

        const supportsClipboard = Boolean(navigator.clipboard);
        const copyButtonLabel = copyButton?.textContent?.trim() || 'Copy text';
        if (!supportsClipboard && copyButton) {
            copyButton.disabled = true;
            copyButton.title = 'Clipboard access is not available in this browser.';
        }

        const TEXT_EXTENSIONS = [
            '.txt', '.md', '.markdown', '.mdx', '.tsv', '.json', '.xml', '.html', '.htm', '.css', '.scss',
            '.sass', '.less', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.r', '.rb', '.php', '.java',
            '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.swift', '.kt', '.sql', '.yaml', '.yml', '.ini', '.cfg',
            '.conf', '.log', '.sh', '.bash', '.zsh', '.ps1', '.pl', '.lua', '.tex', '.m', '.ipynb', '.properties', '.gradle'
        ];
        const TEXT_MIME_ALLOWLIST = [
            'text/plain',
            'application/json',
            'application/javascript',
            'application/xml',
            'application/sql',
            'application/x-sh',
            'application/x-python-code',
            'application/x-httpd-php',
            'application/x-yaml',
            'application/x-shellscript'
        ];

        const STORAGE_KEY = 'fileViewerState';

        const loadPersistedState = () => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.files)) return null;
                return parsed;
            } catch (error) {
                console.warn('Unable to load saved viewer files.', error);
                return null;
            }
        };

        const state = {
            files: [],
            activeId: null,
            selectedIds: new Set(),
            exportExtension: ''
        };

        const persistState = () => {
            try {
                const payload = JSON.stringify({
                    files: state.files,
                    activeId: state.activeId,
                    selectedIds: Array.from(state.selectedIds),
                    exportExtension: state.exportExtension || ''
                });
                localStorage.setItem(STORAGE_KEY, payload);
            } catch (error) {
                console.warn('Unable to persist viewer files.', error);
            }
        };

        const clearPersistedState = () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (error) {
                console.warn('Unable to clear saved viewer files.', error);
            }
        };

        const formatBytes = bytes => {
            if (!Number.isFinite(bytes)) return '';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };

        const formatTimestamp = value => {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        };

        const formatDateOnly = value => {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
        };

        const sanitizeExtension = value => {
            if (!value) return '';
            const trimmed = String(value).trim();
            if (!trimmed) return '';
            const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
            return withDot.replace(/^\.+/, '.');
        };

        const getExportExtension = () => sanitizeExtension(state.exportExtension || '');

        const buildDownloadName = (fileName, extension) => {
            if (!extension) return fileName;
            const lastDot = fileName.lastIndexOf('.');
            const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
            return `${base}${extension}`;
        };

        const escapeAttribute = value => String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const pruneSelection = () => {
            const validIds = new Set(state.files.map(file => file.id));
            let changed = false;
            state.selectedIds.forEach(id => {
                if (!validIds.has(id)) {
                    state.selectedIds.delete(id);
                    changed = true;
                }
            });
            return changed;
        };

        const syncSelectionState = () => {
            const changed = pruneSelection();
            if (changed) persistState();
            return changed;
        };

        const getSelectedRecords = () => state.files.filter(file => state.selectedIds.has(file.id));

        const renderExportList = () => {
            if (!exportFileList) return;
            if (!state.files.length) {
                exportFileList.innerHTML = '<li class="viewer-export-empty">Upload files to enable downloads.</li>';
                return;
            }

            const markup = state.files.map(file => {
                const isSelected = state.selectedIds.has(file.id);
                const details = [formatBytes(file.size)]
                    .concat(file.modifiedTime ? [`Updated ${formatTimestamp(file.modifiedTime)}`] : [])
                    .filter(Boolean)
                    .join(' • ');
                const badge = file.id === state.activeId ? '<span class="viewer-export-badge">Active</span>' : '';
                return `
                    <li class="viewer-export-file-row">
                        <label class="viewer-export-checkbox">
                            <input type="checkbox" data-export-file-id="${file.id}" ${isSelected ? 'checked' : ''}>
                            <span class="viewer-export-file-details">
                                <span class="viewer-export-file-name">${file.name}</span>
                                <span class="viewer-export-file-meta">${[details, badge].filter(Boolean).join(' • ') || 'Plain text'}</span>
                            </span>
                        </label>
                    </li>
                `;
            }).join('');

            exportFileList.innerHTML = markup;
        };

        const updateSelectionSummary = () => {
            const selectedCount = getSelectedRecords().length;
            const total = state.files.length;

            if (selectAllCheckbox) {
                selectAllCheckbox.disabled = total === 0;
                selectAllCheckbox.checked = total > 0 && selectedCount === total;
                selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < total;
            }

            if (clearSelectionButton) {
                clearSelectionButton.disabled = selectedCount === 0;
            }

            if (selectedCountLabel) {
                selectedCountLabel.textContent = selectedCount === 0
                    ? 'No files selected'
                    : selectedCount === 1
                        ? '1 file selected'
                        : `${selectedCount} files selected`;
            }

            if (downloadSelectedButton) {
                downloadSelectedButton.disabled = selectedCount === 0;
                downloadSelectedButton.textContent = selectedCount > 1
                    ? `Download ${selectedCount} files`
                    : 'Download selected';
            }

            if (downloadZipButton) {
                const hasZipSupport = Boolean(window.JSZip);
                downloadZipButton.disabled = total === 0 || !hasZipSupport;
                downloadZipButton.textContent = selectedCount
                    ? 'Download ZIP (selected)'
                    : 'Download ZIP (all)';
                if (hasZipSupport) {
                    downloadZipButton.removeAttribute('title');
                } else {
                    downloadZipButton.title = 'ZIP downloads are not available in this browser.';
                }
            }
        };

        const refreshExportPanel = (options = {}) => {
            const { autoSelectActive = false } = options;
            syncSelectionState();
            if (autoSelectActive && !state.selectedIds.size && state.activeId) {
                state.selectedIds.add(state.activeId);
                persistState();
            }
            renderExportList();
            updateSelectionSummary();
        };

        const isExportModalOpen = () => Boolean(exportModal && !exportModal.classList.contains('hidden'));

        const openExportModal = () => {
            if (!exportModal || !state.files.length) return;
            refreshExportPanel({ autoSelectActive: true });
            exportModal.classList.remove('hidden');
            exportModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('viewer-modal-open');
            rootElement.classList.add('viewer-modal-open');
            setTimeout(() => {
                exportExtensionInput?.focus();
            }, 0);
        };

        const closeExportModal = () => {
            if (!exportModal) return;
            const wasOpen = !exportModal.classList.contains('hidden');
            exportModal.classList.add('hidden');
            exportModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('viewer-modal-open');
            rootElement.classList.remove('viewer-modal-open');
            if (wasOpen) {
                downloadButton?.focus();
            }
        };

        const triggerDownload = (content, mimeType, filename) => {
            const blob = content instanceof Blob ? content : new Blob([content || ''], { type: mimeType || 'text/plain' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename || 'file.txt';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        };

        const setStatus = () => {};

        const generateId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

        const restoredState = loadPersistedState();
        if (restoredState?.files?.length) {
            state.files = restoredState.files
                .filter(file => file && typeof file.content === 'string')
                .map(file => ({
                    id: file.id || generateId(),
                    name: file.name || 'Untitled.txt',
                    size: Number(file.size) || 0,
                    type: file.type || 'text/plain',
                    modifiedTime: file.modifiedTime || Date.now(),
                    content: file.content
                }));
            if (state.files.length) {
                const hasActive = state.files.some(file => file.id === restoredState.activeId);
                state.activeId = hasActive ? restoredState.activeId : state.files[0].id;
            }
        }

        if (Array.isArray(restoredState?.selectedIds)) {
            restoredState.selectedIds.forEach(id => state.selectedIds.add(id));
        }

        if (typeof restoredState?.exportExtension === 'string') {
            const sanitized = sanitizeExtension(restoredState.exportExtension);
            state.exportExtension = sanitized || restoredState.exportExtension || '';
        }

        if (exportExtensionInput) {
            exportExtensionInput.value = state.exportExtension;
        }

        const getActiveFile = () => state.files.find(file => file.id === state.activeId) || null;

        const isTextFile = file => {
            if (!file) return false;
            const name = (file.name || '').toLowerCase();
            const type = (file.type || '').toLowerCase();
            if (type.startsWith('text/')) return true;
            if (TEXT_MIME_ALLOWLIST.includes(type)) return true;
            return TEXT_EXTENSIONS.some(ext => name.endsWith(ext));
        };

        const shouldSyncColumns = () => {
            if (layoutMediaQuery) return layoutMediaQuery.matches;
            return window.innerWidth >= 960;
        };

        const syncColumnHeights = () => {
            if (!dropPane || !previewPane) return;
            if (!shouldSyncColumns()) {
                dropPane.style.height = '';
                dropPane.style.maxHeight = '';
                return;
            }
            const previewHeight = previewPane.getBoundingClientRect().height;
            if (!previewHeight) return;
            dropPane.style.height = `${previewHeight}px`;
            dropPane.style.maxHeight = `${previewHeight}px`;
        };

        if (window.ResizeObserver) {
            const previewObserver = new ResizeObserver(() => {
                syncColumnHeights();
            });
            previewPane && previewObserver.observe(previewPane);
            previewShell && previewObserver.observe(previewShell);
            editor && previewObserver.observe(editor);
        }

        window.addEventListener('resize', syncColumnHeights);
        layoutMediaQuery?.addEventListener?.('change', syncColumnHeights);
        if (layoutMediaQuery && layoutMediaQuery.addEventListener === undefined && layoutMediaQuery.addListener) {
            layoutMediaQuery.addListener(syncColumnHeights);
        }

        const renderFileList = () => {
            if (!fileList || !fileCount) return;
            if (!state.files.length) {
                fileList.innerHTML = '<li class="viewer-file-empty">Drop files to populate your library.</li>';
                fileCount.textContent = '0 files';
                refreshExportPanel();
                syncColumnHeights();
                return;
            }

            const markup = state.files.map(file => {
                const isActive = file.id === state.activeId;
                const detailParts = [];
                const sizeLabel = formatBytes(file.size);
                if (sizeLabel) detailParts.push(sizeLabel);
                const updatedLabel = file.modifiedTime ? formatDateOnly(file.modifiedTime) : '';
                if (updatedLabel) detailParts.push(updatedLabel);
                const metaMarkup = (detailParts.length ? detailParts : ['Plain'])
                    .map(part => `<span class="viewer-file-chip">${escapeAttribute(part)}</span>`)
                    .join('');
                const safeName = escapeAttribute(file.name || 'file');
                const extMatch = (file.name || '').match(/\.([^.]+)$/);
                const extension = extMatch ? extMatch[1] : '';
                const typeLabel = extension ? `<span class="viewer-file-chip viewer-file-type-chip">${escapeAttribute(extension.toUpperCase())}</span>` : '';
                const baseName = escapeAttribute((file.name || '').replace(/\.[^/.]+$/, '') || 'file');
                return `
                    <li class="viewer-file-row${isActive ? ' active' : ''}">
                        <button type="button" class="viewer-file-delete" data-delete-file-id="${file.id}" aria-label="Remove ${safeName}">
                            <svg class="viewer-file-delete-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                <path d="M6 2 5 3H3v1h10V3h-2l-1-1H6zm-2 4v7c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V6H4zm2 1h1v5H6V7zm4 0h-1v5h1V7z"/>
                            </svg>
                            <span class="sr-only">Remove ${safeName}</span>
                        </button>
                        <button type="button" role="option" aria-selected="${isActive}" class="viewer-file-button${isActive ? ' active' : ''}" data-file-id="${file.id}">
                            <div class="viewer-file-card">
                                <div class="viewer-file-heading">
                                    <span class="viewer-file-name">${baseName}</span>
                                </div>
                                <div class="viewer-file-meta">${typeLabel}${metaMarkup}</div>
                            </div>
                        </button>
                    </li>
                `;
            }).join('');

            fileList.innerHTML = markup;
            fileCount.textContent = state.files.length === 1 ? '1 file' : `${state.files.length} files`;
            refreshExportPanel();
            syncColumnHeights();
        };

        const renderActiveFile = () => {
            const active = getActiveFile();
            if (!active) {
                editor.value = 'Drop files on the left to preview them here.';
                editor.classList.add('viewer-editor-empty');
                editor.disabled = true;
                downloadButton && (downloadButton.disabled = true);
                if (copyButton) {
                    copyButton.disabled = true;
                    copyButton.textContent = copyButtonLabel;
                }
                activeFileName && (activeFileName.textContent = 'No file selected');
                activeFileMeta && (activeFileMeta.textContent = 'Drop files on the left to load their contents.');
                if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
                renderFileList();
                return;
            }

            editor.disabled = false;
            editor.classList.remove('viewer-editor-empty');
            editor.value = active.content || '';
            if (downloadButton) downloadButton.disabled = false;
            if (copyButton && supportsClipboard) {
                copyButton.disabled = false;
                copyButton.textContent = copyButtonLabel;
            }
            if (activeFileName) activeFileName.textContent = active.name;
            if (activeFileMeta) {
                const parts = [];
                if (active.size) parts.push(formatBytes(active.size));
                if (active.type) parts.push(active.type);
                if (active.modifiedTime) parts.push(`Updated ${formatTimestamp(active.modifiedTime)}`);
                activeFileMeta.textContent = parts.length ? parts.join(' • ') : 'Editable plain text';
            }
            if (dropFileLabel) {
                const sizeLabel = formatBytes(active.size);
                dropFileLabel.textContent = sizeLabel ? `${active.name} (${sizeLabel})` : active.name;
            }
            renderFileList();
        };

        const deleteFileById = fileId => {
            const index = state.files.findIndex(file => file.id === fileId);
            if (index === -1) return;
            const removedActive = state.activeId === fileId;
            state.files.splice(index, 1);
            state.selectedIds.delete(fileId);
            if (!state.files.length) {
                state.activeId = null;
            } else if (removedActive) {
                const fallbackIndex = index < state.files.length ? index : state.files.length - 1;
                state.activeId = state.files[fallbackIndex]?.id || state.files[0].id;
            }
            persistState();
            renderActiveFile();
        };

        const addFileRecord = (file, content) => {
            const record = {
                id: generateId(),
                name: file.name || 'Untitled.txt',
                size: Number(file.size) || 0,
                type: file.type || 'text/plain',
                modifiedTime: file.lastModified || Date.now(),
                content: typeof content === 'string' ? content : ''
            };
            state.files.push(record);
            state.activeId = record.id;
            renderActiveFile();
            setStatus(`Loaded ${state.files.length === 1 ? '1 file' : `${state.files.length} files`}.`);
            persistState();
        };

        const readFileAsText = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
            try {
                reader.readAsText(file, 'UTF-8');
            } catch (error) {
                reject(error);
            }
        });

        const handleFiles = fileListLike => {
            const files = Array.from(fileListLike || []);
            if (!files.length) {
                setStatus('No files were detected.', true);
                if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
                return;
            }

            let accepted = 0;
            files.forEach(file => {
                if (!isTextFile(file)) {
                    setStatus(`Skipped ${file.name} (unsupported format).`, true);
                    return;
                }
                accepted += 1;
                readFileAsText(file)
                    .then(text => addFileRecord(file, text))
                    .catch(() => setStatus(`Unable to read ${file.name}.`, true));
            });

            if (!accepted) {
                setStatus('No supported text files were added.', true);
                if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
            }
        };

        const clearAll = () => {
            state.files = [];
            state.activeId = null;
            state.selectedIds.clear();
            state.exportExtension = '';
            fileInput.value = '';
            if (exportExtensionInput) exportExtensionInput.value = '';
            closeExportModal();
            renderActiveFile();
            setStatus('No files uploaded yet.');
            if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
            clearPersistedState();
        };

        const downloadSelectedRecords = () => {
            const selection = getSelectedRecords();
            if (!selection.length) return false;
            const extension = getExportExtension();
            selection.forEach(record => {
                const filename = buildDownloadName(record.name, extension);
                triggerDownload(record.content || '', record.type || 'text/plain', filename);
            });
            return true;
        };

        const downloadRecordsAsZip = async records => {
            if (!records.length || !window.JSZip) return false;
            const extension = getExportExtension();
            const zip = new window.JSZip();
            records.forEach(record => {
                const filename = buildDownloadName(record.name, extension);
                zip.file(filename, record.content || '', { binary: false });
            });
            try {
                const blob = await zip.generateAsync({ type: 'blob' });
                const zipName = records.length === state.files.length ? 'file-library.zip' : 'selected-files.zip';
                triggerDownload(blob, 'application/zip', zipName);
                return true;
            } catch (error) {
                console.warn('Unable to prepare the zip archive.', error);
                return false;
            }
        };

        const copyActiveFile = async () => {
            const active = getActiveFile();
            if (!active || !copyButton || !supportsClipboard) return;
            try {
                await navigator.clipboard.writeText(active.content || '');
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = copyButtonLabel;
                }, 1200);
            } catch (error) {
                console.error('Unable to copy file contents', error);
                setStatus('Unable to copy to clipboard.', true);
            }
        };

        uploadButton?.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', event => {
            handleFiles(event.target.files);
            fileInput.value = '';
        });

        clearButton?.addEventListener('click', clearAll);

        copyButton?.addEventListener('click', copyActiveFile);
        downloadButton?.addEventListener('click', openExportModal);
        downloadSelectedButton?.addEventListener('click', () => {
            const performed = downloadSelectedRecords();
            if (performed) {
                closeExportModal();
            }
        });
        downloadZipButton?.addEventListener('click', async () => {
            const selection = getSelectedRecords();
            const targets = selection.length ? selection : state.files;
            if (!targets.length || !window.JSZip) return;
            const previousLabel = downloadZipButton.textContent;
            downloadZipButton.disabled = true;
            downloadZipButton.textContent = 'Preparing ZIP…';
            try {
                const success = await downloadRecordsAsZip(targets);
                if (success) {
                    closeExportModal();
                }
            } finally {
                downloadZipButton.textContent = previousLabel;
                refreshExportPanel();
            }
        });

        closeExportModalButton?.addEventListener('click', closeExportModal);
        exportModalOverlay?.addEventListener('click', closeExportModal);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && isExportModalOpen()) {
                event.preventDefault();
                closeExportModal();
            }
        });

        selectAllCheckbox?.addEventListener('change', event => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (!state.files.length) {
                target.checked = false;
                target.indeterminate = false;
                return;
            }
            if (target.checked) {
                state.files.forEach(file => state.selectedIds.add(file.id));
            } else {
                state.selectedIds.clear();
            }
            persistState();
            refreshExportPanel();
        });

        clearSelectionButton?.addEventListener('click', () => {
            if (!state.selectedIds.size) return;
            state.selectedIds.clear();
            persistState();
            refreshExportPanel();
        });

        dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            dropZone.classList.add('is-dragover');
        });

        dropZone.addEventListener('dragenter', event => {
            event.preventDefault();
            dropZone.classList.add('is-dragover');
        });

        dropZone.addEventListener('dragleave', event => {
            event.preventDefault();
            const related = event.relatedTarget;
            if (!related || !dropZone.contains(related)) {
                dropZone.classList.remove('is-dragover');
            }
        });

        dropZone.addEventListener('dragend', () => {
            dropZone.classList.remove('is-dragover');
        });

        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            dropZone.classList.remove('is-dragover');
            handleFiles(event.dataTransfer?.files);
        });

        fileList?.addEventListener('click', event => {
            const deleteButton = event.target.closest('[data-delete-file-id]');
            if (deleteButton) {
                const fileId = deleteButton.getAttribute('data-delete-file-id');
                if (fileId) {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteFileById(fileId);
                }
                return;
            }
            const button = event.target.closest('[data-file-id]');
            if (!button) return;
            state.activeId = button.getAttribute('data-file-id');
            renderActiveFile();
            persistState();
        });

        exportFileList?.addEventListener('change', event => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (!target.matches('[data-export-file-id]')) return;
            const fileId = target.getAttribute('data-export-file-id');
            if (!fileId) return;
            if (target.checked) {
                state.selectedIds.add(fileId);
            } else {
                state.selectedIds.delete(fileId);
            }
            persistState();
            refreshExportPanel();
        });

        editor.addEventListener('input', () => {
            const active = getActiveFile();
            if (!active) return;
            active.content = editor.value;
            persistState();
            syncColumnHeights();
        });

        ['mouseup', 'keyup'].forEach(eventName => {
            editor.addEventListener(eventName, () => {
                requestAnimationFrame(() => {
                    syncColumnHeights();
                });
            });
        });

        exportExtensionInput?.addEventListener('input', () => {
            state.exportExtension = exportExtensionInput.value;
            persistState();
        });

        exportExtensionInput?.addEventListener('blur', () => {
            const normalized = sanitizeExtension(exportExtensionInput.value);
            exportExtensionInput.value = normalized;
            state.exportExtension = normalized;
            persistState();
        });

        syncColumnHeights();

        if (state.files.length) {
            renderActiveFile();
            setStatus('Restored previous session.');
        } else {
            renderActiveFile();
            setStatus('No files uploaded yet.');
            clearPersistedState();
        }
    });
})();
