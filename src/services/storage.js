// ─── Local Storage Service ──────────────────────────────────
import { SALT } from '../config/constants.js';

function generateHash(data) {
    const str = JSON.stringify(data) + SALT;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

const STORAGE_KEY = 'neuroElite_v3_secure';
const SIG_KEY = 'neuroElite_sig';

export function saveAppData(appData) {
    const hash = generateHash(appData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    localStorage.setItem(SIG_KEY, hash);
}

export function loadAppData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const sig = localStorage.getItem(SIG_KEY);
    if (saved && sig) {
        const parsed = JSON.parse(saved);
        const check = generateHash(parsed);
        if (check === sig) {
            return parsed;
        }
    }
    return null;
}
