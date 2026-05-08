function updateDashboard() {
    const bounds = getCycleBounds(currentViewMonth);
    const startStr = isoDate(bounds.start);
    const endStr = isoDate(bounds.end);

    // Income rows (deposits / refunds) sit in the same table but are
    // tagged kind='income'. They never count toward "spending" totals.
    const monthExpenses = expenses.filter(exp =>
        exp.date >= startStr && exp.date <= endStr && exp.kind !== 'income'
    );

    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
    // totalSpent = honest cash-out for the cycle (includes essentials).
    // It feeds the savings rate + the "Total Spent This Cycle" stat.
    const totalSpent = monthExpenses.reduce((sum, exp) => sum + expenseNet(exp), 0);
    // discretionarySpent = what counted against the daily budget. Big
    // grocery shops don't punish you here.
    const discretionarySpent = monthExpenses.reduce((sum, exp) => sum + expenseDiscretionary(exp), 0);

    const daysInCycle = bounds.days;
    const dailyAvg = discretionarySpent / daysInCycle;

    const availableBudget = monthlyBudget - totalFixed;
    const budgetRemaining = availableBudget - discretionarySpent;
    const dailyBudgetAmount = availableBudget / daysInCycle;

    document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);
    document.getElementById('dailyAverage').textContent = formatCurrency(dailyAvg);
    document.getElementById('dailyAverage').className = 'stat-value ' + (dailyAvg > dailyBudgetAmount ? 'negative' : 'positive');
    document.getElementById('budgetRemaining').textContent = formatCurrency(budgetRemaining);
    document.getElementById('dailyBudget').textContent = formatCurrency(dailyBudgetAmount);

    const budgetPercentage = availableBudget > 0 ? (discretionarySpent / availableBudget) * 100 : 0;
    const progressBar = document.getElementById('budgetProgress');
    progressBar.style.width = `${Math.min(budgetPercentage, 100)}%`;
    progressBar.textContent = `${budgetPercentage.toFixed(0)}%`;
    progressBar.classList.toggle('warning', budgetPercentage > 80);

    document.getElementById('budgetSpent').textContent = formatCurrency(discretionarySpent);
    document.getElementById('budgetTotal').textContent = `of ${formatCurrency(availableBudget)}`;

    renderExpensesList();
    renderHero(totalSpent);
    renderWins();
}



function renderSavingsGrid(bounds, dailyTotals) {
    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
    const dailyBudget = (monthlyBudget - totalFixed) / bounds.days;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const grid = document.getElementById('savingsGrid');
    let html = '';

    const cursor = new Date(bounds.start);
    while (cursor <= bounds.end) {
        const dateStr = isoDate(cursor);
        const dayDate = new Date(cursor);
        dayDate.setHours(0, 0, 0, 0);

        const spent = dailyTotals[dateStr] || 0;
        const savings = dailyBudget - spent;
        const isFuture = dayDate > today;

        let className = 'day-square ';
        let tooltipContent = '';
        const dateLabel = dayDate.toLocaleDateString(activeLocale(), { weekday: 'short', month: 'short', day: 'numeric' });

        if (isFuture) {
            className += 'future';
            tooltipContent = `<div>${dateLabel}</div><span class="day-tooltip-amount" style="color: var(--text-light);">Future</span>`;
        } else if (savings >= 0) {
            className += 'saved';
            tooltipContent = `<div>${dateLabel}</div><span class="day-tooltip-amount">+${formatCurrency(savings)}</span>`;
        } else {
            className += 'over';
            tooltipContent = `<div>${dateLabel}</div><span class="day-tooltip-amount">−${formatCurrency(Math.abs(savings))}</span>`;
        }

        const clickHandler = isFuture ? '' : `onclick="showExpensesByDate('${dateStr}')"`;

        html += `
            <div class="${className}" ${clickHandler}>
                ${dayDate.getDate()}
                <div class="day-tooltip">${tooltipContent}</div>
            </div>
        `;
        cursor.setDate(cursor.getDate() + 1);
    }

    grid.innerHTML = html;
}

// Show Expenses Functions
function showExpensesByCategory(categoryName) {
    const bounds = getCycleBounds(currentViewMonth);
    const startStr = isoDate(bounds.start);
    const endStr = isoDate(bounds.end);

    const category = categories.find(c => c.name === categoryName);
    if (!category) return;

    const filteredExpenses = expenses.filter(exp =>
        exp.category === category.id &&
        exp.date >= startStr &&
        exp.date <= endStr
    );

    showExpenseDetailsModal(filteredExpenses, `${categoryName} Expenses`);
}

function showExpensesByDate(dateStr) {
    const filteredExpenses = expenses.filter(exp => exp.date === dateStr);
    const date = new Date(dateStr + 'T00:00:00');
    const formattedDate = date.toLocaleDateString(activeLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
    showExpenseDetailsModal(filteredExpenses, t('expenses.onDate', { date: formattedDate }));
}

function showExpenseDetailsModal(expensesList, title) {
    document.getElementById('expenseDetailsTitle').textContent = title;
    document.getElementById('expenseDetailsCount').textContent = expensesList.length;
    
    const total = expensesList.reduce((sum, exp) => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        return sum + exp.amount - repayments;
    }, 0);
    
    document.getElementById('expenseDetailsTotal').textContent = formatCurrency(total);
    
    const container = document.getElementById('expenseDetailsList');
    
    if (expensesList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">' + t('empty.noExpensesFound') + '</p>';
    } else {
        container.innerHTML = expensesList.map(exp => {
            const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
            const netAmount = exp.amount - repayments;
            const color = getCategoryColor(exp.category);
            
            return `
                <div class="expense-detail-item" onclick="closeExpenseDetailsModal(); openEditModal(${exp.id})">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 0.5rem;">
                            <span class="expense-category" style="background: ${color}; color: white;">${getCategoryName(exp.category)}</span>
                            ${repayments > 0 ? '<span class="expense-category" style="background: var(--text-light); color: white;">Swish</span>' : ''}
                        </div>
                        <div style="font-weight: 600;">${exp.description}</div>
                        <div style="font-size: 0.875rem; color: var(--text-light);">${formatDate(exp.date)}</div>
                    </div>
                    <div style="font-family: 'DM Sans', sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--primary);">
                        ${formatCurrency(netAmount)}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    document.getElementById('expenseDetailsModal').classList.add('active');
}

function closeExpenseDetailsModal() {
    document.getElementById('expenseDetailsModal').classList.remove('active');
}
