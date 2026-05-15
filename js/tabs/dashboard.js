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
    renderGreeting();
    renderCycleComparison({
        bounds,
        totalSpent,
        discretionarySpent,
        availableBudget,
        totalFixed,
    });
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

// Greeting band: time-aware salutation + today's date in active locale.
function renderGreeting() {
    const textEl = document.getElementById('greetingText');
    const dateEl = document.getElementById('greetingDate');
    if (!textEl || !dateEl) return;
    const h = new Date().getHours();
    let key;
    if (h < 5) key = 'greeting.night';
    else if (h < 12) key = 'greeting.morning';
    else if (h < 17) key = 'greeting.afternoon';
    else if (h < 22) key = 'greeting.evening';
    else key = 'greeting.night';
    textEl.textContent = t(key);
    textEl.setAttribute('data-i18n', key);
    dateEl.textContent = new Date().toLocaleDateString(activeLocale(), {
        weekday: 'long', month: 'long', day: 'numeric',
    });
}

// vs-last-cycle band + per-stat delta chips.
function renderCycleComparison({ bounds, totalSpent, discretionarySpent, availableBudget }) {
    const band = document.getElementById('comparisonBand');
    if (!band) return;

    // Don't compare a partial cycle to a full one. Wait until the
    // current cycle is at least 50% elapsed before showing deltas —
    // anything earlier is misleading (-100% spending on day 6 etc.).
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cycleStart = new Date(bounds.start);
    const dayOfCycle = Math.max(1, Math.round((today - cycleStart) / 86400000) + 1);
    const cycleProgress = dayOfCycle / bounds.days;
    if (cycleProgress < 0.5) {
        band.hidden = true;
        hideAllDeltas();
        return;
    }

    // Last cycle = the cycle ending the day before this cycle starts.
    const prevRef = new Date(bounds.start);
    prevRef.setDate(prevRef.getDate() - 1);
    const prev = getCycleBounds(prevRef);
    const prevStartStr = isoDate(prev.start);
    const prevEndStr = isoDate(prev.end);
    const prevExpenses = expenses.filter(e =>
        e.date >= prevStartStr && e.date <= prevEndStr && e.kind !== 'income'
    );
    if (prevExpenses.length === 0) {
        band.hidden = true;
        hideAllDeltas();
        return;
    }
    const prevTotalFixed = fixedExpenses.reduce((s, f) => s + f.amount, 0);
    const prevTotalSpent = prevExpenses.reduce((s, e) => s + expenseNet(e), 0);
    const prevDiscretionary = prevExpenses.reduce((s, e) => s + expenseDiscretionary(e), 0);
    const prevDailyAvg = prevDiscretionary / prev.days;
    const prevAvailable = monthlyBudget - prevTotalFixed;
    const prevBudgetRemaining = prevAvailable - prevDiscretionary;

    band.hidden = false;
    setComparisonItem('comparisonSpend', t('comparison.spending'), prevTotalSpent, totalSpent, /*lowerIsBetter=*/true);
    if (monthlyIncome > 0) {
        const rateNow = (monthlyIncome - totalSpent) / monthlyIncome * 100;
        const ratePrev = (monthlyIncome - prevTotalSpent) / monthlyIncome * 100;
        setComparisonItem('comparisonSavings', t('comparison.savingsRate'), ratePrev, rateNow, /*lowerIsBetter=*/false, '%', /*absolutePoints=*/true);
    } else {
        const el = document.getElementById('comparisonSavings');
        if (el) el.hidden = true;
    }

    const dailyAvgNow = discretionarySpent / bounds.days;
    setStatDelta('deltaTotalSpent', prevTotalSpent, totalSpent, /*lowerIsBetter=*/true);
    setStatDelta('deltaDailyAverage', prevDailyAvg, dailyAvgNow, /*lowerIsBetter=*/true);
    setStatDelta('deltaBudgetRemaining', prevBudgetRemaining, availableBudget - discretionarySpent, /*lowerIsBetter=*/false);
}

function hideAllDeltas() {
    ['deltaTotalSpent', 'deltaDailyAverage', 'deltaBudgetRemaining'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    });
}

function setStatDelta(id, prev, curr, lowerIsBetter) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!isFinite(prev) || prev === 0) { el.hidden = true; return; }
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    if (!isFinite(pct)) { el.hidden = true; return; }
    const rounded = Math.round(pct);
    if (rounded === 0) {
        el.hidden = false;
        el.setAttribute('data-trend', 'neutral');
        el.textContent = '0%';
        return;
    }
    const isUp = pct > 0;
    const isGood = lowerIsBetter ? !isUp : isUp;
    el.hidden = false;
    el.setAttribute('data-trend', isGood ? 'good' : 'bad');
    el.textContent = (isUp ? '+' : '') + rounded + '%';
}

function setComparisonItem(id, label, prev, curr, lowerIsBetter, suffix, absolutePoints) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    if (!isFinite(prev)) { el.hidden = true; return; }
    let valueText, isGood;
    if (absolutePoints) {
        const diff = curr - prev;
        const rounded = Math.round(diff);
        if (rounded === 0) {
            el.setAttribute('data-trend', 'neutral');
            valueText = `${label} 0pp`;
        } else {
            isGood = lowerIsBetter ? diff < 0 : diff > 0;
            el.setAttribute('data-trend', isGood ? 'good' : 'bad');
            valueText = `${label} ${diff > 0 ? '+' : ''}${rounded}pp`;
        }
    } else {
        if (prev === 0) { el.hidden = true; return; }
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        const rounded = Math.round(pct);
        if (rounded === 0) {
            el.setAttribute('data-trend', 'neutral');
            valueText = `${label} 0%`;
        } else {
            isGood = lowerIsBetter ? pct < 0 : pct > 0;
            el.setAttribute('data-trend', isGood ? 'good' : 'bad');
            valueText = `${label} ${pct > 0 ? '+' : ''}${rounded}%`;
        }
    }
    el.textContent = valueText;
}
