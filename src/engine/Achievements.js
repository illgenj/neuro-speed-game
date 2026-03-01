// ─── Achievement System ─────────────────────────────────────
// 16 achievements across 5 categories with check logic

export const ACHIEVEMENT_DEFS = [
    // ── Speed ───────────────────────────────────────────────
    {
        id: 'quantum_reflexes',
        name: 'QUANTUM REFLEXES',
        desc: 'Achieve a reaction under 80ms',
        icon: '⚡',
        category: 'speed',
        color: '#f43f5e',
    },
    {
        id: 'lightspeed',
        name: 'LIGHTSPEED',
        desc: 'Achieve a reaction under 50ms',
        icon: '💫',
        category: 'speed',
        color: '#f43f5e',
    },
    {
        id: 'velocity_demon',
        name: 'VELOCITY DEMON',
        desc: '10 correct answers under 1.0s each',
        icon: '🔥',
        category: 'speed',
        color: '#f97316',
    },

    // ── Accuracy ────────────────────────────────────────────
    {
        id: 'sync_master',
        name: 'SYNC MASTER',
        desc: '90%+ accuracy in a session',
        icon: '🎯',
        category: 'accuracy',
        color: '#10b981',
    },
    {
        id: 'perfect_sync',
        name: 'PERFECT SYNC',
        desc: '100% accuracy in a session (5+ rounds)',
        icon: '💎',
        category: 'accuracy',
        color: '#06b6d4',
    },
    {
        id: 'cold_streak',
        name: 'COLD STREAK',
        desc: '10 correct answers in a row',
        icon: '❄️',
        category: 'accuracy',
        color: '#0ea5e9',
    },
    {
        id: 'inferno',
        name: 'INFERNO',
        desc: '20 correct answers in a row',
        icon: '🌋',
        category: 'accuracy',
        color: '#ef4444',
    },

    // ── Dedication ──────────────────────────────────────────
    {
        id: 'first_contact',
        name: 'FIRST CONTACT',
        desc: 'Complete your first training session',
        icon: '🛰️',
        category: 'dedication',
        color: '#a855f7',
    },
    {
        id: 'weekly_warrior',
        name: 'WEEKLY WARRIOR',
        desc: 'Complete 7 training sessions',
        icon: '🗓️',
        category: 'dedication',
        color: '#8b5cf6',
    },
    {
        id: 'neural_veteran',
        name: 'NEURAL VETERAN',
        desc: 'Complete 30 training sessions',
        icon: '🧠',
        category: 'dedication',
        color: '#6366f1',
    },
    {
        id: 'daily_grind',
        name: 'DAILY GRIND',
        desc: 'Maintain a 5-day daily streak',
        icon: '📅',
        category: 'dedication',
        color: '#14b8a6',
    },

    // ── Difficulty ──────────────────────────────────────────
    {
        id: 't2_unlocked',
        name: 'T2 UNLOCKED',
        desc: 'Reach Tier 2 classification',
        icon: '🔓',
        category: 'difficulty',
        color: '#f59e0b',
    },
    {
        id: 't3_unlocked',
        name: 'T3 UNLOCKED',
        desc: 'Reach Tier 3 classification',
        icon: '👑',
        category: 'difficulty',
        color: '#f59e0b',
    },
    {
        id: 'difficulty_50',
        name: 'ARCHITECT',
        desc: 'Reach difficulty level 50',
        icon: '🏗️',
        category: 'difficulty',
        color: '#0ea5e9',
    },
    {
        id: 'difficulty_80',
        name: 'TRANSCENDENT',
        desc: 'Reach difficulty level 80',
        icon: '✨',
        category: 'difficulty',
        color: '#a855f7',
    },

    // ── Exploration ─────────────────────────────────────────
    {
        id: 'night_owl',
        name: 'NIGHT OWL',
        desc: 'Train between midnight and 5am',
        icon: '🦉',
        category: 'exploration',
        color: '#6366f1',
    },
    {
        id: 'the_ruse',
        name: 'THE TRUTH',
        desc: 'Uncover the ulterior motive data processing feed',
        icon: '👁️',
        category: 'exploration',
        color: '#ef4444',
    },
];

/**
 * Check all achievements against current user state.
 * @param {Object} user - The user data object
 * @param {Object} context - Extra context from the round just played
 *   { reactionMs, correct, streak, sessionSummary, difficultyLevel }
 * @returns {Array} Array of newly unlocked achievement definitions
 */
export function checkAchievements(user, context = {}) {
    const unlocked = user.achievements || [];
    const unlockedIds = new Set(unlocked.map(a => a.id));
    const newUnlocks = [];

    const sessions = user.sessions || [];
    const lastSession = context.sessionSummary || (sessions.length > 0 ? sessions[sessions.length - 1] : null);

    for (const def of ACHIEVEMENT_DEFS) {
        if (unlockedIds.has(def.id)) continue;

        let earned = false;

        switch (def.id) {
            // Speed
            case 'quantum_reflexes':
                earned = context.reactionMs > 0 && context.reactionMs < 80 && context.correct;
                break;
            case 'lightspeed':
                earned = context.reactionMs > 0 && context.reactionMs < 50 && context.correct;
                break;
            case 'velocity_demon': {
                const hist = user.resultsHistory || [];
                const recent = hist.slice(-10);
                earned = recent.length >= 10 && recent.every(r => r.correct && r.reactionMs < 1000);
                break;
            }

            // Accuracy
            case 'sync_master':
                earned = lastSession && lastSession.accuracy >= 90;
                break;
            case 'perfect_sync':
                earned = lastSession && lastSession.accuracy === 100 && lastSession.roundsPlayed >= 5;
                break;
            case 'cold_streak':
                earned = user.streak >= 10;
                break;
            case 'inferno':
                earned = user.streak >= 20;
                break;

            // Dedication
            case 'first_contact':
                earned = sessions.length >= 1;
                break;
            case 'weekly_warrior':
                earned = sessions.length >= 7;
                break;
            case 'neural_veteran':
                earned = sessions.length >= 30;
                break;
            case 'daily_grind':
                earned = (user.dailyStreak || 0) >= 5;
                break;

            // Difficulty
            case 't2_unlocked':
                earned = !!user.level2;
                break;
            case 't3_unlocked':
                earned = !!user.level3;
                break;
            case 'difficulty_50':
                earned = (context.difficultyLevel || 0) >= 50;
                break;
            case 'difficulty_80':
                earned = (context.difficultyLevel || 0) >= 80;
                break;

            // Exploration
            case 'the_ruse':
                earned = !!context.theRuse;
                break;
            case 'night_owl': {
                const hour = new Date().getHours();
                earned = hour >= 0 && hour < 5;
                break;
            }
        }

        if (earned) {
            newUnlocks.push(def);
            if (!user.achievements) user.achievements = [];
            user.achievements.push({ id: def.id, unlockedAt: new Date().toISOString() });
        }
    }

    return newUnlocks;
}

/**
 * Get all achievements with their unlock status for the gallery.
 */
export function getAllAchievements(user) {
    const unlocked = new Map((user.achievements || []).map(a => [a.id, a.unlockedAt]));
    return ACHIEVEMENT_DEFS.map(def => ({
        ...def,
        unlocked: unlocked.has(def.id),
        unlockedAt: unlocked.get(def.id) || null,
    }));
}

/**
 * Get achievement progress summary.
 */
export function getAchievementProgress(user) {
    const unlockedCount = (user.achievements || []).length;
    return { unlocked: unlockedCount, total: ACHIEVEMENT_DEFS.length };
}
