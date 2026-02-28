// ─── NEURO-SPEED ELITE 8.0 ──────────────────────────────────
// Main Entry Point — wires all modules together
import './styles/index.css';
import './styles/header.css';
import './styles/game.css';
import './styles/overlays.css';
import './styles/animations.css';

import { initFirebase } from './services/firebase.js';
import { saveAppData, loadAppData } from './services/storage.js';
import { subscribeToUser, unsubscribe, fetchLeaderboard } from './services/leaderboard.js';
import { lookupCloudUser, createLocalUser, checkDailyStreak, setPinForUser } from './services/auth.js';
import { GameEngine } from './engine/GameEngine.js';
import { SessionManager } from './engine/SessionManager.js';
import { checkAchievements, getAllAchievements, getAchievementProgress } from './engine/Achievements.js';
import { AnalyticsRenderer } from './ui/AnalyticsRenderer.js';
import { Toast } from './ui/Toast.js';
import { Onboarding } from './ui/Onboarding.js';
import { L2_COLORS, TRAINING_BLOCK_SIZE } from './config/constants.js';

// ─── APP STATE ──────────────────────────────────────────────
let appData = { users: {}, currentUser: null };
let pinResolver = null;
let lastDisplayedScore = 0;

// ─── MICRO-INTERACTION HELPERS ──────────────────────────────
function animateClass(el, className, duration = 500) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth; // force reflow
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
}

function showScoreChange(amount) {
    const label = document.createElement('span');
    label.className = `score-change-label ${amount >= 0 ? 'positive' : 'negative'}`;
    label.textContent = amount >= 0 ? `+${amount}` : `${amount}`;
    const scoreEl = els.scoreVal;
    const rect = scoreEl.getBoundingClientRect();
    label.style.left = `${rect.left + rect.width / 2}px`;
    label.style.top = `${rect.top - 4}px`;
    document.body.appendChild(label);
    setTimeout(() => label.remove(), 1300);
}

function addRipple(e, btn) {
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${(e.clientX || rect.left + rect.width / 2) - rect.left - 10}px`;
    ripple.style.top = `${(e.clientY || rect.top + rect.height / 2) - rect.top - 10}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

// ─── DOM REFS ───────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const els = {
    userDisplay: document.getElementById('user-display'),
    scoreVal: document.getElementById('score-val'),
    speedVal: document.getElementById('speed-val'),
    dailyStreakBadge: document.getElementById('daily-streak-badge'),
    modeIndicator: document.getElementById('mode-indicator'),
    zoneFill: document.getElementById('zone-fill'),
    zoneLabel: document.getElementById('zone-label'),
    systemMessage: document.getElementById('system-message'),
    miniStatus: document.getElementById('mini-status'),
    syncIndicator: document.getElementById('sync-indicator'),
    syncVisContainer: document.getElementById('sync-vis-container'),
    syncBarFill: document.getElementById('sync-bar-fill'),
    syncPercentage: document.getElementById('sync-percentage'),
    mainOverlay: document.getElementById('main-overlay'),
    msgTitle: document.getElementById('msg-title'),
    msgBody: document.getElementById('msg-body'),
    startBtn: document.getElementById('start-btn'),
    analyticsOverlay: document.getElementById('analytics-overlay'),
    chartCanvas: document.getElementById('chart-canvas'),
    leaderboardOverlay: document.getElementById('leaderboard-overlay'),
    lbLoading: document.getElementById('lb-loading'),
    lbList: document.getElementById('lb-list'),
    userOverlay: document.getElementById('user-overlay'),
    userList: document.getElementById('user-list'),
    newLinkOverlay: document.getElementById('new-link-overlay'),
    newAgentName: document.getElementById('new-agent-name'),
    pinOverlay: document.getElementById('pin-overlay'),
    pinTitle: document.getElementById('pin-title'),
    pinReason: document.getElementById('pin-reason'),
    pinInputContainer: document.getElementById('pin-input-container'),
    pinInputField: document.getElementById('pin-input-field'),
    confirmOverlay: document.getElementById('confirm-overlay'),
    securityZone: document.getElementById('security-zone'),
};

// ─── UI CALLBACKS FOR ENGINE ────────────────────────────────
const uiCallbacks = {
    triggerSystemMessage(text, type, userSessions = 0) {
        let display = text;
        const anomalyChance = Math.min(0.20, 0.02 + (userSessions * 0.005)); // Chance increases up to 20%
        if (Math.random() < anomalyChance) {
            const anomalies = [
                "CORRELATING RADAR/FLIR TRACKS",
                "ANALYZING METAMATERIAL ISOTOPES",
                "AAV KINEMATICS EXCEED LIMITS",
                "NHI BIOMETRIC PROFILE UPDATED",
                "LOCATING CRITICAL VULNERABILITIES"
            ];
            if (userSessions > 8) anomalies.push("GIMBAL ROTATION IN PROGRESS");
            if (userSessions > 15) anomalies.push("GOFAST INTERCEPT FAILED");
            if (userSessions > 25) anomalies.push("LOOK AT THAT THING, DUDE!");
            if (userSessions > 30) anomalies.push("IT'S ROTATING...");

            display = anomalies[Math.floor(Math.random() * anomalies.length)];
            setTimeout(() => { if (!els.systemMessage.classList.contains('hidden')) els.systemMessage.innerText = text; }, Math.max(200, 800 - (userSessions * 15)));
        }
        els.systemMessage.innerText = display;
        els.systemMessage.className = '';
        if (type === 'upgrade') { els.systemMessage.classList.add('sys-upgrade'); game.audio.playGame('levelUp'); }
        else if (type === 'info') els.systemMessage.classList.add('sys-info');
        else els.systemMessage.classList.add('sys-alert');
        requestAnimationFrame(() => els.systemMessage.classList.remove('hidden'));
        setTimeout(() => els.systemMessage.classList.add('hidden'), 3500);
    },
    hideSystemMessage() {
        els.systemMessage.classList.add('hidden');
    },
    showMiniStatus(text, userSessions = 0) {
        let display = text;
        const anomalyChance = Math.min(0.15, 0.01 + (userSessions * 0.004));
        if (Math.random() < anomalyChance) {
            const anomalies = ["SYNCING SATELLITE SENSORS", "ROUTING NIMITZ ENCOUNTER DATA", "UPLOAD COMPLETE: OMEGA"];
            if (userSessions > 5) anomalies.push("OVERRIDING LOCAL FIREWALL");
            if (userSessions > 15) anomalies.push("AAV SPLASH POINT LOGGED");

            display = anomalies[Math.floor(Math.random() * anomalies.length)];
            setTimeout(() => { els.miniStatus.innerHTML = `<span class="blink">●</span> ${text}`; }, Math.max(150, 600 - (userSessions * 10)));
        }
        els.miniStatus.innerHTML = `<span class="blink">●</span> ${display}`;
        els.miniStatus.style.opacity = '1';
    },
    hideMiniStatus() {
        els.miniStatus.style.opacity = '0';
    },
    updateUI() {
        updateUI();
    },
    showUserMenu() {
        showUserMenu();
    },
    hideSyncVis() {
        els.syncVisContainer.style.opacity = '0';
    },
    showValidating() {
        els.msgTitle.innerText = "VALIDATING...";
        els.mainOverlay.classList.remove('hidden');
    },
    showResult(correct, score, reason) {
        if (correct) {
            els.msgTitle.innerText = "SYNC STABLE";
            els.msgTitle.style.color = "#10b981";
            els.msgBody.innerText = `RATING: ${score}`;
            animateClass(document.getElementById('game-container'), 'flash-correct', 500);
        } else {
            els.msgTitle.innerText = reason || "SYNC LOST";
            els.msgTitle.style.color = "#ef4444";
            els.msgBody.innerText = "RATING DROPPED";
            animateClass(document.getElementById('game-container'), 'flash-wrong', 500);
        }
    },
    showNetworkError() {
        els.msgTitle.innerText = "NETWORK ERROR";
    },
    updateSyncBar(prevSpeed, newSpeed, correct) {
        const maxLatency = 1000;
        const oldPct = Math.max(0, Math.min(100, ((maxLatency - prevSpeed) / maxLatency) * 100));
        const newPct = Math.max(0, Math.min(100, ((maxLatency - newSpeed) / maxLatency) * 100));
        els.syncVisContainer.style.opacity = '1';
        const themeColor = correct ? 'var(--success)' : 'var(--fail)';
        els.syncBarFill.style.background = themeColor;
        els.syncBarFill.style.boxShadow = `0 0 15px ${themeColor}`;
        els.syncPercentage.style.color = themeColor;
        els.syncBarFill.style.transition = 'none';
        els.syncBarFill.style.width = `${oldPct}%`;
        els.syncPercentage.innerText = `${Math.round(oldPct)}%`;
        setTimeout(() => {
            els.syncBarFill.style.transition = 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
            els.syncBarFill.style.width = `${newPct}%`;
            els.syncPercentage.innerText = `${Math.round(newPct)}%`;
        }, 50);
    },
    unlockStartButton() {
        setTimeout(() => els.startBtn.classList.remove('locked-btn'), 500);
    },
    onSessionStart() {
        game.audio.startAmbient();
    },
    onSessionEnd(summary) {
        game.audio.stopAmbient();
        // Check session-based achievements
        if (appData.currentUser) {
            const u = appData.users[appData.currentUser];
            runAchievementCheck(u, { sessionSummary: summary });
        }
        showSessionSummary(summary);
    },
    onRoundComplete(context) {
        // context: { correct, reactionMs, streak, sessionZone, difficultyLevel }
        if (!appData.currentUser) return;
        const u = appData.users[appData.currentUser];

        // Streak chime
        if (context.correct && context.streak > 1) {
            game.audio.playStreak(context.streak);
        }

        // Zone transition sound at milestones
        if (context.correct && context.sessionZone > 0 && context.sessionZone % 5 === 0) {
            game.audio.playZoneTransition(context.sessionZone);
        }

        // Update ambient intensity
        game.audio.updateAmbientIntensity(context.sessionZone);

        // Check achievements
        runAchievementCheck(u, context);
    },
};

// ─── GAME ENGINE INIT ───────────────────────────────────────
const game = new GameEngine(canvas, appData, uiCallbacks);

// ─── UI FUNCTIONS ───────────────────────────────────────────
function hideOverlays() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
}

function updateUI() {
    const u = appData.users[appData.currentUser];
    if (!u) return;
    if (!u.peakScore) u.peakScore = 0;
    if (u.score > u.peakScore) u.peakScore = u.score;

    els.userDisplay.innerText = appData.currentUser;
    const currentDisplay = Math.floor(u.score || 0);

    // Animated score change
    const scoreDelta = currentDisplay - lastDisplayedScore;
    if (scoreDelta !== 0 && lastDisplayedScore !== 0) {
        showScoreChange(scoreDelta);
        animateClass(els.scoreVal, 'score-pop', 400);
        animateClass(els.scoreVal, scoreDelta > 0 ? 'rating-up' : 'rating-down', 1000);
    }
    lastDisplayedScore = currentDisplay;
    els.scoreVal.innerText = currentDisplay.toLocaleString();

    if (currentDisplay < u.peakScore * 0.5) els.scoreVal.style.color = 'var(--fail)';
    else if (currentDisplay > u.peakScore * 0.9) els.scoreVal.style.color = 'var(--success)';
    else els.scoreVal.style.color = 'var(--gold)';

    els.speedVal.innerText = Math.round(u.speed) + 'ms';
    els.dailyStreakBadge.innerText = `🔥 ${u.dailyStreak || 0}`;
    if ((u.dailyStreak || 0) >= 3) animateClass(els.dailyStreakBadge, 'streak-fire', 600);
    els.modeIndicator.innerText = u.level3 ? "T3" : (u.level2 ? "T2" : "T1");

    // Mark active stat
    const statAgent = document.getElementById('btn-analytics');
    if (statAgent) statAgent.classList.add('stat-active');

    const percentage = Math.min(game.sessionZone * 10, 100);
    const prevWidth = parseFloat(els.zoneFill.style.width) || 0;
    els.zoneFill.style.width = percentage + "%";

    // Zone burst effect on big jumps
    if (percentage > prevWidth && percentage % 50 === 0 && percentage > 0) {
        animateClass(document.getElementById('zone-container'), 'zone-burst', 800);
    }

    if (game.sessionZone >= 10) {
        els.zoneFill.style.background = "linear-gradient(90deg, #f59e0b, #ef4444)";
        els.zoneFill.classList.add('zone-gold');
        els.zoneLabel.innerText = "SINGULARITY: MAX";
        canvas.classList.add('singularity-glow');
    } else if (game.sessionZone >= 5) {
        els.zoneFill.style.background = "linear-gradient(90deg, #a855f7, #ec4899)";
        els.zoneFill.classList.add('zone-gold');
        els.zoneLabel.innerText = "OVERCLOCK: ACTIVE";
        canvas.classList.remove('singularity-glow');
    } else {
        els.zoneFill.style.background = "linear-gradient(90deg, var(--accent), #38bdf8)";
        els.zoneFill.classList.remove('zone-gold');
        els.zoneLabel.innerText = `SYNC STREAK: ${game.sessionZone}`;
        canvas.classList.remove('singularity-glow');
    }
}

function requestPin(title, reason, isAuth = true) {
    return new Promise((resolve) => {
        hideOverlays();
        els.pinTitle.innerText = title || "SECURITY CHECK";
        els.pinReason.innerText = reason || "ENTER KEY";
        if (isAuth) els.pinInputContainer.style.display = 'block';
        else els.pinInputContainer.style.display = 'none';
        els.pinInputField.value = "";
        els.pinOverlay.classList.remove('hidden');
        if (isAuth) setTimeout(() => els.pinInputField.focus(), 100);
        pinResolver = resolve;
    });
}

function initRealtimeSync(userId) {
    subscribeToUser(userId, (cloudData) => {
        const u = appData.users[userId];
        if (u) {
            u.score = cloudData.score || 0;
            u.speed = cloudData.speed;
            u.level2 = (cloudData.tier === 'T2' || cloudData.tier === 'T3');
            u.level3 = (cloudData.tier === 'T3');
            if (cloudData.pin && u.pin !== cloudData.pin) u.pin = cloudData.pin;
            saveAppData(appData);
            updateUI();
            els.syncIndicator.classList.add('syncing');
            setTimeout(() => els.syncIndicator.classList.remove('syncing'), 1000);
        }
    });
}

// ─── OVERLAY SCREENS ────────────────────────────────────────
function showUserMenu() {
    game.audio.playUI('click');
    unsubscribe();
    hideOverlays();
    els.userOverlay.classList.remove('hidden');
    els.userList.innerHTML = '';

    Object.keys(appData.users).forEach(name => {
        const btn = document.createElement('div');
        btn.className = 'a-card';
        btn.style.marginBottom = '8px';
        btn.style.cursor = 'pointer';
        const s = appData.users[name].score ? Math.floor(appData.users[name].score) : 0;
        btn.innerHTML = `<span class="l">${name}</span><span class="v" style="color:var(--gold)">${s} Rating</span>`;
        btn.onclick = () => {
            appData.currentUser = name;
            game.sessionZone = appData.users[name].sessionZone || 0;
            checkDailyStreak(appData.users[name]);
            saveAppData(appData);
            updateUI();
            hideOverlays();
            els.mainOverlay.classList.remove('hidden');
            initRealtimeSync(name);
        };
        els.userList.appendChild(btn);
    });
}

async function showLeaderboard() {
    game.audio.playUI('click');
    hideOverlays();
    els.leaderboardOverlay.classList.remove('hidden');
    els.lbList.innerHTML = '';
    els.lbLoading.style.display = 'block';

    try {
        const results = await fetchLeaderboard(20);
        els.lbLoading.style.display = 'none';
        results.forEach(data => {
            const acc = data.accuracy !== undefined ? Math.round(data.accuracy) + '%' : '--';
            const isSecure = data.pin ? '🔒' : '';
            const isYou = data.name === appData.currentUser;
            const rankClass = data.rank <= 3 ? `rank-${data.rank}` : 'rank-other';

            // Format timestamp
            let dateStr = '';
            if (data.timestamp) {
                const ts = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                const now = new Date();
                const diffDays = Math.floor((now - ts) / 86400000);
                if (diffDays === 0) dateStr = 'TODAY';
                else if (diffDays === 1) dateStr = 'YESTERDAY';
                else if (diffDays < 7) dateStr = `${diffDays}d AGO`;
                else dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            const row = document.createElement('div');
            row.className = `lb-row${isYou ? ' is-you' : ''}`;
            row.innerHTML = `
                <div class="lb-rank-badge ${rankClass}">${data.rank}</div>
                <div class="lb-name">
                    <span class="lb-tier">${data.tier}</span>${data.name}
                    ${isSecure ? `<span style="font-size:0.7em">${isSecure}</span>` : ''}
                    ${isYou ? '<span class="lb-you-badge">YOU</span>' : ''}
                </div>
                <div class="lb-right">
                    <span class="lb-score">${data.score.toLocaleString()}</span>
                    <div class="lb-sub">
                        <span class="lb-stat peak">⚡${Math.round(data.speed)}ms</span>
                        <span class="lb-stat acc">🎯${acc}</span>
                    </div>
                    ${dateStr ? `<div class="lb-date">${dateStr}</div>` : ''}
                </div>
            `;
            els.lbList.appendChild(row);
        });
    } catch (e) { console.error(e); }
}

function showAnalytics() {
    game.audio.playUI('click');
    hideOverlays();
    els.analyticsOverlay.classList.remove('hidden');
    const u = appData.users[appData.currentUser];

    // ─── Performance Tab ────────────────────────────────
    // Dual sparkline: speed history + accuracy trend
    const speedData = (u.history || []).slice(-40);
    const accuracyData = computeRollingAccuracy(u.resultsHistory || [], 40);
    setTimeout(() => {
        AnalyticsRenderer.drawDualChart(
            document.getElementById('chart-canvas'), speedData, accuracyData
        );
        AnalyticsRenderer.drawDifficultyRadar(
            document.getElementById('radar-canvas'), u.difficulty
        );
    }, 50);

    // Stats
    const acc = u.resultsHistory?.length > 0
        ? Math.round((u.resultsHistory.filter(r => r.correct).length / u.resultsHistory.length) * 100)
        : 0;
    document.getElementById('stat-peak').innerText = `${Math.round(Math.min(...(u.history || [450])))}ms`;
    document.getElementById('stat-acc-total').innerText = `${acc}%`;
    document.getElementById('stat-uptime').innerText = (u.totalTimeMs / 3600000).toFixed(1) + 'h';
    document.getElementById('stat-grade').innerText = acc > 90 ? 'S' : (acc > 80 ? 'A' : (acc > 65 ? 'B' : 'C'));
    document.getElementById('stat-sessions').innerText = (u.sessions || []).length;

    // Difficulty composite score
    if (u.difficulty) {
        const flashScore = Math.max(0, (450 - u.difficulty.flashDuration) / 400) * 40;
        const distractorScore = Math.max(0, (u.difficulty.distractorCount - 6) / 12) * 20;
        const similarityScore = (u.difficulty.distractorSimilarity || 0) * 20;
        const distanceScore = Math.max(0, (0.45 - u.difficulty.peripheralDistance) / 0.2) * 20;
        const composite = Math.min(100, Math.round(flashScore + distractorScore + similarityScore + distanceScore));
        document.getElementById('stat-difficulty').innerText = composite;
    } else {
        document.getElementById('stat-difficulty').innerText = '0';
    }

    // ─── Training History Tab ────────────────────────────
    const sessions = u.sessions || [];
    setTimeout(() => {
        AnalyticsRenderer.drawSessionHeatmap(
            document.getElementById('heatmap-canvas'), sessions
        );
        AnalyticsRenderer.drawTrainingProgress(
            document.getElementById('training-progress-container'),
            sessions.length, TRAINING_BLOCK_SIZE
        );
    }, 50);

    const list = document.getElementById('session-history-list');
    const empty = document.getElementById('history-empty');
    list.innerHTML = '';

    if (sessions.length === 0) {
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        // Show sessions in reverse chronological order
        sessions.slice().reverse().forEach((s, idx) => {
            const num = sessions.length - idx;
            const date = new Date(s.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const durMin = Math.floor(s.durationMs / 60000);
            const durSec = Math.floor((s.durationMs % 60000) / 1000);

            const trendClass = `trend-${s.speedTrend || 'stable'}`;
            const trendIcon = s.speedTrend === 'improving' ? '↑' : (s.speedTrend === 'declining' ? '↓' : '→');

            const card = document.createElement('div');
            card.className = 'session-card';
            card.innerHTML = `
                <div class="session-card-num">#${num}</div>
                <div class="session-card-body">
                    <div class="session-card-date">${dateStr} ${timeStr} · ${durMin}:${durSec.toString().padStart(2, '0')}</div>
                    <div class="session-card-stats">
                        <span>R${s.roundsPlayed}</span>
                        <span class="acc">🎯${s.accuracy}%</span>
                        <span class="spd">⚡${s.avgReactionMs}ms</span>
                        <span class="${trendClass}">${trendIcon}</span>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
    }

    // Tab switching
    document.querySelectorAll('.analytics-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.analytics-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-performance').classList.toggle('hidden', tab.dataset.tab !== 'performance');
            document.getElementById('tab-history').classList.toggle('hidden', tab.dataset.tab !== 'history');
        };
    });

    // Security button
    els.securityZone.innerHTML = '';
    if (!u.pin) {
        const btn = document.createElement('button');
        btn.className = 'action-btn secure-btn';
        btn.style.fontSize = '0.7rem';
        btn.style.padding = '12px';
        btn.innerHTML = '🛡️ LOCK ACCOUNT (ADD PIN)';
        btn.onclick = handleSetPin;
        els.securityZone.appendChild(btn);
    }
}

function computeRollingAccuracy(resultsHistory, windowSize) {
    if (!resultsHistory || resultsHistory.length === 0) return [];
    const data = resultsHistory.slice(-windowSize * 3); // take more for smoothing
    const result = [];
    const w = 5; // mini window for rolling average
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - w + 1);
        const slice = data.slice(start, i + 1);
        const correct = slice.filter(r => r.correct).length;
        result.push((correct / slice.length) * 100);
    }
    return result.slice(-windowSize);
}

async function handleSetPin() {
    const uName = appData.currentUser;
    const pin = await requestPin("LOCK ACCOUNT", "ENTER A NEW 4-DIGIT PIN");
    if (pin && pin.length === 4) {
        uiCallbacks.triggerSystemMessage("ENCRYPTING...", "info");
        const success = await setPinForUser(uName, pin, appData);
        if (success) uiCallbacks.triggerSystemMessage("ACCOUNT SECURED", "upgrade");
        else uiCallbacks.triggerSystemMessage("ENCRYPTION FAILED", "alert");
    } else {
        uiCallbacks.triggerSystemMessage("INVALID PIN", "alert");
    }
    hideOverlays();
    els.analyticsOverlay.classList.remove('hidden');
}

async function handleNewLinkAttempt() {
    const btn = document.getElementById('btn-create-link');
    const n = els.newAgentName.value.trim().toUpperCase();
    if (!n) return;
    btn.innerText = "SCANNING GRID...";

    try {
        const cloudData = await lookupCloudUser(n);
        if (cloudData) {
            let authenticated = true;
            if (cloudData.pin) {
                const enteredPin = await requestPin("RECOVERY MODE", `AGENT ${n} DETECTED. ENTER KEY.`);
                authenticated = (enteredPin === cloudData.pin);
            }
            if (authenticated) {
                appData.users[n] = createLocalUser(n, cloudData);
                appData.currentUser = n;
                saveAppData(appData);
                updateUI();
                hideOverlays();
                els.mainOverlay.classList.remove('hidden');
                initRealtimeSync(n);
                return;
            }
        }
    } catch (e) { console.error(e); }

    let pin = await requestPin("SECURE NEW LINK", "SET OPTIONAL 4-DIGIT PIN (OR LEAVE BLANK)");
    appData.users[n] = createLocalUser(n, null, pin);
    appData.currentUser = n;
    saveAppData(appData);
    updateUI();
    hideOverlays();
    els.mainOverlay.classList.remove('hidden');
    initRealtimeSync(n);
}

function initiateDeLink() {
    if (!appData.currentUser) return;
    hideOverlays();
    els.confirmOverlay.classList.remove('hidden');
}

function confirmDeLink() {
    const uName = appData.currentUser;
    if (appData.users[uName]) {
        delete appData.users[uName];
        appData.currentUser = null;
        saveAppData(appData);
        hideOverlays();
        uiCallbacks.triggerSystemMessage("NEURAL PATTERN PURGED", "alert");
        setTimeout(showUserMenu, 1000);
    }
}

// ─── EVENT WIRING ───────────────────────────────────────────
els.startBtn.onclick = () => {
    game.audio.init();
    game.audio.playUI('click');
    hideOverlays();
    Toast.clearAll();
    // Start ambient drone when beginning a round
    game.audio.startAmbient();
    setTimeout(() => game.executeFlash(), 300);
};

document.getElementById('btn-audio').onclick = () => {
    const enabled = game.audio.toggle();
    const btn = document.getElementById('btn-audio');
    const lbl = document.getElementById('audio-icon');
    if (enabled) { btn.classList.add('active'); lbl.innerText = "ON"; game.audio.playUI('click'); }
    else { btn.classList.remove('active'); lbl.innerText = "OFF"; }
};

document.getElementById('btn-user').onclick = showUserMenu;
document.getElementById('btn-analytics').onclick = showAnalytics;
document.getElementById('btn-analytics-2').onclick = showAnalytics;
document.getElementById('btn-leaderboard').onclick = showLeaderboard;
document.getElementById('btn-lb-main').onclick = showLeaderboard;

document.getElementById('btn-close-analytics').onclick = () => { hideOverlays(); els.mainOverlay.classList.remove('hidden'); };
document.getElementById('btn-close-lb').onclick = () => { hideOverlays(); els.mainOverlay.classList.remove('hidden'); };
document.getElementById('btn-close-user').onclick = () => { if (appData.currentUser) { hideOverlays(); els.mainOverlay.classList.remove('hidden'); } };
document.getElementById('btn-close-achievements').onclick = () => { hideOverlays(); showAnalytics(); };
document.getElementById('btn-achievements').onclick = () => { hideOverlays(); showAchievementGallery(); };

document.getElementById('btn-pin-confirm').onclick = () => {
    if (pinResolver) { pinResolver(els.pinInputField.value); pinResolver = null; }
    hideOverlays();
};
document.getElementById('btn-pin-cancel').onclick = () => {
    if (pinResolver) { pinResolver(null); pinResolver = null; }
    hideOverlays();
};
document.getElementById('btn-new-user').onclick = () => {
    hideOverlays();
    els.newLinkOverlay.classList.remove('hidden');
};
document.getElementById('btn-create-link').onclick = handleNewLinkAttempt;
document.getElementById('btn-cancel-link').onclick = () => { hideOverlays(); showUserMenu(); };

document.getElementById('btn-unlink-account').onclick = initiateDeLink;
document.getElementById('btn-confirm-yes').onclick = confirmDeLink;
document.getElementById('btn-confirm-no').onclick = () => { hideOverlays(); els.analyticsOverlay.classList.remove('hidden'); };

document.getElementById('secret-pixel').onclick = () => {
    uiCallbacks.triggerSystemMessage("UNAUTHORIZED ACCESS: NHI DATA PORTAL", "alert");
    const u = appData.users[appData.currentUser];
    if (u) {
        runAchievementCheck(u, { theRuse: true });
    }
};

// Onboarding
const onboarding = new Onboarding(() => showUserMenu());
document.getElementById('onboarding-next-btn').onclick = () => onboarding.next();

// Button ripple effects
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (btn) addRipple(e, btn);
});

window.addEventListener('resize', () => game.resize());
canvas.addEventListener('mousedown', (e) => game.handleCanvasInput(e));

let touchStartX = null;
let touchStartY = null;
let isSwipe = false;

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(10); // Haptic feedback
    if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwipe = false;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touchStartX === null || touchStartY === null) return;
    if (e.touches && e.touches.length > 0) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        // Require valid swipe dimension
        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
            isSwipe = true;
            touchStartX = null;
            touchStartY = null;
            if (Math.abs(dx) > Math.abs(dy)) {
                game.handleKeyInput(dx > 0 ? "ArrowRight" : "ArrowLeft");
            } else {
                game.handleKeyInput(dy > 0 ? "ArrowDown" : "ArrowUp");
            }
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!isSwipe) {
        game.handleCanvasInput(e.changedTouches ? e.changedTouches[0] : e);
    }
    touchStartX = null;
    touchStartY = null;
}, { passive: false });

window.addEventListener('keydown', (e) => game.handleKeyInput(e.key));

// ─── ACHIEVEMENTS ───────────────────────────────────────────
function runAchievementCheck(user, context) {
    // Compute difficulty level for context
    let difficultyLevel = context.difficultyLevel || 0;
    if (!difficultyLevel && user.difficulty) {
        const d = user.difficulty;
        const flashScore = Math.max(0, (450 - d.flashDuration) / 400) * 40;
        const distractorScore = Math.max(0, (d.distractorCount - 6) / 12) * 20;
        const similarityScore = (d.distractorSimilarity || 0) * 20;
        const distanceScore = Math.max(0, (0.45 - d.peripheralDistance) / 0.2) * 20;
        difficultyLevel = Math.min(100, Math.round(flashScore + distractorScore + similarityScore + distanceScore));
    }

    const newUnlocks = checkAchievements(user, { ...context, difficultyLevel });
    if (newUnlocks.length > 0) {
        // Play fanfare and show toasts
        game.audio.playAchievement();
        newUnlocks.forEach((def, i) => {
            setTimeout(() => Toast.showAchievement(def), i * 800);
        });
        saveAppData(appData);
    }
}

function showAchievementGallery() {
    hideOverlays();
    document.getElementById('achievement-overlay').classList.remove('hidden');
    const u = appData.users[appData.currentUser];
    const all = getAllAchievements(u);
    const progress = getAchievementProgress(u);

    document.getElementById('achievement-progress').innerText =
        `${progress.unlocked} / ${progress.total} UNLOCKED`;

    const grid = document.getElementById('achievement-grid');
    grid.innerHTML = '';

    // Group by category
    const categories = ['speed', 'accuracy', 'dedication', 'difficulty', 'exploration'];
    const categoryLabels = {
        speed: '⚡ SPEED',
        accuracy: '🎯 ACCURACY',
        dedication: '📅 DEDICATION',
        difficulty: '🔓 DIFFICULTY',
        exploration: '🔭 EXPLORATION',
    };

    categories.forEach(cat => {
        const items = all.filter(a => a.category === cat);
        if (items.length === 0) return;

        const header = document.createElement('div');
        header.className = 'achievement-category';
        header.innerText = categoryLabels[cat] || cat.toUpperCase();
        grid.appendChild(header);

        items.forEach(ach => {
            const card = document.createElement('div');
            card.className = `ach-card ${ach.unlocked ? 'unlocked' : 'locked'}`;
            card.style.setProperty('--ach-color', ach.color);

            let dateStr = '';
            if (ach.unlockedAt) {
                const d = new Date(ach.unlockedAt);
                dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            card.innerHTML = `
                <div class="ach-icon">${ach.icon}</div>
                <div class="ach-body">
                    <div class="ach-name">${ach.name}</div>
                    <div class="ach-desc">${ach.desc}</div>
                </div>
                ${ach.unlocked ? `<div class="ach-date">${dateStr}</div>` : ''}
            `;
            grid.appendChild(card);
        });
    });
}

// ─── SESSION SUMMARY ────────────────────────────────────────
function showSessionSummary(summary) {
    hideOverlays();
    const u = appData.users[appData.currentUser];
    const sessCount = u.sessions ? u.sessions.length : 0;
    const block = Math.floor((sessCount - 1) / TRAINING_BLOCK_SIZE) + 1;
    const inBlock = ((sessCount - 1) % TRAINING_BLOCK_SIZE) + 1;

    document.getElementById('session-summary-subtitle').innerText =
        `TRAINING BLOCK ${block} — SESSION ${inBlock}/${TRAINING_BLOCK_SIZE}`;
    document.getElementById('summary-rounds').innerText = summary.roundsPlayed;
    document.getElementById('summary-accuracy').innerText = `${summary.accuracy}%`;
    document.getElementById('summary-avg-reaction').innerText = `${summary.avgReactionMs}ms`;
    document.getElementById('summary-best-reaction').innerText = `${summary.bestReactionMs}ms`;

    const trendIcons = { improving: '📈 IMPROVING', declining: '📉 DECLINING', stable: '➡ STABLE' };
    document.getElementById('summary-trend').innerText = trendIcons[summary.speedTrend] || '➡ STABLE';
    document.getElementById('summary-difficulty').innerText = summary.difficultyEnd;

    const totalSec = Math.floor(summary.durationMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    document.getElementById('summary-duration').innerText = `DURATION: ${min}:${sec.toString().padStart(2, '0')}`;

    document.getElementById('session-summary-overlay').classList.remove('hidden');
}

document.getElementById('btn-continue-training').onclick = () => {
    hideOverlays();
    els.mainOverlay.classList.remove('hidden');
};
document.getElementById('btn-end-session').onclick = () => {
    hideOverlays();
    els.mainOverlay.classList.remove('hidden');
};

// ─── BOOSTER REMINDER ───────────────────────────────────────
function checkBooster() {
    if (!appData.currentUser) return;
    const u = appData.users[appData.currentUser];
    const status = SessionManager.getBoosterStatus(u.sessions || [], u.lastBoosterDate);
    if (status.isDue) {
        document.getElementById('booster-reminder-overlay').classList.remove('hidden');
    }
}

document.getElementById('btn-start-booster').onclick = () => {
    const u = appData.users[appData.currentUser];
    if (u) u.lastBoosterDate = new Date().toISOString();
    saveAppData(appData);
    hideOverlays();
    els.mainOverlay.classList.remove('hidden');
};
document.getElementById('btn-dismiss-booster').onclick = () => {
    hideOverlays();
    els.mainOverlay.classList.remove('hidden');
};

// ─── BOOT ───────────────────────────────────────────────────
function boot() {
    initFirebase();
    game.resize();

    const saved = loadAppData();
    if (saved) {
        // Copy loaded data into our appData reference (engine holds this ref)
        appData.users = saved.users;
        appData.currentUser = saved.currentUser;
    }

    if (appData.currentUser) {
        game.restoreSessionZone();
        checkDailyStreak(appData.users[appData.currentUser]);
        saveAppData(appData);
        updateUI();
        initRealtimeSync(appData.currentUser);
        // Check for booster reminder
        setTimeout(() => checkBooster(), 1000);
    } else if (!Onboarding.hasCompleted()) {
        // First-time user — show onboarding
        onboarding.start();
    } else {
        showUserMenu();
    }

    game.startQuestionLoop();

    // Uptime tracker
    setInterval(() => {
        if (appData.currentUser) appData.users[appData.currentUser].totalTimeMs += 2000;
    }, 2000);
}

boot();
