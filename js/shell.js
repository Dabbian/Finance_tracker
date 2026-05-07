// Theme
function setTheme(newTheme) {
    if (newTheme !== 'light' && newTheme !== 'dark') return;
    theme = newTheme;
    document.body.setAttribute('data-theme', theme);
    setSetting('theme', theme);
    renderThemeButtons();
}

function renderThemeButtons() {
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeValue === theme);
    });
}

// Palette — now rendered inline in Settings, no popup
function renderPaletteMenu() {
    const grid = document.getElementById('paletteGrid');
    if (!grid) return;
    grid.innerHTML = palettePresets.map(p => `
        <div class="palette-option ${p.id === palette ? 'active' : ''}" onclick="changePalette('${p.id}')">
            <span class="palette-name">${p.name}</span>
            <div class="palette-swatches">
                ${p.swatches.map(c => `<span style="background:${c};"></span>`).join('')}
            </div>
        </div>
    `).join('');
}

function changePalette(id) {
    palette = id;
    document.body.setAttribute('data-palette', id);
    setSetting('palette', id);
    renderPaletteMenu();
}

// Language picker — segmented control matching the Theme one
function renderLanguageOptions() {
    const wrap = document.getElementById('languageButtons');
    if (!wrap) return;
    wrap.innerHTML = languagePresets.map(l => `
        <button type="button" class="theme-option ${l.id === language ? 'active' : ''}"
                data-language-value="${l.id}" onclick="setLanguage('${l.id}')">${l.label}</button>
    `).join('');
}

// Tabs
const TAB_META = {
    // addable controls whether the topbar "+ Add" button is shown.
    // We keep it visible on every tab now and let topbarAdd() route
    // to the most relevant add flow per tab — falling back to the
    // quick-add expense modal when a tab has no obvious add action.
    dashboard:    { title: 'Dashboard',    addable: true },
    transactions: { title: 'Transactions', addable: true },
    accounts:     { title: 'Accounts',     addable: true },
    goals:        { title: 'Goals',        addable: true },
    insights:     { title: 'Insights',     addable: true },
    reports:      { title: 'Reports',      addable: true },
    recurring:    { title: 'Recurring',    addable: true },
    budget:       { title: 'Budget',       addable: true },
    settings:     { title: 'Settings',     addable: true }
};

function switchTab(tabName, btnEl) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    // Use the explicitly-passed element instead of event.target (which can be a child node)
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        const fallback = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (fallback) fallback.classList.add('active');
    }
    document.getElementById(tabName + '-tab').classList.add('active');

    // Drive the topbar — title + contextual Add button
    const meta = TAB_META[tabName];
    if (meta) {
        const titleEl = document.getElementById('topbarTitle');
        if (titleEl) {
            titleEl.dataset.i18n = 'tabs.' + tabName;
            titleEl.textContent = t('tabs.' + tabName);
        }
        const addBtn = document.getElementById('topbarAddBtn');
        if (addBtn) addBtn.hidden = !meta.addable;
    }

    // Render contextual content when activating these tabs
    if (tabName === 'goals') {
        renderGoals();
    } else if (tabName === 'insights') {
        renderInsights();
    } else if (tabName === 'reports') {
        // Category Breakdown lives here now; chart needs a re-tick when
        // the canvas first becomes visible.
        if (typeof updateCharts === 'function') updateCharts();
    } else if (tabName === 'recurring') {
        if (typeof renderSubscriptionsCard === 'function') renderSubscriptionsCard();
    } else if (tabName === 'accounts') {
        if (typeof renderAccountsCard === 'function') renderAccountsCard();
    }
}

// Topbar "+ Add" — routes to the right add flow per active tab
function topbarAdd() {
    const active = document.querySelector('.tab.active');
    const tabName = active ? active.dataset.tab : 'transactions';
    if (tabName === 'goals') {
        if (typeof openGoalModal === 'function') openGoalModal(null);
    } else if (tabName === 'accounts') {
        if (typeof openAccountModal === 'function') openAccountModal(null);
    } else if (tabName === 'recurring') {
        if (typeof openSubscriptionModal === 'function') openSubscriptionModal(null);
    } else if (tabName === 'budget') {
        // Focus the Add-Fixed form's Name field — the form is inline on the Budget tab
        const nameInput = document.getElementById('fixedName');
        if (nameInput) {
            nameInput.focus();
            nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (typeof openQuickAdd === 'function') {
            openQuickAdd();
        }
    } else {
        // Dashboard & Transactions both add an expense
        if (typeof openQuickAdd === 'function') openQuickAdd();
    }
}

// Currency
function formatCurrency(amount) {
    if (currency === 'SEK') {
        return amount.toFixed(2).replace('.', ',') + ' kr';
    }
    return '$' + amount.toFixed(2);
}

function changeCurrency() {
    currency = document.getElementById('currencySelect').value;
    setSetting('currency', currency);
    updateLabels();
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
}

function updateLabels() {
    const k = currency === 'SEK' ? 'Kr' : 'Usd';   // suffix used in keys
    const set = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    };
    set('amountLabel',         'labels.amount' + k);
    set('budgetLabel',         'labels.discretionaryBudget' + k);
    set('fixedAmountLabel',    'labels.amount' + k);
    set('incomeLabel',         'labels.monthlyIncome' + k);
    set('quickAmountLabel',    'labels.amount' + k);
    set('snapshotAmountLabel', 'netWorth.total' + k);
    set('goalTargetLabel',     'goals.targetAmount' + k);
    set('goalCurrentLabel',    'goals.alreadySaved' + k);
    set('goalContribLabel',    'goals.amountToAdd' + k);
    set('subAmountLabel',      'subs.amountPerCycle' + k);
    set('accountBalanceLabel', 'labels.startingBalance' + k);
    set('obBudgetLabel',       'onboarding.monthlyBudget' + (currency === 'SEK' ? 'Kr' : 'Usd'));
    set('obGoalAmountLabel',   'goals.targetAmount' + k);
}

// Month Navigation
function updateMonthDisplay() {
    document.getElementById('currentMonth').textContent = getCycleBounds(currentViewMonth).label;
}

function previousMonth() {
    const bounds = getCycleBounds(currentViewMonth);
    const prev = new Date(bounds.start);
    prev.setDate(prev.getDate() - 1); // jump into previous cycle
    currentViewMonth = prev;
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
}

function nextMonth() {
    const bounds = getCycleBounds(currentViewMonth);
    const next = new Date(bounds.end);
    next.setDate(next.getDate() + 1); // jump into next cycle
    currentViewMonth = next;
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
}
