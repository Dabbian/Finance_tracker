// =====================================================
// I18N — translations + helpers
// Add new strings to BOTH en and sv. The t(path) helper takes a
// dot-separated path and returns the matching string in the active
// language, falling back to English, then to the path itself.
// =====================================================
const languagePresets = [
    { id: 'en', label: 'English' },
    { id: 'sv', label: 'Svenska' }
];

const translations = {
    en: {
        tabs: {
            dashboard: 'Dashboard',
            transactions: 'Transactions',
            accounts: 'Accounts',
            goals: 'Goals',
            insights: 'Insights',
            reports: 'Reports',
            recurring: 'Recurring',
            budget: 'Budget',
            settings: 'Settings'
        },
        topbar: {
            add: 'Add',
            previousMonth: 'Previous month',
            nextMonth: 'Next month',
            currency: 'Currency',
            primaryNav: 'Primary navigation'
        },
        common: {
            save: 'Save',
            cancel: 'Cancel',
            close: 'Close',
            delete: 'Delete',
            edit: 'Edit',
            add: 'Add',
            confirm: 'Confirm',
            yes: 'Yes',
            no: 'No',
            none: '— None —',
            today: 'Today',
            yesterday: 'Yesterday',
            optional: 'Optional',
            loading: 'Loading…',
            next: 'Next →',
            back: '← Back'
        },
        modals: {
            editExpense: 'Edit Expense',
            newSubscription: 'New Subscription',
            editSubscription: 'Edit Subscription',
            editCancelledSub: 'Edit Cancelled Subscription',
            editCategory: 'Edit Category',
            expenses: 'Expenses',
            expensesLower: 'expenses',
            total: 'total',
            reviewImport: 'Review Imported Expenses',
            dupReview: 'Possible Duplicates',
            expensesFound: 'expenses found',
            quickAdd: 'Quick add expense',
            addToGoal: 'Add to Goal',
            netWorthSnapshot: 'Net Worth Snapshot',
            cutGoalProgress: 'Cut Goal Progress',
            insight: 'Insight',
            newAccount: 'New Account',
            editAccount: 'Edit Account'
        },
        subs: {
            help: 'Track your recurring subscriptions and see what they cost. Auto-detected from import data and any you add manually.',
            amountPerCycle: 'Amount per cycle',
            amountPerCycleKr: 'Amount per cycle (kr)',
            amountPerCycleUsd: 'Amount per cycle ($)',
            billingCycle: 'Billing cycle',
            monthly: 'Monthly',
            yearly: 'Yearly',
            quarterly: 'Quarterly',
            weekly: 'Weekly',
            active: 'Active',
            perMonth: 'Per month',
            perYear: 'Per year',
            autoDetected: 'Auto-detected · {n} new',
            detectedMeta: '{amount}/mo · seen in {months} months',
            ignore: 'Ignore',
            auto: 'Auto',
            noActive: 'No active subscriptions.',
            cancelled: 'Cancelled',
            cancelledStatus: 'Cancelled',
            activeStatus: 'Active',
            markCancelled: 'Mark as cancelled',
            reactivate: 'Reactivate',
            billingDay: 'Billing day',
            due: 'Due',
            cycleShort: { weekly: 'wk', monthly: 'mo', quarterly: 'qt', yearly: 'yr' }
        },
        categories: {
            keywordsHelp: 'Add keywords that will automatically categorize expenses based on description',
            keywordCount: '{n} keywords',
            noKeywords: 'No keywords',
            exists: 'Category already exists',
            cantDeleteDefault: 'Cannot delete default categories',
            confirmDelete: 'Delete this category? Expenses will be moved to "Other"',
            keywordExists: 'Keyword already exists',
            essentialBadge: 'Essential',
            essentialHelp: "Excluded from the daily budget streak so a single big shop doesn't break it.",
            lockedHelp: "Built-in category — can't be deleted."
        },
        defaultCategories: {
            groceries: 'Groceries',
            dining: 'Dining',
            transport: 'Transport',
            entertainment: 'Entertainment',
            shopping: 'Shopping',
            bills: 'Bills & Utilities',
            health: 'Health & Fitness',
            other: 'Other',
            fixed: 'Fixed Expenses'
        },
        onboarding: {
            welcome: 'Welcome!',
            welcomeSub: "Let's set you up in 60 seconds.",
            monthlyIncomeAfterTax: 'Monthly Income (after tax)',
            incomeHelp: 'This stays on your device. We use it to calculate your savings rate.',
            budgetTitle: 'Discretionary Budget',
            budgetSub: 'How much do you want to spend on flexible things each month? (Excludes rent, bills, etc.)',
            monthlyBudget: 'Monthly Discretionary Budget',
            firstGoal: 'First Savings Goal',
            firstGoalSub: "What's something you want to save for? Skip if not sure.",
            goalName: 'Goal Name',
            letsGo: "Let's go",
            monthlyBudgetKr: 'Monthly Discretionary Budget (kr)',
            monthlyBudgetUsd: 'Monthly Discretionary Budget ($)'
        },
        celebration: {
            milestoneReached: 'Milestone reached!',
            savingsRate: 'Savings rate · {n}%',
            streak: '{n}-day streak'
        },
        wins: {
            daysWithout: '{n} days without {category}',
            lowestWeek: 'Lowest spending week in 2 months',
            newBest: 'New best streak: {n} days'
        },
        milestones: {
            savingsRateTitle: '{n}% Savings Rate!',
            savingsRateMsg: 'You kept {n}% of your income this cycle',
            streakTitle: '{n}-Day Streak!',
            streakMsg: "Keep it going — you're building real habits",
            savedTitle: '{amount} saved!',
            savedMsg: 'Your future self thanks you'
        },
        cutGoal: {
            headerNote: 'Auto-tracked: every kr below your {baseline}/month baseline in <strong>{category}</strong> counts toward this goal.',
            thisCategory: 'this category',
            savedSoFar: 'Saved so far',
            monthsElapsed: 'Months elapsed',
            avgPerMonth: 'Avg / month',
            noMonths: 'No months tracked yet.',
            monthByMonth: 'Month by month',
            inProgress: 'in progress',
            spentVs: 'Spent {actual} vs {baseline} baseline',
            tracking: 'Tracking',
            baseline: 'Baseline',
            perMonth: '/month',
            overOneMonth: 'over {n} month',
            overMonths: 'over {n} months',
            editNote: 'Progress is computed from your real spending. Edit name, target, deadline, color, or icon — the tracking rules stay locked.'
        },
        imports: {
            someone: 'Someone',
            swishFrom: '↩ Swish from {sender}',
            skip: "— Skip (don't import) —",
            noAccount: '— No account —',
            applyAccountToAll: 'Account for all rows:',
            incomeTag: 'Income',
            transferIn: 'Transfer in',
            transferOut: 'Transfer out',
            transferOne: '{n} transfer',
            transferMany: '{n} transfers',
            dupExact: 'Duplicate',
            dupMaybe: 'Possible duplicate',
            dupMaybeWith: 'Possible duplicate of: {desc}',
            dupExactSummary: '{n} duplicate skipped',
            dupMaybeSummary: '{n} possible duplicate — review',
            importAnyway: 'Import anyway',
            skipDup: 'Skip — this is a duplicate',
            dupIntro: 'Found {total} row(s) that look like existing transactions ({exact} exact, {maybe} possible). Decide what to do with each before continuing.',
            dupMatchesExisting: 'Matches existing: {desc}',
            dupSkip: 'Skip',
            dupImport: 'Import',
            dupSkipAll: 'Skip all',
            dupKeepAll: 'Import all',
            dupContinue: 'Continue',
            dupDecisionLabel: 'Skip or import this duplicate',
            stepOneOfTwo: 'Step 1 of 2 · Resolve duplicates',
            stepTwoOfTwo: 'Step 2 of 2 · Confirm import',
            chipExpenses: 'expenses',
            chipIncome: 'income',
            chipTransfers: 'transfers',
            chipSwish: 'swish',
            chipSkipped: 'skipped',
            editRow: 'Edit',
            removeRow: 'Remove row',
            skipThisRow: "Skip this row — don't import",
            skippedTag: 'Skipped',
            oneDupSkipped: '{n} duplicate skipped',
            dupSkipped: '{n} duplicates skipped',
            incomeOne: '{n} incoming payment',
            incomeMany: '{n} incoming payments',
            oneExpenseImported: '{n} expense imported',
            expensesImported: '{n} expenses imported',
            oneSwishAttached: '{n} Swish repayment attached',
            swishAttached: '{n} Swish repayments attached',
            oneSwishSkipped: '{n} Swish row skipped',
            swishSkipped: '{n} Swish rows skipped',
            nothingImported: 'Nothing imported.',
            failedSuffix: '{n} failed — see browser console.',
            importedFallback: 'Imported',
            noHeaderRow: 'No header row found and no rows match a (date, description, amount) layout.',
            headerNoRows: 'Found a header row at line {line}, but no valid expense rows below it.\n\nDate column: {dateCol}, Amount column: {amountCol}\nSkipped: {empty} empty, {badDate} bad date, {zeroAmount} zero amount.'
        },
        snapshot: {
            amountAndDateRequired: 'Please enter an amount and date'
        },
        accounts: {
            intro: 'Track balances across your bank accounts, cards, and cash.',
            empty: 'No accounts yet — tap "+ Add Account" to add your first one.',
            totalBalance: 'Total balance',
            summaryEmpty: 'Add an account to see your total here.',
            summaryMeta: '{total} accounts · {linked} linked',
            linked: 'Linked',
            unlinked: 'Unlinked',
            linkedHelp: 'Manual accounts you update yourself are "Unlinked". Real bank-link sync is on the roadmap.'
        },
        accountTypes: {
            checking: 'Checking',
            savings: 'Savings',
            cash: 'Cash',
            credit: 'Credit Card',
            investment: 'Investment'
        },
        reports: {
            intro: 'Custom date-range breakdowns and exports. (Coming soon.)',
            empty: 'Spending reports by category, merchant, and time range are on the way.'
        },
        budget: {
            intro: 'Plan how each kr is supposed to behave before the month starts. (Coming soon.)',
            empty: 'Per-category envelope budgeting is in the works.'
        },
        insightExtras: {
            monthlyAvg: 'Your monthly avg',
            savePerMonth: 'Save / month',
            savePerYear: 'Save / year',
            setAsGoalHint: 'Tap "Set as goal" to track this saving as a goal you can fund over the next 12 months.',
            spentSoFar: 'Spent so far',
            daysIntoCycle: 'Days into cycle',
            projectedTotal: 'Projected total',
            thisCycle: 'This cycle',
            average: 'Average',
            overspend: 'Overspend',
            history: 'History',
            oneCycleAgo: '{n} cycle ago',
            cyclesAgo: '{n} cycles ago',
            count: 'Count',
            monthsTracked: '{n} months tracked',
            monthsTrackedLabel: 'Months tracked',
            daysAgoShort: '{n}d ago',
            lastDaysAgo: 'last {n} days ago',
            last30Days: 'Last 30 days',
            perOccurrence: 'Per occurrence',
            yearlyPace: 'Yearly pace'
        },
        currency: { sek: 'SEK (kr)', usd: 'USD ($)' },
        hero: {
            savingsRate: 'Savings Rate',
            dayStreak: 'Day Streak',
            best: 'Best: {n}',
            setIncomeHint: 'Set your income in Settings to track savings',
            keeping: "You're keeping <strong>{amount}</strong> this cycle",
            spendingOver: 'Spending <strong style="color:var(--danger);">{amount}</strong> over income'
        },
        greeting: {
            morning: 'Good morning',
            afternoon: 'Good afternoon',
            evening: 'Good evening',
            night: 'Hey there'
        },
        comparison: {
            vsLast: 'vs last cycle',
            spending: 'spending',
            savingsRate: 'savings rate'
        },
        transactions: {
            count: 'transactions',
            spent: 'spent',
            received: 'received'
        },
        stats: {
            totalSpentCycle: 'Total Spent This Cycle',
            dailyAverage: 'Daily Average',
            budgetRemaining: 'Budget Remaining',
            dailyBudget: 'Daily Budget'
        },
        savings: {
            hint: 'Hover over a day to see details, click to view expenses',
            underBudget: 'Under budget',
            overBudget: 'Over budget',
            future: 'Future'
        },
        expenses: {
            empty: 'No expenses yet',
            edit: 'Edit Expense',
            details: 'Expense Details',
            confirmDelete: 'Delete this expense?',
            previewTitle: 'Preview Import',
            foundCount: '<strong id="importCount">0</strong> expenses found',
            previewIntro: "Review the expenses below before importing. You can uncheck any rows you don't want.",
            recurringNote: 'Recurring monthly subscriptions are auto-categorized as "Fixed Expenses" and excluded from your daily budget.',
            countLabel: '{n} expenses',
            swishOne: '{n} Swish repayment',
            swishMany: '{n} Swish repayments',
            noDescription: 'No description',
            onDate: 'Expenses on {date}'
        },
        empty: {
            fixed: 'No fixed expenses',
            repayments: 'No repayments',
            noExpenses: 'No expenses',
            noExpensesFound: 'No expenses found',
            firstSnapshot: 'Add your first snapshot to start tracking',
            noSubscriptions: 'No subscriptions yet. Add one or accept an auto-detected one above.'
        },
        confirms: {
            deleteFixed: 'Delete this fixed expense?',
            deleteExpense: 'Delete this expense?',
            deleteGoal: 'Delete this goal? This cannot be undone.',
            deleteSnapshot: 'Delete this snapshot?',
            deleteSubscription: 'Delete this subscription? This only removes it from your tracking — your expense history is unaffected.',
            deleteAccount: 'Delete this account? This only removes it from your tracking — your expense history is unaffected.',
            loadDb: 'Load database from {name}? This will replace all current data.'
        },
        errors: {
            initDb: 'Failed to initialize database. Please refresh the page.',
            readFile: 'Error reading file: {msg}',
            noExpensesFound: 'No expenses found.',
            invalidAmount: 'Please enter a valid amount.',
            invalidDate: 'Please pick a date.',
            saveFailed: 'Could not save. Try again.'
        },
        cards: {
            accounts: 'Accounts',
            yourAccounts: 'Your Accounts',
            reports: 'Reports',
            budget: 'Budget',
            addExpense: 'Add Expense',
            importExcel: 'Import from Excel',
            recentExpenses: 'Recent Expenses',
            transactions: 'Transactions',
            configureCategories: 'Configure Categories',
            savingsGoals: 'Savings Goals',
            netWorth: 'Net Worth',
            insights: 'Insights',
            smartInsights: 'Smart Insights',
            account: 'Account',
            incomeBudget: 'Income & Budget',
            cycleSettings: 'Budget Cycle',
            fixedExpenses: 'Fixed Expenses',
            appearance: 'Appearance',
            subscriptions: 'Subscriptions',
            database: 'Database Management',
            categoryBreakdown: 'Category Breakdown',
            spendingTrend: 'Spending Trend',
            dailySavings: 'Daily Savings',
            milestones: 'Milestones'
        },
        netWorth: {
            intro: 'Take a monthly snapshot. Watch the line go up over time.',
            latestSnapshot: 'Latest snapshot',
            addSnapshot: '+ Add Snapshot',
            change: 'Change',
            from: 'from',
            snapshotHelp: 'Add up your accounts (checking, savings, investments) and subtract debts. Track this monthly.',
            totalKr: 'Total Net Worth (kr)',
            totalUsd: 'Total Net Worth ($)',
            allSnapshots: 'All snapshots',
            noSnapshots: 'No snapshots yet'
        },
        insights: {
            empty: 'No insights yet — add a few expenses to see trends.',
            emptyHint: 'Add a few weeks of expenses for personalized insights.',
            intro: 'Patterns we noticed in your spending. Concrete actions, real numbers.',
            setAsGoal: 'Set as goal',
            gotIt: 'Got it',
            markAsNew: 'Mark as new',
            thisCycle: 'This Cycle',
            watchOut: 'Watch Out',
            recurringCharges: 'Recurring Charges',
            smallLeaks: 'Small Leaks Add Up',
            whatIf: 'What If',
            perMo: '/mo',
            perYr: '/yr',
            daysAgo: '{n} days ago',
            forecastOver: {
                title: 'On pace to exceed budget',
                desc: 'Spending averages {avg}/day. {days} days left in this cycle. To stay on budget, cap daily spend at {cap}.'
            },
            forecastUnder: {
                title: 'On track to stay under budget',
                desc: "At your current pace, you'll save {amount} this cycle."
            },
            anomaly: {
                title: '{category} is up {pct}%',
                desc: '{current} this cycle vs {avg} average over last {n} cycles.'
            },
            subsSummary: {
                title: '{n} recurring charges detected',
                desc: 'About {monthly}/month, or {yearly}/year. Worth reviewing.'
            },
            subsStale: {
                title: '{n} possibly cancelled',
                desc: "Haven't seen {names} in 2+ months. Worth confirming you're not still being charged."
            },
            subsTop: {
                desc: '{amount} every month, {months} months tracked. Last charge {last}.'
            },
            leak: {
                desc: '{count} times in 30 days. Adds up to {yearly} a year at this pace.'
            },
            counterfactual: {
                title: 'Cut {category} by 20%',
                desc: 'Your average is {avg}/month. Trimming 20% would save {yearly} a year.'
            }
        },
        account: {
            note: 'Real account management (change email, change password, delete account) will appear here once a backend is connected.',
            demoLocalOnly: 'Demo (local only)',
            emailPassword: 'Email & password',
            passkey: 'Passkey',
            newAccount: 'New account'
        },
        time: {
            justNow: 'Just now',
            minAgo: '{n} min ago',
            hrAgo: '{n} hr ago'
        },
        charts: {
            dailySpending: 'Daily Spending'
        },
        incomeBudget: {
            incomeHelp: 'Used to calculate your savings rate. Stored locally, never sent anywhere.',
            budgetHelp: 'What you allow yourself to spend each month (excludes fixed expenses).',
            spentOf: 'of {total}'
        },
        cycle: {
            help: 'Choose when your budget month resets. Useful for payday-based budgeting (e.g., Swedish 25th payday) or credit card billing cycles (e.g., Amex on the 2nd).',
            startHelp: '1 = calendar month (default). Use 25 for Swedish payday, 3 for Amex billing, etc.',
            swedenHelp: 'Swedish rule includes Easter, Midsummer, Christmas, Midsummer Eve, Christmas Eve, etc.',
            optNone: 'No adjustment',
            optWeekend: 'Weekend → previous Friday',
            optSweden: 'Swedish payday rule (weekends + röda dagar)',
            preview: 'Current cycle: <strong>{from} – {to}</strong>',
            currentCycle: 'Current cycle',
            days: '{n} days',
            perDay: '{amount}/day',
            shiftedFrom: 'Shifted earlier from {label}',
            weekendReason: 'weekend'
        },
        db: {
            help: 'Your data is stored in a SQLite database. Download backup or load from a previous backup.',
            downloaded: 'Database downloaded.',
            downloadedAt: 'Database downloaded: {time}',
            loaded: 'Database loaded.',
            loadOk: 'Database loaded successfully!',
            loadError: 'Error loading database: {msg}'
        },
        labels: {
            amount: 'Amount',
            amountKr: 'Amount (kr)',
            amountUsd: 'Amount ($)',
            category: 'Category',
            description: 'Description',
            descriptionOptional: 'Description (Optional)',
            date: 'Date',
            categoryName: 'Category Name',
            color: 'Color',
            theme: 'Theme',
            colorPalette: 'Color Palette',
            language: 'Language',
            monthlyIncome: 'Monthly Income',
            monthlyIncomeKr: 'Monthly Income (kr)',
            monthlyIncomeUsd: 'Monthly Income ($)',
            discretionaryBudget: 'Discretionary Budget',
            discretionaryBudgetKr: 'Discretionary Budget (kr)',
            discretionaryBudgetUsd: 'Discretionary Budget ($)',
            cycleStartsOnDay: 'Cycle Starts on Day',
            cycleAdjustment: 'When start date lands on…',
            email: 'Email',
            password: 'Password',
            signInMethod: 'Sign-in method',
            signedIn: 'Signed in',
            accountType: 'Account type',
            light: 'Light',
            dark: 'Dark',
            includeFixed: 'Include Fixed Expenses',
            account: 'Account',
            accountName: 'Account Name',
            accountType: 'Type',
            startingBalance: 'Starting Balance',
            startingBalanceKr: 'Starting Balance (kr)',
            startingBalanceUsd: 'Starting Balance ($)',
            linkedToBank: 'Linked to a bank (auto-synced)',
            name: 'Name',
            keyword: 'Keyword',
            keywords: 'Keywords (for auto-categorization)',
            startingBalance: 'Starting balance',
            balance: 'Balance',
            note: 'Note (Optional)',
            target: 'Target',
            saved: 'Saved',
            remaining: 'Remaining',
            progress: 'Progress',
            icon: 'Icon',
            categoryOptional: 'Category (Optional)',
            swishRepayments: 'Swish Repayments',
            tagAsIncome: 'Tag as income (counts toward monthly income)',
            transactionType: 'Type',
            billingDay: 'Billing day',
            matchKeyword: 'Match keyword'
        },
        hints: {
            matchKey: 'Used to recognize future transactions. Defaults to the name.'
        },
        kinds: {
            expense: 'Expense',
            income: 'Income',
            transferOut: 'Transfer out (money left this account)',
            transferIn: 'Transfer in (money arrived in this account)'
        },
        comparison: {
            vsLast: 'vs last cycle',
            spending: 'spending',
            savingsRate: 'savings rate'
        },
        transactions: {
            count: 'transactions',
            spent: 'spent',
            received: 'received'
        },
        placeholders: {
            amount: '0.00',
            categoryExample: 'e.g., Groceries',
            descriptionExample: 'Coffee at Starbucks',
            incomeExample: '35000',
            budgetExample: '10000',
            fixedExample: 'Rent, Internet, etc.',
            accountName: 'e.g., Chase Checking',
            keywordExample: 'e.g., ica, coop, mat',
            goalNameExample: 'Japan trip, emergency fund, new laptop',
            noteExample: 'Bonus, side income, etc.',
            subName: 'Spotify, Netflix, gym, etc.',
            subNote: 'e.g., shared with Anna',
            quickDesc: 'What was it for?',
            snapshotNote: 'e.g., received bonus',
            dayOfMonth: '1–31',
            matchKey: 'e.g. hyresavi'
        },
        buttons: {
            addExpense: 'Add Expense',
            addCategory: 'Add Category',
            addGoal: 'Add Goal',
            addSubscription: '+ Add Subscription',
            addAccount: '+ Add Account',
            saveAccount: 'Save Account',
            addRepayment: 'Add Repayment',
            addKeyword: 'Add',
            saveGoal: 'Save Goal',
            contribute: 'Contribute',
            takeSnapshot: 'Take Snapshot',
            signOut: 'Sign out',
            downloadDb: '💾 Download Database',
            loadDb: '📂 Load Database',
            importAll: 'Import All',
            uploadClick: 'Click to upload',
            dragDrop: 'or drag and drop',
            uploadHelp: 'Support for .xlsx and .xls files',
            getStarted: 'Get started',
            addFixed: 'Add Fixed Expense',
            saveChanges: 'Save Changes',
            saveSnapshot: 'Save Snapshot',
            done: 'Done',
            deleteExpense: 'Delete Expense',
            deleteSubscription: 'Delete subscription',
            deleteGoal: 'Delete Goal',
            cancelGoal: 'Cancel goal',
            cancel: 'Cancel'
        },
        goals: {
            intro: "Name what you're saving for. Watch the jar fill up.",
            empty: 'No goals yet — tap "+ Add" to create your first one.',
            targetSuffix: '{amount} target',
            completeTitle: 'Goal Complete!',
            reached: 'You reached {name}',
            cutByPercent: 'Cut {category} by {percent}%',
            whatSavingFor: 'What are you saving for?',
            targetAmount: 'Target Amount',
            targetAmountKr: 'Target Amount (kr)',
            targetAmountUsd: 'Target Amount ($)',
            alreadySavedKr: 'Already Saved (kr)',
            alreadySavedUsd: 'Already Saved ($)',
            amountToAddKr: 'Amount to Add (kr)',
            amountToAddUsd: 'Amount to Add ($)',
            targetDate: 'Target Date (Optional)',
            autoTracked: 'Auto-tracked progress',
            autoTrackedShort: 'Auto',
            autoTrackedHelp: 'Progress is computed automatically from your spending — no manual contributions.',
            startingBalance: 'Starting balance',
            deadlineOptional: 'Deadline (optional)',
            newSavingsGoal: 'New Savings Goal',
            newGoal: 'New Goal',
            editGoal: 'Edit goal',
            editCutGoal: 'Edit Cut Goal',
            addContribution: 'Add a contribution',
            takeSnapshotTitle: 'Take a snapshot',
            netWorthIntro: 'A quick log of where you stand. No accounts to link.',
            of: 'of {amount}',
            daysLeft: '{n} days left',
            dueToday: 'Due today',
            daysOverdue: '{n} days overdue',
            trackingStarts: 'Tracking starts after your first full month.',
            targetReached: 'Target reached',
            onTrack: 'On track',
            behindBy: 'Behind by {amount}',
            projected: 'Projected',
            status: 'Status',
            viewProgress: 'View progress'
        },
        signIn: {
            title: 'Welcome back',
            subtitle: 'Sign in to continue tracking your finances.',
            signIn: 'Sign in',
            signUp: 'Sign up',
            createAccount: 'Create account',
            createAccountSub: 'Start tracking what you keep, not just what you spend.',
            forgot: 'Forgot password?',
            withPasskey: 'Sign in with passkey',
            setupPasskey: 'Set up with passkey',
            or: 'or',
            resetTitle: 'Reset password',
            resetSub: "We'll send a reset link to your email.",
            sendReset: 'Send reset link',
            backToSignIn: 'Back to sign in',
            footer: 'Protected by <strong>passkeys</strong> & end-to-end encryption (planned)',
            emailHint: 'you@example.com',
            passwordHint: '••••••••',
            passwordMin: 'At least 8 characters',
            invalidEmail: 'Please enter a valid email.',
            passwordRequired: 'Password is required.',
            passwordTooShort: 'Password must be at least 8 characters.',
            signingIn: 'Signing in…',
            creatingAccount: 'Creating account…',
            sending: 'Sending…',
            waitingPasskey: 'Waiting for passkey…',
            resetSent: 'If that email exists, a reset link has been sent.',
            passkeyUnsupported: "Passkeys aren't supported in this browser.",
            demoNote: '<strong>Demo mode.</strong> Any email and password works. Real authentication coming once a backend is connected.',
            tagline: 'Track · Save · Grow'
        }
    },
    sv: {
        tabs: {
            dashboard: 'Översikt',
            transactions: 'Transaktioner',
            accounts: 'Konton',
            goals: 'Mål',
            insights: 'Insikter',
            reports: 'Rapporter',
            recurring: 'Återkommande',
            budget: 'Budget',
            settings: 'Inställningar'
        },
        topbar: {
            add: 'Lägg till',
            previousMonth: 'Föregående månad',
            nextMonth: 'Nästa månad',
            currency: 'Valuta',
            primaryNav: 'Huvudnavigering'
        },
        common: {
            save: 'Spara',
            cancel: 'Avbryt',
            close: 'Stäng',
            delete: 'Ta bort',
            edit: 'Redigera',
            add: 'Lägg till',
            confirm: 'Bekräfta',
            yes: 'Ja',
            no: 'Nej',
            none: '— Ingen —',
            today: 'Idag',
            yesterday: 'Igår',
            optional: 'Valfritt',
            loading: 'Laddar…',
            next: 'Nästa →',
            back: '← Tillbaka'
        },
        modals: {
            editExpense: 'Redigera utgift',
            newSubscription: 'Ny prenumeration',
            editSubscription: 'Redigera prenumeration',
            editCancelledSub: 'Redigera avslutad prenumeration',
            editCategory: 'Redigera kategori',
            expenses: 'Utgifter',
            expensesLower: 'utgifter',
            total: 'totalt',
            reviewImport: 'Granska importerade utgifter',
            dupReview: 'Möjliga dubbletter',
            expensesFound: 'utgifter hittade',
            quickAdd: 'Snabblägg till utgift',
            addToGoal: 'Bidra till mål',
            netWorthSnapshot: 'Ögonblicksbild av nettoförmögenhet',
            cutGoalProgress: 'Sparmål via utgiftsminskning',
            insight: 'Insikt',
            newAccount: 'Nytt konto',
            editAccount: 'Redigera konto'
        },
        subs: {
            help: 'Håll koll på återkommande prenumerationer och se vad de kostar. Identifieras automatiskt från importerad data, eller läggs till manuellt.',
            amountPerCycle: 'Belopp per cykel',
            amountPerCycleKr: 'Belopp per cykel (kr)',
            amountPerCycleUsd: 'Belopp per cykel ($)',
            billingCycle: 'Faktureringscykel',
            monthly: 'Månadsvis',
            yearly: 'Årsvis',
            quarterly: 'Kvartalsvis',
            weekly: 'Veckovis',
            active: 'Aktiva',
            perMonth: 'Per månad',
            perYear: 'Per år',
            autoDetected: 'Automatiskt upptäckta · {n} nya',
            detectedMeta: '{amount}/mån · setts i {months} månader',
            ignore: 'Ignorera',
            auto: 'Auto',
            noActive: 'Inga aktiva prenumerationer.',
            cancelled: 'Avslutade',
            cancelledStatus: 'Avslutad',
            activeStatus: 'Aktiv',
            markCancelled: 'Markera som avslutad',
            reactivate: 'Återaktivera',
            billingDay: 'Fakturadag',
            due: 'Förfaller',
            cycleShort: { weekly: 'v', monthly: 'mån', quarterly: 'kv', yearly: 'år' }
        },
        categories: {
            keywordsHelp: 'Lägg till sökord som automatiskt kategoriserar utgifter utifrån beskrivningen',
            keywordCount: '{n} sökord',
            noKeywords: 'Inga sökord',
            exists: 'Kategorin finns redan',
            cantDeleteDefault: 'Standardkategorier kan inte tas bort',
            confirmDelete: 'Ta bort denna kategori? Utgifterna flyttas till "Övrigt"',
            keywordExists: 'Sökordet finns redan',
            essentialBadge: 'Nödvändig',
            essentialHelp: 'Räknas inte mot dagsbudgeten — en stor matkasse bryter inte streaket.',
            lockedHelp: 'Inbyggd kategori — kan inte tas bort.'
        },
        defaultCategories: {
            groceries: 'Mat (matkasse)',
            food: 'Restaurang & café',
            transport: 'Transport',
            entertainment: 'Nöje',
            shopping: 'Shopping',
            bills: 'Räkningar & abonnemang',
            health: 'Hälsa & träning',
            other: 'Övrigt',
            fixed: 'Fasta utgifter'
        },
        onboarding: {
            welcome: 'Välkommen!',
            welcomeSub: 'Vi sätter upp dig på 60 sekunder.',
            monthlyIncomeAfterTax: 'Månadsinkomst (efter skatt)',
            incomeHelp: 'Detta sparas på din enhet. Vi använder det för att räkna ut din sparkvot.',
            budgetTitle: 'Disponibel budget',
            budgetSub: 'Hur mycket vill du spendera på flexibla saker per månad? (Exklusive hyra, räkningar osv.)',
            monthlyBudget: 'Disponibel månadsbudget',
            firstGoal: 'Första sparmålet',
            firstGoalSub: 'Vad vill du spara till? Hoppa över om du är osäker.',
            goalName: 'Målets namn',
            letsGo: 'Sätt igång',
            monthlyBudgetKr: 'Disponibel månadsbudget (kr)',
            monthlyBudgetUsd: 'Disponibel månadsbudget ($)'
        },
        celebration: {
            milestoneReached: 'Milstolpe nådd!',
            savingsRate: 'Sparkvot · {n}%',
            streak: '{n} dagar i rad'
        },
        wins: {
            daysWithout: '{n} dagar utan {category}',
            lowestWeek: 'Lägsta utgiftsvecka på 2 månader',
            newBest: 'Nytt rekord i rad: {n} dagar'
        },
        milestones: {
            savingsRateTitle: '{n} % sparkvot!',
            savingsRateMsg: 'Du behöll {n} % av din inkomst denna cykel',
            streakTitle: '{n} dagar i rad!',
            streakMsg: 'Fortsätt så — du bygger riktiga vanor',
            savedTitle: '{amount} sparat!',
            savedMsg: 'Ditt framtida jag tackar dig'
        },
        cutGoal: {
            headerNote: 'Spåras automatiskt: varje krona under din baslinje på {baseline}/månad i <strong>{category}</strong> räknas mot detta mål.',
            thisCategory: 'denna kategori',
            savedSoFar: 'Sparat hittills',
            monthsElapsed: 'Månader gått',
            avgPerMonth: 'Snitt/månad',
            noMonths: 'Inga månader spårade än.',
            monthByMonth: 'Månad för månad',
            inProgress: 'pågår',
            spentVs: 'Spenderat {actual} mot baslinje {baseline}',
            tracking: 'Spårar',
            baseline: 'Baslinje',
            perMonth: '/månad',
            overOneMonth: 'över {n} månad',
            overMonths: 'över {n} månader',
            editNote: 'Framsteg beräknas från dina faktiska utgifter. Du kan redigera namn, mål, deadline, färg eller ikon — spårningsreglerna är låsta.'
        },
        imports: {
            someone: 'Någon',
            swishFrom: '↩ Swish från {sender}',
            skip: '— Hoppa över (importera ej) —',
            noAccount: '— Inget konto —',
            applyAccountToAll: 'Konto för alla rader:',
            incomeTag: 'Insättning',
            transferIn: 'Överföring in',
            transferOut: 'Överföring ut',
            transferOne: '{n} överföring',
            transferMany: '{n} överföringar',
            dupExact: 'Dubblett',
            dupMaybe: 'Möjlig dubblett',
            dupMaybeWith: 'Möjlig dubblett av: {desc}',
            dupExactSummary: '{n} dubblett hoppas över',
            dupMaybeSummary: '{n} möjlig dubblett — granska',
            importAnyway: 'Importera ändå',
            skipDup: 'Hoppa över — detta är en dubblett',
            dupIntro: 'Hittade {total} rad(er) som ser ut som befintliga transaktioner ({exact} exakta, {maybe} möjliga). Bestäm vad du vill göra med varje innan du fortsätter.',
            dupMatchesExisting: 'Matchar befintlig: {desc}',
            dupSkip: 'Hoppa över',
            dupImport: 'Importera',
            dupSkipAll: 'Hoppa över alla',
            dupKeepAll: 'Importera alla',
            dupContinue: 'Fortsätt',
            dupDecisionLabel: 'Hoppa över eller importera denna dubblett',
            stepOneOfTwo: 'Steg 1 av 2 · Hantera dubbletter',
            stepTwoOfTwo: 'Steg 2 av 2 · Bekräfta import',
            chipExpenses: 'utgifter',
            chipIncome: 'inkomster',
            chipTransfers: 'överföringar',
            chipSwish: 'swish',
            chipSkipped: 'överhoppade',
            editRow: 'Redigera',
            removeRow: 'Ta bort rad',
            skipThisRow: 'Hoppa över denna rad — importera inte',
            skippedTag: 'Överhoppad',
            oneDupSkipped: '{n} dubblett hoppas över',
            dupSkipped: '{n} dubbletter hoppade över',
            incomeOne: '{n} insättning',
            incomeMany: '{n} insättningar',
            oneExpenseImported: '{n} utgift importerad',
            expensesImported: '{n} utgifter importerade',
            oneSwishAttached: '{n} Swish-återbetalning kopplad',
            swishAttached: '{n} Swish-återbetalningar kopplade',
            oneSwishSkipped: '{n} Swish-rad hoppades över',
            swishSkipped: '{n} Swish-rader hoppades över',
            nothingImported: 'Inget importerat.',
            failedSuffix: '{n} misslyckades — se webbläsarkonsolen.',
            importedFallback: 'Importerad',
            noHeaderRow: 'Ingen rubrikrad hittades och inga rader matchar formatet (datum, beskrivning, belopp).',
            headerNoRows: 'Hittade en rubrikrad på rad {line}, men inga giltiga utgiftsrader under den.\n\nDatumkolumn: {dateCol}, Beloppskolumn: {amountCol}\nÖverhoppade: {empty} tomma, {badDate} dåligt datum, {zeroAmount} noll-belopp.'
        },
        snapshot: {
            amountAndDateRequired: 'Ange ett belopp och datum'
        },
        accounts: {
            intro: 'Håll koll på saldon för bankkonton, kort och kontanter.',
            empty: 'Inga konton än — tryck på "+ Lägg till konto" för att lägga till ditt första.',
            totalBalance: 'Totalt saldo',
            summaryEmpty: 'Lägg till ett konto för att se totalen här.',
            summaryMeta: '{total} konton · {linked} kopplade',
            linked: 'Kopplad',
            unlinked: 'Manuell',
            linkedHelp: 'Konton du uppdaterar själv är "Manuella". Riktig banklänkning är på vägen.'
        },
        accountTypes: {
            checking: 'Lönekonto',
            savings: 'Sparkonto',
            cash: 'Kontanter',
            credit: 'Kreditkort',
            investment: 'Investering'
        },
        reports: {
            intro: 'Anpassade tidsintervall och export. (Kommer snart.)',
            empty: 'Utgiftsrapporter per kategori, butik och tidsperiod är på gång.'
        },
        budget: {
            intro: 'Planera hur varje krona ska bete sig innan månaden börjar. (Kommer snart.)',
            empty: 'Kuvertbudget per kategori är under utveckling.'
        },
        insightExtras: {
            monthlyAvg: 'Ditt månadssnitt',
            savePerMonth: 'Spar/månad',
            savePerYear: 'Spar/år',
            setAsGoalHint: 'Tryck på "Sätt som mål" för att spåra detta sparande som ett mål du kan finansiera över de kommande 12 månaderna.',
            spentSoFar: 'Spenderat hittills',
            daysIntoCycle: 'Dagar in i cykeln',
            projectedTotal: 'Prognostiserad summa',
            thisCycle: 'Denna cykel',
            average: 'Snitt',
            overspend: 'Översk.',
            history: 'Historik',
            oneCycleAgo: 'för {n} cykel sedan',
            cyclesAgo: 'för {n} cykler sedan',
            count: 'Antal',
            monthsTracked: '{n} månader spårade',
            monthsTrackedLabel: 'Månader spårade',
            daysAgoShort: 'för {n}d sedan',
            lastDaysAgo: 'senast för {n} dagar sedan',
            last30Days: 'Senaste 30 dagarna',
            perOccurrence: 'Per gång',
            yearlyPace: 'Årstakt'
        },
        currency: { sek: 'SEK (kr)', usd: 'USD ($)' },
        hero: {
            savingsRate: 'Sparkvot',
            dayStreak: 'Dagar i rad',
            best: 'Bästa: {n}',
            setIncomeHint: 'Ange din inkomst i Inställningar för att följa sparandet',
            keeping: 'Du behåller <strong>{amount}</strong> denna cykel',
            spendingOver: 'Spenderar <strong style="color:var(--danger);">{amount}</strong> över inkomsten'
        },
        greeting: {
            morning: 'God morgon',
            afternoon: 'God eftermiddag',
            evening: 'God kväll',
            night: 'Hej där'
        },
        comparison: {
            vsLast: 'jämfört med förra cykeln',
            spending: 'utgifter',
            savingsRate: 'sparkvot'
        },
        transactions: {
            count: 'transaktioner',
            spent: 'spenderat',
            received: 'mottaget'
        },
        stats: {
            totalSpentCycle: 'Totalt spenderat denna cykel',
            dailyAverage: 'Snitt per dag',
            budgetRemaining: 'Kvar av budget',
            dailyBudget: 'Daglig budget'
        },
        savings: {
            hint: 'Hovra över en dag för att se detaljer, klicka för att visa utgifter',
            underBudget: 'Under budget',
            overBudget: 'Över budget',
            future: 'Framtid'
        },
        expenses: {
            empty: 'Inga utgifter än',
            edit: 'Redigera utgift',
            details: 'Utgiftsdetaljer',
            confirmDelete: 'Ta bort denna utgift?',
            previewTitle: 'Förhandsgranska import',
            foundCount: '<strong id="importCount">0</strong> utgifter hittade',
            previewIntro: 'Granska utgifterna nedan innan du importerar. Du kan avmarkera rader du inte vill ta med.',
            recurringNote: 'Återkommande månadsprenumerationer kategoriseras automatiskt som "Fasta utgifter" och räknas inte mot din dagliga budget.',
            countLabel: '{n} utgifter',
            swishOne: '{n} Swish-återbetalning',
            swishMany: '{n} Swish-återbetalningar',
            noDescription: 'Ingen beskrivning',
            onDate: 'Utgifter den {date}'
        },
        empty: {
            fixed: 'Inga fasta utgifter',
            repayments: 'Inga återbetalningar',
            noExpenses: 'Inga utgifter',
            noExpensesFound: 'Inga utgifter hittade',
            firstSnapshot: 'Lägg till din första ögonblicksbild för att börja följa',
            noSubscriptions: 'Inga prenumerationer än. Lägg till en eller godkänn en automatiskt upptäckt ovan.'
        },
        confirms: {
            deleteFixed: 'Ta bort denna fasta utgift?',
            deleteExpense: 'Ta bort denna utgift?',
            deleteGoal: 'Ta bort detta mål? Det går inte att ångra.',
            deleteSnapshot: 'Ta bort denna ögonblicksbild?',
            deleteSubscription: 'Ta bort denna prenumeration? Den tas endast bort från din spårning — din utgiftshistorik påverkas inte.',
            deleteAccount: 'Ta bort detta konto? Det tas endast bort från din spårning — din utgiftshistorik påverkas inte.',
            loadDb: 'Läs in databas från {name}? All nuvarande data ersätts.'
        },
        errors: {
            initDb: 'Kunde inte initiera databasen. Ladda om sidan.',
            readFile: 'Kunde inte läsa filen: {msg}',
            noExpensesFound: 'Inga utgifter hittades.',
            invalidAmount: 'Ange ett giltigt belopp.',
            invalidDate: 'Välj ett datum.',
            saveFailed: 'Kunde inte spara. Försök igen.'
        },
        cards: {
            accounts: 'Konton',
            yourAccounts: 'Dina konton',
            reports: 'Rapporter',
            budget: 'Budget',
            addExpense: 'Lägg till utgift',
            importExcel: 'Importera från Excel',
            recentExpenses: 'Senaste utgifter',
            transactions: 'Transaktioner',
            configureCategories: 'Hantera kategorier',
            savingsGoals: 'Sparmål',
            netWorth: 'Nettoförmögenhet',
            insights: 'Insikter',
            smartInsights: 'Smarta insikter',
            account: 'Konto',
            incomeBudget: 'Inkomst & budget',
            cycleSettings: 'Budgetcykel',
            fixedExpenses: 'Fasta utgifter',
            appearance: 'Utseende',
            subscriptions: 'Prenumerationer',
            database: 'Databashantering',
            categoryBreakdown: 'Fördelning per kategori',
            spendingTrend: 'Utgiftstrend',
            dailySavings: 'Dagligt sparande',
            milestones: 'Milstolpar'
        },
        netWorth: {
            intro: 'Ta en ögonblicksbild varje månad. Se linjen stiga över tid.',
            latestSnapshot: 'Senaste ögonblicksbild',
            addSnapshot: '+ Lägg till ögonblicksbild',
            change: 'Förändring',
            from: 'från',
            snapshotHelp: 'Summera dina konton (lönekonto, sparkonto, investeringar) och dra av skulder. Logga detta varje månad.',
            totalKr: 'Total nettoförmögenhet (kr)',
            totalUsd: 'Total nettoförmögenhet ($)',
            allSnapshots: 'Alla ögonblicksbilder',
            noSnapshots: 'Inga ögonblicksbilder än'
        },
        insights: {
            empty: 'Inga insikter än — lägg till några utgifter för att se trender.',
            emptyHint: 'Lägg till några veckors utgifter för personliga insikter.',
            intro: 'Mönster vi sett i dina utgifter. Konkreta åtgärder, riktiga siffror.',
            setAsGoal: 'Sätt som mål',
            gotIt: 'Uppfattat',
            markAsNew: 'Markera som ny',
            thisCycle: 'Denna cykel',
            watchOut: 'Se upp',
            recurringCharges: 'Återkommande betalningar',
            smallLeaks: 'Små läckor blir stora',
            whatIf: 'Tänk om',
            perMo: '/mån',
            perYr: '/år',
            daysAgo: 'för {n} dagar sedan',
            forecastOver: {
                title: 'På väg att överskrida budgeten',
                desc: 'Utgifterna ligger på {avg}/dag i snitt. {days} dagar kvar i denna cykel. För att hålla budgeten, sätt taket på {cap} per dag.'
            },
            forecastUnder: {
                title: 'På väg att hålla under budget',
                desc: 'I nuvarande takt sparar du {amount} denna cykel.'
            },
            anomaly: {
                title: '{category} är upp {pct} %',
                desc: '{current} denna cykel mot {avg} i snitt över de senaste {n} cyklerna.'
            },
            subsSummary: {
                title: '{n} återkommande betalningar upptäckta',
                desc: 'Cirka {monthly}/månad, eller {yearly}/år. Värt att se över.'
            },
            subsStale: {
                title: '{n} möjligen avslutade',
                desc: 'Vi har inte sett {names} på 2+ månader. Värt att bekräfta att du inte fortfarande debiteras.'
            },
            subsTop: {
                desc: '{amount} varje månad, {months} månader spårade. Senaste betalning {last}.'
            },
            leak: {
                desc: '{count} gånger på 30 dagar. Blir {yearly} på ett år i denna takt.'
            },
            counterfactual: {
                title: 'Minska {category} med 20 %',
                desc: 'Ditt snitt är {avg}/månad. 20 % mindre sparar {yearly} på ett år.'
            }
        },
        account: {
            note: 'Riktig kontohantering (byta e-post, byta lösenord, ta bort konto) visas här när en backend är kopplad.',
            demoLocalOnly: 'Demo (endast lokalt)',
            emailPassword: 'E-post & lösenord',
            passkey: 'Passkey',
            newAccount: 'Nytt konto'
        },
        time: {
            justNow: 'Just nu',
            minAgo: 'för {n} min sedan',
            hrAgo: 'för {n} tim sedan'
        },
        charts: {
            dailySpending: 'Dagliga utgifter'
        },
        incomeBudget: {
            incomeHelp: 'Används för att beräkna din sparkvot. Lagras lokalt, skickas aldrig någonstans.',
            budgetHelp: 'Det du tillåter dig att spendera per månad (exklusive fasta utgifter).',
            spentOf: 'av {total}'
        },
        cycle: {
            help: 'Välj när din budgetmånad återställs. Praktiskt för lönedagsbaserad budgetering (t.ex. svensk lön den 25:e) eller kreditkortsfaktureringar (t.ex. Amex den 2:a).',
            startHelp: '1 = kalendermånad (standard). Använd 25 för svensk lönedag, 3 för Amex-fakturering, osv.',
            swedenHelp: 'Den svenska regeln inkluderar påsk, midsommar, jul, midsommarafton, julafton osv.',
            optNone: 'Ingen justering',
            optWeekend: 'Helg → föregående fredag',
            optSweden: 'Svensk lönedagsregel (helger + röda dagar)',
            preview: 'Nuvarande cykel: <strong>{from} – {to}</strong>',
            currentCycle: 'Nuvarande cykel',
            days: '{n} dagar',
            perDay: '{amount}/dag',
            shiftedFrom: 'Tidigarelagd från {label}',
            weekendReason: 'helg'
        },
        db: {
            help: 'Dina data lagras i en SQLite-databas. Ladda ner en backup eller läs in en tidigare backup.',
            downloaded: 'Databasen har laddats ner.',
            downloadedAt: 'Databasen laddades ner: {time}',
            loaded: 'Databasen har lästs in.',
            loadOk: 'Databasen laddades!',
            loadError: 'Fel vid inläsning av databas: {msg}'
        },
        labels: {
            amount: 'Belopp',
            amountKr: 'Belopp (kr)',
            amountUsd: 'Belopp ($)',
            category: 'Kategori',
            description: 'Beskrivning',
            descriptionOptional: 'Beskrivning (valfritt)',
            date: 'Datum',
            categoryName: 'Kategorinamn',
            color: 'Färg',
            theme: 'Tema',
            colorPalette: 'Färgpalett',
            language: 'Språk',
            monthlyIncome: 'Månadsinkomst',
            monthlyIncomeKr: 'Månadsinkomst (kr)',
            monthlyIncomeUsd: 'Månadsinkomst ($)',
            discretionaryBudget: 'Disponibel budget',
            discretionaryBudgetKr: 'Disponibel budget (kr)',
            discretionaryBudgetUsd: 'Disponibel budget ($)',
            cycleStartsOnDay: 'Cykeln börjar dag',
            cycleAdjustment: 'När startdatumet hamnar på…',
            email: 'E-post',
            password: 'Lösenord',
            signInMethod: 'Inloggningsmetod',
            signedIn: 'Inloggad',
            accountType: 'Kontotyp',
            light: 'Ljust',
            dark: 'Mörkt',
            includeFixed: 'Inkludera fasta utgifter',
            account: 'Konto',
            accountName: 'Kontonamn',
            accountType: 'Typ',
            startingBalance: 'Ingående saldo',
            startingBalanceKr: 'Ingående saldo (kr)',
            startingBalanceUsd: 'Ingående saldo ($)',
            linkedToBank: 'Kopplad till bank (synkas automatiskt)',
            name: 'Namn',
            keyword: 'Sökord',
            keywords: 'Sökord (för autokategorisering)',
            startingBalance: 'Ingående saldo',
            balance: 'Saldo',
            note: 'Anteckning (valfritt)',
            target: 'Mål',
            saved: 'Sparat',
            remaining: 'Kvar',
            progress: 'Framsteg',
            icon: 'Ikon',
            categoryOptional: 'Kategori (valfritt)',
            swishRepayments: 'Swish-återbetalningar',
            tagAsIncome: 'Tagga som inkomst (räknas mot månadsinkomst)',
            transactionType: 'Typ',
            billingDay: 'Förfallodag',
            matchKeyword: 'Matchande sökord'
        },
        hints: {
            matchKey: 'Används för att känna igen framtida transaktioner. Standard är namnet.'
        },
        kinds: {
            expense: 'Utgift',
            income: 'Inkomst',
            transferOut: 'Överföring ut (pengar lämnade detta konto)',
            transferIn: 'Överföring in (pengar kom till detta konto)'
        },
        comparison: {
            vsLast: 'vs förra cykeln',
            spending: 'utgifter',
            savingsRate: 'sparkvot'
        },
        transactions: {
            count: 'transaktioner',
            spent: 'spenderat',
            received: 'mottaget'
        },
        placeholders: {
            amount: '0,00',
            categoryExample: 't.ex. Mat',
            descriptionExample: 'Kaffe på Espresso House',
            incomeExample: '35000',
            budgetExample: '10000',
            fixedExample: 'Hyra, internet, osv.',
            accountName: 't.ex. SEB Lönekonto',
            keywordExample: 't.ex. ica, coop, mat',
            goalNameExample: 'Japanresa, sparbuffert, ny laptop',
            noteExample: 'Bonus, sidoinkomst, osv.',
            subName: 'Spotify, Netflix, gym, osv.',
            subNote: 't.ex. delat med Anna',
            quickDesc: 'Vad var det för?',
            snapshotNote: 't.ex. fick bonus',
            dayOfMonth: '1–31',
            matchKey: 't.ex. hyresavi'
        },
        buttons: {
            addExpense: 'Lägg till utgift',
            addCategory: 'Lägg till kategori',
            addGoal: 'Lägg till mål',
            addSubscription: '+ Lägg till prenumeration',
            addAccount: '+ Lägg till konto',
            saveAccount: 'Spara konto',
            addRepayment: 'Lägg till återbetalning',
            addKeyword: 'Lägg till',
            saveGoal: 'Spara mål',
            contribute: 'Bidra',
            takeSnapshot: 'Ta ögonblicksbild',
            signOut: 'Logga ut',
            downloadDb: '💾 Ladda ner databas',
            loadDb: '📂 Ladda databas',
            importAll: 'Importera alla',
            uploadClick: 'Klicka för att ladda upp',
            dragDrop: 'eller dra och släpp',
            uploadHelp: 'Stöder .xlsx och .xls-filer',
            getStarted: 'Kom igång',
            addFixed: 'Lägg till fast utgift',
            saveChanges: 'Spara ändringar',
            saveSnapshot: 'Spara ögonblicksbild',
            done: 'Klar',
            deleteExpense: 'Ta bort utgift',
            deleteSubscription: 'Ta bort prenumeration',
            deleteGoal: 'Ta bort mål',
            cancelGoal: 'Avbryt mål',
            cancel: 'Avbryt'
        },
        goals: {
            intro: 'Namnge det du sparar till. Se burken fyllas på.',
            empty: 'Inga mål än — tryck på "+ Lägg till" för att skapa ditt första.',
            targetSuffix: 'mål {amount}',
            completeTitle: 'Mål klart!',
            reached: 'Du nådde {name}',
            cutByPercent: 'Minska {category} med {percent} %',
            whatSavingFor: 'Vad sparar du till?',
            targetAmount: 'Målbelopp',
            targetAmountKr: 'Målbelopp (kr)',
            targetAmountUsd: 'Målbelopp ($)',
            alreadySavedKr: 'Redan sparat (kr)',
            alreadySavedUsd: 'Redan sparat ($)',
            amountToAddKr: 'Belopp att lägga till (kr)',
            amountToAddUsd: 'Belopp att lägga till ($)',
            targetDate: 'Måldatum (valfritt)',
            autoTracked: 'Autoföljda framsteg',
            autoTrackedShort: 'Auto',
            autoTrackedHelp: 'Framstegen räknas automatiskt från dina utgifter — inga manuella bidrag.',
            startingBalance: 'Ingående saldo',
            deadlineOptional: 'Deadline (valfritt)',
            newSavingsGoal: 'Nytt sparmål',
            newGoal: 'Nytt mål',
            editGoal: 'Redigera mål',
            editCutGoal: 'Redigera utgiftsminskningsmål',
            addContribution: 'Lägg till ett bidrag',
            takeSnapshotTitle: 'Ta en ögonblicksbild',
            netWorthIntro: 'En snabb logg över var du står. Inga konton att koppla.',
            of: 'av {amount}',
            daysLeft: '{n} dagar kvar',
            dueToday: 'Ska klaras idag',
            daysOverdue: '{n} dagar försenat',
            trackingStarts: 'Spårning startar efter din första hela månad.',
            targetReached: 'Mål uppnått',
            onTrack: 'På banan',
            behindBy: 'Efter med {amount}',
            projected: 'Prognos',
            status: 'Status',
            viewProgress: 'Visa framsteg'
        },
        signIn: {
            title: 'Välkommen tillbaka',
            subtitle: 'Logga in för att fortsätta följa din ekonomi.',
            signIn: 'Logga in',
            signUp: 'Registrera',
            createAccount: 'Skapa konto',
            createAccountSub: 'Börja följa det du behåller, inte bara det du spenderar.',
            forgot: 'Glömt lösenordet?',
            withPasskey: 'Logga in med passkey',
            setupPasskey: 'Skapa med passkey',
            or: 'eller',
            resetTitle: 'Återställ lösenord',
            resetSub: 'Vi skickar en återställningslänk till din e-post.',
            sendReset: 'Skicka återställningslänk',
            backToSignIn: 'Tillbaka till inloggning',
            footer: 'Skyddat av <strong>passkeys</strong> och end-to-end-kryptering (planerat)',
            emailHint: 'du@exempel.se',
            passwordHint: '••••••••',
            passwordMin: 'Minst 8 tecken',
            invalidEmail: 'Ange en giltig e-postadress.',
            passwordRequired: 'Lösenord krävs.',
            passwordTooShort: 'Lösenordet måste vara minst 8 tecken.',
            signingIn: 'Loggar in…',
            creatingAccount: 'Skapar konto…',
            sending: 'Skickar…',
            waitingPasskey: 'Väntar på passkey…',
            resetSent: 'Om e-postadressen finns har en återställningslänk skickats.',
            passkeyUnsupported: 'Passkeys stöds inte i denna webbläsare.',
            demoNote: '<strong>Demoläge.</strong> Vilken e-post och vilket lösenord som helst fungerar. Riktig autentisering tillkommer när en backend är ansluten.',
            tagline: 'Följ · Spara · Väx'
        }
    }
};

function t(path, vars) {
    const lookup = (root) => {
        let val = root;
        for (const p of path.split('.')) {
            if (val == null) return null;
            val = val[p];
        }
        return val;
    };
    let val = lookup(translations[language]);
    if (val == null) val = lookup(translations.en);
    if (typeof val !== 'string') return path;
    if (vars) {
        Object.keys(vars).forEach(k => {
            val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return val;
}

// Locale used for Intl helpers (currency, dates, numbers)
function activeLocale() {
    return language === 'sv' ? 'sv-SE' : 'en-US';
}

// Apply the current language to the DOM. Walks elements that opt in
// via data-i18n / data-i18n-placeholder / data-i18n-aria-label /
// data-i18n-title, and re-renders any dynamic content that includes
// translated strings inside JS templates.
function applyLanguage() {
    document.documentElement.lang = language === 'sv' ? 'sv' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const html = t(el.dataset.i18n);
        if (el.dataset.i18nHtml === 'true') el.innerHTML = html;
        else el.textContent = html;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    // Sidebar tab tooltips + aria labels are driven by data-tab + tabs.* keys
    document.querySelectorAll('.app-sidebar .tab[data-tab]').forEach(el => {
        const label = t('tabs.' + el.dataset.tab);
        el.dataset.label = label;
        el.setAttribute('aria-label', label);
    });
    // Re-run dynamic renders that bake translated strings into innerHTML
    if (typeof updateLabels === 'function') updateLabels();
    if (typeof updateMonthDisplay === 'function') updateMonthDisplay();
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof renderCategories === 'function') renderCategories();
    if (typeof renderGoals === 'function') renderGoals();
    if (typeof renderInsights === 'function') renderInsights();
    if (typeof renderSubscriptions === 'function') renderSubscriptions();
    if (typeof renderAccountsCard === 'function') renderAccountsCard();
    if (typeof updateCyclePreview === 'function') updateCyclePreview();
    if (typeof renderLanguageOptions === 'function') renderLanguageOptions();
    // Update tab title in topbar to match the active tab in the new language
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const titleEl = document.getElementById('topbarTitle');
        const meta = TAB_META && TAB_META[activeTab.dataset.tab];
        if (titleEl && meta) titleEl.textContent = t('tabs.' + activeTab.dataset.tab);
    }
}

function setLanguage(newLang) {
    if (newLang !== 'en' && newLang !== 'sv') return;
    language = newLang;
    setSetting('language', language);
    // Mirror to localStorage so the login page (no DB access) can pick it up.
    try { localStorage.setItem('language', language); } catch (e) {}
    applyLanguage();
}
