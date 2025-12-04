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
        const dropPane = document.querySelector('.viewer-drop-pane');
        const previewPane = document.querySelector('.viewer-preview-pane');
        const previewShell = document.querySelector('.preview-shell');
        const layoutMediaQuery = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
        const fileList = document.getElementById('fileList');
        const fileCount = document.getElementById('fileCount');
        const editor = document.getElementById('fileEditor');
        const activeFileName = document.getElementById('activeFileName');
        const activeFileMeta = document.getElementById('activeFileMeta');

        if (!dropZone || !fileInput || !editor) {
            return;
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
        const DOCUMENT_EXTENSIONS = [
            '.csv', '.doc', '.docx', '.pdf', '.rtf', '.odt', '.ppt', '.pptx', '.xls', '.xlsx', '.pages', '.numbers', '.key'
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
        const DOCUMENT_MIME_ALLOWLIST = [
            'text/csv',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/pdf',
            'application/rtf',
            'application/vnd.oasis.opendocument.text',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.apple.pages',
            'application/vnd.apple.numbers',
            'application/vnd.apple.keynote'
        ];
        const DOCX_MIME_TYPES = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, ...DOCUMENT_EXTENSIONS];
        const ALLOWED_MIME_TYPES = [...TEXT_MIME_ALLOWLIST, ...DOCUMENT_MIME_ALLOWLIST];

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

        const getActiveFile = () => state.files.find(file => file.id === state.activeId) || null;

        const isAllowedFile = file => {
            if (!file) return false;
            const name = (file.name || '').toLowerCase();
            const type = (file.type || '').toLowerCase();
            if (type.startsWith('text/')) return true;
            if (ALLOWED_MIME_TYPES.includes(type)) return true;
            return ALLOWED_EXTENSIONS.some(ext => name.endsWith(ext));
        };

        const isDocxFile = file => {
            if (!file) return false;
            const name = (file.name || '').toLowerCase();
            const type = (file.type || '').toLowerCase();
            if (DOCX_MIME_TYPES.includes(type)) return true;
            return name.endsWith('.docx');
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
                activeFileMeta.textContent = parts.length ? parts.join(' • ') : 'Uploaded file';
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

        const readFileAsArrayBuffer = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result instanceof ArrayBuffer) {
                    resolve(reader.result);
                } else {
                    reject(new Error('Unable to read file data.'));
                }
            };
            reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
            try {
                reader.readAsArrayBuffer(file);
            } catch (error) {
                reject(error);
            }
        });

        const extractDocxText = xmlString => {
            if (!xmlString) return '';
            const parser = window.DOMParser ? new DOMParser() : null;
            if (parser) {
                const doc = parser.parseFromString(xmlString, 'application/xml');
                if (!doc.querySelector('parsererror')) {
                    const paragraphs = [];
                    doc.querySelectorAll('w\\:p').forEach(paragraph => {
                        const fragments = [];
                        paragraph.querySelectorAll('w\\:t, w\\:br, w\\:tab').forEach(node => {
                            const tag = (node.tagName || '').toLowerCase();
                            if (tag.endsWith(':t')) {
                                fragments.push(node.textContent || '');
                            } else if (tag.endsWith(':tab')) {
                                fragments.push('\t');
                            } else if (tag.endsWith(':br')) {
                                fragments.push('\n');
                            }
                        });
                        paragraphs.push(fragments.join(''));
                    });
                    return paragraphs.join('\n\n');
                }
            }
            const textNodes = [];
            const matches = xmlString.match(/<w:t[^>]*>([^<]*)<\/w:t>/gi) || [];
            matches.forEach(match => {
                const content = match.replace(/<[^>]+>/g, '');
                textNodes.push(content);
            });
            return textNodes.join(' ');
        };

        const readDocxAsText = async file => {
            const zipLib = window.JSZip;
            if (!zipLib) throw new Error('JSZip is unavailable.');
            const buffer = await readFileAsArrayBuffer(file);
            const zip = await zipLib.loadAsync(buffer);
            const documentFile = zip.file('word/document.xml');
            if (!documentFile) throw new Error('Missing document content.');
            const xml = await documentFile.async('text');
            return extractDocxText(xml);
        };

        const handleFiles = async fileListLike => {
            const files = Array.from(fileListLike || []);
            if (!files.length) {
                setStatus('No files were detected.', true);
                if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
                return;
            }

            let accepted = 0;
            for (const file of files) {
                if (!isAllowedFile(file)) {
                    setStatus(`Skipped ${file.name} (unsupported format).`, true);
                    continue;
                }
                try {
                    const text = isDocxFile(file) ? await readDocxAsText(file) : await readFileAsText(file);
                    addFileRecord(file, text);
                    accepted += 1;
                } catch (error) {
                    console.error('Unable to parse file', error);
                    setStatus(`Unable to read ${file.name}.`, true);
                }
            }

            if (!accepted) {
                setStatus('No supported files were added.', true);
                if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
            }
        };

        const clearAll = () => {
            state.files = [];
            state.activeId = null;
            state.selectedIds.clear();
            state.exportExtension = '';
            fileInput.value = '';
            renderActiveFile();
            setStatus('No files uploaded yet.');
            if (dropFileLabel) dropFileLabel.textContent = 'No file selected';
            clearPersistedState();
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
        downloadButton?.addEventListener('click', () => {
            if (!state.files.length) return;
            window.location.href = 'viewer-export.html';
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
