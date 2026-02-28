// ─── Session Manager ────────────────────────────────────────
// Structured training sessions inspired by NIH ACTIVE study protocol
// Tracks session time, rounds, performance, and booster scheduling

import { SESSION_TARGET_MS, TRAINING_BLOCK_SIZE, BOOSTER_INTERVALS_DAYS } from '../config/constants.js';

export class SessionManager {
    constructor() {
        this.active = false;
        this.startTime = 0;
        this.rounds = [];
        this.pausedDuration = 0;
    }

    // ─── SESSION LIFECYCLE ──────────────────────────────────
    startSession() {
        this.active = true;
        this.startTime = Date.now();
        this.rounds = [];
        this.pausedDuration = 0;
    }

    recordRound(result) {
        if (!this.active) return;
        this.rounds.push({
            correct: result.correct,
            reactionMs: result.reactionMs,
            flashDuration: result.flashDuration,
            difficulty: result.difficultyLevel,
            timestamp: Date.now(),
        });
    }

    endSession() {
        if (!this.active) return null;
        this.active = false;

        const stats = this.getSessionStats();
        return {
            date: new Date().toISOString(),
            durationMs: stats.elapsedMs,
            roundsPlayed: stats.roundsPlayed,
            accuracy: stats.accuracy,
            avgReactionMs: stats.avgReactionMs,
            bestReactionMs: stats.bestReactionMs,
            difficultyEnd: stats.difficultyLevel,
            speedTrend: stats.speedTrend,
        };
    }

    isSessionActive() {
        return this.active;
    }

    // ─── SESSION STATS ──────────────────────────────────────
    getSessionStats() {
        const now = Date.now();
        let elapsedMs = this.active ? (now - this.startTime - this.pausedDuration) : 0;
        // Cap the elapsed time at the target, preventing it from running to infinity while idle
        elapsedMs = Math.min(elapsedMs, SESSION_TARGET_MS);
        const roundsPlayed = this.rounds.length;

        if (roundsPlayed === 0) {
            return {
                elapsedMs,
                roundsPlayed: 0,
                accuracy: 0,
                avgReactionMs: 0,
                bestReactionMs: 0,
                difficultyLevel: 0,
                speedTrend: 'stable',
                targetMs: SESSION_TARGET_MS,
                progressPct: Math.min(100, (elapsedMs / SESSION_TARGET_MS) * 100),
            };
        }

        const correct = this.rounds.filter(r => r.correct).length;
        const accuracy = Math.round((correct / roundsPlayed) * 100);
        const reactions = this.rounds.filter(r => r.correct).map(r => r.reactionMs);
        const avgReactionMs = reactions.length > 0
            ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
            : 0;
        const bestReactionMs = reactions.length > 0 ? Math.round(Math.min(...reactions)) : 0;

        // Speed trend (comparing first half vs second half)
        let speedTrend = 'stable';
        if (roundsPlayed >= 6) {
            const half = Math.floor(roundsPlayed / 2);
            const firstHalf = this.rounds.slice(0, half).filter(r => r.correct).map(r => r.flashDuration);
            const secondHalf = this.rounds.slice(half).filter(r => r.correct).map(r => r.flashDuration);
            if (firstHalf.length > 0 && secondHalf.length > 0) {
                const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
                const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
                if (avgSecond < avgFirst * 0.92) speedTrend = 'improving';
                else if (avgSecond > avgFirst * 1.08) speedTrend = 'declining';
            }
        }

        const lastRound = this.rounds[this.rounds.length - 1];

        return {
            elapsedMs,
            roundsPlayed,
            accuracy,
            avgReactionMs,
            bestReactionMs,
            difficultyLevel: lastRound ? lastRound.difficulty : 0,
            speedTrend,
            targetMs: SESSION_TARGET_MS,
            progressPct: Math.min(100, (elapsedMs / SESSION_TARGET_MS) * 100),
        };
    }

    shouldEndSession() {
        if (!this.active) return false;
        const elapsed = Date.now() - this.startTime - this.pausedDuration;
        return elapsed >= SESSION_TARGET_MS;
    }

    // ─── BOOSTER SCHEDULING ─────────────────────────────────
    static getBoosterStatus(sessions = [], lastBoosterDate = null) {
        if (sessions.length < TRAINING_BLOCK_SIZE) {
            return {
                isDue: false,
                nextIn: null,
                blocksCompleted: 0,
                sessionsInBlock: sessions.length,
                blockSize: TRAINING_BLOCK_SIZE,
            };
        }

        const blocksCompleted = Math.floor(sessions.length / TRAINING_BLOCK_SIZE);
        const lastSessionDate = sessions.length > 0
            ? new Date(sessions[sessions.length - 1].date)
            : null;

        const referenceDate = lastBoosterDate
            ? new Date(lastBoosterDate)
            : lastSessionDate;

        if (!referenceDate) {
            return { isDue: false, nextIn: null, blocksCompleted, sessionsInBlock: sessions.length % TRAINING_BLOCK_SIZE, blockSize: TRAINING_BLOCK_SIZE };
        }

        const daysSince = (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

        // Find the next applicable booster interval
        for (const interval of BOOSTER_INTERVALS_DAYS) {
            if (daysSince >= interval - 1 && daysSince <= interval + 3) {
                return {
                    isDue: true,
                    interval,
                    blocksCompleted,
                    sessionsInBlock: sessions.length % TRAINING_BLOCK_SIZE,
                    blockSize: TRAINING_BLOCK_SIZE,
                };
            }
        }

        return {
            isDue: false,
            nextIn: null,
            blocksCompleted,
            sessionsInBlock: sessions.length % TRAINING_BLOCK_SIZE,
            blockSize: TRAINING_BLOCK_SIZE,
        };
    }

    // ─── SESSION HISTORY ANALYTICS ──────────────────────────
    static getProgressSummary(sessions = []) {
        if (sessions.length === 0) {
            return { totalSessions: 0, totalRounds: 0, avgAccuracy: 0, bestAccuracy: 0, totalTimeHrs: 0 };
        }

        const totalRounds = sessions.reduce((s, sess) => s + sess.roundsPlayed, 0);
        const avgAccuracy = Math.round(sessions.reduce((s, sess) => s + sess.accuracy, 0) / sessions.length);
        const bestAccuracy = Math.max(...sessions.map(s => s.accuracy));
        const totalTimeMs = sessions.reduce((s, sess) => s + sess.durationMs, 0);

        return {
            totalSessions: sessions.length,
            totalRounds,
            avgAccuracy,
            bestAccuracy,
            totalTimeHrs: (totalTimeMs / 3600000).toFixed(1),
        };
    }
}
