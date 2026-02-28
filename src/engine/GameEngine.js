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

    // ─── FLASH SEQUENCE ─────────────────────────────────────
    async executeFlash() {
        if (this.state !== 'IDLE') return;

        this.ui.hideSystemMessage();
        this.ui.hideMiniStatus();
        this.uShape = null; this.uSat = null; this.uColor = null; this.uDir = null;

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
            const { sessionSalt } = result.data;

            // Secure local generation (Blind Auth)
            this.currentManifest = {
                targetShape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
                satShape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
                satColorIdx: Math.floor(Math.random() * L2_COLORS.length),
                satDirIdx: Math.floor(Math.random() * 8),
                salt: sessionSalt,
            };
        } catch (error) {
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
        this.askTask('CENTER');

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

            } else if (this.state === 'IDLE') {
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
            this.inputLocked = false;
            this.lastSelectionIndex = -1;
            const u = this.user;

            if (this.currentTask === 'CENTER') {
                this.uShape = hit.key;
                this.askTask('SATELLITE');
            } else if (this.currentTask === 'SATELLITE') {
                this.uSat = hit.key;
                if (u.level2) this.askTask('COLOR');
                else if (u.level3) this.askTask('DIRECTION');
                else this.finalizeTrial();
            } else if (this.currentTask === 'COLOR') {
                this.uColor = hit.val;
                if (u.level3) this.askTask('DIRECTION');
                else this.finalizeTrial();
            } else if (this.currentTask === 'DIRECTION') {
                this.uDir = hit.val;
                this.finalizeTrial();
            }
        }, 320);
    }

    // ─── TRIAL FINALIZATION ─────────────────────────────────
    async finalizeTrial() {
        const u = this.user;
        this.state = 'IDLE';
        this.ui.hideMiniStatus();
        const reactionTimeMs = Date.now() - this.roundStartTime;

        const prevTier = u.level3 ? "T3" : (u.level2 ? "T2" : "T1");

        this.ui.showValidating();
        this.isValidating = true;

        try {
            const result = await submitRound({
                userId: this.currentUser,
                manifest: this.currentManifest,
                answer: {
                    uShape: this.uShape,
                    uSat: this.uSat,
                    uColor: (this.uColor !== null) ? this.uColor : undefined,
                    uDir: (this.uDir !== null) ? this.uDir : undefined,
                },
                speed: u.speed,
            });

            const serverData = result.data;
            this.isValidating = false;
            const correct = serverData.correct;
            const prevSpeed = u.speed;

            // Adapt difficulty using DifficultyManager
            this.difficulty.adapt(correct, reactionTimeMs);

            // Sync speed for cloud (keep server happy)
            u.speed = this.difficulty.getFlashDuration();

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
                    u.level2 = (serverData.newTier === 'T2' || serverData.newTier === 'T3');
                    u.level3 = (serverData.newTier === 'T3');
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
                if (u.streak > 3 && reactionTimeMs < 2000) {
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
            }

            // Update sync bar
            this.ui.updateSyncBar(prevSpeed, u.speed, correct);

            // Save difficulty state
            u.difficulty = this.difficulty.getState();

            u.history.push(Math.round(u.speed));
            u.resultsHistory.push({ correct, date: new Date().toISOString().split('T')[0] });

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
                    u.trainingBlock = Math.floor(u.sessions.length / 7);
                    saveAppData(this.appData);
                    this.ui.onSessionEnd?.(summary);
                }
            }

        } catch (e) {
            this.isValidating = false;
            console.error("Validation Error", e);
            this.ui.showNetworkError();
        }

        this.ui.unlockStartButton();
    }
}
