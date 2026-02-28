// ─── Difficulty Manager ─────────────────────────────────────
// Multi-dimensional ELO-style adaptive difficulty targeting ~75% accuracy
// Dimensions: flash duration, distractor count, distractor similarity, peripheral distance

import {
    DIFFICULTY_DEFAULTS,
    ACCURACY_WINDOW,
    ACCURACY_UPPER,
    ACCURACY_LOWER,
    SHAPES,
} from '../config/constants.js';

export class DifficultyManager {
    constructor(userDifficultyState = null) {
        if (userDifficultyState) {
            this.restore(userDifficultyState);
        } else {
            this.flashDuration = DIFFICULTY_DEFAULTS.flashDuration;
            this.distractorCount = DIFFICULTY_DEFAULTS.distractorCount;
            this.distractorSimilarity = DIFFICULTY_DEFAULTS.distractorSimilarity;
            this.peripheralDistance = DIFFICULTY_DEFAULTS.peripheralDistance;
            this.recentResults = [];       // rolling window of { correct, reactionMs, dimension }
            this.totalRounds = 0;
        }
    }

    // ─── ADAPT AFTER EACH ROUND ─────────────────────────────
    adapt(wasCorrect, reactionTimeMs) {
        this.totalRounds++;
        this.recentResults.push({ correct: wasCorrect, reactionMs: reactionTimeMs });
        if (this.recentResults.length > ACCURACY_WINDOW) {
            this.recentResults.shift();
        }

        const accuracy = this._rollingAccuracy();
        const reactionFactor = this._reactionFactor(reactionTimeMs);

        if (wasCorrect) {
            // Speed up more aggressively when player is fast AND accurate
            if (accuracy > ACCURACY_UPPER) {
                this._increaseDifficulty(reactionFactor);
            } else if (accuracy > ACCURACY_LOWER) {
                // In the sweet spot — subtle adjustments only
                this._nudgeDifficulty(reactionFactor);
            }
        } else {
            // Decrease difficulty — gentler penalty that scales with progress
            if (accuracy < ACCURACY_LOWER) {
                this._decreaseDifficulty();
            } else {
                // Single miss in a good run — minimal penalty
                this._gentleDecrease();
            }
        }
    }

    // ─── GETTERS ────────────────────────────────────────────
    getFlashDuration() {
        return Math.round(this.flashDuration);
    }

    getDistractorCount() {
        return Math.round(this.distractorCount);
    }

    getDistractorSimilarity() {
        return Math.min(1, Math.max(0, this.distractorSimilarity));
    }

    getPeripheralDistance() {
        return this.peripheralDistance;
    }

    getRollingAccuracy() {
        return this._rollingAccuracy();
    }

    getDifficultyLevel() {
        // 0-100 composite difficulty score for UI display
        const flashScore = Math.max(0, (450 - this.flashDuration) / 400) * 40;         // 0-40 pts
        const distractorScore = Math.max(0, (this.distractorCount - 6) / 12) * 20;     // 0-20 pts
        const similarityScore = this.distractorSimilarity * 20;                         // 0-20 pts
        const distanceScore = Math.max(0, (0.45 - this.peripheralDistance) / 0.2) * 20; // 0-20 pts
        return Math.min(100, Math.round(flashScore + distractorScore + similarityScore + distanceScore));
    }

    // ─── DIFFICULTY ADJUSTMENTS ─────────────────────────────
    _increaseDifficulty(reactionFactor) {
        // Primary: reduce flash duration (most impactful)
        const flashStep = reactionFactor > 0.7 ? 0.92 : 0.96;
        this.flashDuration = Math.max(30, this.flashDuration * flashStep);

        // Secondary: increase distractors (up to 18)
        if (this.totalRounds > 5 && this.distractorCount < 18) {
            this.distractorCount += 0.3;
        }

        // Tertiary: increase distractor similarity (0→1 slowly)
        if (this.totalRounds > 10 && this.distractorSimilarity < 1) {
            this.distractorSimilarity += 0.02;
        }

        // Quaternary: decrease peripheral distance (harder to spot)
        if (this.totalRounds > 15 && this.peripheralDistance > 0.22) {
            this.peripheralDistance -= 0.003;
        }
    }

    _nudgeDifficulty(reactionFactor) {
        // Very subtle adjustments — player is in the zone
        if (reactionFactor > 0.8) {
            this.flashDuration = Math.max(30, this.flashDuration * 0.99);
        }
    }

    _decreaseDifficulty() {
        // Scale penalty with progress — further you've pushed, smaller the penalty
        const progressFactor = Math.min(1, this.totalRounds / 50);
        const flashRecovery = 40 * (1 - progressFactor * 0.6); // 40ms early, ~16ms late

        this.flashDuration = Math.min(800, this.flashDuration + flashRecovery);

        // Pull back secondaries
        if (this.distractorCount > 8) this.distractorCount -= 0.5;
        if (this.distractorSimilarity > 0.05) this.distractorSimilarity -= 0.03;
        if (this.peripheralDistance < 0.42) this.peripheralDistance += 0.005;
    }

    _gentleDecrease() {
        // Single miss — barely noticeable
        this.flashDuration = Math.min(800, this.flashDuration + 8);
    }

    // ─── HELPERS ────────────────────────────────────────────
    _rollingAccuracy() {
        if (this.recentResults.length === 0) return 0.75; // default to target
        const correct = this.recentResults.filter(r => r.correct).length;
        return correct / this.recentResults.length;
    }

    _reactionFactor(reactionMs) {
        // 0 = slow (>5s), 1 = very fast (<500ms)
        return Math.max(0, Math.min(1, (5000 - reactionMs) / 4500));
    }

    // ─── GENERATE SIMILAR DISTRACTORS ───────────────────────
    generateDistractorShapes(targetShape, count) {
        const shapes = [];
        const similarity = this.getDistractorSimilarity();

        for (let i = 0; i < count; i++) {
            if (similarity > 0 && Math.random() < similarity * 0.6) {
                // Similar shape — pick shapes adjacent to target in the list
                const targetIdx = SHAPES.indexOf(targetShape);
                const offset = Math.random() < 0.5 ? 1 : -1;
                const adjacentIdx = (targetIdx + offset + SHAPES.length) % SHAPES.length;
                shapes.push(SHAPES[adjacentIdx]);
            } else {
                shapes.push(SHAPES[Math.floor(Math.random() * SHAPES.length)]);
            }
        }
        return shapes;
    }

    // ─── SERIALIZATION ──────────────────────────────────────
    getState() {
        return {
            flashDuration: this.flashDuration,
            distractorCount: this.distractorCount,
            distractorSimilarity: this.distractorSimilarity,
            peripheralDistance: this.peripheralDistance,
            recentResults: this.recentResults.slice(-ACCURACY_WINDOW),
            totalRounds: this.totalRounds,
        };
    }

    restore(state) {
        this.flashDuration = state.flashDuration ?? DIFFICULTY_DEFAULTS.flashDuration;
        this.distractorCount = state.distractorCount ?? DIFFICULTY_DEFAULTS.distractorCount;
        this.distractorSimilarity = state.distractorSimilarity ?? DIFFICULTY_DEFAULTS.distractorSimilarity;
        this.peripheralDistance = state.peripheralDistance ?? DIFFICULTY_DEFAULTS.peripheralDistance;
        this.recentResults = state.recentResults ?? [];
        this.totalRounds = state.totalRounds ?? 0;
    }
}
