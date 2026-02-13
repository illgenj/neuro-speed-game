const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Game Constants
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross'];
const L2_COLORS = ['#22d3ee', '#4ade80', '#f472b6', '#fbbf24'];

// 1. GENERATE ROUND (The "Dealer")
exports.getGameRound = functions.https.onCall(async (data, context) => {
    // Basic anti-spam could go here
    const userId = data.userId;
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'No User ID');

    // Server generates the random values
    const targetShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const satShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const satColorIdx = Math.floor(Math.random() * L2_COLORS.length);
    const satDirIdx = Math.floor(Math.random() * 8);

    // Store the "Answer Key" in a private collection the client CANNOT see
    await db.collection('private_sessions').doc(userId).set({
        targetShape,
        satShape,
        satColorIdx,
        satDirIdx,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        active: true
    });

    // Return only the visual data to the client
    return {
        targetShape,
        satShape,
        satColorIdx: satColorIdx, // Client needs this to draw
        satDirIdx: satDirIdx     // Client needs this to draw
    };
});

// 2. VERIFY RESULT (The "Judge")
exports.submitRound = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const clientAns = data.answer; // { uShape, uSat, uColor, uDir }
    const clientSpeed = data.speed;

    const sessionRef = db.collection('private_sessions').doc(userId);
    const sessionSnap = await sessionRef.get();
    
    if (!sessionSnap.exists || !sessionSnap.data().active) {
        throw new functions.https.HttpsError('failed-precondition', 'No active session');
    }

    const correctData = sessionSnap.data();
    
    // --- SERVER SIDE VALIDATION ---
    let isCorrect = true;
    if (clientAns.uShape !== correctData.targetShape) isCorrect = false;
    if (clientAns.uSat !== correctData.satShape) isCorrect = false;
    
    // Check Tiers
    const userRef = db.collection('leaderboard').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : { score: 0, tier: 'T1' };
    
    const isT2 = userData.tier === 'T2' || userData.tier === 'T3';
    const isT3 = userData.tier === 'T3';

    if (isT2 && clientAns.uColor !== correctData.satColorIdx) isCorrect = false;
    if (isT3 && clientAns.uDir !== correctData.satDirIdx) isCorrect = false;

    // Calculate Score Change (Server Authority)
    let newScore = userData.score || 0;
    let newTier = userData.tier || "T1";
    let speed = clientSpeed; // You can add server-side timestamp validation to prevent speed hacking here

    if (isCorrect) {
        const performanceVal = Math.max(100, (1500 - speed));
        const tierMult = isT3 ? 2.5 : (isT2 ? 1.5 : 1.0);
        const delta = (performanceVal * tierMult * 10 - newScore) * 0.15;
        if (delta > 0) newScore += delta;
        
        // Handle Promotion Logic Server-Side
        if (speed <= 400 && !isT2) newTier = "T2";
        if (speed <= 300 && isT2) newTier = "T3";
    } else {
        newScore = Math.max(0, newScore - (newScore * 0.20));
        // Handle Demotion Logic
    }

    // Write to DB (Only Server can do this now)
    await userRef.set({
        name: userId,
        score: Math.floor(newScore),
        tier: newTier,
        speed: speed,
        lastActive: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Invalidate session so it can't be replayed
    await sessionRef.update({ active: false });

    return { 
        correct: isCorrect, 
        newScore: Math.floor(newScore), 
        newTier: newTier 
    };
});
