// Excel Import - Enhanced for row 1 AND row 7
function handleFileSelect(e) {
    if (e.target.files.length) handleFile(e.target.files[0]);
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            processExcelData(rows);
        } catch (error) {
            alert(t('errors.readFile', { msg: error.message }));
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('excelFile').value = '';
}

// Credit-card statements invert the usual sign convention: a charge
// appears as a positive number (money you owe) and a payment appears
// as a negative number. For credit-card accounts we flip the rule so
// charges still count as spending toward the daily budget and streak.
function accountIsCredit(accountId) {
    if (accountId == null || accountId === '') return false;
    const id = parseInt(accountId, 10);
    const a = accounts.find(x => x.id === id);
    return !!(a && a.type === 'credit');
}

function deriveImportKind(signedAmount, isSwishRepayment, accountId, isSalary, transferDirection) {
    const isPositive = signedAmount > 0;
    // Transfer wins over salary/swish: it's a movement between your own
    // accounts and shouldn't be in spending or income totals.
    if (transferDirection === 'in') return 'transfer-in';
    if (transferDirection === 'out') return 'transfer-out';
    if (isSalary) return 'income';
    if (isSwishRepayment) return 'expense'; // attached to an expense as a repayment
    if (accountIsCredit(accountId)) {
        // Flip: positive charge → expense, negative payment → income.
        return isPositive ? 'expense' : 'income';
    }
    return isPositive ? 'income' : 'expense';
}

// Escape a string for safe inclusion in a RegExp literal.
function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tiny attribute-safe escaper for short text injected into HTML
// attributes (titles/aria-labels). Doesn't try to be a full sanitizer
// — the surrounding code already trusts the descriptions enough to
// drop them into innerHTML elsewhere.
function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

// Normalize a description for fuzzy comparison: NFC, lowercase, trim,
// collapse internal whitespace. Lets "Coop Konsum  " == "coop konsum".
function normalizeDescForMatch(s) {
    return String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Look for a previously imported transaction that could be the same as
// `item`. Returns { status, match } where status is:
//   'exact' — same amount, same date, same description → almost certainly a dup
//   'maybe' — same amount, same date, but description differs → ask user
//   null    — no match
// Amounts are compared with a 0.01 tolerance to avoid float oddities.
function findDuplicateForImport(item) {
    const wantAmount = Math.abs(item.amount);
    const wantDesc = normalizeDescForMatch(item.description);
    let maybe = null;
    for (const exp of expenses) {
        if (exp.date !== item.date) continue;
        if (Math.abs((exp.amount || 0) - wantAmount) > 0.01) continue;
        const haveDesc = normalizeDescForMatch(exp.description);
        if (haveDesc === wantDesc) {
            return { status: 'exact', match: exp };
        }
        if (!maybe) maybe = exp;
    }
    return maybe ? { status: 'maybe', match: maybe } : { status: null, match: null };
}

// "Lön", "LÖN 2026-05", "Månadslön", "Lon april" — all should match.
// NFC-normalize first so decomposed accents from bank exports still hit.
function isSalaryDescription(description) {
    if (!description) return false;
    const normalized = String(description).normalize('NFC').toLowerCase();
    return /\bl[öo]n\b/.test(normalized);
}

// Decide whether a description points at a known transfer, and which
// way the money is moving. Returns 'in' | 'out' | null.
//
// Direction priority:
//   1. "till <accountName>"        → 'out'   (money sent to one of your accounts)
//      "från <accountName>"        → 'in'    (money came from one of your accounts)
//      "fran <accountName>"        → 'in'    (decomposed-accent variant)
//      where <accountName> must match an existing account's name.
//   2. Generic "överf*"/"transfer" word with no account match → use the
//      signed amount as the direction hint (positive=in, negative=out).
//   3. Otherwise null.
//
// Account-name match: case- and accent-tolerant substring with word
// boundaries — "till Sparkonto", "Överföring till Sparkonto 12345" all
// match an account named "Sparkonto".
function detectTransferDirection(description, signedAmount) {
    if (!description) return null;
    const desc = String(description).normalize('NFC').toLowerCase();

    for (const acc of accounts) {
        const name = (acc.name || '').normalize('NFC').toLowerCase().trim();
        if (!name) continue;
        const nameRe = escapeRegex(name);
        if (new RegExp(`\\btill\\s+${nameRe}\\b`).test(desc)) return 'out';
        if (new RegExp(`\\bfr[åa]n\\s+${nameRe}\\b`).test(desc)) return 'in';
    }

    if (/\böverf\w*/.test(desc) || /\btransfer\b/.test(desc)) {
        return signedAmount > 0 ? 'in' : 'out';
    }
    return null;
}

function processExcelData(rows) {
    pendingImports = [];

    // 1. Find the header row by scanning for date-like column headers in the first 30 rows.
    // Bank exports often have a few intro/metadata rows before the table starts.
    const headerKeywords = {
        date:        ['datum', 'date', 'transaktionsdatum', 'köpdatum', 'bokföringsdatum'],
        description: ['beskrivning', 'description', 'specifikation', 'detaljer', 'merchant', 'butik', 'beskr', 'transaktion', 'text'],
        amount:      ['belopp', 'amount', 'summa', 'belopp (kr)', 'transaktionsbelopp', 'belopp i sek', 'belopp sek']
    };

    function normalize(v) {
        return (v || '').toString().toLowerCase().trim();
    }

    function findColumnIndex(headerRow, candidates) {
        // Return first index whose header matches (or contains) any candidate
        // Prefer exact match over substring match
        const normalized = headerRow.map(normalize);
        for (const cand of candidates) {
            const idx = normalized.indexOf(cand);
            if (idx !== -1) return idx;
        }
        for (let i = 0; i < normalized.length; i++) {
            for (const cand of candidates) {
                if (normalized[i] && normalized[i].includes(cand)) return i;
            }
        }
        return -1;
    }

    let headerIdx = -1;
    let dateCol = -1, descCol = -1, amountCol = -1;

    const scanLimit = Math.min(rows.length, 30);
    for (let i = 0; i < scanLimit; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const dCol = findColumnIndex(row, headerKeywords.date);
        const aCol = findColumnIndex(row, headerKeywords.amount);
        if (dCol !== -1 && aCol !== -1) {
            headerIdx = i;
            dateCol = dCol;
            amountCol = aCol;
            descCol = findColumnIndex(row, headerKeywords.description);
            break;
        }
    }

    // 2. If no header detected, fall back to column-position assumption: [date, description, amount]
    if (headerIdx === -1) {
        headerIdx = -1; // treat row 0 as data
        dateCol = 0;
        descCol = 1;
        amountCol = 2;
    }

    // 3. Iterate data rows
    const dataRows = rows.slice(headerIdx + 1);
    let skippedReasons = { empty: 0, badDate: 0, zeroAmount: 0 };

    dataRows.forEach(row => {
        if (!row || row.length === 0) { skippedReasons.empty++; return; }

        const datum = row[dateCol];
        const beskrivning = descCol !== -1 ? row[descCol] : '';
        const belopp = row[amountCol];

        if (datum === undefined || datum === null || datum === '') { skippedReasons.empty++; return; }

        // Parse date — handles Excel serial numbers AND various string formats
        const date = parseFlexibleDate(datum);
        if (!date || isNaN(date.getTime())) { skippedReasons.badDate++; return; }

        const dateStr = isoDate(date);

        // Parse amount — handles "1 234,56", "1,234.56", "-150.00", "150.00 kr", numbers
        let amountRaw = parseFlexibleAmount(belopp);
        if (isNaN(amountRaw) || amountRaw === 0) { skippedReasons.zeroAmount++; return; }

        const isPositive = amountRaw > 0;
        const amount = Math.abs(amountRaw);

        // Normalize description text: NFC handles bank exports that use decomposed Unicode (O + ¨ → Ö).
        // Without NFC, Å Ä Ö can search/compare incorrectly even though they look right on screen.
        const description = normalizeImportText(beskrivning) || t('imports.importedFallback');

        // Detect Swish repayments (incoming money from a friend, e.g., paying you back for shared dinner).
        // Pattern: positive amount AND description starts with "Swish från" (case-insensitive, accent-insensitive).
        const isSwishRepayment = isPositive && isSwishFromText(description);
        const isSalary = isSalaryDescription(description);
        const transferDirection = detectTransferDirection(description, amountRaw);
        const draft = {
            date: dateStr,
            description: description,
            amount: amount,
            signedAmount: amountRaw,    // preserved so kind can flip when account is a credit card
            category: guessCategory(description),
            swishRepayments: [],
            isSwishRepayment: isSwishRepayment,
            isSalary: isSalary,
            transferDirection: transferDirection,
            kind: deriveImportKind(amountRaw, isSwishRepayment, null, isSalary, transferDirection),
            accountId: null,            // user picks from preview UI
            attachToExpenseId: null     // for Swish repayments
        };
        const dup = findDuplicateForImport(draft);
        draft.duplicateStatus = dup.status;     // 'exact' | 'maybe' | null
        draft.duplicateMatchDesc = dup.match ? dup.match.description : null;
        // Exact dupes default to skipped; "maybe" dupes require an
        // explicit user decision but start as not-skipped (user sees
        // a warning chip and can flip the toggle).
        draft.skip = dup.status === 'exact';
        pendingImports.push(draft);
    });

    if (pendingImports.length === 0) {
        const detail = headerIdx === -1
            ? t('imports.noHeaderRow')
            : t('imports.headerNoRows', {
                line: headerIdx + 1,
                dateCol: dateCol + 1,
                amountCol: amountCol + 1,
                empty: skippedReasons.empty,
                badDate: skippedReasons.badDate,
                zeroAmount: skippedReasons.zeroAmount
            });
        alert(t('errors.noExpensesFound') + '\n\n' + detail);
        return;
    }

    // If any rows look like duplicates, resolve them in their own popup
    // first. Cleaner mental model than mixing dupes into the main review.
    if (pendingImports.some(i => i.duplicateStatus)) {
        showImportDuplicatesModal();
    } else {
        showImportModal();
    }
}

// =====================================================
// Duplicates-first popup
// Shown before the main import modal whenever any parsed row matched an
// existing transaction. Lets the user batch-decide skip vs. import-anyway
// without scrolling past clean rows.
// =====================================================

function showImportDuplicatesModal() {
    const list = document.getElementById('importDuplicatesList');
    const intro = document.getElementById('importDupIntro');
    if (!list || !intro) return;

    const dups = pendingImports
        .map((item, idx) => ({ item, idx }))
        .filter(p => p.item.duplicateStatus);

    const exactN = dups.filter(p => p.item.duplicateStatus === 'exact').length;
    const maybeN = dups.length - exactN;
    intro.textContent = t('imports.dupIntro', { exact: exactN, maybe: maybeN, total: dups.length });

    const warnIcon = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" style="flex-shrink:0;"><path fill="currentColor" d="M8 1.5 15 14H1L8 1.5Zm0 4.25v3.75M8 11.5h.007" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
    const equalIcon = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" style="flex-shrink:0;"><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" d="M3 6h10M3 10h10"/></svg>';

    list.innerHTML = dups.map(({ item, idx }) => {
        const isExact = item.duplicateStatus === 'exact';
        const badge = isExact
            ? `<span class="import-tag dup-exact">${equalIcon}<span>${t('imports.dupExact')}</span></span>`
            : `<span class="import-tag dup-maybe">${warnIcon}<span>${t('imports.dupMaybe')}</span></span>`;
        const matchLine = item.duplicateMatchDesc
            ? `<div class="dup-row-match">↪ ${item.duplicateMatchDesc}</div>`
            : '';
        return `
            <div class="dup-row-card ${isExact ? 'is-exact' : 'is-maybe'}">
                <div class="dup-row-info">
                    <div class="dup-row-title"><strong>${item.description}</strong> ${badge}</div>
                    <div class="dup-row-meta">${formatDate(item.date)} · <span class="dup-row-amount">${formatCurrency(item.amount)}</span></div>
                    ${matchLine}
                </div>
                <div class="dup-switch ${item.skip ? '' : 'is-import'}" role="group" aria-label="${t('imports.dupDecisionLabel')}">
                    <span class="dup-switch-thumb" aria-hidden="true"></span>
                    <button type="button" class="dup-switch-option dup-switch-option-skip" onclick="setImportDupSkip(${idx}, true)" aria-pressed="${item.skip ? 'true' : 'false'}">${t('imports.dupSkip')}</button>
                    <button type="button" class="dup-switch-option dup-switch-option-import" onclick="setImportDupSkip(${idx}, false)" aria-pressed="${!item.skip ? 'true' : 'false'}">${t('imports.dupImport')}</button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('importDuplicatesModal').classList.add('active');
}

// Per-row skip handler for the dup modal. Unlike setImportRowSkip we
// only re-render the dup modal (cheaper, and the main modal isn't open).
function setImportDupSkip(idx, skip) {
    const item = pendingImports[idx];
    if (!item) return;
    item.skip = !!skip;
    showImportDuplicatesModal();
}

function dupBulkSetSkip(skip) {
    pendingImports.forEach(item => {
        if (item.duplicateStatus) item.skip = !!skip;
    });
    showImportDuplicatesModal();
}

function closeImportDuplicatesModal() {
    document.getElementById('importDuplicatesModal').classList.remove('active');
    pendingImports = [];
}

function continueFromDuplicatesModal() {
    document.getElementById('importDuplicatesModal').classList.remove('active');
    showImportModal();
}

// Normalize imported text: trim, remove control chars, NFC-normalize Unicode.
// NFC turns decomposed forms like "O" + combining diaeresis (U+0308) into precomposed "Ö".
function normalizeImportText(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (typeof s.normalize === 'function') s = s.normalize('NFC');
    // Strip stray non-printable control characters (some banks include these as separators)
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return s.trim();
}

// "Swish från Anna" / "SWISH FRÅN ANNA" / decomposed-accent variants — all should match.
function isSwishFromText(description) {
    if (!description) return false;
    const normalized = String(description).normalize('NFC').toLowerCase().trim();
    return normalized.startsWith('swish från') || normalized.startsWith('swish fran');
}

// Extract the sender name from "Swish från X" (used in preview UI)
function extractSwishSender(description) {
    if (!description) return '';
    const match = String(description).match(/^swish\s+fr[åa]n\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

// Parse a value into a Date — supports Excel serial numbers and many string formats
function parseFlexibleDate(value) {
    if (value === undefined || value === null || value === '') return null;

    // Excel serial number
    if (typeof value === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + value * 86400000);
    }

    const str = value.toString().trim();
    if (!str) return null;

    // Try native Date.parse first (handles ISO, RFC, US format)
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
        // Sanity check: Date.parse('2025-13-01') in some engines returns valid junk.
        // Reject anything outside reasonable range.
        const y = d.getFullYear();
        if (y >= 1900 && y <= 2100) return d;
    }

    // Try Swedish/European formats: YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
    const m1 = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m1) return new Date(+m1[1], +m1[2] - 1, +m1[3]);

    const m2 = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m2) {
        // Ambiguous: DD/MM/YYYY vs MM/DD/YYYY. For Sweden assume DD first.
        return new Date(+m2[3], +m2[2] - 1, +m2[1]);
    }

    return null;
}

// Parse an amount — handles Swedish "1 234,56" and English "1,234.56" and stray currency
function parseFlexibleAmount(value) {
    if (value === undefined || value === null || value === '') return NaN;
    if (typeof value === 'number') return value;

    let s = value.toString().trim();
    if (!s) return NaN;

    // Strip currency symbols and spaces (incl. non-breaking)
    s = s.replace(/[^\d,.\-+]/g, '');

    // Decide decimal separator: if both . and , appear, the LAST one is the decimal
    if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        // Only comma — assume Swedish decimal
        s = s.replace(',', '.');
    }
    return parseFloat(s);
}

function showImportModal() {
    const swishCount = pendingImports.filter(i => i.isSwishRepayment).length;
    const transferCount = pendingImports.filter(i => i.kind === 'transfer-in' || i.kind === 'transfer-out').length;
    const incomeCount = pendingImports.filter(i => i.kind === 'income' && !i.isSwishRepayment).length;
    const expenseCount = pendingImports.length - swishCount - incomeCount - transferCount;
    const skippedCount = pendingImports.filter(i => i.skip).length;

    // Render compact stat chips — easier to scan than a long " · " line.
    const chipsEl = document.getElementById('importStatChips');
    if (chipsEl) {
        const chip = (cls, label, n) => `<span class="import-stat-chip ${cls}"><span class="import-stat-chip-num">${n}</span><span>${label}</span></span>`;
        const parts = [];
        if (expenseCount > 0)  parts.push(chip('', t('imports.chipExpenses'), expenseCount));
        if (incomeCount > 0)   parts.push(chip('is-income', t('imports.chipIncome'), incomeCount));
        if (transferCount > 0) parts.push(chip('is-transfer', t('imports.chipTransfers'), transferCount));
        if (swishCount > 0)    parts.push(chip('is-swish', t('imports.chipSwish'), swishCount));
        if (skippedCount > 0)  parts.push(chip('is-dup', t('imports.chipSkipped'), skippedCount));
        chipsEl.innerHTML = parts.join('');
    }

    // Default-account picker — applied to every row that doesn't have
    // a specific override yet.
    const defaultAccountSelect = document.getElementById('importDefaultAccount');
    if (defaultAccountSelect) {
        defaultAccountSelect.innerHTML = renderAccountOptions(null);
    }

    const preview = document.getElementById('importPreview');
    preview.innerHTML = pendingImports.map((item, idx) => {
        if (item.isSwishRepayment) {
            return renderSwishImportRow(item, idx);
        }
        return renderExpenseImportRow(item, idx);
    }).join('');

    document.getElementById('importModal').classList.add('active');
}

// <option> set for an account picker. Includes a "—" no-account row
// at the top so users can leave a transaction unlinked.
function renderAccountOptions(selectedId) {
    const none = `<option value="" ${selectedId == null ? 'selected' : ''}>${t('imports.noAccount')}</option>`;
    const list = accounts.map(a =>
        `<option value="${a.id}" ${String(selectedId) === String(a.id) ? 'selected' : ''}>${a.name}</option>`
    ).join('');
    return none + list;
}

// Apply the default-account dropdown to every pending row that's still
// unset. Called from the dropdown's onchange handler in the modal.
// Rows whose kind the user manually picked keep that kind — only the
// account is changed.
function applyImportDefaultAccount() {
    const sel = document.getElementById('importDefaultAccount');
    if (!sel) return;
    const id = sel.value || null;
    pendingImports.forEach(item => {
        item.accountId = id;
        if (!item.kindOverride) {
            item.kind = deriveImportKind(item.signedAmount, item.isSwishRepayment, id, item.isSalary, item.transferDirection);
        }
    });
    showImportModal(); // re-render so flipped kinds show their new sign/tag
}

// Called from each row's account <select> onchange — keeps that one
// row's kind in sync with the chosen account's type, unless the user
// has manually overridden the kind for that row.
function setImportRowAccount(idx, value) {
    const item = pendingImports[idx];
    if (!item) return;
    item.accountId = value || null;
    if (!item.kindOverride) {
        item.kind = deriveImportKind(item.signedAmount, item.isSwishRepayment, item.accountId, item.isSalary, item.transferDirection);
    }
    showImportModal();
}

// Toggle whether a row will be inserted on import confirm. Lets the
// user resurrect an exact-dup row ("import anyway") or skip a maybe-
// dup row that they've decided is actually the same transaction.
function setImportRowSkip(idx, skip) {
    const item = pendingImports[idx];
    if (!item) return;
    item.skip = !!skip;
    showImportModal();
}

// User-facing manual kind override from the per-row Type dropdown.
// Marks the row so later account/default changes don't clobber it.
function setImportRowKind(idx, value) {
    const item = pendingImports[idx];
    if (!item) return;
    const validKinds = ['expense', 'income', 'transfer-in', 'transfer-out'];
    if (!validKinds.includes(value)) return;
    item.kind = value;
    item.kindOverride = true;
    showImportModal();
}

function renderExpenseImportRow(item, idx) {
    const isIncome = item.kind === 'income';
    const isTransferIn = item.kind === 'transfer-in';
    const isTransferOut = item.kind === 'transfer-out';
    const isTransfer = isTransferIn || isTransferOut;
    const amountClass = isIncome
        ? 'import-amount income'
        : isTransfer ? 'import-amount transfer' : 'import-amount';
    const sign = (isIncome || isTransferIn) ? '+' : (isTransferOut ? '−' : '');
    let kindBadge = '';
    if (isIncome) kindBadge = `<span class="import-tag income">${t('imports.incomeTag')}</span>`;
    else if (isTransferIn) kindBadge = `<span class="import-tag transfer">${t('imports.transferIn')}</span>`;
    else if (isTransferOut) kindBadge = `<span class="import-tag transfer">${t('imports.transferOut')}</span>`;

    // Duplicate detection chip — small, no inline skip toggle (the user
    // already resolved each dup in the Step 1 popup, so no need to
    // re-prompt; the badge is just informational here).
    let dupBadge = '';
    if (item.duplicateStatus === 'exact') {
        dupBadge = `<span class="import-tag dup-exact" title="${escapeAttr(item.duplicateMatchDesc || '')}">${t('imports.dupExact')}</span>`;
    } else if (item.duplicateStatus === 'maybe') {
        const matchLabel = item.duplicateMatchDesc
            ? t('imports.dupMaybeWith', { desc: item.duplicateMatchDesc })
            : t('imports.dupMaybe');
        dupBadge = `<span class="import-tag dup-maybe" title="${escapeAttr(matchLabel)}">${t('imports.dupMaybe')}</span>`;
    }

    const dupRowClass = item.duplicateStatus === 'exact' ? 'dup-exact'
        : item.duplicateStatus === 'maybe' ? 'dup-maybe' : '';
    const isExpanded = !!item._expanded;
    const editIcon = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" d="M10.5 2.5l3 3-8 8H2.5v-3l8-8Z"/></svg>';
    const trashIcon = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 8.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.4M7 7v4M9 7v4"/></svg>';
    const skippedBadge = item.skip
        ? `<span class="import-tag is-skipped">${t('imports.skippedTag')}</span>`
        : '';

    return `
        <div class="import-row ${isIncome ? 'income' : ''} ${isTransfer ? 'transfer' : ''} ${dupRowClass} ${item.skip ? 'is-skipped' : ''} ${isExpanded ? 'is-expanded' : ''}">
            <div class="import-row-main">
                <div class="import-row-info">
                    <div class="import-row-title"><strong>${item.description}</strong> ${kindBadge}${dupBadge}${skippedBadge}</div>
                    <div class="import-row-meta">${formatDate(item.date)}</div>
                </div>
                <div class="${amountClass}">${sign}${formatCurrency(item.amount)}</div>
                <div class="import-row-actions">
                    <button type="button" class="import-row-edit ${isExpanded ? 'is-active' : ''}" onclick="toggleImportRowExpanded(${idx})" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="${t('imports.editRow')}">${editIcon}<span>${t('imports.editRow')}</span></button>
                    <button type="button" class="import-row-delete" onclick="removePendingImport(${idx})" aria-label="${t('imports.removeRow')}">${trashIcon}</button>
                </div>
            </div>
            ${isExpanded ? `
            <div class="import-row-details">
                <div class="import-row-field">
                    <label for="import-kind-${idx}" data-i18n="labels.transactionType">${t('labels.transactionType')}</label>
                    <select id="import-kind-${idx}" onchange="setImportRowKind(${idx}, this.value)">
                        <option value="expense"      ${item.kind === 'expense' ? 'selected' : ''}>${t('kinds.expense')}</option>
                        <option value="income"       ${item.kind === 'income' ? 'selected' : ''}>${t('kinds.income')}</option>
                        <option value="transfer-out" ${item.kind === 'transfer-out' ? 'selected' : ''}>${t('imports.transferOut')}</option>
                        <option value="transfer-in"  ${item.kind === 'transfer-in' ? 'selected' : ''}>${t('imports.transferIn')}</option>
                    </select>
                </div>
                <div class="import-row-field">
                    <label for="import-cat-${idx}">${t('labels.category')}</label>
                    <select id="import-cat-${idx}" onchange="pendingImports[${idx}].category = this.value">
                        ${categories.map(cat =>
                            `<option value="${cat.id}" ${item.category === cat.id ? 'selected' : ''}>${localizedCategoryName(cat)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="import-row-field">
                    <label for="import-acct-${idx}">${t('labels.account')}</label>
                    <select id="import-acct-${idx}" onchange="setImportRowAccount(${idx}, this.value)">
                        ${renderAccountOptions(item.accountId)}
                    </select>
                </div>
                ${item.duplicateStatus ? `
                <div class="import-row-field import-row-field-skip">
                    <label class="import-skip-toggle">
                        <input type="checkbox" ${item.skip ? 'checked' : ''} onchange="setImportRowSkip(${idx}, this.checked)">
                        <span>${t('imports.skipThisRow')}</span>
                    </label>
                </div>` : ''}
            </div>` : ''}
        </div>
    `;
}

// Toggle the inline details panel for an import row.
function toggleImportRowExpanded(idx) {
    const item = pendingImports[idx];
    if (!item) return;
    item._expanded = !item._expanded;
    showImportModal();
}

function renderSwishImportRow(item, idx) {
    const sender = extractSwishSender(item.description) || t('imports.someone');
    const candidates = findSwishCandidateExpenses(item, idx);

    const candidateOptions = candidates.map(c => {
        const labelDate = c.date ? formatDate(c.date) : '';
        const labelAmt = formatCurrency(c.amount);
        const labelDesc = c.description.length > 40 ? c.description.slice(0, 38) + '…' : c.description;
        const value = c.source === 'pending' ? `pending:${c.idx}` : `db:${c.id}`;
        const selected = item.attachToExpenseId === value ? 'selected' : '';
        return `<option value="${value}" ${selected}>${labelDate} · ${labelDesc} · ${labelAmt}</option>`;
    }).join('');

    return `
        <div class="import-row import-row-swish">
            <div class="swish-tag">${t('imports.swishFrom', { sender })}</div>
            <div style="flex: 1; min-width: 0;">
                <strong>${item.description}</strong><br>
                <small style="color: var(--text-light);">${formatDate(item.date)}</small>
            </div>
            <div class="import-amount" style="color: var(--success);">+${formatCurrency(item.amount)}</div>
            <select style="padding: 0.5rem; width: 260px;" onchange="setSwishAttachment(${idx}, this.value)">
                <option value="" ${!item.attachToExpenseId ? 'selected' : ''}>${t('imports.skip')}</option>
                ${candidateOptions}
            </select>
            <button class="delete-btn" onclick="removePendingImport(${idx})">×</button>
        </div>
    `;
}

// Returns suggested expenses to attach a swish repayment to, ordered by likelihood.
// Looks at both existing DB expenses AND other pending imports in the same batch.
function findSwishCandidateExpenses(swishItem, swishIdx) {
    const swishDate = new Date(swishItem.date + 'T00:00:00');
    const dayMs = 86400000;
    const candidates = [];

    // Existing expenses (last 60 days from the swish date)
    expenses.forEach(exp => {
        const expDate = new Date(exp.date + 'T00:00:00');
        const dayDiff = Math.abs((swishDate - expDate) / dayMs);
        if (dayDiff > 60) return;
        if (exp.amount < swishItem.amount) return; // expense must be at least as much as the repayment
        candidates.push({
            source: 'db',
            id: exp.id,
            date: exp.date,
            amount: exp.amount,
            description: exp.description,
            dayDiff: dayDiff
        });
    });

    // Other pending imports in this batch (must be regular expenses, not swish)
    pendingImports.forEach((other, otherIdx) => {
        if (otherIdx === swishIdx || other.isSwishRepayment) return;
        const otherDate = new Date(other.date + 'T00:00:00');
        const dayDiff = Math.abs((swishDate - otherDate) / dayMs);
        if (dayDiff > 60) return;
        if (other.amount < swishItem.amount) return;
        candidates.push({
            source: 'pending',
            idx: otherIdx,
            date: other.date,
            amount: other.amount,
            description: other.description,
            dayDiff: dayDiff
        });
    });

    // Rank: closer in time + higher amount (relative to swish) wins
    candidates.sort((a, b) => {
        if (Math.abs(a.dayDiff - b.dayDiff) > 3) return a.dayDiff - b.dayDiff;
        return b.amount - a.amount;
    });

    return candidates.slice(0, 8);
}

function setSwishAttachment(idx, value) {
    pendingImports[idx].attachToExpenseId = value || null;
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    pendingImports = [];
}

function removePendingImport(idx) {
    pendingImports.splice(idx, 1);
    if (pendingImports.length === 0) {
        closeImportModal();
    } else {
        showImportModal();
    }
}

function confirmImport() {
    const baseId = Date.now() * 1000;
    let insertedExpenses = 0;
    let attachedRepayments = 0;
    let skippedSwish = 0;
    let skippedDuplicates = 0;
    const failed = [];

    // Map from "pending:idx" → assigned DB id, used so swish rows can attach to expenses we just inserted
    const pendingIdToInsertedId = {};

    // Phase 1: insert all non-swish expenses, recording their assigned IDs
    pendingImports.forEach((item, idx) => {
        if (item.isSwishRepayment) return;
        if (item.skip) { skippedDuplicates++; return; }
        const id = baseId + idx;
        const accountId = (item.accountId != null && item.accountId !== '')
            ? parseInt(item.accountId, 10)
            : null;
        const validKinds = ['income', 'expense', 'transfer-in', 'transfer-out'];
        const kind = validKinds.includes(item.kind) ? item.kind : 'expense';
        try {
            db.run(
                'INSERT INTO expenses (id, amount, category, description, date, swish_repayments, account_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, item.amount, item.category, item.description, item.date, '[]', accountId, kind]
            );
            insertedExpenses++;
            pendingIdToInsertedId[`pending:${idx}`] = id;
        } catch (err) {
            failed.push({ item, error: err.message });
            console.error('Import row failed:', item, err);
        }
    });

    // Phase 2: attach swish repayments to the chosen expenses
    pendingImports.forEach((item, idx) => {
        if (!item.isSwishRepayment) return;
        if (!item.attachToExpenseId) {
            skippedSwish++;
            return;
        }

        // Resolve the target expense's DB id
        let targetId = null;
        if (item.attachToExpenseId.startsWith('db:')) {
            targetId = parseInt(item.attachToExpenseId.slice(3));
        } else if (item.attachToExpenseId.startsWith('pending:')) {
            targetId = pendingIdToInsertedId[item.attachToExpenseId];
        }
        if (!targetId) { skippedSwish++; return; }

        try {
            // Read existing repayments, append, write back
            const result = db.exec('SELECT swish_repayments FROM expenses WHERE id = ?', [targetId]);
            let existing = [];
            if (result.length > 0 && result[0].values.length > 0) {
                try { existing = JSON.parse(result[0].values[0][0] || '[]') || []; } catch (e) { existing = []; }
            }
            existing.push({ amount: item.amount, date: new Date(item.date + 'T00:00:00').toISOString() });
            db.run('UPDATE expenses SET swish_repayments = ? WHERE id = ?', [JSON.stringify(existing), targetId]);
            attachedRepayments++;
        } catch (err) {
            failed.push({ item, error: err.message });
            console.error('Swish attach failed:', item, err);
        }
    });

    saveDatabase();
    loadDataFromDB();
    // After import, re-check fixed expenses against the new transactions
    // (including historical months). Matches are recognised silently;
    // unmatched past billing dates get placeholder rows just like at app
    // init.
    if (typeof autoCreateMissingFixedExpenseTransactions === 'function') {
        autoCreateMissingFixedExpenseTransactions();
    }
    updateDashboard();
    updateCharts();
    closeImportModal();

    // Build a friendly summary
    const parts = [];
    if (insertedExpenses > 0) parts.push(t(insertedExpenses === 1 ? 'imports.oneExpenseImported' : 'imports.expensesImported', { n: insertedExpenses }));
    if (attachedRepayments > 0) parts.push(t(attachedRepayments === 1 ? 'imports.oneSwishAttached' : 'imports.swishAttached', { n: attachedRepayments }));
    if (skippedSwish > 0) parts.push(t(skippedSwish === 1 ? 'imports.oneSwishSkipped' : 'imports.swishSkipped', { n: skippedSwish }));
    if (skippedDuplicates > 0) parts.push(t(skippedDuplicates === 1 ? 'imports.oneDupSkipped' : 'imports.dupSkipped', { n: skippedDuplicates }));
    let msg = parts.length > 0 ? parts.join(' · ') : t('imports.nothingImported');
    if (failed.length > 0) msg += '\n\n' + t('imports.failedSuffix', { n: failed.length });
    alert(msg);
}
