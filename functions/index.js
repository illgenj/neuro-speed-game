const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Game Configuration
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross'];
const L2_COLORS = ['#22d3ee', '#4ade80', '#f472b6', '#fbbf24'];

// --- 1. THE DEALER ---
exports.getGameRound = functions.https.onCall(async (data, context) => {
    // SECURITY: Ensure we have a user ID
    const userId = data.userId;
    console.log(`[SERVER] getGameRound called by: ${userId}`);

    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing User ID');
    }

    // Generate Randomness
    const targetShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const satShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const satColorIdx = Math.floor(Math.random() * L2_COLORS.length);
    const satDirIdx = Math.floor(Math.random() * 8);

    // Save to Private Vault
    await db.collection('private_sessions').doc(userId).set({
        targetShape, satShape, satColorIdx, satDirIdx,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        active: true
    });

    return {
        targetShape, satShape, satColorIdx, satDirIdx
    };
});

// --- 2. THE JUDGE ---
exports.submitRound = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const clientAns = data.answer; 
    const clientSpeed = data.speed;

    console.log(`[SERVER] submitRound called by: ${userId}`);

    // Fetch Key
    const sessionRef = db.collection('private_sessions').doc(userId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists || !sessionSnap.data().active) {
        return { correct: false, newScore: 0, newTier: 'T1' };
    }
    const key = sessionSnap.data();

    // Fetch User
    const userRef = db.collection('leaderboard').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : { score: 0, tier: 'T1' };
    
    const isT2 = userData.tier === 'T2' || userData.tier === 'T3';
    const isT3 = userData.tier === 'T3';

    // Validate
    let isCorrect = true;
    if (clientAns.uShape !== key.targetShape) isCorrect = false;
    if (clientAns.uSat !== key.satShape) isCorrect = false;
    if (isT2 && clientAns.uColor !== key.satColorIdx) isCorrect = false;
    if (isT3 && clientAns.uDir !== key.satDirIdx) isCorrect = false;

    // Score
    let newScore = userData.score || 0;
    let newTier = userData.tier || "T1";
    let speed = clientSpeed; 

    if (isCorrect) {
        const performanceVal = Math.max(100, (1500 - speed));
        const tierMult = isT3 ? 2.5 : (isT2 ? 1.5 : 1.0);
        const rawPoints = performanceVal * tierMult * 10; 
        const delta = (rawPoints - newScore) * 0.15;
        if (delta > 0) newScore += delta;

        if (speed <= 400 && !isT2) newTier = "T2";
        if (speed <= 300 && isT2) newTier = "T3";
    } else {
        newScore = Math.max(0, newScore - (newScore * 0.20));
        if (userData.tier === 'T3' && speed > 500) newTier = 'T2';
    }

    // Save
    await userRef.set({
        name: userId,
        score: Math.floor(newScore),
        tier: newTier,
        speed: speed,
        pin: userData.pin || null, 
        sessionZone: userData.sessionZone || 0,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await sessionRef.update({ active: false });

    return {
        correct: isCorrect,
        newScore: Math.floor(newScore),
        newTier: newTier
    };
});
