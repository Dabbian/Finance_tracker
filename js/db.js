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
    addColumnIfMissing('subscriptions', 'billing_day', "TEXT");
    addColumnIfMissing('subscriptions', 'account_id', "INTEGER");
    // Fixed expenses gained transaction-recognition fields. Older DBs
    // only had id/name/amount/category.
    addColumnIfMissing('fixed_expenses', 'match_key', "TEXT");
    addColumnIfMissing('fixed_expenses', 'billing_day', "TEXT");
    addColumnIfMissing('fixed_expenses', 'account_id', "INTEGER");
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
            billing_day TEXT,
            account_id INTEGER,
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
            category TEXT NOT NULL,
            match_key TEXT,
            billing_day TEXT,
            account_id INTEGER
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
            billing_day TEXT,
            account_id INTEGER,
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
    const stmt = db.prepare('INSERT OR IGNORE INTO categories (id, name, color, keywords, essential) VALUES (?, ?, ?, ?, ?)');
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
    const fixedResult = db.exec(`
        SELECT id, name, amount, category, match_key, billing_day, account_id
        FROM fixed_expenses
    `);
    fixedExpenses = fixedResult.length > 0 ? fixedResult[0].values.map(row => ({
        id: row[0],
        name: row[1],
        amount: row[2],
        category: row[3],
        matchKey: row[4] || null,
        billingDay: row[5] || null,
        accountId: row[6] != null ? row[6] : null
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
            SELECT id, name, amount, cycle, category, status, note, source, match_key,
                   billing_day, account_id, created_date
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
            billingDay: row[9] || null,
            accountId: row[10] != null ? row[10] : null,
            createdDate: row[11]
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
