// =====================================================
// INSIGHTS — subscription detection, anomalies, forecast, leaks, counterfactuals
// =====================================================
function renderInsights() {
    const container = document.getElementById('insightsContainer');
    if (!container) return;

    const sections = [];

    // 1. Forecast
    const forecast = computeForecast();
    if (forecast) {
        sections.push({ title: t('insights.thisCycle'), items: [forecast] });
    }

    // 2. Anomaly alerts
    const anomalies = computeAnomalies();
    if (anomalies.length > 0) {
        sections.push({ title: t('insights.watchOut'), items: anomalies });
    }

    // 3. Subscriptions
    const subs = detectSubscriptions();
    if (subs.length > 0) {
        sections.push({ title: t('insights.recurringCharges'), items: subs });
    }

    // 4. Leak detection
    const leaks = detectLeaks();
    if (leaks.length > 0) {
        sections.push({ title: t('insights.smallLeaks'), items: leaks });
    }

    // 5. Counterfactuals
    const cf = computeCounterfactuals();
    if (cf.length > 0) {
        sections.push({ title: t('insights.whatIf'), items: cf });
    }

    if (sections.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon-svg">${svgIcon('search')}</div>
                <div>${t('insights.emptyHint')}</div>
            </div>
        `;
        cachedInsights = {};
        insightList = [];
        return;
    }

    // Refresh insight cache for detail-modal lookups
    cachedInsights = {};
    insightList = []; // flat array for index-based onclick (avoids string-escaping pitfalls)
    const ackSet = new Set(acknowledgedInsights);

    container.innerHTML = sections.map(sec => {
        // Forecast cards aren't sortable/fadeable — they're live status info, always relevant.
        // Sort other acknowledged items to the bottom of each section.
        const isForecast = (it) => it.data && it.data.kind === 'forecast';
        const sorted = [...sec.items].sort((a, b) => {
            const aAck = !isForecast(a) && ackSet.has(a.id) ? 1 : 0;
            const bAck = !isForecast(b) && ackSet.has(b.id) ? 1 : 0;
            return aAck - bAck;
        });
        return `
            <div class="insight-section-title">${sec.title}</div>
            ${sorted.map(item => {
                cachedInsights[item.id] = item;
                const idx = insightList.length;
                insightList.push(item);
                // Forecast cards are never visually acknowledged
                const acknowledged = !isForecast(item) && ackSet.has(item.id);
                return `
                    <div class="insight-card ${item.type || 'tip'} ${acknowledged ? 'acknowledged' : ''}"
                         onclick="openInsightDetail(${idx})"
                         role="button" tabindex="0">
                        <div class="insight-icon-badge">${svgIcon(item.icon || 'sparkles')}</div>
                        <div class="insight-content">
                            <div class="insight-title">${item.title}</div>
                            <div class="insight-desc">${item.desc}</div>
                        </div>
                        ${item.amount ? `<div class="insight-amount ${item.amountClass || ''}">${item.amount}</div>` : ''}
                        ${acknowledged ? `<div class="insight-check" title="Acknowledged">${svgIcon('check-circle', { fill: true })}</div>` : ''}
                    </div>
                `;
            }).join('')}
        `;
    }).join('');
}

// Escape a value for safe inclusion in an HTML attribute
function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// =====================================================
// INSIGHT DETAIL MODAL + ACKNOWLEDGE + GOAL CREATION
// =====================================================
function persistAcknowledgedInsights() {
    setSetting('acknowledgedInsights', JSON.stringify(acknowledgedInsights));
}

// Opens the detail modal for the insight at the given index in `insightList`.
// Index-based to avoid string-escaping issues with merchant names containing apostrophes.
function openInsightDetail(idx) {
    const item = insightList[idx];
    if (!item) return;
    currentDetailInsight = item;

    // Header
    document.getElementById('insightDetailHeader').innerHTML = `
        <div class="insight-icon-badge" style="${insightBadgeStyle(item.type)}">
            ${svgIcon(item.icon || 'sparkles')}
        </div>
        <div style="flex: 1; min-width: 0;">
            <div class="insight-detail-title">${item.title}</div>
            ${item.amount ? `<div class="insight-detail-amount ${item.amountClass || ''}">${item.amount}</div>` : ''}
        </div>
    `;

    // Body — generic description + per-kind extras
    const body = document.getElementById('insightDetailBody');
    body.innerHTML = `<p>${item.desc}</p>${renderInsightExtras(item)}`;

    // Actions — vary by kind / acknowledged state
    const acknowledged = acknowledgedInsights.includes(item.id);
    const isForecast = item.data && item.data.kind === 'forecast';
    const actions = document.getElementById('insightDetailActions');
    const buttons = [];

    if (isForecast) {
        // Forecasts are live status info — no acknowledge action; clicking just shows details
        buttons.push(`<button onclick="closeInsightDetail()">${t('common.close')}</button>`);
    } else if (item.data && item.data.kind === 'counterfactual' && !acknowledged) {
        buttons.push(`<button onclick="createGoalFromCurrentInsight()">${t('insights.setAsGoal')}</button>`);
        buttons.push(`<button class="btn-secondary" onclick="acknowledgeCurrentInsight()">${t('insights.gotIt')}</button>`);
    } else if (acknowledged) {
        buttons.push(`<button class="btn-secondary" onclick="unacknowledgeCurrentInsight()">${t('insights.markAsNew')}</button>`);
        buttons.push(`<button onclick="closeInsightDetail()">${t('common.close')}</button>`);
    } else {
        buttons.push(`<button onclick="acknowledgeCurrentInsight()">${t('insights.gotIt')}</button>`);
        buttons.push(`<button class="btn-secondary" onclick="closeInsightDetail()">${t('common.cancel')}</button>`);
    }

    actions.innerHTML = buttons.join('');
    document.getElementById('insightDetailModal').classList.add('active');
}

// Tinted badge style matching insight type
function insightBadgeStyle(type) {
    const map = {
        alert:   ['var(--warning)', 0.12],
        danger:  ['var(--danger)',  0.12],
        success: ['var(--success)', 0.12],
        tip:     ['var(--accent)',  0.12]
    };
    const [color, alpha] = map[type] || ['var(--text-light)', 0.10];
    return `background: color-mix(in srgb, ${color} ${alpha * 100}%, transparent); color: ${color};`;
}

// Render kind-specific extra body (stat row, lists, etc.)
function renderInsightExtras(item) {
    if (!item.data) return '';
    const d = item.data;

    if (d.kind === 'counterfactual') {
        return `
            <div class="insight-stat-row">
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.monthlyAvg')}</div>
                    <div class="insight-stat-value">${formatCurrency(d.monthlyAverage)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.savePerMonth')}</div>
                    <div class="insight-stat-value savings">${formatCurrency(d.monthlySavings)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.savePerYear')}</div>
                    <div class="insight-stat-value savings">${formatCurrency(d.annualSavings)}</div>
                </div>
            </div>
            <p style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-light);">
                ${t('insightExtras.setAsGoalHint')}
            </p>
        `;
    }

    if (d.kind === 'forecast') {
        return `
            <div class="insight-stat-row">
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.spentSoFar')}</div>
                    <div class="insight-stat-value">${formatCurrency(d.spentSoFar)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.daysIntoCycle')}</div>
                    <div class="insight-stat-value">${d.dayElapsed} / ${d.totalDays}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.projectedTotal')}</div>
                    <div class="insight-stat-value ${d.overUnder > 0 ? 'warning' : 'savings'}">${formatCurrency(d.projectedTotal)}</div>
                </div>
            </div>
        `;
    }

    if (d.kind === 'anomaly') {
        const trailingHtml = d.trailingTotals.map((amt, i) => `
            <div class="insight-detail-list-item">
                <span>${t(i === 0 ? 'insightExtras.oneCycleAgo' : 'insightExtras.cyclesAgo', { n: i + 1 })}</span>
                <strong>${formatCurrency(amt)}</strong>
            </div>
        `).join('');
        return `
            <div class="insight-stat-row">
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.thisCycle')}</div>
                    <div class="insight-stat-value warning">${formatCurrency(d.currentAmount)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.average')}</div>
                    <div class="insight-stat-value">${formatCurrency(d.averageAmount)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.overspend')}</div>
                    <div class="insight-stat-value warning">+${formatCurrency(d.overspend)}</div>
                </div>
            </div>
            <div class="insight-detail-list">
                <div class="insight-stat-label" style="margin-top: 0.75rem;">${t('insightExtras.history')}</div>
                ${trailingHtml}
            </div>
        `;
    }

    if (d.kind === 'subs-summary') {
        const list = d.subscriptions.slice(0, 8).map(s => `
            <div class="insight-detail-list-item">
                <div>
                    <strong>${capitalize(s.desc)}</strong>
                    <small>${t('insightExtras.monthsTracked', { n: s.months })}${s.daysSince > 30 ? ` · ${t('insightExtras.daysAgoShort', { n: s.daysSince })}` : ''}</small>
                </div>
                <strong>${formatCurrency(s.avg)}</strong>
            </div>
        `).join('');
        return `
            <div class="insight-stat-row">
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.count')}</div>
                    <div class="insight-stat-value">${d.count}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('subs.perMonth')}</div>
                    <div class="insight-stat-value warning">${formatCurrency(d.totalMonthly)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('subs.perYear')}</div>
                    <div class="insight-stat-value warning">${formatCurrency(d.totalYearly)}</div>
                </div>
            </div>
            <div class="insight-detail-list">${list}</div>
        `;
    }

    if (d.kind === 'subs-stale') {
        const list = d.stale.map(s => `
            <div class="insight-detail-list-item">
                <div>
                    <strong>${capitalize(s.desc)}</strong>
                    <small>${formatCurrency(s.avg)}${t('insights.perMo')} · ${t('insightExtras.lastDaysAgo', { n: s.daysSince })}</small>
                </div>
            </div>
        `).join('');
        return `<div class="insight-detail-list">${list}</div>`;
    }

    if (d.kind === 'subs-top') {
        return `
            <div class="insight-stat-row">
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('subs.perMonth')}</div>
                    <div class="insight-stat-value">${formatCurrency(d.monthlyAverage)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('subs.perYear')}</div>
                    <div class="insight-stat-value warning">${formatCurrency(d.annualCost)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.monthsTrackedLabel')}</div>
                    <div class="insight-stat-value">${d.monthsTracked}</div>
                </div>
            </div>
        `;
    }

    if (d.kind === 'leak') {
        return `
            <div class="insight-stat-row">
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.last30Days')}</div>
                    <div class="insight-stat-value warning">${formatCurrency(d.monthlyTotal)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.perOccurrence')}</div>
                    <div class="insight-stat-value">${formatCurrency(d.avgPerOccurrence)}</div>
                </div>
                <div class="insight-stat">
                    <div class="insight-stat-label">${t('insightExtras.yearlyPace')}</div>
                    <div class="insight-stat-value warning">${formatCurrency(d.annualProjection)}</div>
                </div>
            </div>
        `;
    }

    return '';
}

function closeInsightDetail() {
    document.getElementById('insightDetailModal').classList.remove('active');
    currentDetailInsight = null;
}

function acknowledgeCurrentInsight() {
    if (!currentDetailInsight) return;
    const id = currentDetailInsight.id;
    if (!acknowledgedInsights.includes(id)) {
        acknowledgedInsights.push(id);
        persistAcknowledgedInsights();
    }
    closeInsightDetail();
    renderInsights();
}

function unacknowledgeCurrentInsight() {
    if (!currentDetailInsight) return;
    const id = currentDetailInsight.id;
    acknowledgedInsights = acknowledgedInsights.filter(x => x !== id);
    persistAcknowledgedInsights();
    closeInsightDetail();
    renderInsights();
}

// Create a savings goal from the currently-open counterfactual insight.
// Cut goals are auto-tracked: progress = how much you actually spent below the
// baseline each calendar month. No manual contributions accepted.
function createGoalFromCurrentInsight() {
    const item = currentDetailInsight;
    if (!item || !item.data || item.data.kind !== 'counterfactual') return;
    const d = item.data;

    // Default deadline: 12 months from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(today);
    deadline.setFullYear(deadline.getFullYear() + 1);
    const deadlineStr = isoDate(deadline);
    const startDateStr = isoDate(today);

    const meta = {
        categoryId: d.categoryId,
        categoryName: d.categoryName,
        baselineMonthlyAvg: d.monthlyAverage,
        cutPercent: d.cutPercent,
        startDate: startDateStr,
        targetMonthlySavings: d.monthlySavings
    };

    const newId = Date.now();
    const goalName = t('goals.cutByPercent', { category: d.categoryName, percent: d.cutPercent });

    db.run(
        'INSERT INTO goals (id, name, emoji, target_amount, current_amount, color, deadline, created_date, completed, kind, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newId, goalName, 'trending-up', Math.round(d.annualSavings), 0, d.categoryColor || '#3b82f6', deadlineStr, startDateStr, 0, 'cut', JSON.stringify(meta)]
    );
    saveDatabase();
    loadDataFromDB();

    // Acknowledge the insight (user took action)
    if (!acknowledgedInsights.includes(item.id)) {
        acknowledgedInsights.push(item.id);
        persistAcknowledgedInsights();
    }

    closeInsightDetail();
    // Switch to Goals tab and open the new goal's detail
    switchTab('goals', document.querySelector('.tab[data-tab="goals"]'));
    setTimeout(() => openCutGoalDetail(newId), 200);
}

function computeForecast() {
    if (monthlyBudget <= 0 || expenses.length === 0) return null;
    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
    const availableBudget = monthlyBudget - totalFixed;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const viewBounds = getCycleBounds(currentViewMonth);
    const todayBounds = getCycleBounds(now);
    const isCurrentCycle = isoDate(viewBounds.start) === isoDate(todayBounds.start);
    if (!isCurrentCycle) return null;

    // Days elapsed including today, days remaining (exclusive of today)
    const dayElapsed = Math.round((now - viewBounds.start) / 86400000) + 1;
    const totalDays = viewBounds.days;
    const daysLeft = totalDays - dayElapsed;
    if (dayElapsed < 5) return null; // Too early to forecast

    const startStr = isoDate(viewBounds.start);
    const endStr = isoDate(viewBounds.end);
    const monthExpenses = expenses.filter(exp =>
        exp.date >= startStr && exp.date <= endStr && isSpendingKind(exp.kind)
    );
    const spentSoFar = monthExpenses.reduce((sum, exp) => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        return sum + exp.amount - repayments;
    }, 0);

    const projectedTotal = (spentSoFar / dayElapsed) * totalDays;
    const overUnder = projectedTotal - availableBudget;
    const cycleId = isoDate(viewBounds.start);

    if (overUnder > 0) {
        return {
            id: `forecast-over:${cycleId}`,
            type: 'alert',
            icon: 'chart',
            title: t('insights.forecastOver.title'),
            desc: t('insights.forecastOver.desc', {
                avg: formatCurrency(spentSoFar/dayElapsed),
                days: daysLeft,
                cap: formatCurrency(Math.max(0, availableBudget - spentSoFar) / Math.max(1, daysLeft))
            }),
            amount: '+' + formatCurrency(overUnder),
            amountClass: 'warning',
            data: {
                kind: 'forecast',
                spentSoFar, dayElapsed, totalDays, daysLeft,
                availableBudget, projectedTotal, overUnder
            }
        };
    } else {
        return {
            id: `forecast-under:${cycleId}`,
            type: 'success',
            icon: 'check-circle',
            title: t('insights.forecastUnder.title'),
            desc: t('insights.forecastUnder.desc', { amount: formatCurrency(Math.abs(overUnder)) }),
            amount: formatCurrency(Math.abs(overUnder)),
            amountClass: 'savings',
            data: {
                kind: 'forecast',
                spentSoFar, dayElapsed, totalDays, daysLeft,
                availableBudget, projectedTotal, overUnder
            }
        };
    }
}

function computeAnomalies() {
    const anomalies = [];
    const currentBounds = getCycleBounds(currentViewMonth);
    const startStr = isoDate(currentBounds.start);
    const endStr = isoDate(currentBounds.end);

    // Per-category spend this cycle vs trailing 3-cycle avg
    const monthExpenses = expenses.filter(exp =>
        exp.date >= startStr && exp.date <= endStr && isSpendingKind(exp.kind)
    );

    // Walk back 3 cycles
    const trailingByCategory = {}; // catId -> [c1, c2, c3]
    let cursorRef = new Date(currentBounds.start);
    cursorRef.setDate(cursorRef.getDate() - 1); // step into previous cycle
    for (let m = 0; m < 3; m++) {
        const b = getCycleBounds(cursorRef);
        const sStr = isoDate(b.start);
        const eStr = isoDate(b.end);
        const buckets = {};
        expenses.forEach(exp => {
            if (!isSpendingKind(exp.kind)) return;
            if (exp.date >= sStr && exp.date <= eStr) {
                const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
                buckets[exp.category] = (buckets[exp.category] || 0) + exp.amount - repayments;
            }
        });
        Object.entries(buckets).forEach(([cat, amt]) => {
            if (!trailingByCategory[cat]) trailingByCategory[cat] = [];
            trailingByCategory[cat].push(amt);
        });
        cursorRef = new Date(b.start);
        cursorRef.setDate(cursorRef.getDate() - 1);
    }

    const currentByCategory = {};
    monthExpenses.forEach(exp => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        currentByCategory[exp.category] = (currentByCategory[exp.category] || 0) + exp.amount - repayments;
    });

    const cycleId = isoDate(currentBounds.start);
    Object.entries(currentByCategory).forEach(([catId, amt]) => {
        const trailing = trailingByCategory[catId] || [];
        if (trailing.length < 2) return; // Need history
        const avg = trailing.reduce((s, x) => s + x, 0) / trailing.length;
        if (avg < 100) return; // Skip tiny categories

        const pctIncrease = ((amt - avg) / avg) * 100;
        if (pctIncrease >= 25) {
            anomalies.push({
                id: `anomaly:${catId}:${cycleId}`,
                type: 'alert',
                icon: 'alert',
                title: t('insights.anomaly.title', { category: getCategoryName(catId), pct: pctIncrease.toFixed(0) }),
                desc: t('insights.anomaly.desc', { current: formatCurrency(amt), avg: formatCurrency(avg), n: trailing.length }),
                amount: '+' + formatCurrency(amt - avg),
                amountClass: 'warning',
                data: {
                    kind: 'anomaly',
                    categoryId: catId,
                    categoryName: getCategoryName(catId),
                    categoryColor: getCategoryColor(catId),
                    currentAmount: amt,
                    averageAmount: avg,
                    overspend: amt - avg,
                    pctIncrease: pctIncrease,
                    trailingCount: trailing.length,
                    trailingTotals: trailing.slice()
                }
            });
        }
    });

    return anomalies;
}

function detectSubscriptions() {
    // Find descriptions that recur with similar amounts in 2+ months
    const byDescription = {};
    expenses.forEach(exp => {
        const desc = (exp.description || '').toLowerCase().trim();
        if (!desc || desc === 'no description') return;
        if (!byDescription[desc]) byDescription[desc] = [];
        byDescription[desc].push(exp);
    });

    const subs = [];
    Object.entries(byDescription).forEach(([desc, list]) => {
        if (list.length < 2) return;
        // Group by month
        const months = new Set();
        list.forEach(e => {
            const d = new Date(e.date);
            months.add(`${d.getFullYear()}-${d.getMonth()}`);
        });
        if (months.size < 2) return;

        // Check amounts are similar (within 10%)
        const amounts = list.map(e => e.amount);
        const avg = amounts.reduce((s, x) => s + x, 0) / amounts.length;
        const maxDiff = Math.max(...amounts.map(a => Math.abs(a - avg)));
        if (maxDiff / avg > 0.15) return; // Variable amounts → not a subscription

        // Most recent occurrence
        const sorted = list.sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastDate = new Date(sorted[0].date);
        const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);

        subs.push({
            desc,
            avg,
            count: list.length,
            months: months.size,
            daysSince,
            lastDate: sorted[0].date,
            category: sorted[0].category
        });
    });

    if (subs.length === 0) return [];

    // Total monthly drain
    const totalMonthly = subs.reduce((s, x) => s + x.avg, 0);
    const yearly = totalMonthly * 12;

    const items = [];
    items.push({
        id: `subs-summary`,
        type: 'tip',
        icon: 'repeat',
        title: t('insights.subsSummary.title', { n: subs.length }),
        desc: t('insights.subsSummary.desc', { monthly: formatCurrency(totalMonthly), yearly: formatCurrency(yearly) }),
        amount: formatCurrency(totalMonthly) + t('insights.perMo'),
        amountClass: 'warning',
        data: {
            kind: 'subs-summary',
            count: subs.length,
            totalMonthly,
            totalYearly: yearly,
            subscriptions: subs.map(s => ({ desc: s.desc, avg: s.avg, daysSince: s.daysSince, months: s.months }))
        }
    });

    // Stale subscriptions (haven't seen in 60+ days but used to be recurring)
    const stale = subs.filter(s => s.daysSince > 60 && s.daysSince < 120);
    if (stale.length > 0) {
        items.push({
            id: `subs-stale`,
            type: 'success',
            icon: 'scissors',
            title: t('insights.subsStale.title', { n: stale.length }),
            desc: t('insights.subsStale.desc', {
                names: stale.map(s => s.desc).slice(0, 3).join(', ') + (stale.length > 3 ? ', …' : '')
            }),
            data: {
                kind: 'subs-stale',
                stale: stale.map(s => ({ desc: s.desc, avg: s.avg, daysSince: s.daysSince, lastDate: s.lastDate }))
            }
        });
    }

    // Top 3 by cost
    const top3 = subs.sort((a, b) => b.avg - a.avg).slice(0, 3);
    top3.forEach(s => {
        items.push({
            id: `subs-top:${s.desc}`,
            type: 'tip',
            icon: 'credit-card',
            title: capitalize(s.desc),
            desc: t('insights.subsTop.desc', {
                amount: formatCurrency(s.avg),
                months: s.months,
                last: s.daysSince === 0 ? t('common.today') : t('insights.daysAgo', { n: s.daysSince })
            }),
            amount: formatCurrency(s.avg * 12) + t('insights.perYr'),
            amountClass: 'warning',
            data: {
                kind: 'subs-top',
                desc: s.desc,
                monthlyAverage: s.avg,
                annualCost: s.avg * 12,
                monthsTracked: s.months,
                daysSince: s.daysSince,
                category: s.category
            }
        });
    });

    return items;
}

function detectLeaks() {
    // Find small recurring charges (< 100/each) that pile up
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 30);

    const recent = expenses.filter(e => new Date(e.date + 'T00:00:00') >= cutoff);
    const byDesc = {};
    recent.forEach(e => {
        const desc = (e.description || '').toLowerCase().trim();
        if (!desc) return;
        if (!byDesc[desc]) byDesc[desc] = { count: 0, total: 0, category: e.category };
        byDesc[desc].count += 1;
        byDesc[desc].total += e.amount;
    });

    const leaks = Object.entries(byDesc)
        .filter(([, d]) => d.count >= 4 && d.total / d.count < 200)
        .map(([desc, d]) => ({ desc, ...d }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return leaks.map(l => ({
        id: `leak:${l.desc}:${monthKey}`,
        type: 'tip',
        icon: 'droplet',
        title: capitalize(l.desc),
        desc: t('insights.leak.desc', { count: l.count, yearly: formatCurrency(l.total * 12) }),
        amount: formatCurrency(l.total) + t('insights.perMo'),
        amountClass: 'warning',
        data: {
            kind: 'leak',
            desc: l.desc,
            count: l.count,
            monthlyTotal: l.total,
            annualProjection: l.total * 12,
            category: l.category,
            avgPerOccurrence: l.total / l.count
        }
    }));
}

function computeCounterfactuals() {
    // For each category with trailing avg, what if you cut by 20%?
    const out = [];
    const trailingByCategory = {};
    const today = new Date();
    for (let m = 1; m <= 3; m++) {
        const target = new Date(today.getFullYear(), today.getMonth() - m, 1);
        const tm = target.getMonth();
        const ty = target.getFullYear();
        expenses.forEach(exp => {
            const d = new Date(exp.date);
            if (d.getMonth() === tm && d.getFullYear() === ty) {
                const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
                trailingByCategory[exp.category] = trailingByCategory[exp.category] || [];
                if (!trailingByCategory[exp.category][m - 1]) trailingByCategory[exp.category][m - 1] = 0;
                trailingByCategory[exp.category][m - 1] += exp.amount - repayments;
            }
        });
    }

    const averages = Object.entries(trailingByCategory)
        .map(([cat, arr]) => {
            const filled = arr.filter(x => x !== undefined);
            if (filled.length === 0) return null;
            const avg = filled.reduce((s, x) => s + x, 0) / filled.length;
            return { cat, avg };
        })
        .filter(x => x && x.avg > 500)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 2);

    averages.forEach(({ cat, avg }) => {
        const cut20 = avg * 0.2;
        const yearlySaving = cut20 * 12;
        out.push({
            id: `counterfactual:${cat}`,
            type: 'tip',
            icon: 'sparkles',
            title: t('insights.counterfactual.title', { category: getCategoryName(cat) }),
            desc: t('insights.counterfactual.desc', { avg: formatCurrency(avg), yearly: formatCurrency(yearlySaving) }),
            amount: formatCurrency(yearlySaving) + t('insights.perYr'),
            amountClass: 'savings',
            data: {
                kind: 'counterfactual',
                categoryId: cat,
                categoryName: getCategoryName(cat),
                categoryColor: getCategoryColor(cat),
                monthlyAverage: avg,
                monthlySavings: cut20,
                annualSavings: yearlySaving,
                cutPercent: 20
            }
        });
    });

    return out;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

