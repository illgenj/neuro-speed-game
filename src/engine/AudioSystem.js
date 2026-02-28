// ─── Audio System ───────────────────────────────────────────

export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.ambientGain = null;
        this.ambientOsc = null;
        this.ambientOsc2 = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    playTone(freq, type, duration, vol = 0.1, slideTo = null) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playUI(type) {
        if (!this.enabled) return;
        if (type === 'click') this.playTone(800, 'sine', 0.1, 0.05);
        if (type === 'lock') this.playTone(1200, 'triangle', 0.1, 0.05, 600);
    }

    playGame(type, sessionZone = 0) {
        if (!this.enabled) return;
        if (type === 'flash') {
            this.playTone(200, 'triangle', 0.15, 0.1, 800);
        } else if (type === 'static') {
            this.playTone(100, 'sawtooth', 0.1, 0.05);
        } else if (type === 'success') {
            const root = 440 * (1 + (sessionZone * 0.05));
            this.playTone(root, 'sine', 0.3, 0.1);
            setTimeout(() => this.playTone(root * 1.25, 'sine', 0.3, 0.08), 50);
            setTimeout(() => this.playTone(root * 1.5, 'sine', 0.4, 0.06), 100);
        } else if (type === 'fail') {
            this.playTone(150, 'sawtooth', 0.4, 0.15, 50);
            this.playTone(140, 'sawtooth', 0.4, 0.15, 40);
        } else if (type === 'levelUp') {
            this.playTone(440, 'square', 0.1, 0.1);
            setTimeout(() => this.playTone(880, 'square', 0.1, 0.1), 100);
            setTimeout(() => this.playTone(1760, 'square', 0.4, 0.1), 200);
        } else if (type === 'timer') {
            this.playTone(800, 'square', 0.05, 0.02);
        }
    }

    // ─── Achievement Fanfare ────────────────────────────────
    playAchievement() {
        if (!this.enabled || !this.ctx) return;
        // Major chord arpeggio with shimmer
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 'sine', 0.5, 0.12);
                this.playTone(freq * 2, 'sine', 0.3, 0.04); // Shimmer overtone
            }, i * 80);
        });
        // Sparkle sweep
        setTimeout(() => this.playTone(2093, 'sine', 0.6, 0.06, 4186), 350);
    }

    // ─── Streak Chime ───────────────────────────────────────
    playStreak(streakCount) {
        if (!this.enabled || !this.ctx) return;
        // Ascending pitch based on streak length
        const base = 600 + Math.min(streakCount, 15) * 40;
        this.playTone(base, 'triangle', 0.15, 0.06);
        setTimeout(() => this.playTone(base * 1.5, 'triangle', 0.1, 0.04), 60);
    }

    // ─── Zone Transition ────────────────────────────────────
    playZoneTransition(zone) {
        if (!this.enabled || !this.ctx) return;
        // Evolving chord at zone thresholds
        const base = 220 * (1 + zone * 0.1);
        this.playTone(base, 'sine', 0.6, 0.08);
        this.playTone(base * 1.5, 'sine', 0.5, 0.05);
        setTimeout(() => this.playTone(base * 2, 'sine', 0.4, 0.04), 100);
    }

    // ─── Ambient Drone ──────────────────────────────────────
    startAmbient() {
        if (!this.enabled || !this.ctx || this.ambientOsc) return;

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.ambientGain.gain.linearRampToValueAtTime(0.015, this.ctx.currentTime + 2);
        this.ambientGain.connect(this.ctx.destination);

        // Low drone
        this.ambientOsc = this.ctx.createOscillator();
        this.ambientOsc.type = 'sine';
        this.ambientOsc.frequency.setValueAtTime(55, this.ctx.currentTime); // A1
        this.ambientOsc.connect(this.ambientGain);
        this.ambientOsc.start();

        // Upper harmonic
        this.ambientOsc2 = this.ctx.createOscillator();
        this.ambientOsc2.type = 'sine';
        this.ambientOsc2.frequency.setValueAtTime(110, this.ctx.currentTime); // A2
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.005, this.ctx.currentTime);
        g2.connect(this.ctx.destination);
        this.ambientOsc2.connect(g2);
        this.ambientOsc2.start();
        this._ambientGain2 = g2;
    }

    updateAmbientIntensity(sessionZone) {
        if (!this.ambientGain || !this.ctx) return;
        const intensity = 0.015 + Math.min(sessionZone, 20) * 0.002;
        this.ambientGain.gain.linearRampToValueAtTime(intensity, this.ctx.currentTime + 0.5);
        // Shift drone pitch slightly with zone
        if (this.ambientOsc) {
            this.ambientOsc.frequency.linearRampToValueAtTime(55 + sessionZone * 2, this.ctx.currentTime + 0.5);
        }
    }

    stopAmbient() {
        if (this.ambientOsc) {
            try {
                if (this.ambientGain) {
                    this.ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
                }
                setTimeout(() => {
                    try { this.ambientOsc?.stop(); } catch (e) { /* already stopped */ }
                    try { this.ambientOsc2?.stop(); } catch (e) { /* already stopped */ }
                    this.ambientOsc = null;
                    this.ambientOsc2 = null;
                    this.ambientGain = null;
                    this._ambientGain2 = null;
                }, 1100);
            } catch (e) {
                this.ambientOsc = null;
                this.ambientOsc2 = null;
            }
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) this.init();
        else this.stopAmbient();
        return this.enabled;
    }
}

