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
