const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Game Configuration
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross'];
const L2_COLORS = ['#22d3ee', '#4ade80', '#f472b6', '#fbbf24'];

// --- 1. THE DEALER (DEBUG VERSION) ---
exports.getGameRound = functions.https.onCall(async (request, context) => {
    // Determine if we are receiving v1 (data, context) or v2 (request)
    const data = request.data || request;

    // 1. DEBUG LOGGING (Safe)
    console.log("USER ID:", data ? data.userId : "undefined");

    // 2. CHECK FOR MISSING ID
    if (!data || !data.userId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing userId');
    }

    const userId = data.userId;

    // 3. Generate Randomness
    const targetShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const satShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const satColorIdx = Math.floor(Math.random() * L2_COLORS.length);
    const satDirIdx = Math.floor(Math.random() * 8);

    // T4-T6 Extended Targets
    const targetColorIdx = Math.floor(Math.random() * L2_COLORS.length);
    const sat2Shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const sat2DirIdx = Math.floor(Math.random() * 8);
    const targetSolid = Math.random() > 0.5;

    const sessionSalt = Math.random().toString(36).substring(2, 10);

    // 4. Save to Private Vault
    await db.collection('private_sessions').doc(userId).set({
        targetShape, satShape, satColorIdx, satDirIdx,
        targetColorIdx, sat2Shape, sat2DirIdx, targetSolid,
        sessionSalt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        active: true
    });

    return {
        sessionSalt,
        // We also send the shapes for the client to use in the manifest
        targetShape, satShape, satColorIdx, satDirIdx,
        targetColorIdx, sat2Shape, sat2DirIdx, targetSolid
    };
});

// --- 2. THE JUDGE ---
exports.submitRound = functions.https.onCall(async (request, context) => {
    const data = request.data || request;
    const userId = data.userId;
    const clientAns = data.answer;
    const clientSpeed = data.speed;
    const mode = data.mode || 'STANDARD';

    const sessionRef = db.collection('private_sessions').doc(userId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists || !sessionSnap.data().active) {
        console.log(`[JUDGE] ${userId} | Rejected: Session not active.`);
        return { correct: false, newScore: 0, newTier: 'T1' };
    }
    const key = sessionSnap.data();

    if (data.manifest && data.manifest.salt !== key.sessionSalt) {
        console.log(`[JUDGE] ${userId} | Rejected: Salt Mismatch. Expected ${key.sessionSalt}, got ${data.manifest.salt}`);
        return { correct: false, newScore: 0, newTier: 'T1', reason: "TEMPORAL_ANOMALY" };
    }

    const userRef = db.collection('leaderboard').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : { score: 0, tier: 'T1' };

    const isT2 = ['T2', 'T3', 'T4', 'T5', 'T6'].includes(userData.tier);
    const isT3 = ['T3', 'T4', 'T5', 'T6'].includes(userData.tier);
    const isT4 = ['T4', 'T5', 'T6'].includes(userData.tier);
    const isT5 = ['T5', 'T6'].includes(userData.tier);
    const isT6 = userData.tier === 'T6';

    console.log(`[JUDGE] User: ${userId} | Tier: ${userData.tier}`);
    console.log(`[JUDGE] ClientAns: ${JSON.stringify(clientAns)}`);
    console.log(`[JUDGE] ClientManifest: ${JSON.stringify(data.manifest)}`);
    console.log(`[JUDGE] ServerKey: ${JSON.stringify(key)}`);

    let isCorrect = true;

    // Core (T1) validation
    if (clientAns.uShape !== undefined && clientAns.uShape !== null && clientAns.uShape !== key.targetShape) isCorrect = false;
    if (clientAns.uSat !== undefined && clientAns.uSat !== null && clientAns.uSat !== key.satShape) isCorrect = false;

    // T2 / T3 validation
    if (clientAns.uColor !== undefined && clientAns.uColor !== null && clientAns.uColor !== key.satColorIdx) isCorrect = false;
    if (clientAns.uDir !== undefined && clientAns.uDir !== null && clientAns.uDir !== key.satDirIdx) isCorrect = false;

    // T4: Core Spectrum validation
    if (clientAns.uTargetColor !== undefined && clientAns.uTargetColor !== null && clientAns.uTargetColor !== key.targetColorIdx) isCorrect = false;

    // T5: Dual Bogeys validation
    if (clientAns.uSat2Shape !== undefined && clientAns.uSat2Shape !== null && clientAns.uSat2Shape !== key.sat2Shape) isCorrect = false;
    if (clientAns.uSat2Dir !== undefined && clientAns.uSat2Dir !== null && clientAns.uSat2Dir !== key.sat2DirIdx) isCorrect = false;

    // T6: Polarity Inversion validation
    if (clientAns.uSolid !== undefined && clientAns.uSolid !== null && clientAns.uSolid !== key.targetSolid) isCorrect = false;

    let newScore = userData.score || 0;
    let newTier = userData.tier || "T1";
    let speed = clientSpeed;

    const isDaily = mode !== 'STANDARD';
    let dailyScore = 0;
    let dailyRounds = 0;
    let dailyRef = null;
    const todayStr = new Date().toISOString().split('T')[0];

    if (isDaily) {
        // Enforce T1 start for daily modes
        if (dailyRounds === 0) {
            newTier = "T1";
        }

        const collName = mode === 'DAILY_CASUAL' ? 'leaderboard_daily_casual' : 'leaderboard_daily_death';
        dailyRef = db.collection(collName).doc(userId);
        const dailySnap = await dailyRef.get();
        if (dailySnap.exists) {
            const dData = dailySnap.data();
            if (dData.date === todayStr) {
                dailyScore = dData.score || 0;
                dailyRounds = dData.roundsPlayed || 0;
                newTier = dData.tier || "T1"; // Resume at the saved daily tier
            }
        }
    }

    if (isCorrect) {
        const performanceVal = Math.max(100, (1500 - speed));

        let tierMult = 1.0;
        if (isT6) tierMult = 5.0;
        else if (isT5) tierMult = 4.0;
        else if (isT4) tierMult = 3.2;
        else if (isT3) tierMult = 2.5;
        else if (isT2) tierMult = 1.5;

        // Scoring differences
        if (isDaily) {
            const roundPoints = performanceVal * tierMult;
            dailyScore += roundPoints;
            dailyRounds++;
        } else {
            const rawPoints = performanceVal * tierMult * 10;
            const delta = (rawPoints - newScore) * 0.15;
            if (delta > 0) newScore += delta;
        }

        // Progression Requirements
        if (speed <= 350 && !isT2) newTier = "T2";
        else if (speed <= 250 && isT2 && !isT3) newTier = "T3";
        else if (speed <= 180 && isT3 && !isT4) newTier = "T4";
        else if (speed <= 120 && isT4 && !isT5) newTier = "T5";
        else if (speed <= 80 && isT5 && !isT6) newTier = "T6";

    } else {
        if (!isDaily) {
            newScore = Math.max(0, newScore - (newScore * 0.20));
        }

        // Tier Demotion limits
        if (userData.tier === 'T6' && speed > 100) newTier = 'T5';
        else if (userData.tier === 'T5' && speed > 150) newTier = 'T4';
        else if (userData.tier === 'T4' && speed > 220) newTier = 'T3';
        else if (userData.tier === 'T3' && speed > 300) newTier = 'T2';
    }

    if (!isDaily) {
        await userRef.set({
            name: userId,
            score: Math.floor(newScore),
            tier: newTier,
            speed: speed,
            pin: userData.pin || null,
            sessionZone: userData.sessionZone || 0,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } else {
        await dailyRef.set({
            name: userId,
            score: Math.floor(dailyScore),
            tier: newTier,
            speed: speed,
            roundsPlayed: dailyRounds,
            pin: userData.pin || null,
            date: todayStr,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    await sessionRef.update({ active: false });

    return {
        correct: isCorrect,
        newScore: Math.floor(isDaily ? dailyScore : newScore),
        newTier: newTier
    };
});

exports.setPin = functions.https.onCall(async (request, context) => {
    const data = request.data || request;
    const { userId, pin } = data;
    if (!userId || !pin) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing userId or pin');
    }
    const userRef = db.collection('leaderboard').doc(userId);
    await userRef.set({ pin }, { merge: true });
    return { success: true };
});

exports.syncProfile = functions.https.onCall(async (request, context) => {
    const data = request.data || request;
    const { userId, profileData } = data;
    if (!userId || !profileData) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing userId or profileData');
    }
    const userRef = db.collection('leaderboard').doc(userId);
    // Merge the full profile data sent from the client
    await userRef.set(profileData, { merge: true });
    return { success: true };
});

exports.getLeaderboard = functions.https.onCall(async (request, context) => {
    const data = request.data || request;
    const mode = data.mode || 'STANDARD';
    const count = data.count || 20;

    let collectionName = "leaderboard";
    if (mode === 'DAILY_CASUAL') collectionName = "leaderboard_daily_casual";
    if (mode === 'DAILY_DEATH') collectionName = "leaderboard_daily_death";

    const fetchCount = mode === 'STANDARD' ? count : 50;

    try {
        const snapshot = await db.collection(collectionName)
            .orderBy("score", "desc")
            .limit(fetchCount)
            .get();

        const results = [];
        const now = Date.now();

        snapshot.forEach((doc) => {
            const d = doc.data();

            if (mode !== 'STANDARD') {
                if (d.timestamp) {
                    const ts = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                    if (now - ts.getTime() > 24 * 60 * 60 * 1000) return;
                }
            }
            // We strip timestamps to send over network smoothly, keeping only strings/numbers
            const cleanData = { ...d };
            if (cleanData.timestamp) cleanData.timestamp = cleanData.timestamp.toDate ? cleanData.timestamp.toDate().toISOString() : new Date(cleanData.timestamp).toISOString();
            results.push(cleanData);
        });

        results.sort((a, b) => b.score - a.score);

        let rank = 1;
        return {
            results: results.slice(0, count).map(r => ({
                rank: rank++, ...r
            }))
        };
    } catch (e) {
        console.error("Leaderboard Fetch Error:", e);
        throw new functions.https.HttpsError('internal', 'Unable to fetch grid data');
    }
});
