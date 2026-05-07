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
