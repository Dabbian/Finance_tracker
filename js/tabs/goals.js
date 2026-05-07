// =====================================================
// SAVINGS GOALS
// =====================================================

// =====================================================
// CUT-GOAL TRACKING
// A "cut" goal is auto-tracked: progress = sum of (baseline - actual) per completed
// calendar month since the goal started, clamped at 0 per month.
// =====================================================
function categorySpendInMonth(categoryId, year, monthIdx) {
    return expenses.reduce((sum, exp) => {
        if (exp.category !== categoryId) return sum;
        const d = new Date(exp.date + 'T00:00:00');
        if (d.getFullYear() !== year || d.getMonth() !== monthIdx) return sum;
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        return sum + exp.amount - repayments;
    }, 0);
}

// Returns rich progress object for a cut goal
function computeCutGoalProgress(goal) {
    const m = goal.meta || {};
    if (!m.categoryId || !m.baselineMonthlyAvg || !m.startDate) {
        return { saved: 0, monthsElapsed: 0, breakdown: [], rate: 0, projected: 0, onTrack: false };
    }

    const baseline = m.baselineMonthlyAvg;
    const start = new Date(m.startDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count COMPLETED calendar months from start (don't include current partial month in projection rate)
    const breakdown = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    let totalSavedClamped = 0;
    let totalSavedRaw = 0;
    let monthsElapsed = 0;

    while (true) {
        const y = cursor.getFullYear();
        const mo = cursor.getMonth();
        const isCurrent = (y === today.getFullYear() && mo === today.getMonth());
        const isFuture = cursor > today;
        if (isFuture) break;

        const actual = categorySpendInMonth(m.categoryId, y, mo);
        const rawDelta = baseline - actual; // can be negative (overspent)
        const clampedDelta = Math.max(0, rawDelta);

        breakdown.push({
            year: y,
            month: mo,
            label: new Date(y, mo, 1).toLocaleDateString(activeLocale(), { month: 'short', year: 'numeric' }),
            baseline,
            actual,
            saved: clampedDelta,
            isPartial: isCurrent
        });

        // For total: include current partial month's progress in display, but exclude from rate
        totalSavedClamped += clampedDelta;
        totalSavedRaw += rawDelta;
        if (!isCurrent) monthsElapsed++;

        if (isCurrent) break;
        cursor = new Date(y, mo + 1, 1);
    }

    // Projection
    const target = goal.targetAmount;
    const deadlineDate = goal.deadline
        ? new Date(goal.deadline + 'T00:00:00')
        : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());

    const totalMonths = Math.max(1,
        (deadlineDate.getFullYear() - start.getFullYear()) * 12 +
        (deadlineDate.getMonth() - start.getMonth())
    );
    const monthsRemaining = Math.max(0, totalMonths - monthsElapsed);

    // Use the average over completed months (not partial); fallback to 0 if no full month yet
    const completedSaved = breakdown
        .filter(b => !b.isPartial)
        .reduce((s, b) => s + b.saved, 0);
    const rate = monthsElapsed > 0 ? (completedSaved / monthsElapsed) : 0;
    const projected = completedSaved + (rate * monthsRemaining);
    const onTrack = projected >= target;

    return {
        saved: totalSavedClamped,
        completedSaved,
        monthsElapsed,
        monthsRemaining,
        totalMonths,
        breakdown: breakdown.reverse(), // newest first for display
        rate,
        projected,
        onTrack,
        target,
        deadlineDate
    };
}

// Returns the effective current amount for a goal (computed for cut goals, stored for manual)
function effectiveCurrentAmount(goal) {
    if (goal.kind === 'cut') {
        return computeCutGoalProgress(goal).saved;
    }
    return goal.currentAmount || 0;
}

// =====================================================
// CUT-GOAL DETAIL MODAL
// =====================================================
function openCutGoalDetail(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal || goal.kind !== 'cut') return;
    currentCutGoalId = goalId;

    const p = computeCutGoalProgress(goal);
    const m = goal.meta || {};
    const iconName = resolveGoalIcon(goal.emoji);

    document.getElementById('cutGoalDetailTitle').textContent = goal.name;
    document.getElementById('cutGoalDetailHeader').innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 1rem;">
            <div class="goal-icon-badge" style="--goal-color: ${goal.color}; width: 56px; height: 56px;">
                ${svgIcon(iconName)}
            </div>
            <div style="flex: 1;">
                <div style="font-size: 0.875rem; color: var(--text-light); margin-bottom: 0.5rem;" data-i18n-html="true">
                    ${t('cutGoal.headerNote', {
                        baseline: formatCurrency(m.baselineMonthlyAvg || 0),
                        category: m.categoryName || t('cutGoal.thisCategory')
                    })}
                </div>
            </div>
        </div>
    `;

    // Stat row
    const stats = [
        { label: t('cutGoal.savedSoFar'), value: formatCurrency(p.saved), cls: 'savings' },
        { label: t('labels.target'), value: formatCurrency(p.target) },
        { label: t('cutGoal.monthsElapsed'), value: `${p.monthsElapsed} / ${p.totalMonths}` },
        { label: t('cutGoal.avgPerMonth'), value: p.monthsElapsed > 0 ? formatCurrency(p.rate) : '—' },
        { label: t('goals.projected'), value: formatCurrency(p.projected), cls: p.onTrack ? 'savings' : 'warning' },
        { label: t('goals.status'), value: p.onTrack ? t('goals.onTrack') : t('goals.behindBy', { amount: formatCurrency(p.target - p.projected) }), cls: p.onTrack ? 'savings' : 'warning' }
    ];
    document.getElementById('cutGoalDetailStats').innerHTML = stats.map(s => `
        <div class="insight-stat">
            <div class="insight-stat-label">${s.label}</div>
            <div class="insight-stat-value ${s.cls || ''}">${s.value}</div>
        </div>
    `).join('');

    // Month-by-month breakdown
    const baseline = m.baselineMonthlyAvg || 0;
    const breakdownHtml = p.breakdown.length === 0
        ? `<p style="text-align: center; color: var(--text-light); padding: 1rem;">${t('cutGoal.noMonths')}</p>`
        : p.breakdown.map(b => {
            const overspent = b.saved === 0 && b.actual > b.baseline;
            const sign = b.saved > 0 ? '+' : (overspent ? '−' : '');
            const amt = b.saved > 0 ? b.saved : (overspent ? b.actual - b.baseline : 0);
            const cls = b.saved > 0 ? 'savings' : (overspent ? 'warning' : '');
            return `
                <div class="insight-detail-list-item">
                    <div>
                        <strong>${b.label}${b.isPartial ? ` <span style="color: var(--text-light); font-weight: 400;">· ${t('cutGoal.inProgress')}</span>` : ''}</strong>
                        <small>${t('cutGoal.spentVs', { actual: formatCurrency(b.actual), baseline: formatCurrency(baseline) })}</small>
                    </div>
                    <div class="insight-stat-value ${cls}" style="font-size: 0.95rem;">${sign}${formatCurrency(amt)}</div>
                </div>
            `;
        }).join('');

    document.getElementById('cutGoalDetailBreakdown').innerHTML = `
        <div class="insight-section-title" style="margin-top: 0; margin-bottom: 0.5rem;">${t('cutGoal.monthByMonth')}</div>
        <div class="insight-detail-list" style="background: var(--bg-alt); padding: 0.5rem 1rem; border-radius: 10px;">
            ${breakdownHtml}
        </div>
    `;

    document.getElementById('cutGoalDetailModal').classList.add('active');
}

function closeCutGoalDetail() {
    document.getElementById('cutGoalDetailModal').classList.remove('active');
    currentCutGoalId = null;
}

function renderGoals() {
    const grid = document.getElementById('goalsGrid');
    if (!grid) return;

    const monthYear = (iso) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const s = d.toLocaleDateString(activeLocale(), { month: 'short', year: 'numeric' });
        // Capitalize first letter so Swedish "maj 2026" reads "Maj 2026"
        return s.charAt(0).toUpperCase() + s.slice(1);
    };

    let html = goals.map(g => {
        const isCut = g.kind === 'cut';
        const current = effectiveCurrentAmount(g);
        const pct = Math.min(100, (current / Math.max(1, g.targetAmount)) * 100);
        const isComplete = current >= g.targetAmount;
        const iconName = resolveGoalIcon(g.emoji);
        const dateLabel = g.deadline ? monthYear(g.deadline) : '';
        const clickHandler = isCut
            ? `openCutGoalDetail(${g.id})`
            : (isComplete ? `openGoalModal(${g.id})` : `openGoalContribModal(${g.id})`);

        const autoBadge = isCut
            ? `<span class="goal-row-auto" title="${t('goals.autoTrackedHelp')}">${t('goals.autoTrackedShort')}</span>`
            : '';

        return `
            <div class="goal-row ${isComplete ? 'complete' : ''} ${isCut ? 'cut-goal' : ''}" style="--goal-color: ${g.color};" onclick="${clickHandler}" role="button" tabindex="0">
                <div class="goal-row-head">
                    <div class="goal-row-icon">${svgIcon(iconName)}</div>
                    <div class="goal-row-text">
                        <div class="goal-row-name">${g.name}${autoBadge}</div>
                        ${dateLabel ? `<div class="goal-row-deadline">${dateLabel}</div>` : ''}
                    </div>
                    <div class="goal-row-amount">
                        <div class="goal-row-current">${formatCurrency(current)}</div>
                        <div class="goal-row-target">${t('goals.targetSuffix', { amount: formatCurrency(g.targetAmount) })}</div>
                    </div>
                </div>
                <div class="goal-row-bar"><div class="goal-row-bar-fill" style="width: ${pct.toFixed(1)}%;"></div></div>
            </div>
        `;
    }).join('');

    if (goals.length === 0) {
        html = `
            <div class="empty-state">
                <div class="empty-state-icon-svg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px;"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
                </div>
                <div data-i18n="goals.empty">No goals yet — tap "+ Add" to create your first one.</div>
            </div>
        `;
    }

    grid.innerHTML = html;
}

// SVG jar with liquid fill — visually satisfying
function jarSvg(percent, color) {
    const fillHeight = (percent / 100) * 100; // 0-100
    const waveY = 110 - fillHeight;
    return `
        <svg viewBox="0 0 100 140" class="goal-jar-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <clipPath id="jarClip-${color.replace('#','')}">
                    <path d="M 20 30 L 20 125 Q 20 130 25 130 L 75 130 Q 80 130 80 125 L 80 30 Z"/>
                </clipPath>
            </defs>
            <!-- Jar lid -->
            <rect x="22" y="14" width="56" height="14" rx="3" fill="${color}" opacity="0.35"/>
            <rect x="25" y="11" width="50" height="6" rx="2" fill="${color}" opacity="0.55"/>
            <!-- Jar body outline -->
            <path d="M 20 30 L 20 125 Q 20 130 25 130 L 75 130 Q 80 130 80 125 L 80 30 Z"
                  fill="none" stroke="var(--border)" stroke-width="2"/>
            <!-- Liquid fill -->
            <g clip-path="url(#jarClip-${color.replace('#','')})">
                <rect x="20" y="${waveY}" width="60" height="${fillHeight + 5}" fill="${color}" opacity="0.85"/>
                <ellipse cx="50" cy="${waveY}" rx="32" ry="3" fill="${color}" opacity="0.9"/>
                <ellipse cx="50" cy="${waveY - 1}" rx="28" ry="2" fill="white" opacity="0.25"/>
            </g>
            <!-- Glass shine -->
            <path d="M 25 35 L 25 110" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.18"/>
        </svg>
    `;
}

function openGoalModal(id) {
    currentEditingGoal = id;
    const titleEl = document.getElementById('goalModalTitle');
    const deleteBtn = document.getElementById('goalDeleteBtn');
    const currentGroup = document.getElementById('goalCurrentGroup');
    const cutInfoGroup = document.getElementById('goalCutInfoGroup');
    const cutInfo = document.getElementById('goalCutInfo');

    if (id) {
        const g = goals.find(x => x.id === id);
        if (!g) return;
        titleEl.textContent = g.kind === 'cut' ? t('goals.editCutGoal') : t('goals.editGoal');
        document.getElementById('goalId').value = g.id;
        document.getElementById('goalName').value = g.name;
        document.getElementById('goalEmoji').value = resolveGoalIcon(g.emoji);
        document.getElementById('goalTarget').value = g.targetAmount;
        document.getElementById('goalCurrent').value = g.currentAmount;
        document.getElementById('goalDeadline').value = g.deadline || '';
        document.getElementById('goalColor').value = g.color;

        if (g.kind === 'cut') {
            currentGroup.style.display = 'none';
            cutInfoGroup.style.display = '';
            const m = g.meta || {};
            const p = computeCutGoalProgress(g);
            cutInfo.innerHTML = `
                <div>${t('cutGoal.tracking')}: <strong>${m.categoryName || t('labels.category').toLowerCase()}</strong></div>
                <div style="margin-top: 0.4rem;">${t('cutGoal.baseline')}: <strong>${formatCurrency(m.baselineMonthlyAvg || 0)}</strong>${t('cutGoal.perMonth')}</div>
                <div style="margin-top: 0.4rem;">${t('cutGoal.savedSoFar')}: <strong style="color: var(--success);">${formatCurrency(p.saved)}</strong> ${t(p.monthsElapsed === 1 ? 'cutGoal.overOneMonth' : 'cutGoal.overMonths', { n: p.monthsElapsed })}</div>
                <div style="margin-top: 0.6rem; font-size: 0.8rem; color: var(--text-light);">
                    ${t('cutGoal.editNote')}
                </div>
            `;
        } else {
            currentGroup.style.display = '';
            cutInfoGroup.style.display = 'none';
        }
        deleteBtn.style.display = 'block';
    } else {
        titleEl.textContent = t('goals.newSavingsGoal');
        document.getElementById('goalForm').reset();
        document.getElementById('goalId').value = '';
        document.getElementById('goalEmoji').value = 'target';
        document.getElementById('goalColor').value = '#3b82f6';
        document.getElementById('goalCurrent').value = '0';
        currentGroup.style.display = '';
        cutInfoGroup.style.display = 'none';
        deleteBtn.style.display = 'none';
    }
    renderGoalIconPicker();
    document.getElementById('goalModal').classList.add('active');
}

function renderGoalIconPicker() {
    const picker = document.getElementById('goalIconPicker');
    if (!picker) return;
    const selected = document.getElementById('goalEmoji').value;
    picker.innerHTML = GOAL_ICON_OPTIONS.map(o => `
        <button type="button" class="icon-picker-option ${o.name === selected ? 'active' : ''}"
                data-icon="${o.name}" onclick="selectGoalIcon('${o.name}')" title="${o.label}">
            ${svgIcon(o.name)}
            <span>${o.label}</span>
        </button>
    `).join('');
}

function selectGoalIcon(name) {
    document.getElementById('goalEmoji').value = name;
    document.querySelectorAll('#goalIconPicker .icon-picker-option').forEach(el => {
        el.classList.toggle('active', el.dataset.icon === name);
    });
}

function closeGoalModal() {
    document.getElementById('goalModal').classList.remove('active');
    currentEditingGoal = null;
}

function saveGoal(e) {
    e.preventDefault();
    const id = document.getElementById('goalId').value;
    const name = document.getElementById('goalName').value;
    const emoji = document.getElementById('goalEmoji').value;
    const target = parseFloat(document.getElementById('goalTarget').value);
    const current = parseFloat(document.getElementById('goalCurrent').value) || 0;
    const deadline = document.getElementById('goalDeadline').value || null;
    const color = document.getElementById('goalColor').value;

    if (id) {
        // Editing — preserve kind / meta (cut goals stay cut goals; their currentAmount is computed, ignore the form field)
        const existing = goals.find(g => g.id === parseInt(id));
        if (existing && existing.kind === 'cut') {
            const computed = effectiveCurrentAmount(existing);
            db.run('UPDATE goals SET name=?, emoji=?, target_amount=?, color=?, deadline=?, completed=? WHERE id=?',
                [name, emoji, target, color, deadline, computed >= target ? 1 : 0, parseInt(id)]);
        } else {
            db.run('UPDATE goals SET name=?, emoji=?, target_amount=?, current_amount=?, color=?, deadline=?, completed=? WHERE id=?',
                [name, emoji, target, current, color, deadline, current >= target ? 1 : 0, parseInt(id)]);
        }
    } else {
        // Creating new manual goal
        const newId = Date.now();
        db.run('INSERT INTO goals (id, name, emoji, target_amount, current_amount, color, deadline, created_date, completed, kind, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newId, name, emoji, target, current, color, deadline, new Date().toISOString().split('T')[0], current >= target ? 1 : 0, 'manual', '{}']);
    }
    saveDatabase();
    loadDataFromDB();
    renderGoals();
    closeGoalModal();
}

function deleteGoal() {
    if (!currentEditingGoal) return;
    if (!confirm(t('confirms.deleteGoal'))) return;
    db.run('DELETE FROM goals WHERE id=?', [parseInt(currentEditingGoal)]);
    saveDatabase();
    loadDataFromDB();
    renderGoals();
    closeGoalModal();
}

function openGoalContribModal(goalId) {
    currentContribGoal = goalId;
    const g = goals.find(x => x.id === goalId);
    if (!g) return;
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    const iconName = resolveGoalIcon(g.emoji);
    document.getElementById('goalContribInfo').innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="goal-icon-badge" style="--goal-color: ${g.color};">${svgIcon(iconName)}</div>
            <div>
                <div style="font-weight: 700;">${g.name}</div>
                <div style="font-size: 0.875rem; color: var(--text-light);">
                    ${formatCurrency(g.currentAmount)} of ${formatCurrency(g.targetAmount)} • ${formatCurrency(remaining)} to go
                </div>
            </div>
        </div>
    `;
    document.getElementById('goalContribAmount').value = '';
    document.getElementById('goalContribModal').classList.add('active');
    setTimeout(() => document.getElementById('goalContribAmount').focus(), 100);
}

function closeGoalContribModal() {
    document.getElementById('goalContribModal').classList.remove('active');
    currentContribGoal = null;
}

function confirmGoalContribution() {
    const amount = parseFloat(document.getElementById('goalContribAmount').value);
    if (!amount || amount <= 0) return;
    const g = goals.find(x => x.id === currentContribGoal);
    if (!g) return;

    const wasComplete = g.currentAmount >= g.targetAmount;
    g.currentAmount += amount;
    const nowComplete = g.currentAmount >= g.targetAmount;

    db.run('UPDATE goals SET current_amount=?, completed=? WHERE id=?',
        [g.currentAmount, nowComplete ? 1 : 0, g.id]);
    saveDatabase();

    closeGoalContribModal();
    renderGoals();

    // Celebrate on completion
    if (!wasComplete && nowComplete) {
        celebrate('🎯', t('goals.completeTitle'), t('goals.reached', { name: g.name }));
    } else {
        // Mini cumulative milestone check across all goals
        const totalSaved = goals.reduce((s, x) => s + x.currentAmount, 0);
        checkSavingsAmountMilestone(totalSaved);
    }
}
