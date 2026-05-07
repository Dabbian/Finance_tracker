// =====================================================
// ACCOUNTS — manual + (future) linked
// =====================================================
let currentEditingAccount = null;

function renderAccountsCard() {
    renderAccountsSummary();
    renderAccountsList();
}

function renderAccountsSummary() {
    const totalEl = document.getElementById('accountsTotalBalance');
    const metaEl = document.getElementById('accountsTotalMeta');
    if (!totalEl || !metaEl) return;
    const total = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    totalEl.textContent = formatCurrency(total);
    if (accounts.length === 0) {
        metaEl.textContent = t('accounts.summaryEmpty');
    } else {
        const linked = accounts.filter(a => a.linked).length;
        metaEl.textContent = t('accounts.summaryMeta', { total: accounts.length, linked });
    }
}

function renderAccountsList() {
    const container = document.getElementById('accountsList');
    if (!container) return;
    if (accounts.length === 0) {
        // NOTE: do NOT call applyLanguage() here. applyLanguage() calls
        // renderAccountsCard() → renderAccountsList(), so calling it
        // again from inside this function creates infinite recursion.
        // Translate the empty-state text inline via t() instead.
        container.innerHTML = `
            <div class="empty-state" style="margin-top: 0;">
                <div class="empty-state-icon-svg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 40px; height: 40px;"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><path d="M6 15h2"/><path d="M11 15h2"/></svg>
                </div>
                <div>${t('accounts.empty')}</div>
            </div>
        `;
        return;
    }
    container.innerHTML = accounts.map(a => {
        const tagKey = a.linked ? 'accounts.linked' : 'accounts.unlinked';
        const tagClass = a.linked ? 'account-tag linked' : 'account-tag unlinked';
        const typeLabel = t('accountTypes.' + (a.type || 'checking'));
        return `
            <div class="account-row" style="--account-color: ${a.color};" onclick="openAccountModal(${a.id})" role="button" tabindex="0">
                <div class="account-row-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/></svg>
                </div>
                <div class="account-row-text">
                    <div class="account-row-name">${a.name} <span class="${tagClass}">${t(tagKey)}</span></div>
                    <div class="account-row-meta">${typeLabel}</div>
                </div>
                <div class="account-row-balance">${formatCurrency(a.balance || 0)}</div>
            </div>
        `;
    }).join('');
}

function openAccountModal(id) {
    currentEditingAccount = id;
    const titleEl = document.getElementById('accountModalTitle');
    const deleteBtn = document.getElementById('accountDeleteBtn');
    if (id != null) {
        const a = accounts.find(x => x.id === id);
        if (!a) return;
        titleEl.textContent = t('modals.editAccount');
        deleteBtn.style.display = '';
        document.getElementById('accountId').value = a.id;
        document.getElementById('accountName').value = a.name;
        document.getElementById('accountType').value = a.type || 'checking';
        document.getElementById('accountBalance').value = a.balance != null ? a.balance : 0;
        document.getElementById('accountColor').value = a.color || '#3b82f6';
        document.getElementById('accountLinked').checked = !!a.linked;
    } else {
        titleEl.textContent = t('modals.newAccount');
        deleteBtn.style.display = 'none';
        document.getElementById('accountId').value = '';
        document.getElementById('accountName').value = '';
        document.getElementById('accountType').value = 'checking';
        document.getElementById('accountBalance').value = '';
        document.getElementById('accountColor').value = '#3b82f6';
        document.getElementById('accountLinked').checked = false;
    }
    document.getElementById('accountModal').classList.add('active');
}

function closeAccountModal() {
    document.getElementById('accountModal').classList.remove('active');
    currentEditingAccount = null;
}

// Robust amount parser — accepts both "278.54" and "278,54" so users
// don't get bitten when typing in a Swedish-locale style. Also strips
// thousands separators (spaces, non-breaking spaces, common kr suffix).
function parseAmountInput(raw) {
    if (raw == null) return 0;
    let s = String(raw).trim();
    if (!s) return 0;
    // Drop currency suffix / spaces / non-breaking spaces
    s = s.replace(/\s| |kr|SEK|\$|USD/gi, '');
    // If both '.' and ',' appear, assume the LAST one is the decimal
    // separator and strip the others as thousand-separators.
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
        const decAt = Math.max(lastDot, lastComma);
        s = s.slice(0, decAt).replace(/[.,]/g, '') + '.' + s.slice(decAt + 1);
    } else {
        s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function saveAccount() {
    const name = document.getElementById('accountName').value.trim();
    if (!name) return;
    const type = document.getElementById('accountType').value;
    const balance = parseAmountInput(document.getElementById('accountBalance').value);
    const color = document.getElementById('accountColor').value;
    const linked = document.getElementById('accountLinked').checked ? 1 : 0;
    const idStr = document.getElementById('accountId').value;

    if (idStr) {
        const id = parseInt(idStr, 10);
        db.run('UPDATE accounts SET name = ?, type = ?, balance = ?, linked = ?, color = ? WHERE id = ?',
            [name, type, balance, linked, color, id]);
    } else {
        const id = Date.now();
        db.run('INSERT INTO accounts (id, name, type, balance, linked, color, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, name, type, balance, linked, color, isoDate(new Date())]);
    }
    saveDatabase();
    loadDataFromDB();
    renderAccountsCard();
    closeAccountModal();
}

function deleteAccount() {
    if (currentEditingAccount == null) return;
    if (!confirm(t('confirms.deleteAccount'))) return;
    db.run('DELETE FROM accounts WHERE id = ?', [currentEditingAccount]);
    saveDatabase();
    loadDataFromDB();
    renderAccountsCard();
    closeAccountModal();
}
