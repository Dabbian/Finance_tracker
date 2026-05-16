// =====================================================
// HERO: Savings Rate + Streak + Avoidance Wins
// =====================================================
function renderHero(monthSpent) {
    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);

    // Savings Rate — prefer income tagged on transactions in the
    // current cycle; fall back to the manual Monthly Income setting.
    const incomeRef = effectiveMonthlyIncome(getCycleBounds(currentViewMonth));
    const heroValue = document.getElementById('heroSavingsRate');
    const heroDetail = document.getElementById('heroSavingsDetail');

    if (incomeRef > 0) {
        const totalOutflow = monthSpent + totalFixed;
        const saved = incomeRef - totalOutflow;
        const rate = (saved / incomeRef) * 100;
        const sign = saved >= 0 ? '+' : '−';
        heroValue.textContent = `${rate.toFixed(0)}%`;
        heroValue.style.color = saved >= 0 ? '' : 'var(--danger)';
        heroDetail.innerHTML = saved >= 0
            ? t('hero.keeping', { amount: formatCurrency(saved) })
            : t('hero.spendingOver', { amount: formatCurrency(Math.abs(saved)) });

        // Trigger milestone celebration when crossing 10/20/30/40/50% savings rate
        if (saved > 0) {
            checkSavingsRateMilestone(rate);
        }
    } else {
        heroValue.textContent = '—';
        heroValue.style.color = '';
        heroDetail.textContent = t('hero.setIncomeHint');
    }

    // Streak
    const streakInfo = computeStreak();
    const streakCount = document.getElementById('streakCount');
    const streakIcon = document.getElementById('streakIcon');
    const streakBest = document.getElementById('streakBest');

    streakCount.textContent = streakInfo.current;
    streakIcon.className = 'streak-icon'; // reset
    if (streakInfo.current === 0) {
        streakIcon.classList.add('cold');
    } else if (streakInfo.current >= 30) {
        streakIcon.classList.add('hot');
    } else if (streakInfo.current >= 7) {
        streakIcon.classList.add('warm');
    }
    // 1–6 days: default white flame, no extra class

    streakBest.textContent = streakInfo.best > 0 ? t('hero.best', { n: streakInfo.best + ' ' + (language === 'sv' ? 'dagar' : 'days') }) : '';

    checkStreakMilestone(streakInfo.current);
}

// Streak: count consecutive days BEFORE today (today might still be in progress)
// where daily spend <= daily budget. Only counts back to start of usage.
function computeStreak() {
    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (monthlyBudget <= 0 || expenses.length === 0) return { current: 0, best: 0 };

    // Get earliest expense date
    const dates = expenses.map(e => new Date(e.date + 'T00:00:00').getTime());
    const earliest = new Date(Math.min(...dates));
    earliest.setHours(0, 0, 0, 0);

    // Build daily totals map — only discretionary (non-essential)
    // expenses count toward streak math, so a single big grocery run
    // doesn't snap the streak.
    const dailyMap = {};
    expenses.forEach(exp => {
        if (!isSpendingKind(exp.kind)) return; // skip income + transfers
        if (isEssentialCategory(exp.category)) return;
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        dailyMap[exp.date] = (dailyMap[exp.date] || 0) + (exp.amount - repayments);
    });

    function dailyBudgetForDate(d) {
        const bounds = getCycleBounds(d);
        return (monthlyBudget - totalFixed) / bounds.days;
    }

    function dateStr(d) {
        return isoDate(d);
    }

    // Current streak: walk backwards from yesterday (today might still earn spend)
    let current = 0;
    let cursor = new Date(today);
    cursor.setDate(cursor.getDate() - 1);
    while (cursor >= earliest) {
        const spent = dailyMap[dateStr(cursor)] || 0;
        if (spent <= dailyBudgetForDate(cursor)) {
            current++;
            cursor.setDate(cursor.getDate() - 1);
        } else {
            break;
        }
    }

    // If today already shows under-budget spending, include it
    const todaySpent = dailyMap[dateStr(today)] || 0;
    if (todaySpent > 0 && todaySpent <= dailyBudgetForDate(today)) {
        current++;
    }

    // Best streak: full sweep
    let best = 0;
    let run = 0;
    let scanDate = new Date(earliest);
    while (scanDate <= today) {
        const ds = dateStr(scanDate);
        // Only count days with at least one expense, OR that have past — use simpler: any day with spent <= budget counts
        const spent = dailyMap[ds] || 0;
        if (spent <= dailyBudgetForDate(scanDate)) {
            run++;
            best = Math.max(best, run);
        } else {
            run = 0;
        }
        scanDate.setDate(scanDate.getDate() + 1);
    }

    return { current, best };
}

// Avoidance wins — surface positive patterns in last 7-30 days
function renderWins() {
    const strip = document.getElementById('winsStrip');
    const wins = computeAvoidanceWins();
    if (wins.length === 0) {
        strip.innerHTML = '';
        return;
    }
    strip.innerHTML = wins.slice(0, 3).map(w => `
        <div class="win-chip">
            <span class="win-chip-dot"></span>
            <span>${w.text}</span>
        </div>
    `).join('');
}

function computeAvoidanceWins() {
    const wins = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Days without an expense in a given category (last 30 days)
    const checkCategories = ['food', 'shopping', 'entertainment'];
    checkCategories.forEach(catId => {
        const cat = categories.find(c => c.id === catId);
        if (!cat) return;
        let daysWithout = 0;
        for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const hasExp = expenses.some(e => e.date === ds && e.category === catId);
            if (!hasExp) daysWithout++;
            else break;
        }
        if (daysWithout >= 3) {
            wins.push({ text: t('wins.daysWithout', { n: daysWithout, category: localizedCategoryName(cat).toLowerCase() }) });
        }
    });

    // Lowest spending week in 8 weeks
    const weeklyTotals = [];
    for (let w = 0; w < 8; w++) {
        const end = new Date(today);
        end.setDate(end.getDate() - w * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        let total = 0;
        expenses.forEach(exp => {
            if (!isSpendingKind(exp.kind)) return;
            const d = new Date(exp.date + 'T00:00:00');
            if (d >= start && d <= end) {
                const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
                total += exp.amount - repayments;
            }
        });
        weeklyTotals.push(total);
    }
    if (weeklyTotals.length >= 4 && weeklyTotals[0] > 0) {
        const recent = weeklyTotals[0];
        const others = weeklyTotals.slice(1).filter(t => t > 0);
        if (others.length > 0) {
            const minOther = Math.min(...others);
            if (recent < minOther) {
                wins.push({ text: t('wins.lowestWeek') });
            }
        }
    }

    // Streak milestone reached today
    const streak = computeStreak();
    if (streak.current >= 7 && streak.current === streak.best) {
        wins.push({ text: t('wins.newBest', { n: streak.current }) });
    }

    return wins;
}
