// =====================================================
// SUBSCRIPTIONS MANAGEMENT
// User-curated list, plus surfacing of auto-detected subs from import data.
// =====================================================

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
        'INSERT INTO subscriptions (id, name, amount, cycle, category, status, source, match_key, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, name, Math.round(d.avg * 100) / 100, 'monthly', d.category || null, 'active', 'detected', d.descLower, isoDate(new Date())]
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
        'INSERT INTO subscriptions (id, name, amount, cycle, category, status, source, match_key, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, capitalize(d.desc).slice(0, 60), d.avg, 'monthly', d.category || null, 'ignored', 'detected', d.descLower, isoDate(new Date())]
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

    return `
        <div class="subs-item ${cancelled ? 'cancelled' : ''}" onclick="openSubscriptionModal(${s.id})">
            <div class="subs-item-left">
                <div class="subs-item-name">${s.name} ${sourceBadge}</div>
                <div class="subs-item-meta">${monthlyPrefix}${s.note ? s.note + ' · ' : ''}${statusLabel}</div>
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

    if (id) {
        db.run('UPDATE subscriptions SET name=?, amount=?, cycle=?, category=?, note=? WHERE id=?',
            [name, amount, cycle, category, note, parseInt(id)]);
    } else {
        const newId = Date.now();
        const matchKey = name.toLowerCase();
        db.run(
            'INSERT INTO subscriptions (id, name, amount, cycle, category, status, note, source, match_key, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newId, name, amount, cycle, category, 'active', note, 'manual', matchKey, isoDate(new Date())]
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

function deleteSubscription() {
    if (!currentEditingSubscription) return;
    if (!confirm(t('confirms.deleteSubscription'))) return;
    db.run('DELETE FROM subscriptions WHERE id=?', [parseInt(currentEditingSubscription)]);
    saveDatabase();
    loadDataFromDB();
    renderSubscriptionsCard();
    closeSubscriptionModal();
}

