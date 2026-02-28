// ─── Leaderboard Service ────────────────────────────────────
import { getDb, collection, doc, query, orderBy, limit, getDocs, onSnapshot } from './firebase.js';

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

export async function fetchLeaderboard(count = 20) {
    const db = getDb();
    if (!db) return [];

    const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(count));
    const snapshot = await getDocs(q);
    const results = [];
    let rank = 1;
    snapshot.forEach((doc) => {
        results.push({ rank: rank++, ...doc.data() });
    });
    return results;
}
