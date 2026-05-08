// =====================================================
// SUBSCRIPTIONS MANAGEMENT
// User-curated list, plus surfacing of auto-detected subs from import data.
// =====================================================

// Render the cycle-specific input that captures the billing day.
// monthly/quarterly: number 1–31 (day of month)
// yearly: <input type="date"> — year is ignored, only MM-DD is stored
// weekly: <select> with weekday options
function renderBillingDayInput(cycle, value) {
    if (cycle === 'yearly') {
        // value is "MM-DD"; render as a real date in current year for the picker
        let dateStr = '';
        if (value && /^\d{2}-\d{2}$/.test(value)) {
            dateStr = `${new Date().getFullYear()}-${value}`;
        }
        return `<input type="date" id="subBillingDayInput" value="${dateStr}">`;
    }
    if (cycle === 'weekly') {
        const opts = [0, 1, 2, 3, 4, 5, 6].map(i => {
            // Pick a known Sunday (2024-01-07 is a Sunday) and offset by i to get each weekday name
            const sample = new Date(2024, 0, 7 + i);
            const label = sample.toLocaleDateString(activeLocale(), { weekday: 'long' });
            const sel = String(value) === String(i) ? 'selected' : '';
            return `<option value="${i}" ${sel}>${label.charAt(0).toUpperCase() + label.slice(1)}</option>`;
        }).join('');
        return `<select id="subBillingDayInput"><option value="">${t('common.none')}</option>${opts}</select>`;
    }
    // monthly / quarterly
    const v = value && /^\d+$/.test(value) ? value : '';
    return `<input type="number" id="subBillingDayInput" min="1" max="31" placeholder="1–31" value="${v}">`;
}

// Read the current billing-day input and produce the storage string for the chosen cycle.
function readBillingDayInput(cycle) {
    const el = document.getElementById('subBillingDayInput');
    if (!el || !el.value) return null;
    if (cycle === 'yearly') {
        // Strip year — store MM-DD
        const m = el.value.match(/^\d{4}-(\d{2}-\d{2})$/);
        return m ? m[1] : null;
    }
    if (cycle === 'weekly') {
        return el.value; // "0".."6"
    }
    const n = parseInt(el.value, 10);
    if (!Number.isFinite(n) || n < 1 || n > 31) return null;
    return String(n);
}

// Format the stored billing-day for display in the list meta line.
function formatBillingDay(s) {
    if (!s.billingDay) return '';
    if (s.cycle === 'yearly') {
        const m = s.billingDay.match(/^(\d{2})-(\d{2})$/);
        if (!m) return '';
        const d = new Date(2000, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
        return d.toLocaleDateString(activeLocale(), { month: 'short', day: 'numeric' });
    }
    if (s.cycle === 'weekly') {
        const i = parseInt(s.billingDay, 10);
        if (!Number.isFinite(i)) return '';
        const sample = new Date(2024, 0, 7 + i);
        return sample.toLocaleDateString(activeLocale(), { weekday: 'short' });
    }
    // monthly / quarterly: just the day number
    return s.billingDay;
}

// Convert a billing cycle to a monthly multiplier for cost summing
function cycleToMonthlyMultiplier(cycle) {
    switch (cycle) {
        case 'weekly':    return 52 / 12;     // ≈ 4.33
        case 'monthly':   return 1;
        case 'quarterly': return 1 / 3;
        case 'yearly':    return 1 / 12;
        default:          return 1;
    }
}

function subscriptionMonthlyCost(sub) {
    return sub.amount * cycleToMonthlyMultiplier(sub.cycle);
}

// Returns auto-detected subscriptions from expenses that AREN'T already in the user's list
// (matched on description-lowercased).
function autoDetectedNewSubscriptions() {
    const known = new Set(subscriptions.map(s => (s.matchKey || s.name || '').toLowerCase().trim()));
    const candidates = detectSubscriptionCandidates();
    return candidates.filter(c => !known.has(c.desc.toLowerCase().trim()));
}

// Lower-level subscription detection (re-uses logic from detectSubscriptions insight)
function detectSubscriptionCandidates() {
    const byDescription = {};
    expenses.forEach(exp => {
        const desc = (exp.description || '').toLowerCase().trim();
        if (!desc || desc === 'no description') return;
        if (!byDescription[desc]) byDescription[desc] = [];
        byDescription[desc].push(exp);
    });

    const out = [];
    Object.entries(byDescription).forEach(([desc, list]) => {
        if (list.length < 2) return;
        const months = new Set();
        list.forEach(e => {
            const d = new Date(e.date);
            months.add(`${d.getFullYear()}-${d.getMonth()}`);
        });
        if (months.size < 2) return;

        const amounts = list.map(e => e.amount);
        const avg = amounts.reduce((s, x) => s + x, 0) / amounts.length;
        const maxDiff = Math.max(...amounts.map(a => Math.abs(a - avg)));
        if (maxDiff / avg > 0.15) return;

        const sorted = list.sort((a, b) => new Date(b.date) - new Date(a.date));
        out.push({
            desc: list[0].description, // preserve original casing
            descLower: desc,
            avg,
            count: list.length,
            months: months.size,
            category: sorted[0].category,
            lastDate: sorted[0].date
        });
    });
    return out.sort((a, b) => b.avg - a.avg);
}

function renderSubscriptionsCard() {
    renderSubsSummary();
    renderSubsDetected();
    renderSubsLists();
}

function renderSubsSummary() {
    const container = document.getElementById('subsSummary');
    if (!container) return;

    const active = subscriptions.filter(s => s.status === 'active');
    const monthlyTotal = active.reduce((sum, s) => sum + subscriptionMonthlyCost(s), 0);
    const yearlyTotal = monthlyTotal * 12;

    container.innerHTML = `
        <div class="subs-summary-cell">
            <div class="subs-summary-label">${t('subs.active')}</div>
            <div class="subs-summary-value">${active.length}</div>
        </div>
        <div class="subs-summary-cell">
            <div class="subs-summary-label">${t('subs.perMonth')}</div>
            <div class="subs-summary-value">${formatCurrency(monthlyTotal)}</div>
        </div>
        <div class="subs-summary-cell">
            <div class="subs-summary-label">${t('subs.perYear')}</div>
            <div class="subs-summary-value">${formatCurrency(yearlyTotal)}</div>
        </div>
    `;
}

function renderSubsDetected() {
    const container = document.getElementById('subsDetected');
    if (!container) return;

    const detected = autoDetectedNewSubscriptions().slice(0, 5);
    if (detected.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = '';
    container.innerHTML = `
        <div class="subs-section-title">${t('subs.autoDetected', { n: detected.length })}</div>
        ${detected.map((d, idx) => `
            <div class="subs-detected-row">
                <div class="subs-detected-info">
                    <div class="subs-detected-name">${capitalize(d.desc)}</div>
                    <div class="subs-detected-meta">${t('subs.detectedMeta', { amount: formatCurrency(d.avg), months: d.months })}</div>
                </div>
                <div class="subs-detected-actions">
                    <button onclick="confirmDetectedSubscription(${idx})">${t('common.add')}</button>
                    <button class="btn-secondary" onclick="ignoreDetectedSubscription(${idx})">${t('subs.ignore')}</button>
                </div>
            </div>
        `).join('')}
    `;
    // Cache the detected list for index-based actions
    container._detected = detected;
}

function confirmDetectedSubscription(idx) {
    const detected = document.getElementById('subsDetected')._detected;
    if (!detected || !detected[idx]) return;
    const d = detected[idx];

    const id = Date.now();
    const name = capitalize(d.desc).slice(0, 60);
    db.run(
        'INSERT INTO subscriptions (id, name, amount, cycle, category, status, source, match_key, billing_day, account_id, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, name, Math.round(d.avg * 100) / 100, 'monthly', d.category || null, 'active', 'detected', d.descLower, null, null, isoDate(new Date())]
    );
    saveDatabase();
    loadDataFromDB();
    renderSubscriptionsCard();
}

// "Ignore" persists by adding a stub sub with status='ignored', so it won't reappear in detected
function ignoreDetectedSubscription(idx) {
    const detected = document.getElementById('subsDetected')._detected;
    if (!detected || !detected[idx]) return;
    const d = detected[idx];

    const id = Date.now();
    db.run(
        'INSERT INTO subscriptions (id, name, amount, cycle, category, status, source, match_key, billing_day, account_id, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, capitalize(d.desc).slice(0, 60), d.avg, 'monthly', d.category || null, 'ignored', 'detected', d.descLower, null, null, isoDate(new Date())]
    );
    saveDatabase();
    loadDataFromDB();
    renderSubscriptionsCard();
}

function renderSubsLists() {
    const activeContainer = document.getElementById('subsActiveList');
    const cancelledContainer = document.getElementById('subsCancelledList');
    if (!activeContainer || !cancelledContainer) return;

    const active = subscriptions.filter(s => s.status === 'active');
    const cancelled = subscriptions.filter(s => s.status === 'cancelled');

    if (active.length === 0 && subscriptions.filter(s => s.status === 'active' || s.status === 'cancelled').length === 0) {
        activeContainer.innerHTML = `<div class="subs-empty">${t('empty.noSubscriptions')}</div>`;
        cancelledContainer.innerHTML = '';
        return;
    }

    activeContainer.innerHTML = active.length > 0
        ? active.map(s => renderSubItem(s)).join('')
        : `<div class="subs-empty">${t('subs.noActive')}</div>`;

    cancelledContainer.innerHTML = cancelled.length > 0
        ? `<div class="subs-list-heading">${t('subs.cancelled')}</div>` + cancelled.map(s => renderSubItem(s)).join('')
        : '';
}

function renderSubItem(s) {
    const monthlyCost = subscriptionMonthlyCost(s);
    const cycleLabel = t('subs.cycleShort.' + (s.cycle || 'monthly'));
    const cancelled = s.status === 'cancelled';
    const sourceBadge = s.source === 'detected' ? `<span class="subs-source-badge">${t('subs.auto')}</span>` : '';
    const statusLabel = cancelled ? t('subs.cancelledStatus') : t('subs.activeStatus');
    const monthlyPrefix = s.cycle === 'monthly' ? '' : `${formatCurrency(monthlyCost)}${t('insights.perMo')} · `;
    const account = s.accountId != null ? accounts.find(a => a.id === s.accountId) : null;
    const dayLabel = !cancelled ? formatBillingDay(s) : '';
    const dueLabel = dayLabel ? `${t('subs.due')} ${dayLabel} · ` : '';
    const accountLabel = account ? `${account.name} · ` : '';

    return `
        <div class="subs-item ${cancelled ? 'cancelled' : ''}" onclick="openSubscriptionModal(${s.id})">
            <div class="subs-item-left">
                <div class="subs-item-name">${s.name} ${sourceBadge}</div>
                <div class="subs-item-meta">${dueLabel}${accountLabel}${monthlyPrefix}${s.note ? s.note + ' · ' : ''}${statusLabel}</div>
            </div>
            <div class="subs-item-amount">${formatCurrency(s.amount)}<span style="font-weight: 400; color: var(--text-light); font-size: 0.75rem;"> / ${cycleLabel}</span></div>
        </div>
    `;
}

// Modal
function openSubscriptionModal(id) {
    currentEditingSubscription = id;
    populateSubCategoryOptions();
    const titleEl = document.getElementById('subModalTitle');
    const deleteBtn = document.getElementById('subDeleteBtn');

    if (id) {
        const s = subscriptions.find(x => x.id === id);
        if (!s) return;
        titleEl.textContent = s.status === 'cancelled' ? t('modals.editCancelledSub') : t('modals.editSubscription');
        document.getElementById('subId').value = s.id;
        document.getElementById('subName').value = s.name;
        document.getElementById('subAmount').value = s.amount;
        document.getElementById('subCycle').value = s.cycle || 'monthly';
        document.getElementById('subCategory').value = s.category || '';
        document.getElementById('subNote').value = s.note || '';
        document.getElementById('subBillingDayContainer').innerHTML = renderBillingDayInput(s.cycle || 'monthly', s.billingDay);
        document.getElementById('subAccount').innerHTML = renderAccountOptions(s.accountId);
        deleteBtn.style.display = 'block';

        // Add Cancel/Reactivate button dynamically (replaces existing one if any)
        const existingToggle = document.getElementById('subStatusToggle');
        if (existingToggle) existingToggle.remove();
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'subStatusToggle';
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn-secondary';
        toggleBtn.style.marginTop = '0.5rem';
        toggleBtn.style.color = s.status === 'cancelled' ? 'var(--success)' : 'var(--warning)';
        toggleBtn.textContent = s.status === 'cancelled' ? t('subs.reactivate') : t('subs.markCancelled');
        toggleBtn.onclick = () => toggleSubscriptionStatus(s.id);
        deleteBtn.parentNode.insertBefore(toggleBtn, deleteBtn);
    } else {
        titleEl.textContent = t('modals.newSubscription');
        document.getElementById('subscriptionForm').reset();
        document.getElementById('subId').value = '';
        document.getElementById('subCycle').value = 'monthly';
        document.getElementById('subBillingDayContainer').innerHTML = renderBillingDayInput('monthly', null);
        document.getElementById('subAccount').innerHTML = renderAccountOptions(null);
        deleteBtn.style.display = 'none';
        const existingToggle = document.getElementById('subStatusToggle');
        if (existingToggle) existingToggle.remove();
    }

    document.getElementById('subscriptionModal').classList.add('active');
}

function populateSubCategoryOptions() {
    const select = document.getElementById('subCategory');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">' + t('common.none') + '</option>' +
        categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    if (current) select.value = current;
}

function closeSubscriptionModal() {
    document.getElementById('subscriptionModal').classList.remove('active');
    currentEditingSubscription = null;
}

function saveSubscription(e) {
    e.preventDefault();
    const id = document.getElementById('subId').value;
    const name = document.getElementById('subName').value.trim();
    const amount = parseFloat(document.getElementById('subAmount').value);
    const cycle = document.getElementById('subCycle').value;
    const category = document.getElementById('subCategory').value || null;
    const note = document.getElementById('subNote').value.trim() || null;
    const billingDay = readBillingDayInput(cycle);
    const accountIdRaw = document.getElementById('subAccount').value;
    const accountId = accountIdRaw ? parseInt(accountIdRaw, 10) : null;

    if (id) {
        db.run('UPDATE subscriptions SET name=?, amount=?, cycle=?, category=?, note=?, billing_day=?, account_id=? WHERE id=?',
            [name, amount, cycle, category, note, billingDay, accountId, parseInt(id)]);
    } else {
        const newId = Date.now();
        const matchKey = name.toLowerCase();
        db.run(
            'INSERT INTO subscriptions (id, name, amount, cycle, category, status, note, source, match_key, billing_day, account_id, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newId, name, amount, cycle, category, 'active', note, 'manual', matchKey, billingDay, accountId, isoDate(new Date())]
        );
    }
    saveDatabase();
    loadDataFromDB();
    renderSubscriptionsCard();
    closeSubscriptionModal();
}

function toggleSubscriptionStatus(id) {
    const s = subscriptions.find(x => x.id === id);
    if (!s) return;
    const newStatus = s.status === 'cancelled' ? 'active' : 'cancelled';
    db.run('UPDATE subscriptions SET status=? WHERE id=?', [newStatus, id]);
    saveDatabase();
    loadDataFromDB();
    renderSubscriptionsCard();
    closeSubscriptionModal();
}

// Cycle changed in the modal — swap the billing-day input. We don't try to
// preserve the previous value across cycles, since "the 15th" doesn't
// translate meaningfully to a weekday or MM-DD.
function onSubCycleChange() {
    const cycle = document.getElementById('subCycle').value;
    document.getElementById('subBillingDayContainer').innerHTML = renderBillingDayInput(cycle, null);
}

// =====================================================
// Auto-create expense from a subscription whose billing day has passed
// =====================================================

// Compute the most recent past billing date (≤ today) for an active sub.
// Returns a Date set to local midnight, or null if not derivable.
function mostRecentBillingDate(s, today) {
    if (!s.billingDay || s.status !== 'active') return null;
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (s.cycle === 'monthly' || s.cycle === 'quarterly') {
        const day = parseInt(s.billingDay, 10);
        if (!Number.isFinite(day) || day < 1 || day > 31) return null;
        // Walk back month-by-month from this month until we find a billing in the past
        for (let back = 0; back < 24; back++) {
            const y = t0.getFullYear();
            const m = t0.getMonth() - back;
            const candidate = new Date(y, m, Math.min(day, daysInMonth(y, m)));
            if (candidate <= t0) {
                if (s.cycle === 'quarterly') {
                    // For quarterly we need the candidate to align with the sub's quarterly schedule.
                    // Anchor to created_date's month — only every third month from there counts.
                    const anchor = new Date(s.createdDate || t0);
                    const monthDiff = (candidate.getFullYear() - anchor.getFullYear()) * 12
                                     + (candidate.getMonth() - anchor.getMonth());
                    if (((monthDiff % 3) + 3) % 3 !== 0) continue;
                }
                return candidate;
            }
        }
        return null;
    }
    if (s.cycle === 'yearly') {
        const m = s.billingDay.match(/^(\d{2})-(\d{2})$/);
        if (!m) return null;
        const month = parseInt(m[1], 10) - 1;
        const day = parseInt(m[2], 10);
        let candidate = new Date(t0.getFullYear(), month, day);
        if (candidate > t0) candidate = new Date(t0.getFullYear() - 1, month, day);
        return candidate;
    }
    if (s.cycle === 'weekly') {
        const dow = parseInt(s.billingDay, 10);
        if (!Number.isFinite(dow) || dow < 0 || dow > 6) return null;
        const diff = (t0.getDay() - dow + 7) % 7;
        // diff=0 means today; we want the most recent past, today counts.
        return new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - diff);
    }
    return null;
}

function daysInMonth(year, month) {
    // month here can be negative or >11; new Date normalises
    return new Date(year, month + 1, 0).getDate();
}

// Has an expense in the linked account near the billing date that matches
// the sub's amount within ±5%? Window is ±3 days around the billing date.
function expenseMatchesSubscription(s, billingDate) {
    if (s.accountId == null) return false;
    const target = billingDate.getTime();
    const windowMs = 3 * 24 * 60 * 60 * 1000;
    const minAmt = s.amount * 0.95;
    const maxAmt = s.amount * 1.05;
    return expenses.some(e => {
        if (e.accountId !== s.accountId) return false;
        if (e.amount < minAmt || e.amount > maxAmt) return false;
        const ed = new Date(e.date).getTime();
        return Math.abs(ed - target) <= windowMs;
    });
}

// For each active sub: if billing day has passed (yesterday or earlier), the
// sub is linked to an account, and no nearby matching expense exists, insert
// an expense at the billing date. Runs once on app init after data load.
function autoCreateMissingSubscriptionExpenses() {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) return;
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    let inserted = 0;
    subscriptions.forEach(s => {
        if (s.status !== 'active') return;
        if (s.accountId == null) return;
        if (!s.billingDay) return;
        const billingDate = mostRecentBillingDate(s, today);
        if (!billingDate) return;
        // Only act once the day has passed (i.e. billing date <= yesterday)
        if (billingDate > yesterday) return;
        // Don't backfill before the sub was created
        if (s.createdDate && billingDate < new Date(s.createdDate)) return;
        if (expenseMatchesSubscription(s, billingDate)) return;
        const id = Date.now() + Math.floor(Math.random() * 1000);
        try {
            db.run(
                'INSERT INTO expenses (id, amount, category, description, date, swish_repayments, account_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, s.amount, s.category || 'fixed', s.name, isoDate(billingDate), '[]', s.accountId, 'expense']
            );
            inserted++;
        } catch (err) {
            console.error('Auto-create subscription expense failed:', s, err);
        }
    });
    if (inserted > 0) {
        saveDatabase();
        loadDataFromDB();
    }
}

function deleteSubscription() {
    if (!currentEditingSubscription) return;
    if (!confirm(t('confirms.deleteSubscription'))) return;
    db.run('DELETE FROM subscriptions WHERE id=?', [parseInt(currentEditingSubscription)]);
    saveDatabase();
    loadDataFromDB();
    renderSubscriptionsCard();
    closeSubscriptionModal();
}

