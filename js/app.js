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
    setText('accountType', t('account.demoLocalOnly'));

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

// SQLite Database
let db = null;
let SQL = null;

// Default categories
const defaultCategories = [
    // essential: not subtracted from the daily budget when checking "did
    // I overspend today?" — stays in totals/savings-rate, just not in
    // the per-day streak math. Groceries is built-in & non-deletable.
    { id: 'dining', name: 'Dining', color: '#22c55e', keywords: ['ica', 'coop', 'willys', 'hemköp', 'lidl', 'mat', 'matvaror', 'matkasse', 'maxi', 'tempo', 'city gross'] },
    { id: 'groceries', name: 'Groceries', color: '#10b981', essential: true, keywords: ['restaurang', 'café', 'cafe', 'mcdonald', 'burger', 'pizza', 'sushi', 'lunch', 'middag'] },
    { id: 'transport', name: 'Transport', color: '#3b82f6', keywords: ['bensin', 'diesel', 'parkering', 'biljett', 'sl', 'tåg', 'buss', 'taxi', 'uber', 'circle k', 'okq8', 'preem'] },
    { id: 'entertainment', name: 'Entertainment', color: '#f59e0b', keywords: ['bio', 'spotify', 'netflix', 'hbo', 'konsert', 'teater', 'museum', 'gym', 'sport', 'svea', 'sf bio'] },
    { id: 'shopping', name: 'Shopping', color: '#ef4444', keywords: ['h&m', 'zara', 'åhlens', 'ikea', 'jysk', 'elgiganten', 'mediamarkt', 'webhallen', 'amazon', 'zalando'] },
    { id: 'bills', name: 'Bills & Utilities', color: '#8b5cf6', keywords: ['el', 'vatten', 'bredband', 'telefon', 'försäkring', 'hyra', 'telia', 'vattenfall', 'fortum'] },
    { id: 'health', name: 'Health & Fitness', color: '#ec4899', keywords: ['apotek', 'läkare', 'tandläkare', 'vårdcentral', 'apoteket', 'pharmacy'] },
    { id: 'other', name: 'Other', color: '#64748b', keywords: [] }
];

// Returns true if the given category id is flagged as essential (e.g.
// groceries) — exempts it from the daily streak / savings-grid math.
function isEssentialCategory(catId) {
    const cat = categories.find(c => c.id === catId);
    if (cat && cat.essential) return true;
    const seed = defaultCategories.find(c => c.id === catId);
    return !!(seed && seed.essential);
}

// Data
let expenses = [];
let fixedExpenses = [];
let categories = [];
let goals = [];
let snapshots = [];
let subscriptions = [];
let accounts = [];
let monthlyBudget = 0;
let monthlyIncome = 0;
let currency = 'SEK';
let theme = 'dark';
let palette = 'slate';
let language = 'en'; // 'en' | 'sv'
let cycleStartDay = 1;          // 1 = calendar month, otherwise 1–28
let cycleAdjustment = 'none';   // 'none' | 'weekend' | 'sweden'
let achievedMilestones = []; // [{type, key}] for confetti dedupe
let acknowledgedInsights = []; // array of insight IDs
let cachedInsights = {}; // id -> item, refreshed per render
let insightList = []; // flat ordered list, index used by click handlers
let currentDetailInsight = null; // currently-open insight item (full object, not id)

const palettePresets = [
    { id: 'slate',  name: 'Slate',  swatches: ['#0f172a', '#3b82f6', '#10b981', '#f59e0b'] },
    { id: 'earth',  name: 'Earth',  swatches: ['#2d2418', '#c2410c', '#65a30d', '#d97706'] },
    { id: 'mint',   name: 'Mint',   swatches: ['#1a202c', '#0d9488', '#10b981', '#f59e0b'] },
    { id: 'forest', name: 'Forest', swatches: ['#1c2a1e', '#15803d', '#16a34a', '#ca8a04'] },
    { id: 'plum',   name: 'Plum',   swatches: ['#2d1b2e', '#9333ea', '#10b981', '#f59e0b'] },
    { id: 'mono',   name: 'Mono',   swatches: ['#09090b', '#52525b', '#16a34a', '#ca8a04'] },
    { id: 'ocean',   name: 'Ocean',   swatches: ['#0c1e2e', '#0891b2', '#10b981', '#f97316'] },
    { id: 'sunset',  name: 'Sunset',  swatches: ['#3a0f0a', '#c2410c', '#ea580c', '#fb923c'] },
    { id: 'blossom', name: 'Blossom', swatches: ['#4c0d2e', '#ec4899', '#f472b6', '#10b981'] },
    { id: 'honey',   name: 'Honey',   swatches: ['#713f12', '#fde047', '#fef08a', '#84cc16'] }
];

let currentViewMonth = new Date();
let currentEditingExpense = null;

// =====================================================
// BUDGET CYCLE HELPERS
// A "cycle" is the budget period. cycleStartDay=1 means calendar month.
// Otherwise cycle runs from day N of one month to (N-1) of next month.
// Weekend shift moves the start date earlier if it lands on a Sat/Sun.
// =====================================================
function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns the actual cycle start date for the cycle that "belongs" to the given calendar month index.
// Example: if cycleStartDay=25 and we ask for April 2026, returns April 25 2026 (or earlier business day).
function getCycleStartForMonth(year, monthIdx) {
    if (cycleStartDay === 1) return new Date(year, monthIdx, 1);
    let target = new Date(year, monthIdx, cycleStartDay);

    if (cycleAdjustment === 'none') return target;

    const useHolidays = cycleAdjustment === 'sweden';

    // Walk backwards while target lands on weekend (or holiday, when enabled)
    let safety = 14; // max walk-back; protects against pathological input
    let cachedYear = target.getFullYear();
    let cachedHolidays = useHolidays ? getSwedishHolidays(cachedYear) : null;

    while (safety-- > 0) {
        // Refresh holiday cache when crossing year boundary backwards
        if (useHolidays && target.getFullYear() !== cachedYear) {
            cachedYear = target.getFullYear();
            cachedHolidays = getSwedishHolidays(cachedYear);
        }
        const dow = target.getDay();
        const isWeekend = (dow === 0 || dow === 6);
        const isHoliday = useHolidays && cachedHolidays.has(isoDate(target));
        if (isWeekend || isHoliday) {
            target.setDate(target.getDate() - 1);
        } else {
            break;
        }
    }

    return target;
}

// =====================================================
// SVG ICON REGISTRY (Lucide-style line icons)
// Used across goals, insights, and other UI surfaces for a clean look.
// =====================================================
const ICONS = {
    // Goal icons
    'target':       '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'plane':        '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    'home':         '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'car':          '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    'laptop':       '<rect x="2" y="4" width="20" height="14" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/>',
    'graduation':   '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    'heart':        '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
    'shield':       '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'gift':         '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    'trending-up':  '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    'star':         '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',

    // Insight icons
    'chart':        '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    'alert':        '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'repeat':       '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    'scissors':     '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    'credit-card':  '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    'droplet':      '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    'sparkles':     '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>',
    'search':       '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',

    // Onboarding
    'wallet':       '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4z"/>'
};

function svgIcon(name, opts = {}) {
    const path = ICONS[name] || ICONS['target'];
    const stroke = opts.fill ? 'none' : 'currentColor';
    const fill = opts.fill ? 'currentColor' : 'none';
    return `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${opts.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// Convert legacy emoji (stored from earlier app versions) to icon name.
function resolveGoalIcon(value) {
    if (!value) return 'target';
    // Already an icon name?
    if (/^[a-z][a-z0-9-]*$/.test(value)) return ICONS[value] ? value : 'target';
    const map = {
        '🎯': 'target', '✈️': 'plane', '🏠': 'home', '🚗': 'car',
        '💻': 'laptop', '🎓': 'graduation', '💍': 'heart',
        '🛡️': 'shield', '🎁': 'gift', '📈': 'trending-up', '⭐': 'star'
    };
    return map[value] || 'target';
}

const GOAL_ICON_OPTIONS = [
    { name: 'target',      label: 'Goal'      },
    { name: 'plane',       label: 'Travel'    },
    { name: 'home',        label: 'Home'      },
    { name: 'car',         label: 'Car'       },
    { name: 'laptop',      label: 'Tech'      },
    { name: 'graduation',  label: 'Education' },
    { name: 'heart',       label: 'Wedding'   },
    { name: 'shield',      label: 'Emergency' },
    { name: 'gift',        label: 'Gift'      },
    { name: 'trending-up', label: 'Invest'    },
    { name: 'star',        label: 'Other'     }
];


// Given any reference date, return the cycle bounds containing it.
function getCycleBounds(refDate) {
    const ref = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()); // strip time
    const loc = activeLocale();
    if (cycleStartDay === 1) {
        const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        const days = end.getDate();
        // Capitalize first letter so Swedish month names ("januari") look right in headings
        const monthLabel = start.toLocaleString(loc, { month: 'long' });
        const cap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
        return { start, end, days, label: `${cap} ${start.getFullYear()}` };
    }

    const thisMonthStart = getCycleStartForMonth(ref.getFullYear(), ref.getMonth());
    let start, nextStart;
    if (ref >= thisMonthStart) {
        start = thisMonthStart;
        nextStart = getCycleStartForMonth(ref.getFullYear(), ref.getMonth() + 1);
    } else {
        start = getCycleStartForMonth(ref.getFullYear(), ref.getMonth() - 1);
        nextStart = thisMonthStart;
    }
    const end = new Date(nextStart);
    end.setDate(end.getDate() - 1);
    const days = Math.round((end - start) / 86400000) + 1;
    const fmt = (d, opts) => d.toLocaleDateString(loc, opts);
    const sameYear = start.getFullYear() === end.getFullYear();
    const label = sameYear
        ? `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `${fmt(start, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return { start, end, days, label };
}

// True if a YYYY-MM-DD date string falls within the cycle that contains refDate.
function dateInCycle(dateStr, refDate) {
    const bounds = getCycleBounds(refDate);
    return dateStr >= isoDate(bounds.start) && dateStr <= isoDate(bounds.end);
}

let currentEditingCategory = null;
let currentEditingGoal = null;
let currentContribGoal = null;
let currentCutGoalId = null;
let currentEditingSubscription = null;
let onboardingState = { step: 1 };
let pendingImports = [];

// Charts
let categoryChart = null;
let trendChart = null;
let netWorthChart = null;

// Initialize SQLite
async function initDatabase() {
    try {
        SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        // Try to load existing database from localStorage
        const savedDb = localStorage.getItem('financeDB');
        if (savedDb) {
            const uint8Array = new Uint8Array(JSON.parse(savedDb));
            db = new SQL.Database(uint8Array);
            // Always ensure new tables exist (for upgraders from older versions)
            ensureSchema();
        } else {
            db = new SQL.Database();
            createTables();
            // Migrate from old localStorage if exists
            migrateFromLocalStorage();
        }

        loadDataFromDB();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        alert(t('errors.initDb'));
    }
}

// Idempotent schema upgrades — safe to run on existing DBs

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Populate account card from session before anything else (cheap, sync)
    populateAccountCard();

    await initDatabase();

    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-palette', palette);
    // Mirror DB-stored language to localStorage so the login page picks it up.
    try { localStorage.setItem('language', language); } catch (e) {}
    renderThemeButtons();
    renderPaletteMenu();
    renderLanguageOptions();
    applyLanguage();
    // The in-tab Add Expense form was removed; #date may not exist.
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.valueAsDate = new Date();
    document.getElementById('quickDate').valueAsDate = new Date();
    document.getElementById('snapshotDate').valueAsDate = new Date();
    document.getElementById('currencySelect').value = currency;
    if (monthlyBudget > 0) {
        document.getElementById('monthlyBudget').value = monthlyBudget;
    }
    if (monthlyIncome > 0) {
        document.getElementById('monthlyIncome').value = monthlyIncome;
    }
    document.getElementById('cycleStartDay').value = cycleStartDay;
    document.getElementById('cycleAdjustment').value = cycleAdjustment;
    
    updateMonthDisplay();
    updateLabels();
    updateCategorySelects();
    renderCategoriesList();
    updateDashboard();
    initCharts();
    renderFixedExpenses();
    renderCyclePreview();

    // The in-tab Add Expense form was removed; the quick-add modal is the
    // single entry point now. Guard so this is a no-op if absent.
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) expenseForm.addEventListener('submit', addExpense);
    document.getElementById('quickAddForm').addEventListener('submit', addExpenseFromQuick);
    document.getElementById('fixedExpenseForm').addEventListener('submit', addFixedExpense);
    document.getElementById('addCategoryForm').addEventListener('submit', addCategory);
    document.getElementById('goalForm').addEventListener('submit', saveGoal);
    document.getElementById('subscriptionForm').addEventListener('submit', saveSubscription);

    renderSubscriptionsCard();
    renderAccountsCard();

    const fileUpload = document.getElementById('fileUpload');
    const fileInput = document.getElementById('excelFile');
    fileUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    fileUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUpload.style.borderColor = 'var(--accent)';
    });
    fileUpload.addEventListener('dragleave', () => {
        fileUpload.style.borderColor = '';
    });
    fileUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUpload.style.borderColor = '';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // Trigger onboarding for first-time users
    if (monthlyIncome === 0 && monthlyBudget === 0 && expenses.length === 0) {
        setTimeout(() => openOnboarding(), 400);
    }

    // Resize confetti canvas
    window.addEventListener('resize', resizeConfettiCanvas);
    resizeConfettiCanvas();
});



// Fixed Expenses
function addFixedExpense(e) {
    e.preventDefault();
    const name = document.getElementById('fixedName').value;
    const amount = parseFloat(document.getElementById('fixedAmount').value);
    const category = document.getElementById('fixedCategory').value;
    const id = Date.now();
    
    db.run('INSERT INTO fixed_expenses (id, name, amount, category) VALUES (?, ?, ?, ?)',
        [id, name, amount, category]);
    saveDatabase();
    
    fixedExpenses.push({ id, name, amount, category });
    
    document.getElementById('fixedExpenseForm').reset();
    renderFixedExpenses();
    updateDashboard();
    updateCharts();
}

function deleteFixedExpense(id) {
    if (!confirm(t('confirms.deleteFixed'))) return;
    
    db.run('DELETE FROM fixed_expenses WHERE id = ?', [id]);
    saveDatabase();
    
    fixedExpenses = fixedExpenses.filter(f => f.id !== id);
    renderFixedExpenses();
    updateDashboard();
    updateCharts();
}


function renderFixedExpenses() {
    const container = document.getElementById('fixedExpensesList');
    if (fixedExpenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.fixed') + '</p>';
        return;
    }
    container.innerHTML = fixedExpenses.map(f => `
        <div class="fixed-expense-item">
            <div>
                <strong>${f.name}</strong><br>
                <small style="color: var(--text-light);">${getCategoryName(f.category)}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <strong>${formatCurrency(f.amount)}</strong>
                <button class="delete-btn" onclick="deleteFixedExpense(${f.id})">×</button>
            </div>
        </div>
    `).join('');
}

// Update Budget
function updateBudget() {
    monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value) || 0;
    setSetting('monthlyBudget', monthlyBudget.toString());
    updateDashboard();
    renderCyclePreview();
}

// Dashboard
// Net amount on an expense (amount minus any Swish repayments).
// Hoisted to module scope because both updateDashboard and updateCharts
// need it; previously these were const inside updateDashboard, which
// made them undefined inside updateCharts → a ReferenceError aborted
// the per-day loop, so trendChart.update() and renderSavingsGrid()
// silently never ran. That manifested as Spending Trend / Daily
// Savings not updating when the cycle changes.
function expenseNet(exp) {
    const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
    return exp.amount - repayments;
}
// Discretionary amount: same as net, but zeroed for essential
// categories (Groceries by default) so big shops don't break the
// streak / paint the savings calendar red.
function expenseDiscretionary(exp) {
    const net = expenseNet(exp);
    return isEssentialCategory(exp.category) ? 0 : net;
}




function ordinal(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return s[(v-20)%10] || s[v] || s[0];
}




// Utils
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return t('common.today');
    if (date.toDateString() === yesterday.toDateString()) return t('common.yesterday');
    return date.toLocaleDateString(activeLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

// Close any open modal when the user clicks the dimmed backdrop.
// Each modal has its own close function with cleanup beyond just
// hiding the element, so we dispatch by id; falls back to removing
// .active for any unmapped modal.
(function setupModalBackdropClose() {
    const closers = {
        editModal: closeEditModal,
        subscriptionModal: closeSubscriptionModal,
        editCategoryModal: closeEditCategoryModal,
        expenseDetailsModal: closeExpenseDetailsModal,
        importModal: closeImportModal,
        quickAddModal: closeQuickAdd,
        goalModal: closeGoalModal,
        goalContribModal: closeGoalContribModal,
        snapshotModal: closeSnapshotModal,
        cutGoalDetailModal: closeCutGoalDetail,
        accountModal: closeAccountModal,
    };
    document.addEventListener('click', function (e) {
        const el = e.target;
        if (!(el instanceof HTMLElement) || !el.classList.contains('modal')) return;
        const fn = closers[el.id];
        if (typeof fn === 'function') fn();
        else el.classList.remove('active');
    });
})();
