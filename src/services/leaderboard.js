// ─── Leaderboard Service ────────────────────────────────────
import { getDb, collection, doc, query, orderBy, limit, getDocs, onSnapshot, getLeaderboard } from './firebase.js';

let realtimeUnsubscribe = null;

export function subscribeToUser(userId, callback) {
    if (realtimeUnsubscribe) realtimeUnsubscribe();
    const db = getDb();
    if (!db || !userId) return;

    realtimeUnsubscribe = onSnapshot(doc(db, "leaderboard", userId), (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        }
    });
}

export function unsubscribe() {
    if (realtimeUnsubscribe) {
        realtimeUnsubscribe();
        realtimeUnsubscribe = null;
    }
}

export async function fetchLeaderboard(count = 20, mode = 'STANDARD') {
    const db = getDb();
    if (!db) return [];

    try {
        const result = await getLeaderboard({ count, mode });
        return result.data.results || [];
    } catch (e) {
        console.error("fetchLeaderboard failed", e);
        throw e;
    }
}
