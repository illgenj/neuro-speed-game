// ─── User/Auth Service ──────────────────────────────────────
import { getDb, doc, getDoc } from './firebase.js';
import { setPin as firebaseSetPin } from './firebase.js';
import { saveAppData } from './storage.js';

export async function lookupCloudUser(userId) {
    const db = getDb();
    if (!db) return null;
    try {
        const docSnap = await getDoc(doc(db, "leaderboard", userId));
        if (docSnap.exists()) return docSnap.data();
    } catch (e) {
        console.error(e);
    }
    return null;
}

export function createLocalUser(name, cloudData = null, pin = null) {
    if (cloudData) {
        return {
            speed: cloudData.speed || 450,
            score: cloudData.score || 0,
            peakScore: cloudData.score || 0,
            streak: 0,
            history: [cloudData.speed || 450],
            resultsHistory: [],
            level2: cloudData.tier === 'T2' || cloudData.tier === 'T3',
            level3: cloudData.tier === 'T3',
            totalTimeMs: 0,
            dailyStreak: 0,
            lastPlayDate: null,
            pin: cloudData.pin || pin,
            sessionZone: 0,
            difficulty: null,
            sessions: [],
            trainingBlock: 0,
            lastBoosterDate: null,
            achievements: [],
        };
    }
    return {
        speed: 450,
        score: 0,
        peakScore: 0,
        streak: 0,
        history: [450],
        resultsHistory: [],
        level2: false,
        level3: false,
        totalTimeMs: 0,
        dailyStreak: 0,
        lastPlayDate: null,
        pin: pin || null,
        sessionZone: 0,
        difficulty: null,
        sessions: [],
        trainingBlock: 0,
        lastBoosterDate: null,
        achievements: [],
    };
}

export function checkDailyStreak(user) {
    const today = new Date().toISOString().split('T')[0];
    if (!user.lastPlayDate) {
        user.lastPlayDate = today;
        user.dailyStreak = 1;
    } else if (user.lastPlayDate !== today) {
        const diff = (new Date(today) - new Date(user.lastPlayDate)) / 86400000;
        if (diff >= 0.9 && diff < 2) user.dailyStreak++;
        else if (diff >= 2) user.dailyStreak = 1;
        user.lastPlayDate = today;
    }
}

export async function setPinForUser(userId, pin, appData) {
    try {
        await firebaseSetPin({ userId, pin });
        if (appData.users[userId]) {
            appData.users[userId].pin = pin;
            saveAppData(appData);
        }
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}
