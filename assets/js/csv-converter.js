document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('csvDropZone');
    const input = document.getElementById('csvFileInput');
    const uploadButton = document.getElementById('csvUploadButton');
    const clearButton = document.getElementById('clearCsvButton');
    const downloadButton = document.getElementById('downloadExcelButton');
    const headerCheckbox = document.getElementById('headerCheckbox');
    const fileName = document.getElementById('csvFileName');
    const tablePreview = document.getElementById('tablePreview');

    const DEFAULT_MESSAGE = 'Upload a CSV file to see a spreadsheet preview.';
    let parsedData = null;

    const resetView = () => {
        input.value = '';
        parsedData = null;
        fileName.textContent = 'No file selected';
        downloadButton.disabled = true;
        tablePreview.innerHTML = `<p class="preview-placeholder">${DEFAULT_MESSAGE}</p>`;
        dropZone.classList.remove('dragover', 'error');
    };

    const setError = message => {
        dropZone.classList.add('error');
        fileName.textContent = message;
        tablePreview.innerHTML = `<p class="preview-placeholder">${DEFAULT_MESSAGE}</p>`;
        downloadButton.disabled = true;
    };

    const renderTable = data => {
        if (!Array.isArray(data) || !data.length) {
            tablePreview.innerHTML = `<p class="preview-placeholder">No rows detected in the CSV file.</p>`;
            downloadButton.disabled = true;
            return;
        }

        const container = document.createElement('div');
        container.className = 'table-scroll';

        const table = document.createElement('table');
        table.className = 'data-table';

        const useHeaders = Boolean(headerCheckbox.checked);
        const rows = data.map(row => Array.isArray(row) ? row : [row]);
        const previewLimit = 200;
        const truncated = rows.length > previewLimit;
        const displayRows = truncated ? rows.slice(0, previewLimit) : rows;
        const columnCount = displayRows.reduce((max, row) => Math.max(max, row.length), 0);

        if (displayRows.length) {
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            if (useHeaders) {
                const headerRow = displayRows[0];
                for (let i = 0; i < columnCount; i += 1) {
                    const th = document.createElement('th');
                    th.textContent = headerRow[i] ?? `Column ${i + 1}`;
                    th.contentEditable = 'true';
                    th.tabIndex = 0;
                    th.dataset.row = '0';
                    th.dataset.col = String(i);
                    th.addEventListener('focus', () => th.classList.add('active'));
                    th.addEventListener('blur', () => {
                        th.classList.remove('active');
                        if (!parsedData) return;
                        const c = parseInt(th.dataset.col, 10);
                        if (!Array.isArray(parsedData[0])) parsedData[0] = [];
                        parsedData[0][c] = th.textContent;
                    });
                    th.addEventListener('input', () => {
                        if (!parsedData) return;
                        const c = parseInt(th.dataset.col, 10);
                        if (!Array.isArray(parsedData[0])) parsedData[0] = [];
                        parsedData[0][c] = th.textContent;
                    });
                    headRow.appendChild(th);
                }
            } else {
                for (let i = 0; i < columnCount; i += 1) {
                    const th = document.createElement('th');
                    th.textContent = `Column ${i + 1}`;
                    headRow.appendChild(th);
                }
            }
            thead.appendChild(headRow);
            table.appendChild(thead);
        }

        const tbody = document.createElement('tbody');
        const bodyRows = useHeaders ? displayRows.slice(1) : displayRows;
        const displayStart = 0;
        bodyRows.forEach((row, rowIdx) => {
            const tr = document.createElement('tr');
            const globalRowIdx = displayStart + rowIdx + (useHeaders ? 1 : 0);
            for (let i = 0; i < columnCount; i += 1) {
                const cell = row[i];
                const td = document.createElement('td');
                td.textContent = cell ?? '';
                td.contentEditable = 'true';
                td.tabIndex = 0;
                td.dataset.row = String(globalRowIdx);
                td.dataset.col = String(i);

                td.addEventListener('focus', () => td.classList.add('active'));
                td.addEventListener('blur', () => {
                    td.classList.remove('active');
                    if (!parsedData) return;
                    const r = parseInt(td.dataset.row, 10);
                    const c = parseInt(td.dataset.col, 10);
                    if (!Array.isArray(parsedData[r])) parsedData[r] = [];
                    parsedData[r][c] = td.textContent;
                });

                // Keep parsedData in sync while typing so downloads reflect edits immediately
                td.addEventListener('input', () => {
                    if (!parsedData) return;
                    const r = parseInt(td.dataset.row, 10);
                    const c = parseInt(td.dataset.col, 10);
                    if (!Array.isArray(parsedData[r])) parsedData[r] = [];
                    parsedData[r][c] = td.textContent;
                });

                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        container.appendChild(table);
        tablePreview.innerHTML = '';
        tablePreview.appendChild(container);

        if (truncated) {
            const note = document.createElement('p');
            note.className = 'preview-note';
            note.textContent = `Showing first ${previewLimit} rows of ${rows.length}. Full dataset will be included in the Excel download.`;
            tablePreview.appendChild(note);
        }

        downloadButton.disabled = false;
    };

    const parseFile = file => {
        if (!file) {
            setError('Please select a CSV file.');
            return;
        }
        if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
            setError('Only .CSV files are supported.');
            return;
        }

        Papa.parse(file, {
            skipEmptyLines: 'greedy',
            dynamicTyping: false,
            complete(results) {
                const errors = Array.isArray(results.errors) ? results.errors : [];
                const fatalError = errors.find(error => error && error.fatal);
                const data = Array.isArray(results.data) ? results.data : [];

                if (fatalError) {
                    console.error(fatalError);
                    setError('Unable to parse the CSV file.');
                    return;
                }
                if (!data.length) {
                    setError('No rows detected in the CSV file.');
                    return;
                }

                if (errors.length) {
                    console.warn('Non-fatal CSV parse warnings detected:', errors);
                }

                parsedData = data;
                dropZone.classList.remove('error');
                fileName.textContent = `${file.name} (${file.size} bytes)`;
                renderTable(parsedData);
            },
            error(error) {
                console.error(error);
                setError('Unable to read the CSV file.');
            }
        });
    };

    const prepareAoA = () => {
        if (!parsedData || !parsedData.length) {
            return null;
        }
        return parsedData.map(row => Array.isArray(row) ? row : [row]);
    };

    uploadButton.addEventListener('click', () => input.click());

    input.addEventListener('change', event => {
        const [file] = event.target.files || [];
        parseFile(file);
    });

    ['dragenter', 'dragover'].forEach(evt =>
        dropZone.addEventListener(evt, event => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.add('dragover');
        })
    );

    ['dragleave', 'drop'].forEach(evt =>
        dropZone.addEventListener(evt, event => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove('dragover');
        })
    );

    dropZone.addEventListener('drop', event => {
        const file = event.dataTransfer && event.dataTransfer.files
            ? event.dataTransfer.files[0]
            : null;
        parseFile(file);
    });

    headerCheckbox.addEventListener('change', () => {
        if (parsedData) {
            renderTable(parsedData);
        }
    });

    clearButton.addEventListener('click', resetView);

    downloadButton.addEventListener('click', () => {
        const aoa = prepareAoA();
        if (!aoa) {
            return;
        }

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
        XLSX.writeFile(workbook, `converted-${timestamp}.xlsx`);
    });

    resetView();
});
