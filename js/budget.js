// Fixed Expenses
function addFixedExpense(e) {
    e.preventDefault();
    const name = document.getElementById('fixedName').value;
    const amount = parseFloat(document.getElementById('fixedAmount').value);
    const category = document.getElementById('fixedCategory').value;
    const id = Date.now();
    
    db.run('INSERT INTO fixed_expenses (id, name, amount, category) VALUES (?, ?, ?, ?)',
        [id, name, amount, category]);
    saveDatabase();
    
    fixedExpenses.push({ id, name, amount, category });
    
    document.getElementById('fixedExpenseForm').reset();
    renderFixedExpenses();
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
    if (fixedExpenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.fixed') + '</p>';
        return;
    }
    container.innerHTML = fixedExpenses.map(f => `
        <div class="fixed-expense-item">
            <div>
                <strong>${f.name}</strong><br>
                <small style="color: var(--text-light);">${getCategoryName(f.category)}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <strong>${formatCurrency(f.amount)}</strong>
                <button class="delete-btn" onclick="deleteFixedExpense(${f.id})">×</button>
            </div>
        </div>
    `).join('');
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
// Discretionary amount: same as net, but zeroed for essential
// categories (Groceries by default) so big shops don't break the
// streak / paint the savings calendar red.
function expenseDiscretionary(exp) {
    const net = expenseNet(exp);
    return isEssentialCategory(exp.category) ? 0 : net;
}
