// === Session guard ===
// Demo auth only: any non-empty session in sessionStorage is treated as logged in.
// Real backend (Supabase, etc.) would replace this with a proper token check.
(function checkSession() {
    try {
        const session = sessionStorage.getItem('financeSession');
        if (!session) {
            window.location.replace('index.html');
        }
    } catch (e) {
        // sessionStorage unavailable — fall through and let the app load anyway
    }
})();

// === User chip / account / sign out ===
function getCurrentUser() {
    try {
        const raw = sessionStorage.getItem('financeSession');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function populateAccountCard() {
    const user = getCurrentUser();
    if (!user) return;
    const email = user.email || 'demo@local';
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText('accountEmail', email);
    setText('accountAvatar', email.charAt(0).toUpperCase());

    // Method label
    const method = user.method === 'passkey' ? t('account.passkey') : t('account.emailPassword');
    setText('accountMethod', method);

    // Signed-in time (relative if recent, otherwise short date+time)
    if (user.signedInAt) {
        const date = new Date(user.signedInAt);
        const diff = Date.now() - user.signedInAt;
        let label;
        if (diff < 60_000)         label = t('time.justNow');
        else if (diff < 3_600_000) label = t('time.minAgo', { n: Math.floor(diff / 60_000) });
        else if (diff < 86_400_000) label = t('time.hrAgo', { n: Math.floor(diff / 3_600_000) });
        else                       label = date.toLocaleString(activeLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        setText('accountSignedIn', label);
    } else {
        setText('accountSignedIn', '—');
    }

    // Account type — currently always demo, but ready for real backend
    setText('userAccountType', t('account.demoLocalOnly'));

    // Subline under the email
    const sublineParts = [];
    if (user.isNewAccount) sublineParts.push(t('account.newAccount'));
    sublineParts.push(method);
    setText('accountMeta', sublineParts.join(' · '));
}

function signOut() {
    try { sessionStorage.removeItem('financeSession'); } catch (e) {}
    window.location.replace('index.html');
}
