// =====================================================
// NET WORTH SNAPSHOTS
// =====================================================
function openSnapshotModal() {
    document.getElementById('snapshotDate').valueAsDate = new Date();
    document.getElementById('snapshotAmount').value = '';
    document.getElementById('snapshotNote').value = '';
    document.getElementById('snapshotModal').classList.add('active');
    setTimeout(() => document.getElementById('snapshotAmount').focus(), 100);
}

function closeSnapshotModal() {
    document.getElementById('snapshotModal').classList.remove('active');
}

function saveSnapshot() {
    const amount = parseFloat(document.getElementById('snapshotAmount').value);
    const date = document.getElementById('snapshotDate').value;
    const note = document.getElementById('snapshotNote').value || null;
    if (isNaN(amount) || !date) {
        alert(t('snapshot.amountAndDateRequired'));
        return;
    }
    const id = Date.now();
    db.run('INSERT INTO net_worth_snapshots (id, date, amount, note) VALUES (?, ?, ?, ?)',
        [id, date, amount, note]);
    saveDatabase();
    loadDataFromDB();
    closeSnapshotModal();
    renderNetWorth();
}

function deleteSnapshot(id) {
    if (!confirm(t('confirms.deleteSnapshot'))) return;
    db.run('DELETE FROM net_worth_snapshots WHERE id=?', [id]);
    saveDatabase();
    loadDataFromDB();
    renderNetWorth();
}

function renderNetWorth() {
    const latestEl = document.getElementById('netWorthLatest');
    const dateEl = document.getElementById('netWorthDate');
    const changeWrap = document.getElementById('netWorthChangeWrap');
    const list = document.getElementById('snapshotsList');
    // Net Worth UI was removed from the Goals tab. Bail safely if the
    // section isn't in the DOM so other flows (e.g. snapshot modal
    // save/delete) don't crash.
    if (!latestEl || !dateEl || !changeWrap || !list) return;

    if (snapshots.length === 0) {
        latestEl.textContent = '—';
        dateEl.textContent = t('netWorth.noSnapshots');
        changeWrap.innerHTML = '';
        list.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.firstSnapshot') + '</p>';
        if (netWorthChart) {
            netWorthChart.data.labels = [];
            netWorthChart.data.datasets[0].data = [];
            netWorthChart.update();
        }
        return;
    }

    const latest = snapshots[snapshots.length - 1];
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    latestEl.textContent = formatCurrency(latest.amount);
    dateEl.textContent = formatDate(latest.date) + (latest.note ? ` · ${latest.note}` : '');

    if (previous) {
        const change = latest.amount - previous.amount;
        const pct = previous.amount !== 0 ? (change / Math.abs(previous.amount)) * 100 : 0;
        const isUp = change >= 0;
        changeWrap.innerHTML = `
            <div class="net-worth-change ${isUp ? 'up' : 'down'}">
                ${isUp ? '↗' : '↘'} ${formatCurrency(Math.abs(change))} (${pct.toFixed(1)}%)
            </div>
        `;
    } else {
        changeWrap.innerHTML = '';
    }

    // Init or update line chart
    if (!netWorthChart) {
        const ctx = document.getElementById('netWorthChart').getContext('2d');
        netWorthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Net Worth',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: false, ticks: { callback: v => formatCurrency(v) } } }
            }
        });
    }
    netWorthChart.data.labels = snapshots.map(s => formatDate(s.date));
    netWorthChart.data.datasets[0].data = snapshots.map(s => s.amount);
    netWorthChart.update();

    // Snapshot list
    list.innerHTML = '<div class="insight-section-title">' + t('netWorth.allSnapshots') + '</div>' + [...snapshots].reverse().map(s => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border);">
            <div>
                <div style="font-weight: 600;">${formatDate(s.date)}</div>
                ${s.note ? `<div style="font-size: 0.75rem; color: var(--text-light);">${s.note}</div>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong>${formatCurrency(s.amount)}</strong>
                <button class="delete-btn" onclick="deleteSnapshot(${s.id})">×</button>
            </div>
        </div>
    `).join('');
}
