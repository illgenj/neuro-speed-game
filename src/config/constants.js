// ─── Game Constants ─────────────────────────────────────────
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross'];

export const L2_COLORS = ['#22d3ee', '#4ade80', '#f472b6', '#fbbf24'];

export const QUESTION_TIMEOUT_MS = 15000;

export const DIR_MAP = [
    { id: 0, key: 6, label: '6', angle: 0 },
    { id: 1, key: 3, label: '3', angle: Math.PI * 0.25 },
    { id: 2, key: 2, label: '2', angle: Math.PI * 0.5 },
    { id: 3, key: 1, label: '1', angle: Math.PI * 0.75 },
    { id: 4, key: 4, label: '4', angle: Math.PI },
    { id: 5, key: 7, label: '7', angle: Math.PI * 1.25 },
    { id: 6, key: 8, label: '8', angle: Math.PI * 1.5 },
    { id: 7, key: 9, label: '9', angle: Math.PI * 1.75 },
];

export const SALT = "NEURO_SECURE_SALT_9283";

// Firebase config — these are client keys restricted via Firebase security rules
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBbUKJ9FgkTMU2WHM4N0uYAujLBDBV-ILs",
    authDomain: "neuro-speed-web.firebaseapp.com",
    projectId: "neuro-speed-web",
    storageBucket: "neuro-speed-web.firebasestorage.app",
    messagingSenderId: "314397349425",
    appId: "1:314397349425:web:992853535b9f8bd61de710",
};

// ─── Session Constants ──────────────────────────────────────
export const SESSION_TARGET_MS = 10 * 60 * 1000;  // 10 minutes
export const TRAINING_BLOCK_SIZE = 7;               // Sessions per block
export const BOOSTER_INTERVALS_DAYS = [7, 30, 90];  // Days between boosters

// ─── Difficulty Defaults ────────────────────────────────────
export const DIFFICULTY_DEFAULTS = {
    flashDuration: 450,
    distractorCount: 12,
    distractorSimilarity: 0,  // 0 = random, 1 = identical to target
    peripheralDistance: 0.35,  // fraction of minDim
};

export const ACCURACY_TARGET = 0.75;       // Target 75% accuracy
export const ACCURACY_WINDOW = 20;         // Rolling window size
export const ACCURACY_UPPER = 0.82;        // Above this → increase difficulty
export const ACCURACY_LOWER = 0.62;        // Below this → decrease difficulty

