// Fixed Expenses
function addFixedExpense(e) {
    e.preventDefault();
    const name = document.getElementById('fixedName').value.trim();
    const amount = parseFloat(document.getElementById('fixedAmount').value);
    const category = document.getElementById('fixedCategory').value;
    const billingDayRaw = document.getElementById('fixedBillingDay');
    const accountRaw = document.getElementById('fixedAccount');
    const matchRaw = document.getElementById('fixedMatchKey');
    const billingDayN = billingDayRaw ? parseInt(billingDayRaw.value, 10) : NaN;
    const billingDay = Number.isFinite(billingDayN) && billingDayN >= 1 && billingDayN <= 31 ? String(billingDayN) : null;
    const accountId = accountRaw && accountRaw.value ? parseInt(accountRaw.value, 10) : null;
    const matchTyped = matchRaw ? matchRaw.value.trim() : '';
    const matchKey = (matchTyped || name).toLowerCase();
    const id = Date.now();

    db.run(
        'INSERT INTO fixed_expenses (id, name, amount, category, match_key, billing_day, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, name, amount, category, matchKey, billingDay, accountId]
    );
    saveDatabase();

    fixedExpenses.push({ id, name, amount, category, matchKey, billingDay, accountId });

    document.getElementById('fixedExpenseForm').reset();
    renderFixedExpenses();
    autoCreateMissingFixedExpenseTransactions();
    updateDashboard();
    updateCharts();
}

function deleteFixedExpense(id) {
    if (!confirm(t('confirms.deleteFixed'))) return;
    
    db.run('DELETE FROM fixed_expenses WHERE id = ?', [id]);
    saveDatabase();
    
    fixedExpenses = fixedExpenses.filter(f => f.id !== id);
    renderFixedExpenses();
    updateDashboard();
    updateCharts();
}


function renderFixedExpenses() {
    const container = document.getElementById('fixedExpensesList');
    const acctSel = document.getElementById('fixedAccount');
    if (acctSel && typeof renderAccountOptions === 'function') {
        acctSel.innerHTML = renderAccountOptions(null);
    }
    if (fixedExpenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.fixed') + '</p>';
        return;
    }
    container.innerHTML = fixedExpenses.map(f => {
        const meta = [getCategoryName(f.category)];
        if (f.billingDay) meta.push(t('subs.due') + ' ' + f.billingDay);
        if (f.accountId != null) {
            const a = accounts.find(x => x.id === f.accountId);
            if (a) meta.push(a.name);
        }
        return `
        <div class="fixed-expense-item">
            <div>
                <strong>${f.name}</strong><br>
                <small style="color: var(--text-light);">${meta.join(' · ')}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <strong>${formatCurrency(f.amount)}</strong>
                <button class="delete-btn" onclick="deleteFixedExpense(${f.id})">×</button>
            </div>
        </div>
        `;
    }).join('');
}

// Update Budget
function updateBudget() {
    monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value) || 0;
    setSetting('monthlyBudget', monthlyBudget.toString());
    updateDashboard();
    renderCyclePreview();
}

// Dashboard
// Net amount on an expense (amount minus any Swish repayments).
// Hoisted to module scope because both updateDashboard and updateCharts
// need it; previously these were const inside updateDashboard, which
// made them undefined inside updateCharts → a ReferenceError aborted
// the per-day loop, so trendChart.update() and renderSavingsGrid()
// silently never ran. That manifested as Spending Trend / Daily
// Savings not updating when the cycle changes.
function expenseNet(exp) {
    const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
    return exp.amount - repayments;
}

// Transfers move money between the user's own accounts. They affect
// each side's account balance but never count as spending or income.
function isTransferKind(kind) {
    return kind === 'transfer-in' || kind === 'transfer-out';
}
function isSpendingKind(kind) {
    // Anything not explicitly income/transfer counts as spending —
    // legacy rows have undefined kind which should still spend.
    return kind !== 'income' && !isTransferKind(kind);
}
// Discretionary amount: same as net, but zeroed for essential
// categories (Groceries by default) so big shops don't break the
// streak / paint the savings calendar red.
function expenseDiscretionary(exp) {
    const net = expenseNet(exp);
    return isEssentialCategory(exp.category) ? 0 : net;
}

// Sum of kind='income' transactions within a cycle. Used to derive
// the cycle's actual income (salary + refunds + deposits) instead of
// relying on the manually entered Monthly Income setting.
function cycleIncomeFromTransactions(bounds) {
    const startStr = isoDate(bounds.start);
    const endStr = isoDate(bounds.end);
    return expenses.reduce((sum, e) => {
        if (e.kind !== 'income') return sum; // transfers excluded by being a different kind
        if (e.date < startStr || e.date > endStr) return sum;
        return sum + expenseNet(e);
    }, 0);
}

// Effective income for a cycle: derived from tagged transactions when
// any exist, otherwise the manual monthlyIncome setting.
function effectiveMonthlyIncome(bounds) {
    const derived = cycleIncomeFromTransactions(bounds);
    return derived > 0 ? derived : monthlyIncome;
}

// =====================================================
// Fixed expense transaction recognition
// Mirrors the subscription auto-create flow: each month, if a fixed
// expense's billing day has passed and we can't find a transaction
// that matches by description + amount in the linked account, insert
// a placeholder expense at the billing date.
// =====================================================

function fixedExpenseBillingDate(f, today) {
    const dates = fixedExpenseBillingDatesSince(f, today, 1);
    return dates.length > 0 ? dates[0] : null;
}

// Returns every past billing date for `f`, newest first, walking back
// from `today` to `f.createdDate` (capped at maxMonths). Used to retro-
// recognize / backfill against imported historical transactions.
function fixedExpenseBillingDatesSince(f, today, maxMonths = 24) {
    if (!f.billingDay) return [];
    const day = parseInt(f.billingDay, 10);
    if (!Number.isFinite(day) || day < 1 || day > 31) return [];
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const floor = f.createdDate ? new Date(f.createdDate) : null;
    const out = [];
    for (let back = 0; back < maxMonths; back++) {
        const y = t0.getFullYear();
        const m = t0.getMonth() - back;
        const last = new Date(y, m + 1, 0).getDate();
        const candidate = new Date(y, m, Math.min(day, last));
        if (candidate > t0) continue;
        if (floor && candidate < floor) break;
        out.push(candidate);
    }
    return out;
}

// Match by description-contains AND amount ±5% within ±3 days of the
// billing date. Requires the fixed expense to have an account.
function transactionMatchesFixed(f, billingDate) {
    if (f.accountId == null) return false;
    if (!f.matchKey) return false;
    const key = f.matchKey.toLowerCase();
    const target = billingDate.getTime();
    const windowMs = 3 * 24 * 60 * 60 * 1000;
    const minAmt = f.amount * 0.95;
    const maxAmt = f.amount * 1.05;
    return expenses.some(e => {
        if (e.accountId !== f.accountId) return false;
        if (e.amount < minAmt || e.amount > maxAmt) return false;
        const desc = (e.description || '').toLowerCase();
        if (!desc.includes(key)) return false;
        const ed = new Date(e.date).getTime();
        return Math.abs(ed - target) <= windowMs;
    });
}

function autoCreateMissingFixedExpenseTransactions() {
    if (!Array.isArray(fixedExpenses) || fixedExpenses.length === 0) return;
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    let inserted = 0;
    fixedExpenses.forEach(f => {
        if (f.accountId == null) return;
        if (!f.billingDay) return;
        // Walk back through every past billing date since the fixed
        // expense was created. For each one that lacks a matching
        // transaction, insert a placeholder. This means importing old
        // bank statements retroactively recognises rent/internet/etc.
        // and doesn't double-up the existing placeholders.
        const billingDates = fixedExpenseBillingDatesSince(f, today, 24);
        billingDates.forEach(billingDate => {
            if (billingDate > yesterday) return;
            if (transactionMatchesFixed(f, billingDate)) return;
            const id = Date.now() + Math.floor(Math.random() * 100000);
            try {
                db.run(
                    'INSERT INTO expenses (id, amount, category, description, date, swish_repayments, account_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [id, f.amount, f.category || 'fixed', f.name, isoDate(billingDate), '[]', f.accountId, 'expense']
                );
                // Reflect the new row in the in-memory cache so subsequent
                // billing-date checks for the same fixed expense see it
                // and don't double-insert when the loop continues.
                expenses.push({
                    id, amount: f.amount, category: f.category || 'fixed',
                    description: f.name, date: isoDate(billingDate),
                    swishRepayments: [], accountId: f.accountId, kind: 'expense'
                });
                inserted++;
            } catch (err) {
                console.error('Auto-create fixed expense transaction failed:', f, err);
            }
        });
    });
    if (inserted > 0) {
        saveDatabase();
        loadDataFromDB();
    }
}
