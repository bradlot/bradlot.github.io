(() => {
    const ready = callback => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    };

    ready(() => {
        const exportFileList = document.getElementById('exportFileList');
        const selectAllCheckbox = document.getElementById('selectAllFiles');
        const selectedCountLabel = document.getElementById('selectedCount');
        const downloadSelectedButton = document.getElementById('downloadSelectedButton');
        const downloadZipButton = document.getElementById('downloadZipButton');
        const exportExtensionInput = document.getElementById('exportExtension');
        const presetButtons = document.querySelectorAll('.viewer-export-preset');
        const backButton = document.getElementById('viewerExportBackButton');

        const STORAGE_KEY = 'fileViewerState';

        const formatBytes = bytes => {
            if (!Number.isFinite(bytes)) return '';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

        const loadState = () => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.files)) return null;
                parsed.selectedIds = new Set(parsed.selectedIds || []);
                return parsed;
            } catch (error) {
                console.warn('Unable to load saved viewer files.', error);
                return null;
            }
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

        const state = loadState() || { files: [], activeId: null, selectedIds: new Set(), exportExtension: '' };

        if (!state.selectedIds || !(state.selectedIds instanceof Set)) {
            state.selectedIds = new Set(state.selectedIds || []);
        }

        const getSelectedRecords = () => state.files.filter(file => state.selectedIds.has(file.id));

        const ensureSelectionExists = () => {
            if (!state.selectedIds.size) {
                state.files.forEach(file => state.selectedIds.add(file.id));
            }
        };

        const renderExportList = () => {
            if (!exportFileList) return;
            if (!state.files.length) {
                exportFileList.innerHTML = '<li class="viewer-export-empty">Upload files in the viewer first.</li>';
                return;
            }

            const markup = state.files.map(file => {
                const isSelected = state.selectedIds.has(file.id);
                const details = [formatBytes(file.size)]
                    .concat(file.modifiedTime ? [formatDateOnly(file.modifiedTime)] : [])
                    .filter(Boolean)
                    .join(' • ');
                return `
                    <li class="viewer-export-file-row">
                        <label class="viewer-export-checkbox">
                            <input type="checkbox" data-export-file-id="${file.id}" ${isSelected ? 'checked' : ''}>
                            <span class="viewer-export-file-details">
                                <span class="viewer-export-file-name">${file.name}</span>
                                <span class="viewer-export-file-meta-tags">${details || 'Plain'}</span>
                            </span>
                        </label>
                    </li>
                `;
            }).join('');

            exportFileList.innerHTML = markup;
        };

        const syncListSelectionState = () => {
            if (!exportFileList) return;
            const checkboxes = exportFileList.querySelectorAll('input[data-export-file-id]');
            checkboxes.forEach(box => {
                if (!(box instanceof HTMLInputElement)) return;
                const fileId = box.getAttribute('data-export-file-id');
                box.checked = Boolean(fileId && state.selectedIds.has(fileId));
            });
        };

        const updateSelectionSummary = () => {
            const selectedCount = getSelectedRecords().length;
            const total = state.files.length;
            if (selectAllCheckbox) {
                selectAllCheckbox.disabled = !total;
                selectAllCheckbox.checked = total > 0 && selectedCount === total;
                selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < total;
            }
            if (selectedCountLabel) {
                selectedCountLabel.textContent = selectedCount === 0
                    ? 'No files selected'
                    : selectedCount === 1
                        ? '1 file selected'
                        : `${selectedCount} files selected`;
            }
            const disableDownloads = selectedCount === 0;
            if (downloadSelectedButton) downloadSelectedButton.disabled = disableDownloads;
            if (downloadZipButton) downloadZipButton.disabled = disableDownloads || !window.JSZip;
        };

        const getExportExtension = () => sanitizeExtension(state.exportExtension || '');

        const downloadSelectedRecords = () => {
            const targets = getSelectedRecords();
            if (!targets.length) return;
            const extension = getExportExtension();
            targets.forEach(record => {
                const filename = buildDownloadName(record.name, extension);
                triggerDownload(record.content || '', record.type || 'text/plain', filename);
            });
        };

        const buildDownloadName = (fileName, extension) => {
            if (!extension) return fileName;
            const lastDot = fileName.lastIndexOf('.');
            const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
            return `${base}${extension}`;
        };

        const downloadRecordsAsZip = async () => {
            if (!window.JSZip) return;
            const targets = getSelectedRecords();
            if (!targets.length) return;
            const extension = getExportExtension();
            const zip = new JSZip();
            targets.forEach(record => {
                const filename = buildDownloadName(record.name, extension);
                zip.file(filename, record.content || '', { binary: false });
            });
            const blob = await zip.generateAsync({ type: 'blob' });
            const zipName = targets.length === state.files.length ? 'file-library.zip' : 'selected-files.zip';
            triggerDownload(blob, 'application/zip', zipName);
        };

        if (!state.files.length) {
            if (downloadSelectedButton) downloadSelectedButton.disabled = true;
            if (downloadZipButton) downloadZipButton.disabled = true;
            if (selectAllCheckbox) selectAllCheckbox.disabled = true;
            if (selectedCountLabel) selectedCountLabel.textContent = 'No files available.';
            renderExportList();
            return;
        }

        ensureSelectionExists();
        if (exportExtensionInput) exportExtensionInput.value = state.exportExtension || '';

        renderExportList();
        syncListSelectionState();
        updateSelectionSummary();

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
            updateSelectionSummary();
        });

        selectAllCheckbox?.addEventListener('change', event => {
            const checkbox = event.target;
            if (!(checkbox instanceof HTMLInputElement)) return;
            if (!state.files.length) {
                checkbox.checked = false;
                checkbox.indeterminate = false;
                return;
            }
            if (checkbox.checked) {
                state.files.forEach(file => state.selectedIds.add(file.id));
            } else {
                state.selectedIds.clear();
            }
            persistState();
            syncListSelectionState();
            updateSelectionSummary();
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

        presetButtons?.forEach(button => {
            button.addEventListener('click', () => {
                const normalized = sanitizeExtension(button.getAttribute('data-extension') || '');
                if (exportExtensionInput) exportExtensionInput.value = normalized;
                state.exportExtension = normalized;
                persistState();
            });
        });

        downloadSelectedButton?.addEventListener('click', () => {
            downloadSelectedRecords();
        });

        downloadZipButton?.addEventListener('click', async () => {
            downloadZipButton.disabled = true;
            downloadZipButton.textContent = 'Preparing ZIP…';
            try {
                await downloadRecordsAsZip();
            } finally {
                downloadZipButton.textContent = 'Download ZIP';
                updateSelectionSummary();
            }
        });

        backButton?.addEventListener('click', () => {
            window.location.href = 'viewer.html';
        });
    });
})();
