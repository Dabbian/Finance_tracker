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
