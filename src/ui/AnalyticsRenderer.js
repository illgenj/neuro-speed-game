// ─── Analytics Renderer ─────────────────────────────────────
// Canvas-based chart rendering for the analytics dashboard

export class AnalyticsRenderer {

    // ─── DUAL SPARKLINE (Speed + Accuracy) ──────────────────
    static drawDualChart(canvas, speedData, accuracyData) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;

        ctx.clearRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const y = (h / 4) * (i + 0.5);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Speed sparkline (area fill)
        if (speedData.length > 1) {
            const maxSpeed = Math.max(...speedData, 500);
            const minSpeed = Math.min(...speedData, 30);
            const range = maxSpeed - minSpeed || 1;

            ctx.beginPath();
            speedData.forEach((v, i) => {
                const x = (i / (speedData.length - 1)) * w;
                const y = h - ((v - minSpeed) / range) * (h * 0.85) - h * 0.05;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });

            // Stroke
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#0ea5e9';
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Fill gradient
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(14, 165, 233, 0.2)');
            grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // Accuracy overlay line
        if (accuracyData.length > 1) {
            ctx.beginPath();
            accuracyData.forEach((v, i) => {
                const x = (i / (accuracyData.length - 1)) * w;
                const y = h - (v / 100) * (h * 0.85) - h * 0.05;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 6;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
        }

        // Labels
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(14, 165, 233, 0.6)';
        ctx.fillText('LATENCY', 6, 12);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.fillText('ACCURACY', 6, 24);
    }

    // ─── DIFFICULTY RADAR ───────────────────────────────────
    static drawDifficultyRadar(canvas, difficultyState) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.min(w, h) * 0.38;

        ctx.clearRect(0, 0, w, h);

        const axes = [
            { label: 'SPEED', value: Math.max(0, (450 - (difficultyState?.flashDuration || 450)) / 420) },
            { label: 'CLUTTER', value: Math.max(0, ((difficultyState?.distractorCount || 12) - 6) / 12) },
            { label: 'MIMIC', value: difficultyState?.distractorSimilarity || 0 },
            { label: 'DEPTH', value: Math.max(0, (0.45 - (difficultyState?.peripheralDistance || 0.35)) / 0.23) },
        ];

        const count = axes.length;
        const angleStep = (Math.PI * 2) / count;

        // Grid rings
        for (let ring = 1; ring <= 3; ring++) {
            const r = (ring / 3) * maxR;
            ctx.beginPath();
            for (let i = 0; i <= count; i++) {
                const a = -Math.PI / 2 + i * angleStep;
                const px = cx + Math.cos(a) * r;
                const py = cy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = `rgba(255, 255, 255, ${ring === 3 ? 0.08 : 0.04})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Axis lines
        axes.forEach((_, i) => {
            const a = -Math.PI / 2 + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.stroke();
        });

        // Data polygon
        ctx.beginPath();
        axes.forEach((axis, i) => {
            const a = -Math.PI / 2 + i * angleStep;
            const r = Math.min(1, axis.value) * maxR;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#0ea5e9';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Data points + labels
        axes.forEach((axis, i) => {
            const a = -Math.PI / 2 + i * angleStep;
            const r = Math.min(1, axis.value) * maxR;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;

            // Dot
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#0ea5e9';
            ctx.fill();

            // Label
            const labelR = maxR + 14;
            const lx = cx + Math.cos(a) * labelR;
            const ly = cy + Math.sin(a) * labelR;
            ctx.font = "700 8px 'JetBrains Mono', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillText(axis.label, lx, ly);

            // Value percentage
            ctx.fillStyle = '#0ea5e9';
            ctx.font = "800 9px 'JetBrains Mono', monospace";
            ctx.fillText(`${Math.round(axis.value * 100)}%`, lx, ly + 12);
        });
    }

    // ─── SESSION HEATMAP ────────────────────────────────────
    static drawSessionHeatmap(canvas, sessions = []) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;

        ctx.clearRect(0, 0, w, h);

        // Build 30-day map
        const days = 30;
        const today = new Date();
        const dayMap = {};
        sessions.forEach(s => {
            const dateStr = s.date?.split('T')[0];
            if (dateStr) dayMap[dateStr] = (dayMap[dateStr] || 0) + 1;
        });

        const cellSize = Math.min((w - 10) / days, (h - 24) / 1);
        const gap = 2;
        const startX = (w - (days * (cellSize + gap))) / 2;
        const startY = 20;

        // Month labels
        ctx.font = "600 8px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';

        for (let i = 0; i < days; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - (days - 1 - i));
            const dateStr = d.toISOString().split('T')[0];
            const count = dayMap[dateStr] || 0;
            const x = startX + i * (cellSize + gap);

            // Cell
            let intensity = 0;
            if (count >= 3) intensity = 1;
            else if (count === 2) intensity = 0.7;
            else if (count === 1) intensity = 0.4;

            if (intensity > 0) {
                ctx.fillStyle = `rgba(14, 165, 233, ${intensity * 0.7})`;
                ctx.shadowColor = '#0ea5e9';
                ctx.shadowBlur = intensity > 0.5 ? 6 : 0;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.shadowBlur = 0;
            }

            ctx.beginPath();
            ctx.roundRect(x, startY, cellSize, cellSize, 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Day label (every 5 days)
            if (i % 5 === 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.font = "500 7px 'JetBrains Mono', monospace";
                ctx.fillText(`${d.getDate()}`, x + cellSize / 2, startY - 5);
            }
        }

        // Legend
        ctx.font = "500 7px 'JetBrains Mono', monospace";
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillText('LAST 30 DAYS', w - 4, startY - 5);
    }

    // ─── TRAINING PROGRESS BAR ──────────────────────────────
    static drawTrainingProgress(container, sessionsCount, blockSize) {
        const block = Math.floor(sessionsCount / blockSize);
        const inBlock = sessionsCount % blockSize;

        container.innerHTML = `
            <div class="training-progress-label">
                BLOCK ${block + 1} — SESSION ${inBlock}/${blockSize}
            </div>
            <div class="training-progress-bar">
                ${Array.from({ length: blockSize }, (_, i) =>
            `<div class="training-dot ${i < inBlock ? 'filled' : ''}" style="animation-delay: ${i * 60}ms"></div>`
        ).join('')}
            </div>
        `;
    }
}
