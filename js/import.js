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
        // Anything else that's positive and not a Swish repayment is
        // treated as income (a deposit / refund / salary). It still
        // gets a category guess but the user can leave it as "other".
        const kind = (isPositive && !isSwishRepayment) ? 'income' : 'expense';

        pendingImports.push({
            date: dateStr,
            description: description,
            amount: amount,
            category: guessCategory(description),
            swishRepayments: [],
            isSwishRepayment: isSwishRepayment,
            kind,
            accountId: null,            // user picks from preview UI
            attachToExpenseId: null     // for Swish repayments
        });
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
    const incomeCount = pendingImports.filter(i => i.kind === 'income' && !i.isSwishRepayment).length;
    const expenseCount = pendingImports.length - swishCount - incomeCount;

    // Update header summary
    const countEl = document.getElementById('importCount');
    const parts = [t('expenses.countLabel', { n: expenseCount })];
    if (incomeCount > 0) {
        parts.push(`<span style="color: var(--success);">${t(incomeCount === 1 ? 'imports.incomeOne' : 'imports.incomeMany', { n: incomeCount })}</span>`);
    }
    if (swishCount > 0) {
        parts.push(`<span style="color: var(--success);">${t(swishCount === 1 ? 'expenses.swishOne' : 'expenses.swishMany', { n: swishCount })}</span>`);
    }
    countEl.innerHTML = parts.join(' · ');

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
function applyImportDefaultAccount() {
    const sel = document.getElementById('importDefaultAccount');
    if (!sel) return;
    const id = sel.value || null;
    pendingImports.forEach((item, idx) => {
        item.accountId = id;
        const rowSel = document.getElementById('import-acct-' + idx);
        if (rowSel) rowSel.value = id || '';
    });
}

function renderExpenseImportRow(item, idx) {
    const isIncome = item.kind === 'income';
    const amountClass = isIncome ? 'import-amount income' : 'import-amount';
    const sign = isIncome ? '+' : '';
    const kindBadge = isIncome
        ? `<span class="import-tag income">${t('imports.incomeTag')}</span>`
        : '';
    return `
        <div class="import-row ${isIncome ? 'income' : ''}">
            <div style="flex: 1; min-width: 0;">
                <strong>${item.description}</strong> ${kindBadge}<br>
                <small style="color: var(--text-light);">${formatDate(item.date)}</small>
            </div>
            <div class="${amountClass}">${sign}${formatCurrency(item.amount)}</div>
            <select id="import-cat-${idx}" style="padding: 0.5rem; width: 140px;" onchange="pendingImports[${idx}].category = this.value">
                ${categories.map(cat =>
                    `<option value="${cat.id}" ${item.category === cat.id ? 'selected' : ''}>${localizedCategoryName(cat)}</option>`
                ).join('')}
            </select>
            <select id="import-acct-${idx}" style="padding: 0.5rem; width: 160px;" onchange="pendingImports[${idx}].accountId = this.value || null">
                ${renderAccountOptions(item.accountId)}
            </select>
            <button class="delete-btn" onclick="removePendingImport(${idx})">×</button>
        </div>
    `;
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
    const failed = [];

    // Map from "pending:idx" → assigned DB id, used so swish rows can attach to expenses we just inserted
    const pendingIdToInsertedId = {};

    // Phase 1: insert all non-swish expenses, recording their assigned IDs
    pendingImports.forEach((item, idx) => {
        if (item.isSwishRepayment) return;
        const id = baseId + idx;
        const accountId = (item.accountId != null && item.accountId !== '')
            ? parseInt(item.accountId, 10)
            : null;
        const kind = item.kind === 'income' ? 'income' : 'expense';
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
    updateDashboard();
    updateCharts();
    closeImportModal();

    // Build a friendly summary
    const parts = [];
    if (insertedExpenses > 0) parts.push(t(insertedExpenses === 1 ? 'imports.oneExpenseImported' : 'imports.expensesImported', { n: insertedExpenses }));
    if (attachedRepayments > 0) parts.push(t(attachedRepayments === 1 ? 'imports.oneSwishAttached' : 'imports.swishAttached', { n: attachedRepayments }));
    if (skippedSwish > 0) parts.push(t(skippedSwish === 1 ? 'imports.oneSwishSkipped' : 'imports.swishSkipped', { n: skippedSwish }));
    let msg = parts.length > 0 ? parts.join(' · ') : t('imports.nothingImported');
    if (failed.length > 0) msg += '\n\n' + t('imports.failedSuffix', { n: failed.length });
    alert(msg);
}
