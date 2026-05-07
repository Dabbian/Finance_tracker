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

// =====================================================
// SWEDISH HOLIDAYS (Röda dagar)
// =====================================================
// Anonymous Gregorian / Meeus algorithm for Easter Sunday
function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    const month = Math.floor(n / 31); // 3 = March, 4 = April
    const day = (n % 31) + 1;
    return new Date(year, month - 1, day);
}

function _addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

// Cache holiday sets per year (computation is cheap, but we call this in a loop)
const _swedishHolidayCache = {};

function getSwedishHolidays(year) {
    if (_swedishHolidayCache[year]) return _swedishHolidayCache[year];

    const set = new Set();
    const meta = {}; // YYYY-MM-DD → friendly name
    const add = (date, name) => {
        const k = isoDate(date);
        set.add(k);
        meta[k] = name;
    };

    // Fixed-date red days
    add(new Date(year, 0, 1),   'Nyårsdagen');
    add(new Date(year, 0, 6),   'Trettondedag jul');
    add(new Date(year, 4, 1),   'Första maj');
    add(new Date(year, 5, 6),   'Sveriges nationaldag');
    add(new Date(year, 11, 25), 'Juldagen');
    add(new Date(year, 11, 26), 'Annandag jul');
    // De facto bank holidays (no payday processed) — important for payday shift
    add(new Date(year, 11, 24), 'Julafton');
    add(new Date(year, 11, 31), 'Nyårsafton');

    // Easter-based
    const easter = easterSunday(year);
    add(_addDays(easter, -2), 'Långfredagen');         // Good Friday
    add(_addDays(easter,  1), 'Annandag påsk');         // Easter Monday
    add(_addDays(easter, 39), 'Kristi himmelsfärdsdag'); // Ascension (always Thursday)

    // Midsummer Eve = first Friday on/after June 19; Midsummer Day = next day (Saturday)
    let mid = new Date(year, 5, 19);
    while (mid.getDay() !== 5) mid.setDate(mid.getDate() + 1);
    add(mid,                    'Midsommarafton');
    add(_addDays(mid, 1),       'Midsommardagen');

    // All Saints' Day = first Saturday on/after Oct 31
    let allSaints = new Date(year, 9, 31);
    while (allSaints.getDay() !== 6) allSaints.setDate(allSaints.getDate() + 1);
    add(allSaints, 'Alla helgons dag');

    set._meta = meta;
    _swedishHolidayCache[year] = set;
    return set;
}

// Returns the friendly name of a holiday on a given date, or null
function holidayName(date) {
    if (cycleAdjustment !== 'sweden') return null;
    const set = getSwedishHolidays(date.getFullYear());
    const k = isoDate(date);
    return set._meta && set._meta[k] ? set._meta[k] : null;
}

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
function ensureSchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            emoji TEXT DEFAULT '🎯',
            target_amount REAL NOT NULL,
            current_amount REAL DEFAULT 0,
            color TEXT DEFAULT '#3b82f6',
            deadline TEXT,
            created_date TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            kind TEXT DEFAULT 'manual',
            meta TEXT DEFAULT '{}'
        )
    `);
    // For databases created by an older version, add the new columns idempotently
    addColumnIfMissing('goals', 'kind', "TEXT DEFAULT 'manual'");
    addColumnIfMissing('goals', 'meta', "TEXT DEFAULT '{}'");
    addColumnIfMissing('categories', 'essential', "INTEGER DEFAULT 0");
    // Per-transaction account link + kind (expense/income). Existing
    // DBs created before #16 don't have these on the expenses table —
    // add them idempotently. loadDataFromDB selects both columns, so
    // without this migration the first SELECT throws "no such column:
    // account_id" and the page fails to load.
    addColumnIfMissing('expenses', 'account_id', "INTEGER");
    addColumnIfMissing('expenses', 'kind', "TEXT DEFAULT 'expense'");
    db.run(`
        CREATE TABLE IF NOT EXISTS net_worth_snapshots (
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            cycle TEXT DEFAULT 'monthly',
            category TEXT,
            status TEXT DEFAULT 'active',
            note TEXT,
            source TEXT DEFAULT 'manual',
            match_key TEXT,
            created_date TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'checking',
            balance REAL DEFAULT 0,
            linked INTEGER DEFAULT 0,
            color TEXT DEFAULT '#3b82f6',
            created_date TEXT NOT NULL
        )
    `);
    saveDatabase();
}

function createTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            swish_repayments TEXT DEFAULT '[]',
            account_id INTEGER,
            kind TEXT DEFAULT 'expense'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS fixed_expenses (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            keywords TEXT DEFAULT '[]',
            essential INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            emoji TEXT DEFAULT '🎯',
            target_amount REAL NOT NULL,
            current_amount REAL DEFAULT 0,
            color TEXT DEFAULT '#3b82f6',
            deadline TEXT,
            created_date TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            kind TEXT DEFAULT 'manual',
            meta TEXT DEFAULT '{}'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS net_worth_snapshots (
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            cycle TEXT DEFAULT 'monthly',
            category TEXT,
            status TEXT DEFAULT 'active',
            note TEXT,
            source TEXT DEFAULT 'manual',
            match_key TEXT,
            created_date TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'checking',
            balance REAL DEFAULT 0,
            linked INTEGER DEFAULT 0,
            color TEXT DEFAULT '#3b82f6',
            created_date TEXT NOT NULL
        )
    `);

    // Insert default categories
    const stmt = db.prepare('INSERT OR IGNORE INTO categories (id, name, color, keywords) VALUES (?, ?, ?, ?)');
    defaultCategories.forEach(cat => {
        stmt.run([cat.id, cat.name, cat.color, JSON.stringify(cat.keywords), cat.essential ? 1 : 0]);
    });
    stmt.free();
    const sync = db.prepare('UPDATE categories SET essential = ? WHERE id = ?');
    defaultCategories.forEach(cat => {
        sync.run([cat.essential ? 1 : 0, cat.id]);
    });
    sync.free();

    saveDatabase();
}

function saveDatabase() {
    try {
        const data = db.export();
        const buffer = Array.from(data);
        localStorage.setItem('financeDB', JSON.stringify(buffer));
    } catch (error) {
        console.error('Failed to save database:', error);
    }
}

// Add a column to an existing table if it doesn't already exist.
// SQLite has no IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we check the schema first.
function addColumnIfMissing(tableName, columnName, columnDef) {
    try {
        const result = db.exec(`PRAGMA table_info(${tableName})`);
        if (result.length === 0) return; // table doesn't exist; ensureSchema will create it
        const existing = result[0].values.map(row => row[1]); // col 1 = name
        if (!existing.includes(columnName)) {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        }
    } catch (e) {
        console.warn(`addColumnIfMissing(${tableName}.${columnName}) failed:`, e);
    }
}

function loadDataFromDB() {
    // Load expenses (named columns so the new account_id / kind don't
    // depend on table-creation order).
    const expensesResult = db.exec(`
        SELECT id, amount, category, description, date, swish_repayments,
               account_id, kind
        FROM expenses ORDER BY date DESC
    `);
    expenses = expensesResult.length > 0 ? expensesResult[0].values.map(row => ({
        id: row[0],
        amount: row[1],
        category: row[2],
        description: row[3],
        date: row[4],
        swishRepayments: JSON.parse(row[5] || '[]'),
        accountId: row[6] || null,
        kind: row[7] || 'expense'
    })) : [];

    // Load fixed expenses
    const fixedResult = db.exec('SELECT * FROM fixed_expenses');
    fixedExpenses = fixedResult.length > 0 ? fixedResult[0].values.map(row => ({
        id: row[0],
        name: row[1],
        amount: row[2],
        category: row[3]
    })) : [];

    // Load categories
    const categoriesResult = db.exec('SELECT id, name, color, keywords, essential FROM categories');
    categories = categoriesResult.length > 0 ? categoriesResult[0].values.map(row => ({
        id: row[0],
        name: row[1],
        color: row[2],
        keywords: JSON.parse(row[3] || '[]'),
        essential: !!row[4]
    })) : defaultCategories.map(c => ({ ...c, essential: !!c.essential }));

    // Load settings
    const settingsResult = db.exec('SELECT * FROM settings');
    if (settingsResult.length > 0) {
        settingsResult[0].values.forEach(row => {
            const key = row[0];
            const value = row[1];
            if (key === 'monthlyBudget') monthlyBudget = parseFloat(value) || 0;
            if (key === 'monthlyIncome') monthlyIncome = parseFloat(value) || 0;
            if (key === 'currency') currency = value;
            if (key === 'theme') theme = value;
            if (key === 'palette') palette = value;
            if (key === 'language') {
                language = (value === 'sv' ? 'sv' : 'en');
                try { localStorage.setItem('language', language); } catch (e) {}
            }
            if (key === 'cycleStartDay') cycleStartDay = Math.max(1, Math.min(28, parseInt(value) || 1));
            if (key === 'cycleAdjustment') {
                cycleAdjustment = ['none', 'weekend', 'sweden'].includes(value) ? value : 'none';
            }
            // Legacy: existing users had a simple boolean. True maps to 'sweden' since that was the spirit.
            if (key === 'cycleWeekendShift' && value === 'true' && cycleAdjustment === 'none') {
                cycleAdjustment = 'sweden';
            }
            if (key === 'achievedMilestones') {
                try { achievedMilestones = JSON.parse(value) || []; } catch(e) { achievedMilestones = []; }
            }
            if (key === 'acknowledgedInsights') {
                try { acknowledgedInsights = JSON.parse(value) || []; } catch(e) { acknowledgedInsights = []; }
            }
        });
    }

    // Load goals
    try {
        const goalsResult = db.exec(`
            SELECT id, name, emoji, target_amount, current_amount, color, deadline, created_date, completed, kind, meta
            FROM goals ORDER BY completed ASC, created_date DESC
        `);
        goals = goalsResult.length > 0 ? goalsResult[0].values.map(row => {
            let metaObj = {};
            try { metaObj = JSON.parse(row[10] || '{}') || {}; } catch (e) { metaObj = {}; }
            return {
                id: row[0],
                name: row[1],
                emoji: row[2] || '🎯',
                targetAmount: row[3],
                currentAmount: row[4] || 0,
                color: row[5] || '#3b82f6',
                deadline: row[6],
                createdDate: row[7],
                completed: !!row[8],
                kind: row[9] || 'manual',
                meta: metaObj
            };
        }) : [];
    } catch(e) { goals = []; }

    // Load snapshots
    try {
        const snapshotsResult = db.exec('SELECT * FROM net_worth_snapshots ORDER BY date ASC');
        snapshots = snapshotsResult.length > 0 ? snapshotsResult[0].values.map(row => ({
            id: row[0],
            date: row[1],
            amount: row[2],
            note: row[3]
        })) : [];
    } catch(e) { snapshots = []; }

    // Load subscriptions
    try {
        const subsResult = db.exec(`
            SELECT id, name, amount, cycle, category, status, note, source, match_key, created_date
            FROM subscriptions ORDER BY status ASC, amount DESC
        `);
        subscriptions = subsResult.length > 0 ? subsResult[0].values.map(row => ({
            id: row[0],
            name: row[1],
            amount: row[2],
            cycle: row[3] || 'monthly',
            category: row[4],
            status: row[5] || 'active',
            note: row[6],
            source: row[7] || 'manual',
            matchKey: row[8],
            createdDate: row[9]
        })) : [];
    } catch(e) { subscriptions = []; }

    // Load accounts
    try {
        const accountsResult = db.exec(`
            SELECT id, name, type, balance, linked, color, created_date
            FROM accounts ORDER BY created_date ASC
        `);
        accounts = accountsResult.length > 0 ? accountsResult[0].values.map(row => ({
            id: row[0],
            name: row[1],
            type: row[2] || 'checking',
            balance: row[3] || 0,
            linked: !!row[4],
            color: row[5] || '#3b82f6',
            createdDate: row[6]
        })) : [];
    } catch(e) { accounts = []; }
}

function setSetting(key, value) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    saveDatabase();
}

function migrateFromLocalStorage() {
    // Migrate old data if exists
    const oldExpenses = localStorage.getItem('expenses');
    const oldFixed = localStorage.getItem('fixedExpenses');
    const oldCategories = localStorage.getItem('categories');
    const oldBudget = localStorage.getItem('monthlyBudget');
    const oldCurrency = localStorage.getItem('currency');
    const oldTheme = localStorage.getItem('theme');

    if (oldExpenses) {
        const parsed = JSON.parse(oldExpenses);
        const stmt = db.prepare('INSERT INTO expenses (id, amount, category, description, date, swish_repayments) VALUES (?, ?, ?, ?, ?, ?)');
        parsed.forEach(exp => {
            stmt.run([exp.id, exp.amount, exp.category, exp.description, exp.date, JSON.stringify(exp.swishRepayments || [])]);
        });
        stmt.free();
    }

    if (oldFixed) {
        const parsed = JSON.parse(oldFixed);
        const stmt = db.prepare('INSERT INTO fixed_expenses (id, name, amount, category) VALUES (?, ?, ?, ?)');
        parsed.forEach(f => {
            stmt.run([f.id, f.name, f.amount, f.category]);
        });
        stmt.free();
    }

    if (oldCategories) {
        const parsed = JSON.parse(oldCategories);
        const stmt = db.prepare('INSERT OR REPLACE INTO categories (id, name, color, keywords, essential) VALUES (?, ?, ?, ?, ?)');
        parsed.forEach(cat => {
            const seed = defaultCategories.find(d => d.id === cat.id);
            const essential = (typeof cat.essential === 'boolean' ? cat.essential : !!(seed && seed.essential)) ? 1 : 0;
            stmt.run([cat.id, cat.name, cat.color, JSON.stringify(cat.keywords || []), essential]);
        });
        stmt.free();
    }

    if (oldBudget) setSetting('monthlyBudget', oldBudget);
    if (oldCurrency) setSetting('currency', oldCurrency);
    if (oldTheme) setSetting('theme', oldTheme);

    saveDatabase();
}

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

// Theme
function setTheme(newTheme) {
    if (newTheme !== 'light' && newTheme !== 'dark') return;
    theme = newTheme;
    document.body.setAttribute('data-theme', theme);
    setSetting('theme', theme);
    renderThemeButtons();
}

function renderThemeButtons() {
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeValue === theme);
    });
}

// Palette — now rendered inline in Settings, no popup
function renderPaletteMenu() {
    const grid = document.getElementById('paletteGrid');
    if (!grid) return;
    grid.innerHTML = palettePresets.map(p => `
        <div class="palette-option ${p.id === palette ? 'active' : ''}" onclick="changePalette('${p.id}')">
            <span class="palette-name">${p.name}</span>
            <div class="palette-swatches">
                ${p.swatches.map(c => `<span style="background:${c};"></span>`).join('')}
            </div>
        </div>
    `).join('');
}

function changePalette(id) {
    palette = id;
    document.body.setAttribute('data-palette', id);
    setSetting('palette', id);
    renderPaletteMenu();
}

// Language picker — segmented control matching the Theme one
function renderLanguageOptions() {
    const wrap = document.getElementById('languageButtons');
    if (!wrap) return;
    wrap.innerHTML = languagePresets.map(l => `
        <button type="button" class="theme-option ${l.id === language ? 'active' : ''}"
                data-language-value="${l.id}" onclick="setLanguage('${l.id}')">${l.label}</button>
    `).join('');
}

// Tabs
const TAB_META = {
    // addable controls whether the topbar "+ Add" button is shown.
    // We keep it visible on every tab now and let topbarAdd() route
    // to the most relevant add flow per tab — falling back to the
    // quick-add expense modal when a tab has no obvious add action.
    dashboard:    { title: 'Dashboard',    addable: true },
    transactions: { title: 'Transactions', addable: true },
    accounts:     { title: 'Accounts',     addable: true },
    goals:        { title: 'Goals',        addable: true },
    insights:     { title: 'Insights',     addable: true },
    reports:      { title: 'Reports',      addable: true },
    recurring:    { title: 'Recurring',    addable: true },
    budget:       { title: 'Budget',       addable: true },
    settings:     { title: 'Settings',     addable: true }
};

function switchTab(tabName, btnEl) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    // Use the explicitly-passed element instead of event.target (which can be a child node)
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        const fallback = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (fallback) fallback.classList.add('active');
    }
    document.getElementById(tabName + '-tab').classList.add('active');

    // Drive the topbar — title + contextual Add button
    const meta = TAB_META[tabName];
    if (meta) {
        const titleEl = document.getElementById('topbarTitle');
        if (titleEl) {
            titleEl.dataset.i18n = 'tabs.' + tabName;
            titleEl.textContent = t('tabs.' + tabName);
        }
        const addBtn = document.getElementById('topbarAddBtn');
        if (addBtn) addBtn.hidden = !meta.addable;
    }

    // Render contextual content when activating these tabs
    if (tabName === 'goals') {
        renderGoals();
    } else if (tabName === 'insights') {
        renderInsights();
    } else if (tabName === 'reports') {
        // Category Breakdown lives here now; chart needs a re-tick when
        // the canvas first becomes visible.
        if (typeof updateCharts === 'function') updateCharts();
    } else if (tabName === 'recurring') {
        if (typeof renderSubscriptionsCard === 'function') renderSubscriptionsCard();
    } else if (tabName === 'accounts') {
        if (typeof renderAccountsCard === 'function') renderAccountsCard();
    }
}

// Topbar "+ Add" — routes to the right add flow per active tab
function topbarAdd() {
    const active = document.querySelector('.tab.active');
    const tabName = active ? active.dataset.tab : 'transactions';
    if (tabName === 'goals') {
        if (typeof openGoalModal === 'function') openGoalModal(null);
    } else if (tabName === 'accounts') {
        if (typeof openAccountModal === 'function') openAccountModal(null);
    } else if (tabName === 'recurring') {
        if (typeof openSubscriptionModal === 'function') openSubscriptionModal(null);
    } else if (tabName === 'budget') {
        // Focus the Add-Fixed form's Name field — the form is inline on the Budget tab
        const nameInput = document.getElementById('fixedName');
        if (nameInput) {
            nameInput.focus();
            nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (typeof openQuickAdd === 'function') {
            openQuickAdd();
        }
    } else {
        // Dashboard & Transactions both add an expense
        if (typeof openQuickAdd === 'function') openQuickAdd();
    }
}

// Currency
function formatCurrency(amount) {
    if (currency === 'SEK') {
        return amount.toFixed(2).replace('.', ',') + ' kr';
    }
    return '$' + amount.toFixed(2);
}

function changeCurrency() {
    currency = document.getElementById('currencySelect').value;
    setSetting('currency', currency);
    updateLabels();
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
}

function updateLabels() {
    const k = currency === 'SEK' ? 'Kr' : 'Usd';   // suffix used in keys
    const set = (id, key) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    };
    set('amountLabel',         'labels.amount' + k);
    set('budgetLabel',         'labels.discretionaryBudget' + k);
    set('fixedAmountLabel',    'labels.amount' + k);
    set('incomeLabel',         'labels.monthlyIncome' + k);
    set('quickAmountLabel',    'labels.amount' + k);
    set('snapshotAmountLabel', 'netWorth.total' + k);
    set('goalTargetLabel',     'goals.targetAmount' + k);
    set('goalCurrentLabel',    'goals.alreadySaved' + k);
    set('goalContribLabel',    'goals.amountToAdd' + k);
    set('subAmountLabel',      'subs.amountPerCycle' + k);
    set('accountBalanceLabel', 'labels.startingBalance' + k);
    set('obBudgetLabel',       'onboarding.monthlyBudget' + (currency === 'SEK' ? 'Kr' : 'Usd'));
    set('obGoalAmountLabel',   'goals.targetAmount' + k);
}

// Month Navigation
function updateMonthDisplay() {
    document.getElementById('currentMonth').textContent = getCycleBounds(currentViewMonth).label;
}

function previousMonth() {
    const bounds = getCycleBounds(currentViewMonth);
    const prev = new Date(bounds.start);
    prev.setDate(prev.getDate() - 1); // jump into previous cycle
    currentViewMonth = prev;
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
}

function nextMonth() {
    const bounds = getCycleBounds(currentViewMonth);
    const next = new Date(bounds.end);
    next.setDate(next.getDate() + 1); // jump into next cycle
    currentViewMonth = next;
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
}

// Categories
function updateCategorySelects() {
    const selects = [
        document.getElementById('category'),
        document.getElementById('editCategory'),
        document.getElementById('fixedCategory'),
        document.getElementById('quickCategory')
    ];
    
    selects.forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = categories.map(cat =>
            `<option value="${cat.id}">${localizedCategoryName(cat)}</option>`
        ).join('');
        if (currentValue) select.value = currentValue;
    });
}

function renderCategoriesList() {
    const container = document.getElementById('categoriesList');
    container.innerHTML = categories.map(cat => {
        const locked = !!defaultCategories.find(d => d.id === cat.id);
        const essentialPill = cat.essential
            ? `<span class="cat-essential-pill" data-i18n-title="categories.essentialHelp" title="Excluded from the daily budget streak math">${t('categories.essentialBadge')}</span>`
            : '';
        const deleteBtn = locked
            ? `<span class="cat-locked" data-i18n-title="categories.lockedHelp" title="Built-in category — can't be deleted">🔒</span>`
            : `<button class="delete-btn" onclick="event.stopPropagation(); deleteCategory('${cat.id}')">×</button>`;
        return `
            <div class="category-item" onclick="openEditCategoryModal('${cat.id}')">
                <div style="display: flex; align-items: center;">
                    <div class="category-badge" style="background: ${cat.color};"></div>
                    <div>
                        <strong>${localizedCategoryName(cat)}</strong>${essentialPill}<br>
                        <small style="color: var(--text-light);">${t('categories.keywordCount', { n: cat.keywords.length })}</small>
                    </div>
                </div>
                ${deleteBtn}
            </div>
        `;
    }).join('');
}

function addCategory(e) {
    e.preventDefault();
    const name = document.getElementById('newCategoryName').value;
    const color = document.getElementById('newCategoryColor').value;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    if (categories.find(c => c.id === id)) {
        alert(t('categories.exists'));
        return;
    }
    
    db.run('INSERT INTO categories (id, name, color, keywords, essential) VALUES (?, ?, ?, ?, ?)',
        [id, name, color, '[]', 0]);
    saveDatabase();
    
    categories.push({ id, name, color, keywords: [] });
    
    document.getElementById('addCategoryForm').reset();
    updateCategorySelects();
    renderCategoriesList();
    updateCharts();
}

function deleteCategory(id) {
    if (defaultCategories.find(c => c.id === id)) {
        alert(t('categories.cantDeleteDefault'));
        return;
    }
    const cat = categories.find(c => c.id === id);
    if (cat && cat.essential) {
        alert(t('categories.cantDeleteDefault'));
        return;
    }

    if (!confirm(t('categories.confirmDelete'))) return;
    
    db.run('UPDATE expenses SET category = ? WHERE category = ?', ['other', id]);
    db.run('UPDATE fixed_expenses SET category = ? WHERE category = ?', ['other', id]);
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    saveDatabase();
    
    categories = categories.filter(c => c.id !== id);
    loadDataFromDB();
    
    updateCategorySelects();
    renderCategoriesList();
    updateDashboard();
    updateCharts();
}

function openEditCategoryModal(id) {
    currentEditingCategory = id;
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    
    document.getElementById('editCatName').value = cat.name;
    document.getElementById('editCatColor').value = cat.color;
    renderKeywordsList(cat.keywords);
    document.getElementById('editCategoryModal').classList.add('active');
}

function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('active');
    document.getElementById('newKeyword').value = '';
    currentEditingCategory = null;
}

function renderKeywordsList(keywords) {
    const container = document.getElementById('keywordsList');
    if (keywords.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('categories.noKeywords') + '</p>';
        return;
    }
    container.innerHTML = keywords.map((kw, idx) => `
        <div class="keyword-tag">
            <span>${kw}</span>
            <button onclick="removeKeyword(${idx})">×</button>
        </div>
    `).join('');
}

function addKeyword() {
    const cat = categories.find(c => c.id === currentEditingCategory);
    if (!cat) return;
    
    const keyword = document.getElementById('newKeyword').value.toLowerCase().trim();
    if (!keyword) return;
    
    if (cat.keywords.includes(keyword)) {
        alert(t('categories.keywordExists'));
        return;
    }
    
    cat.keywords.push(keyword);
    db.run('UPDATE categories SET keywords = ? WHERE id = ?', 
        [JSON.stringify(cat.keywords), currentEditingCategory]);
    saveDatabase();
    
    renderKeywordsList(cat.keywords);
    document.getElementById('newKeyword').value = '';
}

function removeKeyword(idx) {
    const cat = categories.find(c => c.id === currentEditingCategory);
    if (!cat) return;
    
    cat.keywords.splice(idx, 1);
    db.run('UPDATE categories SET keywords = ? WHERE id = ?', 
        [JSON.stringify(cat.keywords), currentEditingCategory]);
    saveDatabase();
    
    renderKeywordsList(cat.keywords);
}

function saveCategoryEdit() {
    const cat = categories.find(c => c.id === currentEditingCategory);
    if (!cat) return;
    
    cat.name = document.getElementById('editCatName').value;
    cat.color = document.getElementById('editCatColor').value;
    
    db.run('UPDATE categories SET name = ?, color = ? WHERE id = ?', 
        [cat.name, cat.color, currentEditingCategory]);
    saveDatabase();
    
    closeEditCategoryModal();
    updateCategorySelects();
    renderCategoriesList();
    updateDashboard();
    updateCharts();
}

function guessCategory(desc) {
    if (!desc) return 'other';
    const d = desc.toLowerCase();
    
    for (const cat of categories) {
        for (const keyword of cat.keywords) {
            if (d.includes(keyword)) {
                return cat.id;
            }
        }
    }
    
    return 'other';
}

function getCategoryColor(id) {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.color : '#64748b';
}

// For default categories we translate the name even if the DB row was seeded in another language.
function localizedCategoryName(cat) {
    if (!cat) return '';
    const seed = defaultCategories.find(d => d.id === cat.id);
    return seed ? t('defaultCategories.' + cat.id) : cat.name;
}

function getCategoryName(id) {
    const cat = categories.find(c => c.id === id);
    return cat ? localizedCategoryName(cat) : id;
}

// Add Expense
function addExpense(e) {
    e.preventDefault();
    const rawDescription = document.getElementById('description').value;
    const description = normalizeImportText(rawDescription);
    const category = description ? guessCategory(description) : document.getElementById('category').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const date = document.getElementById('date').value;
    const id = Date.now();

    db.run('INSERT INTO expenses (id, amount, category, description, date, swish_repayments) VALUES (?, ?, ?, ?, ?, ?)',
        [id, amount, category, description || t('expenses.noDescription'), date, '[]']);
    saveDatabase();

    expenses.unshift({
        id, amount, category,
        description: description || t('expenses.noDescription'),
        date, swishRepayments: []
    });

    const _form = document.getElementById('expenseForm');
    if (_form) _form.reset();
    const _date = document.getElementById('date');
    if (_date) _date.valueAsDate = new Date();
    updateDashboard();
    updateCharts();
}

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

function updateDashboard() {
    const bounds = getCycleBounds(currentViewMonth);
    const startStr = isoDate(bounds.start);
    const endStr = isoDate(bounds.end);

    // Income rows (deposits / refunds) sit in the same table but are
    // tagged kind='income'. They never count toward "spending" totals.
    const monthExpenses = expenses.filter(exp =>
        exp.date >= startStr && exp.date <= endStr && exp.kind !== 'income'
    );

    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
    // totalSpent = honest cash-out for the cycle (includes essentials).
    // It feeds the savings rate + the "Total Spent This Cycle" stat.
    const totalSpent = monthExpenses.reduce((sum, exp) => sum + expenseNet(exp), 0);
    // discretionarySpent = what counted against the daily budget. Big
    // grocery shops don't punish you here.
    const discretionarySpent = monthExpenses.reduce((sum, exp) => sum + expenseDiscretionary(exp), 0);

    const daysInCycle = bounds.days;
    const dailyAvg = discretionarySpent / daysInCycle;

    const availableBudget = monthlyBudget - totalFixed;
    const budgetRemaining = availableBudget - discretionarySpent;
    const dailyBudgetAmount = availableBudget / daysInCycle;

    document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);
    document.getElementById('dailyAverage').textContent = formatCurrency(dailyAvg);
    document.getElementById('dailyAverage').className = 'stat-value ' + (dailyAvg > dailyBudgetAmount ? 'negative' : 'positive');
    document.getElementById('budgetRemaining').textContent = formatCurrency(budgetRemaining);
    document.getElementById('dailyBudget').textContent = formatCurrency(dailyBudgetAmount);

    const budgetPercentage = availableBudget > 0 ? (discretionarySpent / availableBudget) * 100 : 0;
    const progressBar = document.getElementById('budgetProgress');
    progressBar.style.width = `${Math.min(budgetPercentage, 100)}%`;
    progressBar.textContent = `${budgetPercentage.toFixed(0)}%`;
    progressBar.classList.toggle('warning', budgetPercentage > 80);

    document.getElementById('budgetSpent').textContent = formatCurrency(discretionarySpent);
    document.getElementById('budgetTotal').textContent = `of ${formatCurrency(availableBudget)}`;

    renderExpensesList();
    renderHero(totalSpent);
    renderWins();
}

function renderExpensesList() {
    const container = document.getElementById('expensesList');
    if (expenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">' + t('expenses.empty') + '</p>';
        return;
    }

    const accountById = new Map(accounts.map(a => [a.id, a]));

    container.innerHTML = expenses.slice(0, 50).map(exp => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        const netAmount = exp.amount - repayments;
        const isIncome = exp.kind === 'income';
        const color = getCategoryColor(exp.category);
        const account = exp.accountId != null ? accountById.get(exp.accountId) : null;
        const accountTag = account
            ? `<span class="expense-tag account" style="background: color-mix(in srgb, ${account.color || 'var(--accent)'} 22%, transparent); color: ${account.color || 'var(--accent)'};">${account.name}</span>`
            : '';
        const incomeTag = isIncome
            ? `<span class="expense-tag income">${t('imports.incomeTag')}</span>`
            : '';
        const sign = isIncome ? '+' : '';
        const amountClass = isIncome ? 'expense-amount income' : 'expense-amount';
        const swishTag = repayments > 0 ? '<span class="expense-category" style="background: var(--text-light); color: white;">Swish</span>' : '';

        return `
            <div class="expense-item ${isIncome ? 'income' : ''}" onclick="openEditModal(${exp.id})">
                <div class="expense-info">
                    ${isIncome ? '' : `<span class="expense-category" style="background: ${color}; color: white;">${getCategoryName(exp.category)}</span>`}
                    ${swishTag}
                    ${incomeTag}
                    ${accountTag}
                    <div class="expense-description">${exp.description}</div>
                    <div class="expense-date">${formatDate(exp.date)}</div>
                </div>
                <div class="${amountClass}">${sign}${formatCurrency(netAmount)}</div>
            </div>
        `;
    }).join('');
}

// Edit Modal
function openEditModal(id) {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    currentEditingExpense = id;
    document.getElementById('editDescription').textContent = exp.description;
    document.getElementById('editAmount').textContent = formatCurrency(exp.amount);
    document.getElementById('editCategory').value = exp.category;
    // Refresh the account dropdown (accounts may have changed since
    // last open) and select the linked one (if any).
    const editAccount = document.getElementById('editAccount');
    if (editAccount) {
        editAccount.innerHTML = renderAccountOptions(exp.accountId);
    }

    renderSwishList(exp.swishRepayments || []);
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('swishAmount').value = '';
    currentEditingExpense = null;
}

function renderSwishList(repayments) {
    const container = document.getElementById('swishList');
    if (repayments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('empty.repayments') + '</p>';
        return;
    }
    container.innerHTML = repayments.map((r, idx) => `
        <div class="swish-repayment">
            <span>${formatCurrency(r.amount)}</span>
            <button class="delete-btn" onclick="removeSwishRepayment(${idx})">×</button>
        </div>
    `).join('');
}

function addSwishRepayment() {
    const amount = parseFloat(document.getElementById('swishAmount').value);
    if (!amount || amount <= 0) return;

    const exp = expenses.find(e => e.id === currentEditingExpense);
    if (!exp) return;

    if (!exp.swishRepayments) exp.swishRepayments = [];
    exp.swishRepayments.push({ amount, date: new Date().toISOString() });
    
    db.run('UPDATE expenses SET swish_repayments = ? WHERE id = ?',
        [JSON.stringify(exp.swishRepayments), currentEditingExpense]);
    saveDatabase();
    
    renderSwishList(exp.swishRepayments);
    document.getElementById('swishAmount').value = '';
    updateDashboard();
    updateCharts();
}

function removeSwishRepayment(idx) {
    const exp = expenses.find(e => e.id === currentEditingExpense);
    if (!exp || !exp.swishRepayments) return;

    exp.swishRepayments.splice(idx, 1);
    
    db.run('UPDATE expenses SET swish_repayments = ? WHERE id = ?',
        [JSON.stringify(exp.swishRepayments), currentEditingExpense]);
    saveDatabase();
    
    renderSwishList(exp.swishRepayments);
    updateDashboard();
    updateCharts();
}

function saveExpenseEdit() {
    const exp = expenses.find(e => e.id === currentEditingExpense);
    if (!exp) return;

    exp.category = document.getElementById('editCategory').value;
    const acctEl = document.getElementById('editAccount');
    const accountIdRaw = acctEl ? acctEl.value : '';
    exp.accountId = accountIdRaw ? parseInt(accountIdRaw, 10) : null;

    db.run('UPDATE expenses SET category = ?, account_id = ? WHERE id = ?',
        [exp.category, exp.accountId, currentEditingExpense]);
    saveDatabase();

    closeEditModal();
    renderExpensesList();
    updateDashboard();
    updateCharts();
}

function deleteExpense(id) {
    if (!confirm(t('confirms.deleteExpense'))) return;
    
    db.run('DELETE FROM expenses WHERE id = ?', [id]);
    saveDatabase();
    
    expenses = expenses.filter(e => e.id !== id);
    closeEditModal();
    updateDashboard();
    updateCharts();
}

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

function renderSavingsGrid(bounds, dailyTotals) {
    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
    const dailyBudget = (monthlyBudget - totalFixed) / bounds.days;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const grid = document.getElementById('savingsGrid');
    let html = '';

    const cursor = new Date(bounds.start);
    while (cursor <= bounds.end) {
        const dateStr = isoDate(cursor);
        const dayDate = new Date(cursor);
        dayDate.setHours(0, 0, 0, 0);

        const spent = dailyTotals[dateStr] || 0;
        const savings = dailyBudget - spent;
        const isFuture = dayDate > today;

        let className = 'day-square ';
        let tooltipContent = '';
        const dateLabel = dayDate.toLocaleDateString(activeLocale(), { weekday: 'short', month: 'short', day: 'numeric' });

        if (isFuture) {
            className += 'future';
            tooltipContent = `<div>${dateLabel}</div><span class="day-tooltip-amount" style="color: var(--text-light);">Future</span>`;
        } else if (savings >= 0) {
            className += 'saved';
            tooltipContent = `<div>${dateLabel}</div><span class="day-tooltip-amount">+${formatCurrency(savings)}</span>`;
        } else {
            className += 'over';
            tooltipContent = `<div>${dateLabel}</div><span class="day-tooltip-amount">−${formatCurrency(Math.abs(savings))}</span>`;
        }

        const clickHandler = isFuture ? '' : `onclick="showExpensesByDate('${dateStr}')"`;

        html += `
            <div class="${className}" ${clickHandler}>
                ${dayDate.getDate()}
                <div class="day-tooltip">${tooltipContent}</div>
            </div>
        `;
        cursor.setDate(cursor.getDate() + 1);
    }

    grid.innerHTML = html;
}

// Show Expenses Functions
function showExpensesByCategory(categoryName) {
    const bounds = getCycleBounds(currentViewMonth);
    const startStr = isoDate(bounds.start);
    const endStr = isoDate(bounds.end);

    const category = categories.find(c => c.name === categoryName);
    if (!category) return;

    const filteredExpenses = expenses.filter(exp =>
        exp.category === category.id &&
        exp.date >= startStr &&
        exp.date <= endStr
    );

    showExpenseDetailsModal(filteredExpenses, `${categoryName} Expenses`);
}

function showExpensesByDate(dateStr) {
    const filteredExpenses = expenses.filter(exp => exp.date === dateStr);
    const date = new Date(dateStr + 'T00:00:00');
    const formattedDate = date.toLocaleDateString(activeLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
    showExpenseDetailsModal(filteredExpenses, t('expenses.onDate', { date: formattedDate }));
}

function showExpenseDetailsModal(expensesList, title) {
    document.getElementById('expenseDetailsTitle').textContent = title;
    document.getElementById('expenseDetailsCount').textContent = expensesList.length;
    
    const total = expensesList.reduce((sum, exp) => {
        const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
        return sum + exp.amount - repayments;
    }, 0);
    
    document.getElementById('expenseDetailsTotal').textContent = formatCurrency(total);
    
    const container = document.getElementById('expenseDetailsList');
    
    if (expensesList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">' + t('empty.noExpensesFound') + '</p>';
    } else {
        container.innerHTML = expensesList.map(exp => {
            const repayments = (exp.swishRepayments || []).reduce((s, r) => s + r.amount, 0);
            const netAmount = exp.amount - repayments;
            const color = getCategoryColor(exp.category);
            
            return `
                <div class="expense-detail-item" onclick="closeExpenseDetailsModal(); openEditModal(${exp.id})">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 0.5rem;">
                            <span class="expense-category" style="background: ${color}; color: white;">${getCategoryName(exp.category)}</span>
                            ${repayments > 0 ? '<span class="expense-category" style="background: var(--text-light); color: white;">Swish</span>' : ''}
                        </div>
                        <div style="font-weight: 600;">${exp.description}</div>
                        <div style="font-size: 0.875rem; color: var(--text-light);">${formatDate(exp.date)}</div>
                    </div>
                    <div style="font-family: 'DM Sans', sans-serif; font-size: 1.25rem; font-weight: 700; color: var(--primary);">
                        ${formatCurrency(netAmount)}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    document.getElementById('expenseDetailsModal').classList.add('active');
}

function closeExpenseDetailsModal() {
    document.getElementById('expenseDetailsModal').classList.remove('active');
}

// Excel Import - Enhanced for row 1 AND row 7
function handleFileSelect(e) {
    if (e.target.files.length) handleFile(e.target.files[0]);
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            processExcelData(rows);
        } catch (error) {
            alert(t('errors.readFile', { msg: error.message }));
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('excelFile').value = '';
}

function processExcelData(rows) {
    pendingImports = [];

    // 1. Find the header row by scanning for date-like column headers in the first 30 rows.
    // Bank exports often have a few intro/metadata rows before the table starts.
    const headerKeywords = {
        date:        ['datum', 'date', 'transaktionsdatum', 'köpdatum', 'bokföringsdatum'],
        description: ['beskrivning', 'description', 'specifikation', 'detaljer', 'merchant', 'butik', 'beskr', 'transaktion', 'text'],
        amount:      ['belopp', 'amount', 'summa', 'belopp (kr)', 'transaktionsbelopp', 'belopp i sek', 'belopp sek']
    };

    function normalize(v) {
        return (v || '').toString().toLowerCase().trim();
    }

    function findColumnIndex(headerRow, candidates) {
        // Return first index whose header matches (or contains) any candidate
        // Prefer exact match over substring match
        const normalized = headerRow.map(normalize);
        for (const cand of candidates) {
            const idx = normalized.indexOf(cand);
            if (idx !== -1) return idx;
        }
        for (let i = 0; i < normalized.length; i++) {
            for (const cand of candidates) {
                if (normalized[i] && normalized[i].includes(cand)) return i;
            }
        }
        return -1;
    }

    let headerIdx = -1;
    let dateCol = -1, descCol = -1, amountCol = -1;

    const scanLimit = Math.min(rows.length, 30);
    for (let i = 0; i < scanLimit; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const dCol = findColumnIndex(row, headerKeywords.date);
        const aCol = findColumnIndex(row, headerKeywords.amount);
        if (dCol !== -1 && aCol !== -1) {
            headerIdx = i;
            dateCol = dCol;
            amountCol = aCol;
            descCol = findColumnIndex(row, headerKeywords.description);
            break;
        }
    }

    // 2. If no header detected, fall back to column-position assumption: [date, description, amount]
    if (headerIdx === -1) {
        headerIdx = -1; // treat row 0 as data
        dateCol = 0;
        descCol = 1;
        amountCol = 2;
    }

    // 3. Iterate data rows
    const dataRows = rows.slice(headerIdx + 1);
    let skippedReasons = { empty: 0, badDate: 0, zeroAmount: 0 };

    dataRows.forEach(row => {
        if (!row || row.length === 0) { skippedReasons.empty++; return; }

        const datum = row[dateCol];
        const beskrivning = descCol !== -1 ? row[descCol] : '';
        const belopp = row[amountCol];

        if (datum === undefined || datum === null || datum === '') { skippedReasons.empty++; return; }

        // Parse date — handles Excel serial numbers AND various string formats
        const date = parseFlexibleDate(datum);
        if (!date || isNaN(date.getTime())) { skippedReasons.badDate++; return; }

        const dateStr = isoDate(date);

        // Parse amount — handles "1 234,56", "1,234.56", "-150.00", "150.00 kr", numbers
        let amountRaw = parseFlexibleAmount(belopp);
        if (isNaN(amountRaw) || amountRaw === 0) { skippedReasons.zeroAmount++; return; }

        const isPositive = amountRaw > 0;
        const amount = Math.abs(amountRaw);

        // Normalize description text: NFC handles bank exports that use decomposed Unicode (O + ¨ → Ö).
        // Without NFC, Å Ä Ö can search/compare incorrectly even though they look right on screen.
        const description = normalizeImportText(beskrivning) || t('imports.importedFallback');

        // Detect Swish repayments (incoming money from a friend, e.g., paying you back for shared dinner).
        // Pattern: positive amount AND description starts with "Swish från" (case-insensitive, accent-insensitive).
        const isSwishRepayment = isPositive && isSwishFromText(description);
        // Anything else that's positive and not a Swish repayment is
        // treated as income (a deposit / refund / salary). It still
        // gets a category guess but the user can leave it as "other".
        const kind = (isPositive && !isSwishRepayment) ? 'income' : 'expense';

        pendingImports.push({
            date: dateStr,
            description: description,
            amount: amount,
            category: guessCategory(description),
            swishRepayments: [],
            isSwishRepayment: isSwishRepayment,
            kind,
            accountId: null,            // user picks from preview UI
            attachToExpenseId: null     // for Swish repayments
        });
    });

    if (pendingImports.length === 0) {
        const detail = headerIdx === -1
            ? t('imports.noHeaderRow')
            : t('imports.headerNoRows', {
                line: headerIdx + 1,
                dateCol: dateCol + 1,
                amountCol: amountCol + 1,
                empty: skippedReasons.empty,
                badDate: skippedReasons.badDate,
                zeroAmount: skippedReasons.zeroAmount
            });
        alert(t('errors.noExpensesFound') + '\n\n' + detail);
        return;
    }

    showImportModal();
}

// Normalize imported text: trim, remove control chars, NFC-normalize Unicode.
// NFC turns decomposed forms like "O" + combining diaeresis (U+0308) into precomposed "Ö".
function normalizeImportText(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (typeof s.normalize === 'function') s = s.normalize('NFC');
    // Strip stray non-printable control characters (some banks include these as separators)
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return s.trim();
}

// "Swish från Anna" / "SWISH FRÅN ANNA" / decomposed-accent variants — all should match.
function isSwishFromText(description) {
    if (!description) return false;
    const normalized = String(description).normalize('NFC').toLowerCase().trim();
    return normalized.startsWith('swish från') || normalized.startsWith('swish fran');
}

// Extract the sender name from "Swish från X" (used in preview UI)
function extractSwishSender(description) {
    if (!description) return '';
    const match = String(description).match(/^swish\s+fr[åa]n\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

// Parse a value into a Date — supports Excel serial numbers and many string formats
function parseFlexibleDate(value) {
    if (value === undefined || value === null || value === '') return null;

    // Excel serial number
    if (typeof value === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + value * 86400000);
    }

    const str = value.toString().trim();
    if (!str) return null;

    // Try native Date.parse first (handles ISO, RFC, US format)
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
        // Sanity check: Date.parse('2025-13-01') in some engines returns valid junk.
        // Reject anything outside reasonable range.
        const y = d.getFullYear();
        if (y >= 1900 && y <= 2100) return d;
    }

    // Try Swedish/European formats: YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
    const m1 = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m1) return new Date(+m1[1], +m1[2] - 1, +m1[3]);

    const m2 = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m2) {
        // Ambiguous: DD/MM/YYYY vs MM/DD/YYYY. For Sweden assume DD first.
        return new Date(+m2[3], +m2[2] - 1, +m2[1]);
    }

    return null;
}

// Parse an amount — handles Swedish "1 234,56" and English "1,234.56" and stray currency
function parseFlexibleAmount(value) {
    if (value === undefined || value === null || value === '') return NaN;
    if (typeof value === 'number') return value;

    let s = value.toString().trim();
    if (!s) return NaN;

    // Strip currency symbols and spaces (incl. non-breaking)
    s = s.replace(/[^\d,.\-+]/g, '');

    // Decide decimal separator: if both . and , appear, the LAST one is the decimal
    if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        // Only comma — assume Swedish decimal
        s = s.replace(',', '.');
    }
    return parseFloat(s);
}

function showImportModal() {
    const swishCount = pendingImports.filter(i => i.isSwishRepayment).length;
    const incomeCount = pendingImports.filter(i => i.kind === 'income' && !i.isSwishRepayment).length;
    const expenseCount = pendingImports.length - swishCount - incomeCount;

    // Update header summary
    const countEl = document.getElementById('importCount');
    const parts = [t('expenses.countLabel', { n: expenseCount })];
    if (incomeCount > 0) {
        parts.push(`<span style="color: var(--success);">${t(incomeCount === 1 ? 'imports.incomeOne' : 'imports.incomeMany', { n: incomeCount })}</span>`);
    }
    if (swishCount > 0) {
        parts.push(`<span style="color: var(--success);">${t(swishCount === 1 ? 'expenses.swishOne' : 'expenses.swishMany', { n: swishCount })}</span>`);
    }
    countEl.innerHTML = parts.join(' · ');

    // Default-account picker — applied to every row that doesn't have
    // a specific override yet.
    const defaultAccountSelect = document.getElementById('importDefaultAccount');
    if (defaultAccountSelect) {
        defaultAccountSelect.innerHTML = renderAccountOptions(null);
    }

    const preview = document.getElementById('importPreview');
    preview.innerHTML = pendingImports.map((item, idx) => {
        if (item.isSwishRepayment) {
            return renderSwishImportRow(item, idx);
        }
        return renderExpenseImportRow(item, idx);
    }).join('');

    document.getElementById('importModal').classList.add('active');
}

// <option> set for an account picker. Includes a "—" no-account row
// at the top so users can leave a transaction unlinked.
function renderAccountOptions(selectedId) {
    const none = `<option value="" ${selectedId == null ? 'selected' : ''}>${t('imports.noAccount')}</option>`;
    const list = accounts.map(a =>
        `<option value="${a.id}" ${String(selectedId) === String(a.id) ? 'selected' : ''}>${a.name}</option>`
    ).join('');
    return none + list;
}

// Apply the default-account dropdown to every pending row that's still
// unset. Called from the dropdown's onchange handler in the modal.
function applyImportDefaultAccount() {
    const sel = document.getElementById('importDefaultAccount');
    if (!sel) return;
    const id = sel.value || null;
    pendingImports.forEach((item, idx) => {
        item.accountId = id;
        const rowSel = document.getElementById('import-acct-' + idx);
        if (rowSel) rowSel.value = id || '';
    });
}

function renderExpenseImportRow(item, idx) {
    const isIncome = item.kind === 'income';
    const amountClass = isIncome ? 'import-amount income' : 'import-amount';
    const sign = isIncome ? '+' : '';
    const kindBadge = isIncome
        ? `<span class="import-tag income">${t('imports.incomeTag')}</span>`
        : '';
    return `
        <div class="import-row ${isIncome ? 'income' : ''}">
            <div style="flex: 1; min-width: 0;">
                <strong>${item.description}</strong> ${kindBadge}<br>
                <small style="color: var(--text-light);">${formatDate(item.date)}</small>
            </div>
            <div class="${amountClass}">${sign}${formatCurrency(item.amount)}</div>
            <select id="import-cat-${idx}" style="padding: 0.5rem; width: 140px;" onchange="pendingImports[${idx}].category = this.value">
                ${categories.map(cat =>
                    `<option value="${cat.id}" ${item.category === cat.id ? 'selected' : ''}>${localizedCategoryName(cat)}</option>`
                ).join('')}
            </select>
            <select id="import-acct-${idx}" style="padding: 0.5rem; width: 160px;" onchange="pendingImports[${idx}].accountId = this.value || null">
                ${renderAccountOptions(item.accountId)}
            </select>
            <button class="delete-btn" onclick="removePendingImport(${idx})">×</button>
        </div>
    `;
}

function renderSwishImportRow(item, idx) {
    const sender = extractSwishSender(item.description) || t('imports.someone');
    const candidates = findSwishCandidateExpenses(item, idx);

    const candidateOptions = candidates.map(c => {
        const labelDate = c.date ? formatDate(c.date) : '';
        const labelAmt = formatCurrency(c.amount);
        const labelDesc = c.description.length > 40 ? c.description.slice(0, 38) + '…' : c.description;
        const value = c.source === 'pending' ? `pending:${c.idx}` : `db:${c.id}`;
        const selected = item.attachToExpenseId === value ? 'selected' : '';
        return `<option value="${value}" ${selected}>${labelDate} · ${labelDesc} · ${labelAmt}</option>`;
    }).join('');

    return `
        <div class="import-row import-row-swish">
            <div class="swish-tag">${t('imports.swishFrom', { sender })}</div>
            <div style="flex: 1; min-width: 0;">
                <strong>${item.description}</strong><br>
                <small style="color: var(--text-light);">${formatDate(item.date)}</small>
            </div>
            <div class="import-amount" style="color: var(--success);">+${formatCurrency(item.amount)}</div>
            <select style="padding: 0.5rem; width: 260px;" onchange="setSwishAttachment(${idx}, this.value)">
                <option value="" ${!item.attachToExpenseId ? 'selected' : ''}>${t('imports.skip')}</option>
                ${candidateOptions}
            </select>
            <button class="delete-btn" onclick="removePendingImport(${idx})">×</button>
        </div>
    `;
}

// Returns suggested expenses to attach a swish repayment to, ordered by likelihood.
// Looks at both existing DB expenses AND other pending imports in the same batch.
function findSwishCandidateExpenses(swishItem, swishIdx) {
    const swishDate = new Date(swishItem.date + 'T00:00:00');
    const dayMs = 86400000;
    const candidates = [];

    // Existing expenses (last 60 days from the swish date)
    expenses.forEach(exp => {
        const expDate = new Date(exp.date + 'T00:00:00');
        const dayDiff = Math.abs((swishDate - expDate) / dayMs);
        if (dayDiff > 60) return;
        if (exp.amount < swishItem.amount) return; // expense must be at least as much as the repayment
        candidates.push({
            source: 'db',
            id: exp.id,
            date: exp.date,
            amount: exp.amount,
            description: exp.description,
            dayDiff: dayDiff
        });
    });

    // Other pending imports in this batch (must be regular expenses, not swish)
    pendingImports.forEach((other, otherIdx) => {
        if (otherIdx === swishIdx || other.isSwishRepayment) return;
        const otherDate = new Date(other.date + 'T00:00:00');
        const dayDiff = Math.abs((swishDate - otherDate) / dayMs);
        if (dayDiff > 60) return;
        if (other.amount < swishItem.amount) return;
        candidates.push({
            source: 'pending',
            idx: otherIdx,
            date: other.date,
            amount: other.amount,
            description: other.description,
            dayDiff: dayDiff
        });
    });

    // Rank: closer in time + higher amount (relative to swish) wins
    candidates.sort((a, b) => {
        if (Math.abs(a.dayDiff - b.dayDiff) > 3) return a.dayDiff - b.dayDiff;
        return b.amount - a.amount;
    });

    return candidates.slice(0, 8);
}

function setSwishAttachment(idx, value) {
    pendingImports[idx].attachToExpenseId = value || null;
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    pendingImports = [];
}

function removePendingImport(idx) {
    pendingImports.splice(idx, 1);
    if (pendingImports.length === 0) {
        closeImportModal();
    } else {
        showImportModal();
    }
}

function confirmImport() {
    const baseId = Date.now() * 1000;
    let insertedExpenses = 0;
    let attachedRepayments = 0;
    let skippedSwish = 0;
    const failed = [];

    // Map from "pending:idx" → assigned DB id, used so swish rows can attach to expenses we just inserted
    const pendingIdToInsertedId = {};

    // Phase 1: insert all non-swish expenses, recording their assigned IDs
    pendingImports.forEach((item, idx) => {
        if (item.isSwishRepayment) return;
        const id = baseId + idx;
        const accountId = (item.accountId != null && item.accountId !== '')
            ? parseInt(item.accountId, 10)
            : null;
        const kind = item.kind === 'income' ? 'income' : 'expense';
        try {
            db.run(
                'INSERT INTO expenses (id, amount, category, description, date, swish_repayments, account_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, item.amount, item.category, item.description, item.date, '[]', accountId, kind]
            );
            insertedExpenses++;
            pendingIdToInsertedId[`pending:${idx}`] = id;
        } catch (err) {
            failed.push({ item, error: err.message });
            console.error('Import row failed:', item, err);
        }
    });

    // Phase 2: attach swish repayments to the chosen expenses
    pendingImports.forEach((item, idx) => {
        if (!item.isSwishRepayment) return;
        if (!item.attachToExpenseId) {
            skippedSwish++;
            return;
        }

        // Resolve the target expense's DB id
        let targetId = null;
        if (item.attachToExpenseId.startsWith('db:')) {
            targetId = parseInt(item.attachToExpenseId.slice(3));
        } else if (item.attachToExpenseId.startsWith('pending:')) {
            targetId = pendingIdToInsertedId[item.attachToExpenseId];
        }
        if (!targetId) { skippedSwish++; return; }

        try {
            // Read existing repayments, append, write back
            const result = db.exec('SELECT swish_repayments FROM expenses WHERE id = ?', [targetId]);
            let existing = [];
            if (result.length > 0 && result[0].values.length > 0) {
                try { existing = JSON.parse(result[0].values[0][0] || '[]') || []; } catch (e) { existing = []; }
            }
            existing.push({ amount: item.amount, date: new Date(item.date + 'T00:00:00').toISOString() });
            db.run('UPDATE expenses SET swish_repayments = ? WHERE id = ?', [JSON.stringify(existing), targetId]);
            attachedRepayments++;
        } catch (err) {
            failed.push({ item, error: err.message });
            console.error('Swish attach failed:', item, err);
        }
    });

    saveDatabase();
    loadDataFromDB();
    updateDashboard();
    updateCharts();
    closeImportModal();

    // Build a friendly summary
    const parts = [];
    if (insertedExpenses > 0) parts.push(t(insertedExpenses === 1 ? 'imports.oneExpenseImported' : 'imports.expensesImported', { n: insertedExpenses }));
    if (attachedRepayments > 0) parts.push(t(attachedRepayments === 1 ? 'imports.oneSwishAttached' : 'imports.swishAttached', { n: attachedRepayments }));
    if (skippedSwish > 0) parts.push(t(skippedSwish === 1 ? 'imports.oneSwishSkipped' : 'imports.swishSkipped', { n: skippedSwish }));
    let msg = parts.length > 0 ? parts.join(' · ') : t('imports.nothingImported');
    if (failed.length > 0) msg += '\n\n' + t('imports.failedSuffix', { n: failed.length });
    alert(msg);
}

// Database Management
function downloadDatabase() {
    const data = db.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-tracker-${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const status = document.getElementById('dbStatus');
    status.textContent = t('db.downloadedAt', { time: new Date().toLocaleString(activeLocale()) });
    setTimeout(() => {
        status.textContent = '';
    }, 5000);
}

function loadDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            if (!confirm(t('confirms.loadDb', { name: file.name }))) {
                return;
            }
            
            const uint8Array = new Uint8Array(e.target.result);
            db = new SQL.Database(uint8Array);
            
            // Run schema upgrades on imported DB too
            ensureSchema();
            saveDatabase();
            loadDataFromDB();

            document.body.setAttribute('data-theme', theme);
            document.body.setAttribute('data-palette', palette);
            renderThemeButtons();
            document.getElementById('currencySelect').value = currency;
            document.getElementById('monthlyBudget').value = monthlyBudget;
            document.getElementById('monthlyIncome').value = monthlyIncome || '';
            document.getElementById('cycleStartDay').value = cycleStartDay;
            document.getElementById('cycleAdjustment').value = cycleAdjustment;

            updateLabels();
            updateCategorySelects();
            renderPaletteMenu();
            renderCategoriesList();
            updateMonthDisplay();
            updateDashboard();
            updateCharts();
            renderFixedExpenses();
            renderSubscriptionsCard();
            renderCyclePreview();

            alert(t('db.loadOk'));
            
        } catch (error) {
            alert(t('db.loadError', { msg: error.message }));
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// =====================================================
// HERO: Savings Rate + Streak + Avoidance Wins
// =====================================================
function renderHero(monthSpent) {
    const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);

    // Savings Rate
    const heroValue = document.getElementById('heroSavingsRate');
    const heroDetail = document.getElementById('heroSavingsDetail');

    if (monthlyIncome > 0) {
        const totalOutflow = monthSpent + totalFixed;
        const saved = monthlyIncome - totalOutflow;
        const rate = (saved / monthlyIncome) * 100;
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

// =====================================================
// MILESTONE CELEBRATIONS (Confetti)
// =====================================================
function checkSavingsRateMilestone(rate) {
    const tiers = [10, 20, 30, 40, 50];
    const cycleKey = isoDate(getCycleBounds(currentViewMonth).start);
    tiers.forEach(tier => {
        if (rate >= tier) {
            const key = `savingsRate:${cycleKey}:${tier}`;
            if (!achievedMilestones.find(m => m.key === key)) {
                achievedMilestones.push({ type: 'savingsRate', key });
                persistMilestones();
                celebrate('💰', t('milestones.savingsRateTitle', { n: tier }), t('milestones.savingsRateMsg', { n: tier }));
            }
        }
    });
}

function checkStreakMilestone(streak) {
    const tiers = [3, 7, 14, 30, 60, 100];
    tiers.forEach(tier => {
        if (streak === tier) {
            const key = `streak:${tier}`;
            if (!achievedMilestones.find(m => m.key === key)) {
                achievedMilestones.push({ type: 'streak', key });
                persistMilestones();
                celebrate('🔥', t('milestones.streakTitle', { n: tier }), t('milestones.streakMsg'));
            }
        }
    });
}

function checkSavingsAmountMilestone(amount) {
    const tiers = [1000, 5000, 10000, 25000, 50000, 100000];
    tiers.forEach(tier => {
        if (amount >= tier) {
            const key = `saved:${tier}`;
            if (!achievedMilestones.find(m => m.key === key)) {
                achievedMilestones.push({ type: 'saved', key });
                persistMilestones();
                celebrate('💎', t('milestones.savedTitle', { amount: formatCurrency(tier) }), t('milestones.savedMsg'));
            }
        }
    });
}

function persistMilestones() {
    setSetting('achievedMilestones', JSON.stringify(achievedMilestones));
}

function celebrate(emoji, title, message) {
    const toast = document.getElementById('celebrationToast');
    document.getElementById('celebrationEmoji').textContent = emoji;
    document.getElementById('celebrationTitle').textContent = title;
    document.getElementById('celebrationMessage').textContent = message;
    toast.classList.add('show');
    fireConfetti();
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// Lightweight confetti — no library needed
function resizeConfettiCanvas() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function fireConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const particles = [];

    for (let i = 0; i < 120; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 12,
            vy: Math.random() * -14 - 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4,
            rotation: Math.random() * Math.PI * 2,
            vRotation: (Math.random() - 0.5) * 0.2,
            life: 1
        });
    }

    let frame = 0;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
            p.vy += 0.35; // gravity
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.vRotation;
            p.life -= 0.008;
            if (p.life > 0 && p.y < canvas.height + 50) {
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
                ctx.restore();
            }
        });
        frame++;
        if (alive && frame < 250) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    animate();
}

// =====================================================
// QUICK ADD (Mobile FAB)
// =====================================================
function openQuickAdd() {
    document.getElementById('quickDate').valueAsDate = new Date();
    document.getElementById('quickAddModal').classList.add('active');
    setTimeout(() => document.getElementById('quickAmount').focus(), 100);
}

function closeQuickAdd() {
    document.getElementById('quickAddModal').classList.remove('active');
    document.getElementById('quickAddForm').reset();
}

function addExpenseFromQuick(e) {
    e.preventDefault();
    const description = normalizeImportText(document.getElementById('quickDescription').value);
    const category = description ? guessCategory(description) || document.getElementById('quickCategory').value : document.getElementById('quickCategory').value;
    const amount = parseFloat(document.getElementById('quickAmount').value);
    const date = document.getElementById('quickDate').value;
    const id = Date.now();

    db.run('INSERT INTO expenses (id, amount, category, description, date, swish_repayments) VALUES (?, ?, ?, ?, ?, ?)',
        [id, amount, category, description || t('expenses.noDescription'), date, '[]']);
    saveDatabase();

    expenses.unshift({ id, amount, category, description: description || t('expenses.noDescription'), date, swishRepayments: [] });
    closeQuickAdd();
    updateDashboard();
    updateCharts();
}

// =====================================================
// INCOME
// =====================================================
function updateIncome() {
    monthlyIncome = parseFloat(document.getElementById('monthlyIncome').value) || 0;
    setSetting('monthlyIncome', monthlyIncome.toString());
    updateDashboard();
}

// =====================================================
// BUDGET CYCLE SETTINGS
// =====================================================
function updateCycleSettings() {
    const dayInput = document.getElementById('cycleStartDay');
    const adjInput = document.getElementById('cycleAdjustment');
    let day = parseInt(dayInput.value);
    if (isNaN(day) || day < 1) day = 1;
    if (day > 28) day = 28;
    dayInput.value = day;

    cycleStartDay = day;
    cycleAdjustment = adjInput.value;
    setSetting('cycleStartDay', String(cycleStartDay));
    setSetting('cycleAdjustment', cycleAdjustment);

    // Snap currentViewMonth into the cycle that contains "today"
    currentViewMonth = new Date();
    updateMonthDisplay();
    updateDashboard();
    updateCharts();
    renderCyclePreview();
}

function renderCyclePreview() {
    const preview = document.getElementById('cyclePreview');
    if (!preview) return;
    const bounds = getCycleBounds(new Date());
    const days = bounds.days;
    const dailyBudget = monthlyBudget > 0 && fixedExpenses
        ? (monthlyBudget - fixedExpenses.reduce((s, f) => s + f.amount, 0)) / days
        : 0;

    // Compute what start would have been WITHOUT adjustment, to show the user when a shift was applied
    let adjustmentNote = '';
    if (cycleStartDay !== 1 && cycleAdjustment !== 'none') {
        // Determine which calendar month the cycle is anchored to
        const ref = new Date();
        // Build the unadjusted intended start in the same anchor month
        const anchorMonth = bounds.start.getDate() <= cycleStartDay ? bounds.start.getMonth() : bounds.start.getMonth() + 1;
        const anchorYear  = bounds.start.getDate() <= cycleStartDay ? bounds.start.getFullYear() : bounds.start.getFullYear() + (anchorMonth > 11 ? 1 : 0);
        const intended = new Date(anchorYear, ((anchorMonth % 12) + 12) % 12, cycleStartDay);
        if (intended.getTime() !== bounds.start.getTime()) {
            const intendedLabel = intended.toLocaleDateString(activeLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
            const holiday = holidayName(intended);
            const reason = holiday ? holiday : (intended.getDay() === 0 || intended.getDay() === 6 ? t('cycle.weekendReason') : '');
            adjustmentNote = `<div style="margin-top: 0.5rem; color: var(--text-light); font-size: 0.8rem;">${t('cycle.shiftedFrom', { label: intendedLabel })}${reason ? ' (' + reason + ')' : ''}</div>`;
        }
    }

    preview.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${t('cycle.currentCycle')}</div>
        <div style="color: var(--text-light);">${bounds.label} · ${t('cycle.days', { n: days })}${dailyBudget > 0 ? ` · ${t('cycle.perDay', { amount: formatCurrency(dailyBudget) })}` : ''}</div>
        ${adjustmentNote}
    `;
}

function ordinal(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return s[(v-20)%10] || s[v] || s[0];
}

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
    const monthExpenses = expenses.filter(exp => exp.date >= startStr && exp.date <= endStr);
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
    const monthExpenses = expenses.filter(exp => exp.date >= startStr && exp.date <= endStr);

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

// =====================================================
// ONBOARDING
// =====================================================
function openOnboarding() {
    onboardingState.step = 1;
    setOnboardingStep(1);
    document.getElementById('obCurrency').value = currency;
    // Populate SVG icons (uses data-icon attribute on each step's onboarding-icon div)
    document.querySelectorAll('.onboarding-icon[data-icon]').forEach(el => {
        if (!el.querySelector('svg')) {
            el.innerHTML = svgIcon(el.dataset.icon);
        }
    });
    document.getElementById('onboardingModal').classList.add('active');
}

function setOnboardingStep(step) {
    onboardingState.step = step;
    [1, 2, 3].forEach(s => {
        document.getElementById(`ob-step-${s}`).classList.toggle('active', s === step);
        document.getElementById(`ob-dot-${s}`).classList.toggle('active', s <= step);
    });
}

function onboardingNext(step) {
    if (onboardingState.step === 1 && step === 2) {
        // Save currency + income
        const newCurrency = document.getElementById('obCurrency').value;
        currency = newCurrency;
        document.getElementById('currencySelect').value = newCurrency;
        setSetting('currency', newCurrency);
        const income = parseFloat(document.getElementById('obIncome').value) || 0;
        if (income > 0) {
            monthlyIncome = income;
            setSetting('monthlyIncome', income.toString());
            document.getElementById('monthlyIncome').value = income;
        }
        updateLabels();
    } else if (onboardingState.step === 2 && step === 3) {
        const budget = parseFloat(document.getElementById('obBudget').value) || 0;
        if (budget > 0) {
            monthlyBudget = budget;
            setSetting('monthlyBudget', budget.toString());
            document.getElementById('monthlyBudget').value = budget;
        }
    }
    setOnboardingStep(step);
}

function completeOnboarding() {
    // Save first goal if provided
    const goalName = document.getElementById('obGoalName').value.trim();
    const goalTarget = parseFloat(document.getElementById('obGoalAmount').value);
    if (goalName && goalTarget > 0) {
        const id = Date.now();
        db.run('INSERT INTO goals (id, name, emoji, target_amount, current_amount, color, deadline, created_date, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, goalName, 'target', goalTarget, 0, '#3b82f6', null, new Date().toISOString().split('T')[0], 0]);
        saveDatabase();
        loadDataFromDB();
    }
    document.getElementById('onboardingModal').classList.remove('active');
    updateDashboard();
    updateCharts();
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
