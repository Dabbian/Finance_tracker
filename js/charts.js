// Charts
function initCharts() {
    const ctx1 = document.getElementById('categoryChart').getContext('2d');
    const ctx2 = document.getElementById('trendChart').getContext('2d');

    categoryChart = new Chart(ctx1, {
        type: 'doughnut',
        data: { 
            labels: [], 
            datasets: [{ 
                data: [], 
                backgroundColor: []
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = formatCurrency(context.parsed);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    trendChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: t('charts.dailySpending'), data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } }
        }
    });

    updateCharts();
}

function updateCharts() {
    if (!categoryChart || !trendChart) return;

    const bounds = getCycleBounds(currentViewMonth);
    const startStr = isoDate(bounds.start);
    const endStr = isoDate(bounds.end);
    const includeFixed = document.getElementById('includeFixed').checked;

    const monthExpenses = expenses.filter(exp => exp.date >= startStr && exp.date <= endStr);

    // Category breakdown
    const categoryTotals = {};
    monthExpenses.forEach(exp => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        const netAmount = exp.amount - repayments;
        categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + netAmount;
    });

    if (includeFixed) {
        fixedExpenses.forEach(f => {
            categoryTotals[f.category] = (categoryTotals[f.category] || 0) + f.amount;
        });
    }

    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const total = sortedCategories.reduce((sum, [, amount]) => sum + amount, 0);

    categoryChart.data.labels = sortedCategories.map(([id]) => getCategoryName(id));
    categoryChart.data.datasets[0].data = sortedCategories.map(([, amount]) => amount);
    categoryChart.data.datasets[0].backgroundColor = sortedCategories.map(([id]) => getCategoryColor(id));
    categoryChart.update();

    // Category breakdown list
    const listContainer = document.getElementById('categoryBreakdownList');
    if (sortedCategories.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.noExpenses') + '</p>';
    } else {
        listContainer.innerHTML = sortedCategories.map(([id, amount]) => {
            const percentage = ((amount / total) * 100).toFixed(1);
            const categoryName = getCategoryName(id);
            return `
                <div class="category-list-item" onclick="showExpensesByCategory('${categoryName}')" style="cursor: pointer; transition: all 0.2s ease;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div class="category-badge" style="background: ${getCategoryColor(id)};"></div>
                        <span>${categoryName}</span>
                    </div>
                    <div style="text-align: right;">
                        <strong>${formatCurrency(amount)}</strong><br>
                        <small style="color: var(--text-light);">${percentage}%</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Trend chart — iterate days within the cycle. dailyTotals is the
    // honest daily spend (used for the trend line). dailyDiscretionary
    // is the same map with essential-category amounts zeroed out — it
    // drives the per-day "saved/over" classification on the savings
    // grid so a 1500 kr grocery shop doesn't paint the day red.
    const dailyTotals = {};
    const dailyDiscretionary = {};
    const labels = [];
    const cursor = new Date(bounds.start);
    while (cursor <= bounds.end) {
        const ds = isoDate(cursor);
        dailyTotals[ds] = 0;
        dailyDiscretionary[ds] = 0;
        labels.push(`${cursor.getMonth() + 1}/${cursor.getDate()}`);
        cursor.setDate(cursor.getDate() + 1);
    }

    monthExpenses.forEach(exp => {
        if (dailyTotals.hasOwnProperty(exp.date)) {
            dailyTotals[exp.date] += expenseNet(exp);
            dailyDiscretionary[exp.date] += expenseDiscretionary(exp);
        }
    });

    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = Object.values(dailyTotals);
    trendChart.update();

    // Daily Savings Grid
    renderSavingsGrid(bounds, dailyDiscretionary);
}
