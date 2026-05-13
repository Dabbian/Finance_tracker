
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
        autoCreateMissingSubscriptionExpenses();
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

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-palette', palette);
    // Mirror DB-stored values to localStorage. Language: so the login page
    // picks it up. Theme/palette: so the inline <head> script can apply them
    // before paint on the next reload (avoids a default-theme flash).
    try {
        localStorage.setItem('language', language);
        localStorage.setItem('theme', theme);
        localStorage.setItem('palette', palette);
    } catch (e) {}
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

    renderActiveTabContent();
});







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

