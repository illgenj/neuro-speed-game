// ─── Firebase Service ───────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, query, orderBy, limit, getDocs, getDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FIREBASE_CONFIG } from '../config/constants.js';

let app, db, functions;
let getGameRoundFunc, submitRoundFunc, setPinFunc;

export function initFirebase() {
    try {
        app = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(app);
        functions = getFunctions(app);
        getGameRoundFunc = httpsCallable(functions, 'getGameRound');
        submitRoundFunc = httpsCallable(functions, 'submitRound');
        setPinFunc = httpsCallable(functions, 'setPin');
        console.log("Neuro-Link Secured (Blind Auth).");
        return true;
    } catch (e) {
        console.error("Link Error:", e);
        return false;
    }
}

export function getDb() { return db; }
export function getGameRound(data) { return getGameRoundFunc(data); }
export function submitRound(data) { return submitRoundFunc(data); }
export function setPin(data) { return setPinFunc(data); }

// Re-export Firestore utilities needed by other modules
export { collection, doc, setDoc, query, orderBy, limit, getDocs, getDoc, onSnapshot };
