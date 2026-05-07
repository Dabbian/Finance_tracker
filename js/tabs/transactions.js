// =====================================================
// TRANSACTIONS — list, edit modal, swish repayments, add/delete
// =====================================================
// Add Expense
function addExpense(e) {
    e.preventDefault();
    const rawDescription = document.getElementById('description').value;
    const description = normalizeImportText(rawDescription);
    const category = description ? guessCategory(description) : document.getElementById('category').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const date = document.getElementById('date').value;
    const id = Date.now();

    db.run('INSERT INTO expenses (id, amount, category, description, date, swish_repayments) VALUES (?, ?, ?, ?, ?, ?)',
        [id, amount, category, description || t('expenses.noDescription'), date, '[]']);
    saveDatabase();

    expenses.unshift({
        id, amount, category,
        description: description || t('expenses.noDescription'),
        date, swishRepayments: []
    });

    const _form = document.getElementById('expenseForm');
    if (_form) _form.reset();
    const _date = document.getElementById('date');
    if (_date) _date.valueAsDate = new Date();
    updateDashboard();
    updateCharts();
}


function renderExpensesList() {
    const container = document.getElementById('expensesList');
    if (expenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">' + t('expenses.empty') + '</p>';
        return;
    }

    const accountById = new Map(accounts.map(a => [a.id, a]));

    container.innerHTML = expenses.slice(0, 50).map(exp => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        const netAmount = exp.amount - repayments;
        const isIncome = exp.kind === 'income';
        const color = getCategoryColor(exp.category);
        const account = exp.accountId != null ? accountById.get(exp.accountId) : null;
        const accountTag = account
            ? `<span class="expense-tag account" style="background: color-mix(in srgb, ${account.color || 'var(--accent)'} 22%, transparent); color: ${account.color || 'var(--accent)'};">${account.name}</span>`
            : '';
        const incomeTag = isIncome
            ? `<span class="expense-tag income">${t('imports.incomeTag')}</span>`
            : '';
        const sign = isIncome ? '+' : '';
        const amountClass = isIncome ? 'expense-amount income' : 'expense-amount';
        const swishTag = repayments > 0 ? '<span class="expense-category" style="background: var(--text-light); color: white;">Swish</span>' : '';

        return `
            <div class="expense-item ${isIncome ? 'income' : ''}" onclick="openEditModal(${exp.id})">
                <div class="expense-info">
                    ${isIncome ? '' : `<span class="expense-category" style="background: ${color}; color: white;">${getCategoryName(exp.category)}</span>`}
                    ${swishTag}
                    ${incomeTag}
                    ${accountTag}
                    <div class="expense-description">${exp.description}</div>
                    <div class="expense-date">${formatDate(exp.date)}</div>
                </div>
                <div class="${amountClass}">${sign}${formatCurrency(netAmount)}</div>
            </div>
        `;
    }).join('');
}

// Edit Modal
function openEditModal(id) {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    currentEditingExpense = id;
    document.getElementById('editDescription').textContent = exp.description;
    document.getElementById('editAmount').textContent = formatCurrency(exp.amount);
    document.getElementById('editCategory').value = exp.category;
    // Refresh the account dropdown (accounts may have changed since
    // last open) and select the linked one (if any).
    const editAccount = document.getElementById('editAccount');
    if (editAccount) {
        editAccount.innerHTML = renderAccountOptions(exp.accountId);
    }

    renderSwishList(exp.swishRepayments || []);
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('swishAmount').value = '';
    currentEditingExpense = null;
}

function renderSwishList(repayments) {
    const container = document.getElementById('swishList');
    if (repayments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.repayments') + '</p>';
        return;
    }
    container.innerHTML = repayments.map((r, idx) => `
        <div class="swish-repayment">
            <span>${formatCurrency(r.amount)}</span>
            <button class="delete-btn" onclick="removeSwishRepayment(${idx})">×</button>
        </div>
    `).join('');
}

function addSwishRepayment() {
    const amount = parseFloat(document.getElementById('swishAmount').value);
    if (!amount || amount <= 0) return;

    const exp = expenses.find(e => e.id === currentEditingExpense);
    if (!exp) return;

    if (!exp.swishRepayments) exp.swishRepayments = [];
    exp.swishRepayments.push({ amount, date: new Date().toISOString() });
    
    db.run('UPDATE expenses SET swish_repayments = ? WHERE id = ?',
        [JSON.stringify(exp.swishRepayments), currentEditingExpense]);
    saveDatabase();
    
    renderSwishList(exp.swishRepayments);
    document.getElementById('swishAmount').value = '';
    updateDashboard();
    updateCharts();
}

function removeSwishRepayment(idx) {
    const exp = expenses.find(e => e.id === currentEditingExpense);
    if (!exp || !exp.swishRepayments) return;

    exp.swishRepayments.splice(idx, 1);
    
    db.run('UPDATE expenses SET swish_repayments = ? WHERE id = ?',
        [JSON.stringify(exp.swishRepayments), currentEditingExpense]);
    saveDatabase();
    
    renderSwishList(exp.swishRepayments);
    updateDashboard();
    updateCharts();
}

function saveExpenseEdit() {
    const exp = expenses.find(e => e.id === currentEditingExpense);
    if (!exp) return;

    exp.category = document.getElementById('editCategory').value;
    const acctEl = document.getElementById('editAccount');
    const accountIdRaw = acctEl ? acctEl.value : '';
    exp.accountId = accountIdRaw ? parseInt(accountIdRaw, 10) : null;

    db.run('UPDATE expenses SET category = ?, account_id = ? WHERE id = ?',
        [exp.category, exp.accountId, currentEditingExpense]);
    saveDatabase();

    closeEditModal();
    renderExpensesList();
    updateDashboard();
    updateCharts();
}

function deleteExpense(id) {
    if (!confirm(t('confirms.deleteExpense'))) return;
    
    db.run('DELETE FROM expenses WHERE id = ?', [id]);
    saveDatabase();
    
    expenses = expenses.filter(e => e.id !== id);
    closeEditModal();
    updateDashboard();
    updateCharts();
}
