document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('usageForm');
    const nameInput = document.getElementById('categoryName');
    const percentInput = document.getElementById('categoryPercent');
    const clearButton = document.getElementById('clearUsage');
    const undoButton = document.getElementById('undoUsage');
    const submitButton = form?.querySelector('button[type="submit"]');
    const saveButton = document.getElementById('saveUsage');
    const copyButton = document.getElementById('copyUsage');
    const includeLegend = document.getElementById('includeLegend');
    const bar = document.getElementById('usageBar');
    const list = document.getElementById('usageList');
    const summary = document.getElementById('usageSummary');

    const STORAGE_KEY = 'bradlotUsageBarState';

    /** @type {{ id: number; name: string; value: number; }[]} */
    let items = [];
    let nextId = 1;
    let draggingId = null;
    let editingId = null;
    let undoSnapshot = null;
    let undoTimeoutId = null;
    let errorTimeoutId = null;

    const COLORS = [
        '#0b6bff',
        '#1f883d',
        '#bf3b4b',
        '#c29700',
        '#8250df',
        '#218bff',
        '#e36209',
        '#34d399',
        '#f97316',
        '#a855f7',
        '#2dd4bf',
        '#f04f88'
    ];

    function saveState() {
        try {
            const payload = {
                items,
                legend: includeLegend ? !!includeLegend.checked : false
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore persistence errors
        }
    }

    function restoreState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.items)) {
                items = parsed.items
                    .filter(entry => entry && typeof entry.name === 'string')
                    .map(entry => ({
                        id: typeof entry.id === 'number' ? entry.id : nextId++,
                        name: entry.name,
                        value: Number.isFinite(entry.value) ? entry.value : 0
                    }));
                const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);
                if (maxId >= nextId) nextId = maxId + 1;
            }
            if (includeLegend && typeof parsed.legend === 'boolean') {
                includeLegend.checked = parsed.legend;
            }
        } catch {
            // Ignore restore errors and start fresh
        }
    }

    function getCompactName(name, share, count) {
        const trimmed = (name || '').trim();
        if (!trimmed) return '';

        let maxChars = 20;
        if (count > 6) maxChars = 16;
        if (share < 12) maxChars = Math.min(maxChars, 12);
        if (share < 6) maxChars = Math.min(maxChars, 8);

        if (trimmed.length <= maxChars) return trimmed;

        const words = trimmed.split(/\s+/);
        if (words.length > 1) {
            const initials = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
            if (initials.length <= maxChars) {
                return initials;
            }
        }

        return `${trimmed.slice(0, Math.max(maxChars - 1, 2))}…`;
    }

    function renderBar() {
        bar.innerHTML = '';
        bar.classList.add('usage-bar-horizontal');

        if (!items.length) {
            bar.setAttribute('aria-label', 'Empty usage bar');
            return;
        }

        const hasPositive = items.some(item => item.value > 0);
        if (!hasPositive) {
            bar.setAttribute('aria-label', 'Usage bar with no measurable values');
            return;
        }

        const labelParts = [];

        items.forEach((item, index) => {
            const raw = Number.isFinite(item.value) ? item.value : 0;
            const clamped = Math.max(Math.min(raw, 100), 0);
            const width = Math.max(clamped, 0.5);
            const slice = document.createElement('div');
            slice.className = 'usage-slice';
            slice.style.flexBasis = `${width}%`;
            slice.style.backgroundColor = COLORS[index % COLORS.length];

            const innerLabel = document.createElement('span');
            innerLabel.className = 'usage-slice-label';
            const compact = getCompactName(item.name, clamped, items.length);
            innerLabel.textContent = compact ? `${compact} (${clamped.toFixed(1)}%)` : `${clamped.toFixed(1)}%`;
            slice.appendChild(innerLabel);

            bar.appendChild(slice);
            labelParts.push(`${item.name} ${clamped.toFixed(1)}%`);
        });

        bar.setAttribute('aria-label', `Usage bar: ${labelParts.join(', ')}`);
    }

    function renderList() {
        list.innerHTML = '';
        if (!items.length) return;

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'usage-list-item';
            li.dataset.id = String(item.id);
            li.draggable = true;

            const dragHandle = document.createElement('span');
            dragHandle.className = 'usage-drag-handle';
            dragHandle.textContent = '≡';

            const colorSwatch = document.createElement('span');
            colorSwatch.className = 'usage-color';
            colorSwatch.style.backgroundColor = COLORS[index % COLORS.length];

            const text = document.createElement('span');
            text.className = 'usage-label';
            text.textContent = `${item.name} — ${item.value}%`;

            text.addEventListener('click', () => {
                if (editingId === item.id) {
                    // Toggle off editing for this item
                    editingId = null;
                    nameInput.value = '';
                    percentInput.value = '';
                    list.querySelectorAll('.usage-list-item').forEach(node =>
                        node.classList.remove('editing')
                    );
                } else {
                    // Start editing this item
                    editingId = item.id;
                    nameInput.value = item.name;
                    percentInput.value = String(item.value ?? '');
                    nameInput.focus();
                    list.querySelectorAll('.usage-list-item').forEach(node =>
                        node.classList.toggle('editing', node.dataset.id === String(item.id))
                    );
                }
                updateSummary();
            });

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-contributor';
            removeButton.setAttribute('aria-label', 'Remove category');
            removeButton.textContent = '✕';
            removeButton.addEventListener('click', () => {
                items = items.filter(entry => entry.id !== item.id);
                if (editingId === item.id) {
                    editingId = null;
                    nameInput.value = '';
                    percentInput.value = '';
                }
                renderList();
                renderBar();
                updateSummary();
            });

            li.appendChild(dragHandle);
            li.appendChild(colorSwatch);
            li.appendChild(text);
            li.appendChild(removeButton);

            if (item.id === editingId) {
                li.classList.add('editing');
            }

            li.addEventListener('dragstart', event => {
                draggingId = item.id;
                li.classList.add('dragging');

                if (event.dataTransfer) {
                    const ghost = document.createElement('div');
                    ghost.className = 'usage-drag-ghost';
                    const ghostColor = COLORS[index % COLORS.length];
                    ghost.textContent = `${item.name} — ${item.value}%`;
                    ghost.style.position = 'fixed';
                    ghost.style.top = '-1000px';
                    ghost.style.left = '-1000px';
                    ghost.style.padding = '4px 8px';
                    ghost.style.borderRadius = '6px';
                    ghost.style.background = ghostColor;
                    ghost.style.color = '#ffffff';
                    ghost.style.fontSize = '0.85rem';
                    ghost.style.fontFamily = 'inherit';
                    ghost.style.boxShadow = '0 4px 10px rgba(31, 35, 40, 0.25)';
                    ghost.style.pointerEvents = 'none';
                    document.body.appendChild(ghost);
                    const rect = ghost.getBoundingClientRect();
                    event.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
                    setTimeout(() => {
                        ghost.remove();
                    }, 0);
                }
            });

            li.addEventListener('dragover', event => {
                event.preventDefault();
                const overItem = event.currentTarget;
                const rect = overItem.getBoundingClientRect();
                const offsetY = event.clientY - rect.top;
                const midpoint = rect.height / 2;

                list.querySelectorAll('.usage-list-item').forEach(node => {
                    node.classList.remove('drop-before', 'drop-after');
                });

                if (offsetY < midpoint) {
                    overItem.classList.add('drop-before');
                } else {
                    overItem.classList.add('drop-after');
                }
            });

            li.addEventListener('drop', event => {
                event.preventDefault();
                const marker =
                    list.querySelector('.usage-list-item.drop-before, .usage-list-item.drop-after') ||
                    event.currentTarget;
                const targetId = Number(marker.dataset.id);
                if (draggingId == null || !Number.isFinite(targetId)) return;

                const fromIndex = items.findIndex(entry => entry.id === draggingId);
                let toIndex = items.findIndex(entry => entry.id === targetId);
                if (fromIndex === -1 || toIndex === -1) {
                    draggingId = null;
                    list.querySelectorAll('.usage-list-item').forEach(node => {
                        node.classList.remove('dragging', 'drop-before', 'drop-after');
                    });
                    return;
                }

                if (marker.classList.contains('drop-after')) {
                    toIndex += 1;
                }

                if (fromIndex < toIndex) {
                    toIndex -= 1;
                }

                if (fromIndex === toIndex) {
                    draggingId = null;
                    list.querySelectorAll('.usage-list-item').forEach(node => {
                        node.classList.remove('dragging', 'drop-before', 'drop-after');
                    });
                    return;
                }

                const [moved] = items.splice(fromIndex, 1);
                items.splice(toIndex, 0, moved);
                draggingId = null;
                renderList();
                renderBar();
                updateSummary();
            });

            li.addEventListener('dragend', () => {
                draggingId = null;
                list.querySelectorAll('.usage-list-item').forEach(node => {
                    node.classList.remove('dragging', 'drop-before', 'drop-after');
                });
            });

            list.appendChild(li);
        });
    }

    function updateSummary() {
        const hasItems = items.length > 0;
        if (!hasItems) {
            summary.textContent = 'No categories yet. Add a few to build the bar.';
        } else {
            const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
            const formattedTotal = total % 1 === 0 ? total.toString() : total.toFixed(1);
            summary.textContent = `Total entered: ${formattedTotal}% across ${items.length} categor${items.length === 1 ? 'y' : 'ies'}. Any leftover space stays unfilled.`;
        }
        summary.classList.remove('usage-error');
        if (saveButton) saveButton.disabled = !hasItems;
        if (copyButton) copyButton.disabled = !hasItems;
        saveState();
        if (submitButton) {
            submitButton.textContent = editingId != null ? 'Update category' : 'Add category';
        }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const raw = percentInput.value.trim();
        if (!name || !raw) return;

        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
            percentInput.focus();
            return;
        }

        const safeValue = Math.max(value, 0);
        const totalBefore = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
        let previous = 0;
        if (editingId != null) {
            const existing = items.find(entry => entry.id === editingId);
            if (existing) {
                previous = Math.max(existing.value, 0);
            }
        }
        const prospectiveTotal = totalBefore - previous + safeValue;
        if (prospectiveTotal > 100.0001) {
            const currentTotal = totalBefore;
            const currentFormatted = currentTotal % 1 === 0 ? currentTotal.toString() : currentTotal.toFixed(1);
            const remaining = Math.max(0, 100 - currentTotal);
            const remainingFormatted = remaining % 1 === 0 ? remaining.toString() : remaining.toFixed(1);
            if (currentTotal < 100) {
                summary.textContent = `You have already used ${currentFormatted}%. You can add at most ${remainingFormatted}% more without exceeding 100%.`;
            } else {
                const overflow = prospectiveTotal - 100;
                const overflowFormatted = overflow % 1 === 0 ? overflow.toString() : overflow.toFixed(1);
                summary.textContent = `You are over 100% (current total ${currentFormatted}%). Reduce categories by at least ${overflowFormatted}% before adding more.`;
            }
            summary.classList.add('usage-error');
            if (errorTimeoutId) {
                clearTimeout(errorTimeoutId);
            }
            errorTimeoutId = setTimeout(() => {
                summary.classList.remove('usage-error');
                updateSummary();
                errorTimeoutId = null;
            }, 10000);
            percentInput.focus();
            return;
        }

        if (editingId != null) {
            const index = items.findIndex(entry => entry.id === editingId);
            if (index !== -1) {
                items[index] = { ...items[index], name, value };
            }
            editingId = null;
        } else {
            items = [
                ...items,
                { id: nextId++, name, value }
            ];
        }

        nameInput.value = '';
        percentInput.value = '';
        nameInput.focus();

        renderList();
        renderBar();
        updateSummary();
    });

    clearButton.addEventListener('click', () => {
        if (items.length) {
            undoSnapshot = {
                items: items.map(entry => ({ ...entry })),
                legend: includeLegend ? !!includeLegend.checked : false
            };
            if (undoButton) {
                undoButton.classList.remove('hidden');
                undoButton.disabled = false;
            }
            if (undoTimeoutId) {
                clearTimeout(undoTimeoutId);
            }
            undoTimeoutId = setTimeout(() => {
                undoSnapshot = null;
                if (undoButton) {
                    undoButton.classList.add('hidden');
                    undoButton.disabled = true;
                }
            }, 15000);
        }

        items = [];
        renderList();
        renderBar();
        editingId = null;
        updateSummary();
        nameInput.value = '';
        percentInput.value = '';
        nameInput.focus();
    });

    if (includeLegend) {
        includeLegend.addEventListener('change', () => {
            saveState();
        });
    }

    function captureUsageBar() {
        return new Promise((resolve, reject) => {
            if (!window.html2canvas || !items.length) {
                reject(new Error('Nothing to capture'));
                return;
            }

            const exportRoot = includeLegend && includeLegend.checked
                ? (document.getElementById('usageExport') || bar.closest('.usage-bar-shell') || bar)
                : (bar.closest('.usage-bar-shell') || bar);

            if (!exportRoot) {
                reject(new Error('No export root found'));
                return;
            }

            exportRoot.classList.add('usage-exporting');

            window.html2canvas(exportRoot, {
                backgroundColor: null,
                scale: window.devicePixelRatio || 2
            })
                .then(canvas => {
                    exportRoot.classList.remove('usage-exporting');
                    canvas.toBlob(blob => {
                        if (!blob) {
                            reject(new Error('Unable to create image'));
                            return;
                        }
                        resolve(blob);
                    });
                })
                .catch(error => {
                    exportRoot.classList.remove('usage-exporting');
                    reject(error);
                });
        });
    }

    if (undoButton) {
        undoButton.addEventListener('click', () => {
            if (!undoSnapshot) return;
            items = undoSnapshot.items.map(entry => ({ ...entry }));
            const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);
            if (maxId >= nextId) nextId = maxId + 1;
            if (includeLegend) {
                includeLegend.checked = undoSnapshot.legend;
            }
            editingId = null;
            nameInput.value = '';
            percentInput.value = '';
            renderList();
            renderBar();
            updateSummary();
            undoSnapshot = null;
            if (undoTimeoutId) {
                clearTimeout(undoTimeoutId);
                undoTimeoutId = null;
            }
            undoButton.classList.add('hidden');
            undoButton.disabled = true;
        });
    }

    if (saveButton) {
        saveButton.addEventListener('click', () => {
            captureUsageBar().then(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'usage-bar.png';
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            }).catch(() => {
                // Silent failure; no-op if capture fails
            });
        });
    }

    if (copyButton) {
        copyButton.addEventListener('click', () => {
            captureUsageBar()
                .then(async blob => {
                    // Try to copy the PNG to the clipboard when supported
                    let copied = false;
                    if (navigator.clipboard && window.ClipboardItem) {
                        try {
                            const item = new ClipboardItem({ [blob.type]: blob });
                            await navigator.clipboard.write([item]);
                            copied = true;
                        } catch {
                            copied = false;
                        }
                    }

                    // If copy is not supported or failed, fall back to download
                    if (!copied) {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'usage-bar.png';
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        URL.revokeObjectURL(url);
                    }
                })
                .catch(() => {
                    // Ignore failures silently
                });
        });
    }

    restoreState();
    renderList();
    updateSummary();
    renderBar();
});
