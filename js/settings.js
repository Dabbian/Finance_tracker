// Database Management
function downloadDatabase() {
    const data = db.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-tracker-${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const status = document.getElementById('dbStatus');
    status.textContent = t('db.downloadedAt', { time: new Date().toLocaleString(activeLocale()) });
    setTimeout(() => {
        status.textContent = '';
    }, 5000);
}

function loadDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            if (!confirm(t('confirms.loadDb', { name: file.name }))) {
                return;
            }
            
            const uint8Array = new Uint8Array(e.target.result);
            db = new SQL.Database(uint8Array);
            
            // Run schema upgrades on imported DB too
            ensureSchema();
            saveDatabase();
            loadDataFromDB();

            document.body.setAttribute('data-theme', theme);
            document.body.setAttribute('data-palette', palette);
            renderThemeButtons();
            document.getElementById('currencySelect').value = currency;
            document.getElementById('monthlyBudget').value = monthlyBudget;
            document.getElementById('monthlyIncome').value = monthlyIncome || '';
            document.getElementById('cycleStartDay').value = cycleStartDay;
            document.getElementById('cycleAdjustment').value = cycleAdjustment;

            updateLabels();
            updateCategorySelects();
            renderPaletteMenu();
            renderCategoriesList();
            updateMonthDisplay();
            updateDashboard();
            updateCharts();
            renderFixedExpenses();
            renderSubscriptionsCard();
            renderCyclePreview();

            alert(t('db.loadOk'));
            
        } catch (error) {
            alert(t('db.loadError', { msg: error.message }));
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}



// =====================================================
// QUICK ADD (Mobile FAB)
// =====================================================
function openQuickAdd() {
    document.getElementById('quickDate').valueAsDate = new Date();
    document.getElementById('quickAddModal').classList.add('active');
    setTimeout(() => document.getElementById('quickAmount').focus(), 100);
}

function closeQuickAdd() {
    document.getElementById('quickAddModal').classList.remove('active');
    document.getElementById('quickAddForm').reset();
}

function addExpenseFromQuick(e) {
    e.preventDefault();
    const description = normalizeImportText(document.getElementById('quickDescription').value);
    const category = description ? guessCategory(description) || document.getElementById('quickCategory').value : document.getElementById('quickCategory').value;
    const amount = parseFloat(document.getElementById('quickAmount').value);
    const date = document.getElementById('quickDate').value;
    const id = Date.now();

    db.run('INSERT INTO expenses (id, amount, category, description, date, swish_repayments) VALUES (?, ?, ?, ?, ?, ?)',
        [id, amount, category, description || t('expenses.noDescription'), date, '[]']);
    saveDatabase();

    expenses.unshift({ id, amount, category, description: description || t('expenses.noDescription'), date, swishRepayments: [] });
    closeQuickAdd();
    updateDashboard();
    updateCharts();
}

// =====================================================
// INCOME
// =====================================================
function updateIncome() {
    monthlyIncome = parseFloat(document.getElementById('monthlyIncome').value) || 0;
    setSetting('monthlyIncome', monthlyIncome.toString());
    updateDashboard();
}

// =====================================================
// BUDGET CYCLE SETTINGS
// =====================================================
function updateCycleSettings() {
    const dayInput = document.getElementById('cycleStartDay');
    const adjInput = document.getElementById('cycleAdjustment');
    let day = parseInt(dayInput.value);
    if (isNaN(day) || day < 1) day = 1;
    if (day > 28) day = 28;
    dayInput.value = day;

    cycleStartDay = day;
    cycleAdjustment = adjInput.value;
    setSetting('cycleStartDay', String(cycleStartDay));
    setSetting('cycleAdjustment', cycleAdjustment);

    // Snap currentViewMonth into the cycle that contains "today"
    currentViewMonth = new Date();
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
    renderCyclePreview();
}

function renderCyclePreview() {
    const preview = document.getElementById('cyclePreview');
    if (!preview) return;
    const bounds = getCycleBounds(new Date());
    const days = bounds.days;
    const dailyBudget = monthlyBudget > 0 && fixedExpenses
        ? (monthlyBudget - fixedExpenses.reduce((s, f) => s + f.amount, 0)) / days
        : 0;

    // Compute what start would have been WITHOUT adjustment, to show the user when a shift was applied
    let adjustmentNote = '';
    if (cycleStartDay !== 1 && cycleAdjustment !== 'none') {
        // Determine which calendar month the cycle is anchored to
        const ref = new Date();
        // Build the unadjusted intended start in the same anchor month
        const anchorMonth = bounds.start.getDate() <= cycleStartDay ? bounds.start.getMonth() : bounds.start.getMonth() + 1;
        const anchorYear  = bounds.start.getDate() <= cycleStartDay ? bounds.start.getFullYear() : bounds.start.getFullYear() + (anchorMonth > 11 ? 1 : 0);
        const intended = new Date(anchorYear, ((anchorMonth % 12) + 12) % 12, cycleStartDay);
        if (intended.getTime() !== bounds.start.getTime()) {
            const intendedLabel = intended.toLocaleDateString(activeLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
            const holiday = holidayName(intended);
            const reason = holiday ? holiday : (intended.getDay() === 0 || intended.getDay() === 6 ? t('cycle.weekendReason') : '');
            adjustmentNote = `<div style="margin-top: 0.5rem; color: var(--text-light); font-size: 0.8rem;">${t('cycle.shiftedFrom', { label: intendedLabel })}${reason ? ' (' + reason + ')' : ''}</div>`;
        }
    }

    preview.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${t('cycle.currentCycle')}</div>
        <div style="color: var(--text-light);">${bounds.label} · ${t('cycle.days', { n: days })}${dailyBudget > 0 ? ` · ${t('cycle.perDay', { amount: formatCurrency(dailyBudget) })}` : ''}</div>
        ${adjustmentNote}
    `;
}
