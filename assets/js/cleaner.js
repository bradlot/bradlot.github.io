'use strict';

(() => {
    const DEFAULT_OPTIONS = {
        normalizeQuotes: true,
        convertDashes: true,
        stripFormatting: true,
        preserveLineBreaks: false,
        autoClean: false
    };

    const SETTINGS = {
        typingDelay: 260
    };

    const CHAR_NAMES = {
        "'": 'APOSTROPHE',
        '"': 'QUOTATION MARK',
        '-': 'HYPHEN-MINUS',
        '.': 'FULL STOP',
        ' ': 'SPACE',
        '\t': 'TAB',
        '\n': 'LINE FEED',
        '\u2018': 'LEFT SINGLE QUOTATION MARK',
        '\u2019': 'RIGHT SINGLE QUOTATION MARK',
        '\u201A': 'SINGLE LOW-9 QUOTATION MARK',
        '\u201B': 'SINGLE HIGH-REVERSED-9 QUOTATION MARK',
        '\u201C': 'LEFT DOUBLE QUOTATION MARK',
        '\u201D': 'RIGHT DOUBLE QUOTATION MARK',
        '\u201E': 'DOUBLE LOW-9 QUOTATION MARK',
        '\u201F': 'DOUBLE HIGH-REVERSED-9 QUOTATION MARK',
        '\u2032': 'PRIME',
        '\u2033': 'DOUBLE PRIME',
        '\u00AB': 'LEFT-POINTING DOUBLE ANGLE QUOTATION MARK',
        '\u00BB': 'RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK',
        '\u2010': 'HYPHEN',
        '\u2011': 'NON-BREAKING HYPHEN',
        '\u2012': 'FIGURE DASH',
        '\u2013': 'EN DASH',
        '\u2014': 'EM DASH',
        '\u2015': 'HORIZONTAL BAR',
        '\u2212': 'MINUS SIGN',
        '\u2026': 'HORIZONTAL ELLIPSIS',
        '\u00A0': 'NO-BREAK SPACE',
        '\u2007': 'FIGURE SPACE',
        '\u2008': 'PUNCTUATION SPACE',
        '\u2009': 'THIN SPACE',
        '\u200A': 'HAIR SPACE',
        '\u200B': 'ZERO WIDTH SPACE',
        '\u200C': 'ZERO WIDTH NON-JOINER',
        '\u200D': 'ZERO WIDTH JOINER',
        '\u202F': 'NARROW NO-BREAK SPACE',
        '\u205F': 'MEDIUM MATHEMATICAL SPACE',
        '\u2060': 'WORD JOINER',
        '\uFEFF': 'ZERO WIDTH NO-BREAK SPACE',
        '\u00AD': 'SOFT HYPHEN',
        '\u2022': 'BULLET',
        '\u2023': 'TRIANGULAR BULLET',
        '\u2043': 'HYPHEN BULLET',
        '\u204C': 'BLACK LEFTWARDS BULLET',
        '\u204D': 'BLACK RIGHTWARDS BULLET',
        '\u2219': 'BULLET OPERATOR',
        '\u25E6': 'WHITE BULLET',
        '\u00B7': 'MIDDLE DOT',
        '\u22C5': 'DOT OPERATOR',
        '\u0387': 'GREEK ANO TELEIA',
        '\u2024': 'ONE DOT LEADER',
        '\u2025': 'TWO DOT LEADER',
        '\uFE52': 'SMALL FULL STOP',
        '\uFF0E': 'FULLWIDTH FULL STOP',
        '\u2016': 'DOUBLE VERTICAL LINE',
        '\u2223': 'DIVIDES',
        '\u2225': 'PARALLEL TO',
        '\uFF5C': 'FULLWIDTH VERTICAL LINE',
        '\u00A6': 'BROKEN BAR',
        '\u02BC': 'MODIFIER LETTER APOSTROPHE',
        '\u02BB': 'MODIFIER LETTER TURNED COMMA',
        '\u02BD': 'MODIFIER LETTER REVERSED COMMA',
        '\u02BE': 'MODIFIER LETTER RIGHT HALF RING',
        '\u02BF': 'MODIFIER LETTER LEFT HALF RING',
        '\u02EE': 'MODIFIER LETTER DOUBLE APOSTROPHE',
        '\u3000': 'IDEOGRAPHIC SPACE',
        '\u3001': 'IDEOGRAPHIC COMMA',
        '\u3002': 'IDEOGRAPHIC FULL STOP',
        '\uFF01': 'FULLWIDTH EXCLAMATION MARK',
        '\uFF02': 'FULLWIDTH QUOTATION MARK',
        '\uFF03': 'FULLWIDTH NUMBER SIGN',
        '\uFF04': 'FULLWIDTH DOLLAR SIGN',
        '\uFF05': 'FULLWIDTH PERCENT SIGN',
        '\uFF06': 'FULLWIDTH AMPERSAND',
        '\uFF07': 'FULLWIDTH APOSTROPHE',
        '\uFF08': 'FULLWIDTH LEFT PARENTHESIS',
        '\uFF09': 'FULLWIDTH RIGHT PARENTHESIS',
        '\uFF0A': 'FULLWIDTH ASTERISK',
        '\uFF0B': 'FULLWIDTH PLUS SIGN',
        '\uFF0C': 'FULLWIDTH COMMA',
        '\uFF0D': 'FULLWIDTH HYPHEN-MINUS',
        '\uFF0F': 'FULLWIDTH SOLIDUS',
        '\uFF1A': 'FULLWIDTH COLON',
        '\uFF1B': 'FULLWIDTH SEMICOLON',
        '\uFF1C': 'FULLWIDTH LESS-THAN SIGN',
        '\uFF1D': 'FULLWIDTH EQUALS SIGN',
        '\uFF1E': 'FULLWIDTH GREATER-THAN SIGN',
        '\uFF1F': 'FULLWIDTH QUESTION MARK',
        '\uFF20': 'FULLWIDTH COMMERCIAL AT',
        '\uFF3B': 'FULLWIDTH LEFT SQUARE BRACKET',
        '\uFF3C': 'FULLWIDTH REVERSE SOLIDUS',
        '\uFF3D': 'FULLWIDTH RIGHT SQUARE BRACKET',
        '\uFF3E': 'FULLWIDTH CIRCUMFLEX ACCENT',
        '\uFF3F': 'FULLWIDTH LOW LINE',
        '\uFF40': 'FULLWIDTH GRAVE ACCENT',
        '\uFF5B': 'FULLWIDTH LEFT CURLY BRACKET',
        '\uFF5D': 'FULLWIDTH RIGHT CURLY BRACKET',
        '\uFF5E': 'FULLWIDTH TILDE',
        '\uFF61': 'HALFWIDTH IDEOGRAPHIC FULL STOP',
        '\uFF62': 'HALFWIDTH LEFT CORNER BRACKET',
        '\uFF63': 'HALFWIDTH RIGHT CORNER BRACKET',
        '\uFF64': 'HALFWIDTH IDEOGRAPHIC COMMA',
        '\uFF65': 'HALFWIDTH KATAKANA MIDDLE DOT'
    };

    const REPLACEMENTS = new Map([
        // Quotes
        ['\u2018', "'"],
        ['\u2019', "'"],
        ['\u201A', "'"],
        ['\u201B', "'"],
        ['\u2032', "'"],
        ['\u201C', '"'],
        ['\u201D', '"'],
        ['\u201E', '"'],
        ['\u201F', '"'],
        ['\u2033', '"'],
        ['\u00AB', '"'],
        ['\u00BB', '"'],
        ['\u02BC', "'"],
        ['\u02BB', "'"],
        ['\u02BD', "'"],
        ['\u02BE', "'"],
        ['\u02BF', "'"],
        ['\u02EE', "''"],
        ['\uFF07', "'"],
        ['\uFF02', '"'],
        // Dashes
        ['\u2010', '-'],
        ['\u2011', '-'],
        ['\u2012', '-'],
        ['\u2013', '-'],
        ['\u2014', '-'],
        ['\u2015', '-'],
        ['\u2212', '-'],
        ['\u00AD', ''],
        ['\uFF0D', '-'],
        // Ellipses and dots
        ['\u2026', '...'],
        ['\u2024', '.'],
        ['\u2025', '..'],
        ['\uFE52', '.'],
        ['\uFF0E', '.'],
        ['\uFF61', '.'],
        ['\u3002', '.'],
        // Spaces
        ['\u00A0', ' '],
        ['\u2007', ' '],
        ['\u2008', ' '],
        ['\u2009', ' '],
        ['\u200A', ' '],
        ['\u202F', ' '],
        ['\u205F', ' '],
        ['\u3000', ' '],
        // Invisible characters
        ['\u200B', ''],
        ['\u200C', ''],
        ['\u200D', ''],
        ['\u2060', ''],
        ['\uFEFF', ''],
        // Bullets
        ['\u2022', '*'],
        ['\u2023', '*'],
        ['\u2043', '-'],
        ['\u204C', '*'],
        ['\u204D', '*'],
        ['\u2219', '*'],
        ['\u25E6', '*'],
        ['\u00B7', '*'],
        ['\u22C5', '*'],
        ['\u0387', '.'],
        // Pipes and bars
        ['\u2016', '||'],
        ['\u2223', '|'],
        ['\u2225', '||'],
        ['\uFF5C', '|'],
        ['\u00A6', '|'],
        // Fullwidth characters
        ['\uFF01', '!'],
        ['\uFF03', '#'],
        ['\uFF04', '$'],
        ['\uFF05', '%'],
        ['\uFF06', '&'],
        ['\uFF08', '('],
        ['\uFF09', ')'],
        ['\uFF0A', '*'],
        ['\uFF0B', '+'],
        ['\uFF0C', ','],
        ['\uFF0F', '/'],
        ['\uFF1A', ':'],
        ['\uFF1B', ';'],
        ['\uFF1C', '<'],
        ['\uFF1D', '='],
        ['\uFF1E', '>'],
        ['\uFF1F', '?'],
        ['\uFF20', '@'],
        ['\uFF3B', '['],
        ['\uFF3C', '\\'],
        ['\uFF3D', ']'],
        ['\uFF3E', '^'],
        ['\uFF3F', '_'],
        ['\uFF40', '`'],
        ['\uFF5B', '{'],
        ['\uFF5D', '}'],
        ['\uFF5E', '~'],
        // Halfwidth characters
        ['\uFF64', ','],
        ['\uFF65', '.'],
        // Other punctuation
        ['\u3001', ','],
        ['\uFF62', '['],
        ['\uFF63', ']'],
        // Tabs
        ['\t', ' ']
    ]);

    const QUOTE_CHARS = new Set([
        '\u2018', '\u2019', '\u201A', '\u201B', '\u2032',
        '\u201C', '\u201D', '\u201E', '\u201F', '\u2033',
        '\u00AB', '\u00BB', '\u02BC', '\u02BB', '\u02BD',
        '\u02BE', '\u02BF', '\u02EE', '\uFF07', '\uFF02'
    ]);

    const DASH_CHARS = new Set([
        '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212', '\u00AD', '\uFF0D'
    ]);

    const EMOJI_RANGES = [
        [0x1F300, 0x1F5FF],
        [0x1F600, 0x1F64F],
        [0x1F680, 0x1F6FF],
        [0x1F700, 0x1F77F],
        [0x1F780, 0x1F7FF],
        [0x1F800, 0x1F8FF],
        [0x1F900, 0x1F9FF],
        [0x1FA00, 0x1FAFF],
        [0x1FB00, 0x1FBFF],
        [0x2600, 0x27BF]
    ];

    const EMPTY_MESSAGE = 'No substitutions detected yet. Paste text and run the cleaner to see a breakdown.';
    const CLEAN_MESSAGE = 'No substitutions detected - your text is already clean.';
    const DEFAULT_COPY_LABEL = 'Copy Cleaned Text';

    const DEFAULT_PASTE_LABEL = 'Paste from Clipboard';
    const elements = {
        input: document.getElementById('inputText'),
        output: document.getElementById('outputText'),
        cleanButton: document.getElementById('cleanButton'),
        resetButton: document.getElementById('resetButton'),
        copyButton: document.getElementById('copyButton'),
        pasteButton: document.getElementById('pasteButton'),
        changeList: document.getElementById('changeList')
    };

    const optionControls = document.querySelectorAll('[data-option]');

    const state = {
        options: { ...DEFAULT_OPTIONS },
        debounceTimer: null
    };

    const isEmoji = codePoint =>
        EMOJI_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);

    const escapeHTML = text =>
        text.replace(/[&<>"']/g, match => {
            switch (match) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return match;
            }
        });

    const formatChar = char => {
        if (char === '') return '[removed]';
        if (char === ' ') return '[space]';
        if (char === '\n') return '[newline]';
        if (char === '\t') return '[tab]';
        return char;
    };

    const getCharName = char => {
        if (char === '') return 'removed';
        if (char === '\n') return 'LINE FEED';
        if (char === '\t') return 'CHARACTER TABULATION';
        return CHAR_NAMES[char] || 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    };

    const perHundred = (count, words) => (words ? (count / words * 100).toFixed(2) : '0.00');

    const syncOptionsFromUI = () => {
        const options = { ...DEFAULT_OPTIONS };
        optionControls.forEach(control => {
            const key = control.dataset.option;
            if (!key) return;
            options[key] = control.type === 'checkbox' ? control.checked : control.value;
        });
        state.options = options;
    };

    const cleanText = (raw, options) => {
        const source = raw.replace(/\r\n?/g, '\n');
        const substitutions = new Map();
        const flagged = new Map();

        let cleaned = '';

        const bumpFlagged = char => {
            if (char === '\n' || char === '\t' || char === ' ') return;
            const key = char;
            flagged.set(key, (flagged.get(key) || 0) + 1);
        };

        const recordSubstitution = (original, replacement) => {
            const key = original + '->' + replacement;
            if (!substitutions.has(key)) {
                substitutions.set(key, { original, replacement, count: 0 });
            }
            substitutions.get(key).count += 1;
            bumpFlagged(original);
        };

        for (const char of source) {
            const codePoint = char.codePointAt(0);
            const printableAscii = (codePoint >= 32 && codePoint <= 126) || char === '\n' || char === '\t';

            if (!printableAscii && !isEmoji(codePoint)) {
                bumpFlagged(char);
            }

            if (char === '\n') {
                if (options.preserveLineBreaks) {
                    cleaned += '\n';
                } else if (options.stripFormatting) {
                    recordSubstitution(char, ' ');
                    cleaned += ' ';
                } else {
                    cleaned += ' ';
                }
                continue;
            }

            if (REPLACEMENTS.has(char)) {
                const replacement = REPLACEMENTS.get(char);
                const isQuote = QUOTE_CHARS.has(char);
                const isDash = DASH_CHARS.has(char);
                const shouldReplace =
                    (!isQuote || options.normalizeQuotes) &&
                    (!isDash || options.convertDashes);

                if (shouldReplace) {
                    recordSubstitution(char, replacement);
                    cleaned += replacement;
                } else {
                    cleaned += char;
                }
                continue;
            }

            if (isEmoji(codePoint) || printableAscii) {
                cleaned += char;
                continue;
            }

            recordSubstitution(char, '');
        }

        let flattened = cleaned;
        let formattingAdjustments = 0;

        if (options.stripFormatting) {
            if (options.preserveLineBreaks) {
                flattened = cleaned
                    .split('\n')
                    .map(line => line.replace(/\s+/g, ' ').trim())
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            } else {
                flattened = cleaned.replace(/\s+/g, ' ').trim();
            }
            formattingAdjustments = Math.max(0, cleaned.length - flattened.length);
        } else {
            flattened = options.preserveLineBreaks ? cleaned : cleaned.trim();
        }

        const substitutionList = Array.from(substitutions.values());
        const totalSubstitutions = substitutionList.reduce((sum, item) => sum + item.count, 0);
        const flaggedMap = new Map(flagged);

        return {
            text: flattened,
            substitutions: substitutionList,
            totalSubstitutions,
            formattingAdjustments,
            flagged: flaggedMap
        };
    };

    const updateChangeLog = (result, wordCount) => {
        if (!elements.changeList) return;
        const entries = [];
        const sorted = result.substitutions.slice().sort((a, b) => b.count - a.count);
        const seenChars = new Set();

        sorted.forEach(item => {
            const per = perHundred(item.count, wordCount);
            const original = '<code>' + escapeHTML(formatChar(item.original)) + '</code> (' + escapeHTML(getCharName(item.original)) + ')';
            const replacement = '<code>' + escapeHTML(formatChar(item.replacement)) + '</code> (' + escapeHTML(getCharName(item.replacement)) + ')';
            const label = item.count === 1 ? 'occurrence' : 'occurrences';
            const metaText = item.count + ' ' + label + ' (' + per + ' per 100 words)';
            seenChars.add(item.original);
            entries.push(
                '<li>' +
                    '<div class="change-row">' +
                        '<strong>' + original + '</strong>' +
                        '<span class="change-arrow" aria-hidden="true">&rarr;</span>' + replacement +
                    '</div>' +
                    '<div class="change-meta">' + metaText + '</div>' +
                '</li>'
            );
        });

        if (result.formattingAdjustments > 0) {
            const formattingPer = perHundred(result.formattingAdjustments, wordCount);
            entries.push(
                '<li>' +
                    '<div class="change-row">' +
                        '<strong>Formatting normalized</strong>' +
                        '<span class="change-arrow" aria-hidden="true">&rarr;</span><code>Plain text</code></div>' +
                '<div class="change-meta">' + result.formattingAdjustments + ' characters removed (' + formattingPer + ' per 100 words)</div></li>'
            );
        }

        if (!entries.length) {
            elements.changeList.classList.add('empty');
            elements.changeList.innerHTML = '<li>' + CLEAN_MESSAGE + '</li>';
            return;
        }

        elements.changeList.classList.remove('empty');
        elements.changeList.innerHTML = entries.join('');
    };

    const renderResult = result => {
        const wordCount = result.text ? result.text.split(/\s+/).length : 0;

        elements.output.value = result.text;

        updateChangeLog(result, wordCount);

    };

    const reset = () => {
        elements.input.value = '';
        elements.output.value = '';
        if (elements.changeList) {
            elements.changeList.classList.add('empty');
            elements.changeList.innerHTML = '<li>' + EMPTY_MESSAGE + '</li>';
        }
        elements.copyButton.textContent = DEFAULT_COPY_LABEL;
        if (elements.pasteButton) {
            elements.pasteButton.textContent = DEFAULT_PASTE_LABEL;
        }
    };

    const performClean = () => {
        syncOptionsFromUI();
        const raw = elements.input.value;
        const result = cleanText(raw, state.options);
        renderResult(result);
    };

    const copyCleaned = () => {
        if (!elements.output.value) {
            elements.copyButton.textContent = 'Nothing to copy';
            setTimeout(() => { elements.copyButton.textContent = DEFAULT_COPY_LABEL; }, 1600);
            return;
        }
        navigator.clipboard.writeText(elements.output.value)
            .then(() => {
                elements.copyButton.textContent = 'Copied!';
                setTimeout(() => { elements.copyButton.textContent = DEFAULT_COPY_LABEL; }, 1600);
            })
            .catch(() => {
                elements.copyButton.textContent = 'Press Ctrl+C';
                setTimeout(() => { elements.copyButton.textContent = DEFAULT_COPY_LABEL; }, 1600);
            });
    };

    const handlePaste = () => {
        if (!elements.pasteButton) {
            return;
        }

        if (!navigator.clipboard || !navigator.clipboard.readText) {
            elements.pasteButton.textContent = 'Clipboard unavailable';
            setTimeout(() => { elements.pasteButton.textContent = DEFAULT_PASTE_LABEL; }, 1600);
            return;
        }

        elements.pasteButton.textContent = 'Pasting...';
        navigator.clipboard.readText()
            .then(text => {
                elements.pasteButton.textContent = DEFAULT_PASTE_LABEL;
                if (!text) {
                    elements.pasteButton.textContent = 'Clipboard empty';
                    setTimeout(() => { elements.pasteButton.textContent = DEFAULT_PASTE_LABEL; }, 1200);
                    return;
                }
                elements.input.value = text;
                if (state.options.autoClean) {
                    performClean();
                }
            })
            .catch(() => {
                elements.pasteButton.textContent = 'Clipboard blocked';
                setTimeout(() => { elements.pasteButton.textContent = DEFAULT_PASTE_LABEL; }, 1600);
            });
    };

    optionControls.forEach(control => {
        control.addEventListener('change', () => {
            syncOptionsFromUI();
            if (state.options.autoClean || control.dataset.option === 'autoClean') {
                performClean();
            }
        });
    });

    elements.cleanButton.addEventListener('click', performClean);
    elements.resetButton.addEventListener('click', () => {
        reset();
        elements.input.focus();
    });
    elements.copyButton.addEventListener('click', copyCleaned);
    if (elements.pasteButton) {
        elements.pasteButton.textContent = DEFAULT_PASTE_LABEL;
        elements.pasteButton.addEventListener('click', handlePaste);
    }
    const handleAutoCleanInput = () => {
        if (!state.options.autoClean) return;
        clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(performClean, SETTINGS.typingDelay);
    };

    elements.input.addEventListener('input', handleAutoCleanInput);
    elements.input.addEventListener('keydown', event => {
        if (event.metaKey && event.key.toLowerCase() === 'enter') {
            performClean();
        }
    });

    reset();
})();
