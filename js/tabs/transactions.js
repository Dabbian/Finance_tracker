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
    const summary = document.getElementById('txSummary');

    if (expenses.length === 0) {
        if (summary) summary.hidden = true;
        container.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="3"/>
                    <path d="M3 10h18"/>
                    <path d="M7 15h4"/>
                </svg>
                <p class="empty-state-text">${t('expenses.empty')}</p>
            </div>`;
        return;
    }

    const accountById = new Map(accounts.map(a => [a.id, a]));
    const visible = expenses.slice(0, 50);

    let totalSpent = 0;
    let totalReceived = 0;
    visible.forEach(exp => {
        if (isTransferKind(exp.kind)) return; // transfers don't count as spend or receive
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        const net = exp.amount - repayments;
        if (exp.kind === 'income') totalReceived += net;
        else totalSpent += net;
    });
    if (summary) {
        summary.hidden = false;
        document.getElementById('txCount').textContent = visible.length;
        document.getElementById('txSpent').textContent = formatCurrency(totalSpent);
        const recvWrap = document.getElementById('txReceivedWrap');
        if (totalReceived > 0) {
            recvWrap.hidden = false;
            document.getElementById('txReceived').textContent = formatCurrency(totalReceived);
        } else {
            recvWrap.hidden = true;
        }
    }

    const groups = new Map();
    visible.forEach(exp => {
        if (!groups.has(exp.date)) groups.set(exp.date, []);
        groups.get(exp.date).push(exp);
    });

    const today = isoDate(new Date());
    const yesterday = (() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return isoDate(d);
    })();
    const loc = activeLocale();
    const dateHeader = (dStr) => {
        if (dStr === today) return t('labels.today');
        if (dStr === yesterday) return t('labels.yesterday');
        const d = new Date(dStr + 'T00:00:00');
        return d.toLocaleDateString(loc, { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const rowHtml = (exp) => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        const netAmount = exp.amount - repayments;
        const isIncome = exp.kind === 'income';
        const isTransferIn = exp.kind === 'transfer-in';
        const isTransferOut = exp.kind === 'transfer-out';
        const isTransfer = isTransferIn || isTransferOut;
        const color = getCategoryColor(exp.category);
        const account = exp.accountId != null ? accountById.get(exp.accountId) : null;
        const accountTag = account
            ? `<span class="expense-tag account" style="--tag-color: ${account.color || 'var(--accent)'};">${account.name}</span>`
            : '';
        const incomeTag = isIncome
            ? `<span class="expense-tag income">${t('imports.incomeTag')}</span>`
            : '';
        const transferTag = isTransfer
            ? `<span class="expense-tag transfer">${t(isTransferIn ? 'imports.transferIn' : 'imports.transferOut')}</span>`
            : '';
        const swishTag = repayments > 0
            ? '<span class="expense-tag is-swish">Swish</span>'
            : '';
        const categoryBadge = (isIncome || isTransfer)
            ? ''
            : `<span class="expense-category" style="--cat-color: ${color};">${getCategoryName(exp.category)}</span>`;
        const sign = (isIncome || isTransferIn) ? '+' : (isTransferOut ? '−' : '');
        const amountClass = isIncome
            ? 'expense-amount income'
            : isTransfer ? 'expense-amount transfer' : 'expense-amount';

        return `
            <div class="expense-item ${isIncome ? 'income' : ''} ${isTransfer ? 'transfer' : ''}" onclick="openEditModal(${exp.id})">
                <div class="expense-info">
                    <div class="expense-tags">
                        ${categoryBadge}${swishTag}${incomeTag}${transferTag}${accountTag}
                    </div>
                    <div class="expense-description">${exp.description}</div>
                </div>
                <div class="${amountClass}">${sign}${formatCurrency(netAmount)}</div>
            </div>
        `;
    };

    container.innerHTML = Array.from(groups.entries()).map(([dStr, items]) => `
        <div class="tx-group">
            <div class="tx-day-header">${dateHeader(dStr)}</div>
            ${items.map(rowHtml).join('')}
        </div>
    `).join('');
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
    const editKind = document.getElementById('editKind');
    if (editKind) editKind.value = exp.kind || 'expense';

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
    const kindEl = document.getElementById('editKind');
    const validKinds = ['expense', 'income', 'transfer-in', 'transfer-out'];
    exp.kind = (kindEl && validKinds.includes(kindEl.value)) ? kindEl.value : 'expense';

    db.run('UPDATE expenses SET category = ?, account_id = ?, kind = ? WHERE id = ?',
        [exp.category, exp.accountId, exp.kind, currentEditingExpense]);
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
