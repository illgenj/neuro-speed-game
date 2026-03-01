// ─── Game Engine ────────────────────────────────────────────
// Core state machine: IDLE → FLASHING → QUESTIONING → (finalize) → IDLE
import { SHAPES, L2_COLORS, QUESTION_TIMEOUT_MS, DIR_MAP } from '../config/constants.js';
import { getGameRound, submitRound } from '../services/firebase.js';
import { saveAppData } from '../services/storage.js';
import { Renderer } from './Renderer.js';
import { AudioSystem } from './AudioSystem.js';
import { DifficultyManager } from './DifficultyManager.js';
import { SessionManager } from './SessionManager.js';

export class GameEngine {
    constructor(canvas, appData, uiCallbacks) {
        this.canvas = canvas;
        this.appData = appData;
        this.ui = uiCallbacks;

        this.renderer = new Renderer(canvas);
        this.audio = new AudioSystem();
        this.difficulty = new DifficultyManager();
        this.session = new SessionManager();

        // Game state
        this.state = 'IDLE';
        this.currentTask = null;
        this.selectionBoxes = [];
        this.currentManifest = null;
        this.uShape = null;
        this.uSat = null;
        this.uColor = null;
        this.uDir = null;
        this.sessionZone = 0;
        this.activeDistractors = [];
        this.lastFlashRadius = 0;
        this.inputLocked = false;
        this.lastSelectionIndex = -1;
        this.animFrameId = null;
        this.questionTimerStart = 0;
        this.isTimedOut = false;
        this.lastTickTime = 0;
        this.screenShake = 0;
        this.roundStartTime = 0; // Track when round started for reaction time
    }

    get currentUser() {
        return this.appData.currentUser;
    }

    get mode() {
        return this.currentMode || 'STANDARD';
    }

    get user() {
        return this.appData.users[this.appData.currentUser];
    }

    resize() {
        this.renderer.resize();
    }

    restoreSessionZone() {
        if (this.currentUser && this.user) {
            this.sessionZone = this.user.sessionZone || 0;
            // Restore difficulty state if saved
            if (this.user.difficulty) {
                this.difficulty = new DifficultyManager(this.user.difficulty);
            }
        }
    }

    abortRun() {
        this.state = 'IDLE';
        this.isValidating = false;
        this.inputLocked = false;
        this.sessionZone = 0;
        this.renderer.clear();
        this.renderer.drawNeuralNetwork(this.sessionZone);
        this.renderer.drawEchoes();
        this.renderer.drawReticle(this.sessionZone);

        // Force the daily attempt dates locally so they cannot refresh to try again
        if (this.user && this.mode !== 'STANDARD') {
            const today = new Date().toISOString().split('T')[0];
            if (this.mode === 'DAILY_CASUAL') this.user.dailyCasualDate = today;
            if (this.mode === 'DAILY_DEATH') this.user.dailyDeathDate = today;
        }

        const summary = this.session.endSession();
        if (this.ui.onSessionEnd) this.ui.onSessionEnd(summary);
    }

    // ─── FLASH SEQUENCE ─────────────────────────────────────
    async executeFlash() {
        if (this.state !== 'IDLE') return;

        this.state = 'FETCHING';
        this.ui.hideSystemMessage();
        this.ui.hideMiniStatus();
        this.uShape = null; this.uSat = null; this.uColor = null; this.uDir = null;
        this.uTargetColor = undefined; this.uSat2Shape = undefined; this.uSat2Dir = undefined; this.uSolid = undefined;

        if (!this.currentUser) {
            this.ui.showUserMenu();
            return;
        }

        // Auto-start session if not active
        if (!this.session.isSessionActive()) {
            this.session.startSession();
            this.ui.onSessionStart?.();
        }

        this.ui.hideSyncVis();
        this.ui.showMiniStatus("ESTABLISHING UPLINK...", this.user.sessions ? this.user.sessions.length : 0);

        try {
            const result = await getGameRound({ userId: this.currentUser });
            const serverData = result.data;

            // Use server-provided seed/shapes for consistent validation
            this.currentManifest = {
                targetShape: serverData.targetShape,
                satShape: serverData.satShape,
                satColorIdx: serverData.satColorIdx,
                satDirIdx: serverData.satDirIdx,
                targetColorIdx: serverData.targetColorIdx,
                sat2Shape: serverData.sat2Shape,
                sat2DirIdx: serverData.sat2DirIdx,
                targetSolid: serverData.targetSolid,
                salt: serverData.sessionSalt,
            };
        } catch (error) {
            this.state = 'IDLE';
            console.error("Server Link Failed", error);
            this.ui.triggerSystemMessage("SERVER LINK LOST", "alert");
            this.ui.hideMiniStatus();
            return;
        }

        this.state = 'FLASHING';
        this.isTimedOut = false;
        this.roundStartTime = Date.now();
        this.ui.hideMiniStatus();
        this.ui.hideSystemMessage();

        const u = this.user;

        if (this.mode !== 'STANDARD' && (!this.session.isSessionActive() || this.session.getSessionStats().roundsPlayed === 0)) {
            // Start from scratch every time
            this.difficulty = new DifficultyManager();

            // Override UI Tier flags locally for this session
            u.tier = 'T1';
            u.level2 = false;
            u.level3 = false;
            u.level4 = false;
            u.level5 = false;
            u.level6 = false;
            u.speed = this.difficulty.getFlashDuration();
        }

        this.isAnomalyRound = false;
        if (u.level2 && Math.random() < 0.1) {
            this.isAnomalyRound = true;
            this.ui.triggerSystemMessage("ANOMALY DETECTED: TEMPORAL COMPRESSION", "alert", u.sessions ? u.sessions.length : 0);
            this.renderer.screenShake = 10;
        }

        // Use DifficultyManager for peripheral distance
        const peripheralDist = this.difficulty.getPeripheralDistance();
        this.lastFlashRadius = this.renderer.minDim * peripheralDist;

        // Use DifficultyManager for distractor count and shapes
        const distractorCount = this.difficulty.getDistractorCount();
        const angle = this.currentManifest.satDirIdx * Math.PI * 0.25;
        this.activeDistractors = [];
        const step = (Math.PI * 2) / distractorCount;
        const distractorShapes = this.difficulty.generateDistractorShapes(
            this.currentManifest.targetShape, distractorCount
        );

        for (let i = 0; i < distractorCount; i++) {
            const a = i * step;
            if (Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle))) > 0.6) {
                this.activeDistractors.push({
                    x: this.renderer.centerX + Math.cos(a) * this.lastFlashRadius + (Math.random() - 0.5) * 20,
                    y: this.renderer.centerY + Math.sin(a) * this.lastFlashRadius + (Math.random() - 0.5) * 20,
                    shape: distractorShapes[i] || SHAPES[Math.floor(Math.random() * SHAPES.length)],
                });
            }
        }

        this.audio.playGame('flash', this.sessionZone);
        let startTime = null;
        let staticPlayed = false;

        // Use DifficultyManager for flash duration instead of u.speed
        let flashDuration = this.difficulty.getFlashDuration();
        if (this.isAnomalyRound) {
            flashDuration = Math.max(50, flashDuration * 0.5); // Halved duration for anomaly
        }

        const animate = (now) => {
            if (!startTime) startTime = now;
            const elapsed = now - startTime;

            if (elapsed < flashDuration) {
                // Phase 1: Show shapes
                this.renderer.drawFlashScene(this.currentManifest, u, this.lastFlashRadius, this.activeDistractors);
                this.animFrameId = requestAnimationFrame(animate);
            } else if (elapsed < flashDuration + 60) {
                // Phase 2: Static burst
                if (!staticPlayed) { this.audio.playGame('static'); staticPlayed = true; }
                this.renderer.drawStatic(0.15);
                this.animFrameId = requestAnimationFrame(animate);
            } else {
                // Phase 3: Question
                this.state = 'QUESTIONING';
                this.inputLocked = false;
                this.startQuestionLoop();
            }
        };
        this.animFrameId = requestAnimationFrame(animate);
    }

    // ─── QUESTION LOOP ──────────────────────────────────────
    startQuestionLoop() {
        const u = this.user;
        this.questionQueue = ['CENTER']; // Always start with core shape

        if (u.level4 || u.level5 || u.level6) {
            // T4+ Interrogation Roulette (Random 3 additional max)
            const pool = ['SATELLITE'];
            if (u.level2) pool.push('COLOR');
            if (u.level3 || u.level4 || u.level5 || u.level6) pool.push('DIRECTION');
            if (u.level4 || u.level5 || u.level6) pool.push('TARGET_COLOR');
            if (u.level5 || u.level6) { pool.push('SAT2_SHAPE', 'SAT2_DIR'); }
            if (u.level6) pool.push('POLARITY');

            // Shuffle and pick 3 max to prevent fatigue at 150ms
            pool.sort(() => 0.5 - Math.random());
            this.questionQueue.push(...pool.slice(0, 3));
        } else {
            // Standard T1-T3 sequential
            this.questionQueue.push('SATELLITE');
            if (u.level2) this.questionQueue.push('COLOR');
            if (u.level3) this.questionQueue.push('DIRECTION');
        }

        this.askTask(this.questionQueue.shift());

        const loop = (now) => {
            // Screen shake
            if (this.screenShake > 0.5) {
                this.renderer.ctx.save();
                const dx = (Math.random() - 0.5) * this.screenShake;
                const dy = (Math.random() - 0.5) * this.screenShake;
                this.renderer.ctx.translate(dx, dy);
                this.renderer.ctx.globalCompositeOperation = "lighter";
                this.screenShake *= 0.9;
            }

            if (this.state === 'QUESTIONING') {
                if (!this.questionTimerStart) this.questionTimerStart = now;
                const elapsed = now - this.questionTimerStart;
                const remaining = QUESTION_TIMEOUT_MS - elapsed;

                if (remaining <= 0) {
                    if (!this.isTimedOut) {
                        this.isTimedOut = true;
                        this.ui.triggerSystemMessage("NEURAL LINK SEVERED (TIMEOUT)", "alert", this.user.sessions ? this.user.sessions.length : 0);
                        this.uShape = null;
                        this.finalizeTrial();
                    }
                    if (this.screenShake > 0.5) this.renderer.ctx.restore();
                    return;
                }

                if (remaining < 5000) {
                    if (now - this.lastTickTime > 1000) {
                        this.audio.playGame('timer');
                        this.lastTickTime = now;
                    }
                }

                const timerPct = Math.max(0, remaining / QUESTION_TIMEOUT_MS);
                this.renderer.drawQuestionUI(this.currentTask, this.selectionBoxes, this.lastSelectionIndex, timerPct);

                // Draw session timer if session active
                if (this.session.isSessionActive()) {
                    const stats = this.session.getSessionStats();
                    this.renderer.drawSessionTimer(stats.elapsedMs, stats.targetMs, stats.roundsPlayed);
                }

                this.animFrameId = requestAnimationFrame(loop);

            } else if (this.state === 'IDLE' || this.state === 'VALIDATING' || this.state === 'FETCHING') {
                this.renderer.clear();
                this.renderer.drawNeuralNetwork(this.sessionZone);
                this.renderer.drawEchoes();
                this.renderer.drawReticle(this.sessionZone);
                this.renderer.updateAndDrawParticles();

                if (this.isValidating) {
                    this.renderer.drawConspiracyOverlay();
                }

                // Draw session timer in idle too
                if (this.session.isSessionActive()) {
                    const stats = this.session.getSessionStats();
                    this.renderer.drawSessionTimer(stats.elapsedMs, stats.targetMs, stats.roundsPlayed);
                }

                this.animFrameId = requestAnimationFrame(loop);
            }

            if (this.screenShake > 0.5) this.renderer.ctx.restore();
        };

        this.animFrameId = requestAnimationFrame(loop);
    }

    askTask(type) {
        this.currentTask = type;
        this.questionTimerStart = Date.now();
    }

    // ─── INPUT HANDLING ─────────────────────────────────────
    handleCanvasInput(e) {
        if (this.state !== 'QUESTIONING' || this.inputLocked) return;
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0);
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        this.renderer.addRipple(x, y);
        const hit = this.selectionBoxes.find(b => x > b.x1 && x < b.x2 && y > b.y1 && y < b.y2);
        if (hit) this.processHit(hit);
    }

    handleKeyInput(key) {
        if (this.state !== 'QUESTIONING' || this.inputLocked) return;

        if (this.currentTask !== 'DIRECTION' && /^[1-9]$/.test(key)) {
            const idx = parseInt(key) - 1;
            const hit = this.selectionBoxes.find(b => b.val === idx);
            if (hit) this.processHit(hit);
        }

        if (this.currentTask === 'DIRECTION') {
            let dirId = -1;
            const dir = DIR_MAP.find(d => d.label === key);
            if (dir) dirId = dir.id;

            if (key === "ArrowRight") dirId = 0;
            else if (key === "ArrowDown") dirId = 2;
            else if (key === "ArrowLeft") dirId = 4;
            else if (key === "ArrowUp") dirId = 6;

            if (dirId !== -1) {
                const hit = this.selectionBoxes.find(b => b.val === dirId);
                if (hit) this.processHit(hit);
            }
        }
    }

    processHit(hit) {
        this.lastSelectionIndex = hit.val;
        this.inputLocked = true;
        this.audio.playUI('lock');
        this.renderer.spawnParticles(hit.cx, hit.cy, 'var(--accent)');

        setTimeout(() => {
            if (this.state !== 'QUESTIONING') return; // Prevent progressing if timed out
            this.inputLocked = false;
            this.lastSelectionIndex = -1;
            const u = this.user;

            if (this.currentTask === 'CENTER') this.uShape = hit.key;
            else if (this.currentTask === 'SATELLITE') this.uSat = hit.key;
            else if (this.currentTask === 'COLOR') this.uColor = hit.val;
            else if (this.currentTask === 'DIRECTION') this.uDir = hit.val;
            else if (this.currentTask === 'TARGET_COLOR') this.uTargetColor = hit.val;
            else if (this.currentTask === 'SAT2_SHAPE') this.uSat2Shape = hit.key;
            else if (this.currentTask === 'SAT2_DIR') this.uSat2Dir = hit.val;
            else if (this.currentTask === 'POLARITY') this.uSolid = hit.val;

            if (this.questionQueue.length > 0) {
                this.askTask(this.questionQueue.shift());
            } else {
                this.finalizeTrial();
            }
        }, 320);
    }

    // ─── TRIAL FINALIZATION ─────────────────────────────────
    async finalizeTrial() {
        if (this.state !== 'QUESTIONING') return; // Prevent double firing

        const u = this.user;
        this.state = 'VALIDATING';
        this.ui.hideMiniStatus();
        const reactionTimeMs = Date.now() - this.roundStartTime;

        const prevTier = u.level3 ? "T3" : (u.level2 ? "T2" : "T1");

        this.ui.showValidating();
        this.isValidating = true;

        try {
            // Strip undefined/null so JSON stringify drops them completely
            const answerPayload = {};
            if (this.uShape !== null && this.uShape !== undefined) answerPayload.uShape = this.uShape;
            if (this.uSat !== null && this.uSat !== undefined) answerPayload.uSat = this.uSat;
            if (this.uColor !== null && this.uColor !== undefined) answerPayload.uColor = this.uColor;
            if (this.uDir !== null && this.uDir !== undefined) answerPayload.uDir = this.uDir;
            if (this.uTargetColor !== null && this.uTargetColor !== undefined) answerPayload.uTargetColor = this.uTargetColor;
            if (this.uSat2Shape !== null && this.uSat2Shape !== undefined) answerPayload.uSat2Shape = this.uSat2Shape;
            if (this.uSat2Dir !== null && this.uSat2Dir !== undefined) answerPayload.uSat2Dir = this.uSat2Dir;
            if (this.uSolid !== null && this.uSolid !== undefined) answerPayload.uSolid = this.uSolid;

            const result = await submitRound({
                userId: this.currentUser,
                manifest: this.currentManifest,
                answer: answerPayload,
                speed: this.mode === 'STANDARD' ? u.speed : this.difficulty.getFlashDuration(),
                mode: this.mode
            });

            const serverData = result.data;
            this.isValidating = false;

            // Sync server properties immediately to eliminate race conditions
            if (this.mode === 'STANDARD') {
                if (serverData.newScore !== undefined) {
                    u.score = serverData.newScore;
                    if (!u.peakScore) u.peakScore = 0;
                    if (u.score > u.peakScore) u.peakScore = u.score;
                }
                if (serverData.newTier) u.tier = serverData.newTier;
            } else {
                if (this.mode === 'DAILY_CASUAL') {
                    u.dailyCasualScore = serverData.newScore || 0;
                    u.dailyCasualDate = new Date().toISOString().split('T')[0];
                }
                if (this.mode === 'DAILY_DEATH') {
                    u.dailyDeathScore = serverData.newScore || 0;
                    u.dailyDeathDate = new Date().toISOString().split('T')[0];
                }
            }

            const correct = serverData.correct;
            const prevSpeed = this.mode === 'STANDARD' ? u.speed : this.difficulty.getFlashDuration();

            // Adapt difficulty using DifficultyManager
            this.difficulty.adapt(correct, reactionTimeMs);

            // Sync speed for cloud (keep server happy) only on standard
            if (this.mode === 'STANDARD') {
                u.speed = this.difficulty.getFlashDuration();
            }

            // Record round in session
            this.session.recordRound({
                correct,
                reactionMs: reactionTimeMs,
                flashDuration: this.difficulty.getFlashDuration(),
                difficultyLevel: this.difficulty.getDifficultyLevel(),
            });

            if (correct) {
                this.sessionZone++;
                this.audio.playGame('success', this.sessionZone);
                u.streak = Math.max(0, u.streak) + 1;

                this.ui.showResult(true, serverData.newScore);

                // Perfect hit combo and supernova effect
                if (reactionTimeMs < 1200) {
                    this.renderer.spawnParticles(this.renderer.centerX, this.renderer.centerY, '#facc15');
                    this.renderer.spawnParticles(this.renderer.centerX, this.renderer.centerY, '#38bdf8');
                    const combo = Math.min(5, Math.floor(this.sessionZone / 3) + 1);
                    if (combo > 1) {
                        this.ui.showMiniStatus(`SYNC MULTIPLIER: x${combo}`, u.sessions ? u.sessions.length : 0);
                    }
                }

                if (serverData.newTier && serverData.newTier !== prevTier) {
                    const tr = serverData.newTier;
                    u.level2 = ['T2', 'T3', 'T4', 'T5', 'T6'].includes(tr);
                    u.level3 = ['T3', 'T4', 'T5', 'T6'].includes(tr);
                    u.level4 = ['T4', 'T5', 'T6'].includes(tr);
                    u.level5 = ['T5', 'T6'].includes(tr);
                    u.level6 = (tr === 'T6');

                    this.ui.triggerSystemMessage(`PROMOTION: ${serverData.newTier} UNLOCKED`, "upgrade");
                }

                // Add echoes
                const angle = this.currentManifest.satDirIdx * Math.PI * 0.25;
                const satX = this.renderer.centerX + Math.cos(angle) * this.lastFlashRadius;
                const satY = this.renderer.centerY + Math.sin(angle) * this.lastFlashRadius;
                this.renderer.addEcho(this.currentManifest.targetShape, this.renderer.centerX, this.renderer.centerY, this.renderer.minDim * 0.06, '#fff');
                this.renderer.addEcho(this.currentManifest.satShape, satX, satY, this.renderer.minDim * 0.05,
                    u.level2 ? L2_COLORS[this.currentManifest.satColorIdx] : '#8b5cf6');

                // Velocity surge feedback at high streaks
                if (u.streak > 0 && u.streak % 5 === 0 && reactionTimeMs < 2000) {
                    this.ui.showMiniStatus(">>> VELOCITY SURGE <<<", u.sessions ? u.sessions.length : 0);
                    this.screenShake = 5;
                }
            } else {
                // Fail
                this.isValidating = false;
                this.screenShake = 15;
                this.sessionZone = 0;
                this.audio.playGame('fail');
                u.streak = Math.min(0, u.streak) - 1;
                this.renderer.clearEchoes();

                const reason = (this.isTimedOut || serverData.reason === "TEMPORAL_ANOMALY") ? "SYNC TIMEOUT" : "SYNC LOST";
                this.ui.showResult(false, null, reason);

                if (this.mode === 'DAILY_DEATH') {
                    // Death mode ends immediately on fail
                    setTimeout(() => {
                        this.abortRun();
                    }, 500);
                    return;
                }
            }

            // Update sync bar
            this.ui.updateSyncBar(prevSpeed, u.speed, correct);

            // Save difficulty state
            if (this.mode === 'STANDARD') {
                u.difficulty = this.difficulty.getState();
            }

            u.history.push(Math.round(u.speed));
            if (u.history.length > 500) u.history.shift();

            u.resultsHistory.push({ correct, reactionMs: reactionTimeMs, date: new Date().toISOString().split('T')[0] });
            if (u.resultsHistory.length > 500) u.resultsHistory.shift();

            saveAppData(this.appData);
            this.ui.updateUI();

            // Notify main.js of round completion for achievements & audio
            this.ui.onRoundComplete?.({
                correct,
                reactionMs: reactionTimeMs,
                streak: u.streak,
                sessionZone: this.sessionZone,
                difficultyLevel: this.difficulty.getDifficultyLevel(),
            });
            if (this.session.shouldEndSession()) {
                const summary = this.session.endSession();
                if (summary) {
                    // Save session to user history
                    if (!u.sessions) u.sessions = [];
                    u.sessions.push(summary);
                    if (!u.totalSessions) u.totalSessions = u.sessions.length;
                    u.totalSessions++;
                    if (u.sessions.length > 100) u.sessions.shift();

                    u.trainingBlock = Math.floor(u.totalSessions / 7);
                    saveAppData(this.appData);
                    this.ui.onSessionEnd?.(summary);
                }
            }

        } catch (e) {
            this.isValidating = false;
            this.state = 'IDLE';
            console.error("Validation Error", e);
            this.ui.showNetworkError();
        }

        this.state = 'IDLE';
        this.ui.unlockStartButton();
    }
}
