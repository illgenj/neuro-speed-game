// ─── Onboarding Flow ────────────────────────────────────────
// 3-step intro: Science → How it Works → Create Agent

export class Onboarding {
    constructor(onComplete) {
        this.onComplete = onComplete;
        this.currentStep = 0;
        this.totalSteps = 3;
        this.overlay = document.getElementById('onboarding-overlay');
    }

    start() {
        if (!this.overlay) return;
        this.currentStep = 0;
        this.render();
        this.overlay.classList.remove('hidden');
    }

    render() {
        const steps = this.overlay.querySelectorAll('.onboarding-step');
        const dots = this.overlay.querySelectorAll('.onboarding-dot');

        steps.forEach((step, i) => {
            step.classList.toggle('active', i === this.currentStep);
        });

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentStep);
        });

        // Update button text
        const btn = document.getElementById('onboarding-next-btn');
        if (btn) {
            if (this.currentStep === this.totalSteps - 1) {
                btn.innerText = "BEGIN TRAINING";
            } else {
                btn.innerText = "CONTINUE";
            }
        }
    }

    next() {
        this.currentStep++;
        if (this.currentStep >= this.totalSteps) {
            this.overlay.classList.add('hidden');
            localStorage.setItem('neuro_onboarded', 'true');
            this.onComplete();
        } else {
            this.render();
        }
    }

    static hasCompleted() {
        return localStorage.getItem('neuro_onboarded') === 'true';
    }
}
