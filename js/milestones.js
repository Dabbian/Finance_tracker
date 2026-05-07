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
