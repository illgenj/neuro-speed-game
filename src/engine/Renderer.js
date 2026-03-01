// ─── Canvas Renderer ────────────────────────────────────────
import { SHAPES, L2_COLORS, DIR_MAP } from '../config/constants.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.centerX = 0;
        this.centerY = 0;
        this.minDim = 0;
        this.particles = [];
        this.ripples = [];
        this.backgroundEchoes = [];
        // Neural network idle animation
        this.neuralNodes = [];
        this.neuralInitialized = false;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight - 96;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.minDim = Math.min(this.canvas.width, this.canvas.height);
        this._initNeuralNodes();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // ─── Neural Network Idle Animation ──────────────────────
    _initNeuralNodes() {
        this.neuralNodes = [];
        const count = Math.floor((this.canvas.width * this.canvas.height) / 25000);
        for (let i = 0; i < count; i++) {
            this.neuralNodes.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                radius: Math.random() * 2 + 1,
                phase: Math.random() * Math.PI * 2,
            });
        }
        this.neuralInitialized = true;
    }

    drawNeuralNetwork(sessionZone = 0) {
        if (!this.neuralInitialized || this.neuralNodes.length === 0) return;
        const ctx = this.ctx;
        const time = Date.now() / 1000;
        const intensity = Math.min(sessionZone, 10) / 10;
        const connectionDist = 120 + intensity * 40;

        // Update node positions
        for (const node of this.neuralNodes) {
            node.x += node.vx;
            node.y += node.vy;
            // Wrap around
            if (node.x < 0) node.x = this.canvas.width;
            if (node.x > this.canvas.width) node.x = 0;
            if (node.y < 0) node.y = this.canvas.height;
            if (node.y > this.canvas.height) node.y = 0;
        }

        // Radial center glow
        ctx.save();
        const glowRadius = 80 + Math.sin(time * 0.5) * 30 + intensity * 60;
        const grad = ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, glowRadius
        );
        let gr = 14, gg = 165, gb = 233;
        if (intensity > 0.3) { gr = 130; gg = 90; gb = 230; }
        if (intensity > 0.7) { gr = 245; gg = 158; gb = 11; }
        grad.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, ${0.04 + intensity * 0.06})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw connections with traveling pulses
        for (let i = 0; i < this.neuralNodes.length; i++) {
            for (let j = i + 1; j < this.neuralNodes.length; j++) {
                const a = this.neuralNodes[i];
                const b = this.neuralNodes[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < connectionDist) {
                    const alpha = (1 - dist / connectionDist) * 0.08;
                    let r = 14, g = 165, bl = 233;
                    if (intensity > 0.3) { r = 130; g = 90; bl = 230; }
                    if (intensity > 0.7) { r = 245; g = 158; bl = 11; }
                    ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();

                    // Traveling pulse along connection
                    const pulseT = ((time * 0.5 + i * 0.1 + j * 0.07) % 1);
                    const px = a.x + (b.x - a.x) * pulseT;
                    const py = a.y + (b.y - a.y) * pulseT;
                    const pulseAlpha = Math.sin(pulseT * Math.PI) * (0.15 + intensity * 0.3);
                    ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${pulseAlpha})`;
                    ctx.beginPath();
                    ctx.arc(px, py, 1.5 + intensity, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw nodes with glow
        for (const node of this.neuralNodes) {
            const pulse = Math.sin(time * 2 + node.phase) * 0.5 + 0.5;
            const alpha = 0.1 + pulse * 0.15 + intensity * 0.1;
            let r = 14, g = 165, bl = 233;
            if (intensity > 0.3) { r = 130; g = 90; bl = 230; }
            if (intensity > 0.7) { r = 245; g = 158; bl = 11; }
            const nodeRadius = node.radius * (0.8 + pulse * 0.4);

            // Node glow
            if (pulse > 0.7) {
                ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${(pulse - 0.7) * 0.15})`;
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeRadius * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ─── Shapes ─────────────────────────────────────────────
    drawShape(type, x, y, size, color, isSolid = true) {
        const ctx = this.ctx;
        ctx.beginPath();
        if (isSolid) {
            ctx.fillStyle = color;
        } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = size * 0.3; // Hollow thickness
        }

        if (type === 'circle') ctx.arc(x, y, size, 0, Math.PI * 2);
        else if (type === 'square') ctx.rect(x - size, y - size, size * 2, size * 2);
        else if (type === 'triangle') { ctx.moveTo(x, y - size); ctx.lineTo(x + size, y + size); ctx.lineTo(x - size, y + size); ctx.closePath(); }
        else if (type === 'diamond') { ctx.moveTo(x, y - size * 1.2); ctx.lineTo(x + size * 1.2, y); ctx.lineTo(x, y + size * 1.2); ctx.lineTo(x - size * 1.2, y); ctx.closePath(); }
        else if (type === 'cross') { ctx.rect(x - size / 3, y - size, size / 1.5, size * 2); ctx.rect(x - size, y - size / 3, size * 2, size / 1.5); }

        if (isSolid) ctx.fill();
        else ctx.stroke();
    }

    drawStatic(intensity = 0.5) {
        const ctx = this.ctx;
        const imageData = ctx.createImageData(this.canvas.width, this.canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const val = Math.random() * 255 * intensity;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);

        if (Math.random() < 0.15) {
            ctx.save();
            ctx.strokeStyle = `rgba(168, 85, 247, ${Math.random() * 0.3 + 0.1})`;
            ctx.lineWidth = 1;

            // Faint UAP tracking reticle
            ctx.beginPath();
            ctx.ellipse(this.centerX, this.centerY, this.minDim * 0.45, this.minDim * 0.25, 0, 0, Math.PI * 2);
            ctx.moveTo(this.centerX - this.minDim * 0.5, this.centerY);
            ctx.lineTo(this.centerX + this.minDim * 0.5, this.centerY);
            ctx.stroke();

            // UAP signature coordinate readout
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = `600 ${this.minDim * 0.03}px 'JetBrains Mono', monospace`;
            ctx.fillText(`FLIR/TV: ${(Math.random() * 5 + 1).toFixed(2)} MACH`, 20, 30);
            ctx.fillText(`AAV SIGNATURE LINKED`, 20, 60);

            ctx.restore();
        }
    }

    drawEchoes() {
        if (this.backgroundEchoes.length === 0) return;
        this.ctx.save();
        this.ctx.globalAlpha = 0.06;
        this.backgroundEchoes.forEach(echo => {
            this.drawShape(echo.type, echo.x, echo.y, echo.size, echo.color);
        });
        this.ctx.restore();
    }

    addEcho(type, x, y, size, color) {
        this.backgroundEchoes.push({ type, x, y, size, color });
        if (this.backgroundEchoes.length > 20) this.backgroundEchoes.splice(0, 2);
    }

    clearEchoes() {
        this.backgroundEchoes = [];
    }

    drawConspiracyOverlay() {
        const ctx = this.ctx;
        const time = Date.now() / 1000;

        ctx.save();
        // Faint scanlines sweeping
        const sweepY = (time * 150) % this.canvas.height;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
        ctx.fillRect(0, sweepY, this.canvas.width, 2);

        // Faint text overlay at absolute top right indicating processing
        ctx.fillStyle = 'rgba(14, 165, 233, 0.1)';
        ctx.font = `800 ${this.minDim * 0.02}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`UAP SENSOR FUSION: ACTIVE // CH ${Math.floor(Math.random() * 99)}`, this.canvas.width - 20, 30);
        ctx.fillText(`KINEMATIC DATA: ${Date.now().toString().slice(-6)} TB`, this.canvas.width - 20, 50);

        // Faint rotating geo-tracker
        ctx.translate(this.centerX, this.centerY);
        ctx.rotate(time * -0.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            ctx.moveTo(0, this.minDim * 0.1);
            ctx.lineTo(0, this.minDim * 0.3);
            ctx.rotate(Math.PI / 6);
        }
        ctx.stroke();

        ctx.restore();
    }

    // ─── Reticle ────────────────────────────────────────────
    drawReticle(sessionZone) {
        const ctx = this.ctx;
        const intensity = Math.min(sessionZone, 10) / 10;
        const rot = (Date.now() / 2000) * (1 + intensity * 4);
        const jitter = intensity > 0.8 ? (Math.random() - 0.5) * 4 : 0;

        ctx.save();
        ctx.translate(this.centerX + jitter, this.centerY + jitter);
        ctx.rotate(rot);

        const breathSpeed = 800 - (intensity * 600);
        const breath = Math.sin(Date.now() / breathSpeed) * (2 + intensity * 5);
        const size = 15 + breath;

        let color = '255, 255, 255';
        if (intensity > 0.3) color = '168, 85, 247';
        if (intensity > 0.6) color = '245, 158, 11';
        if (intensity > 0.9) color = '244, 63, 94';

        ctx.strokeStyle = `rgba(${color}, ${0.15 + (intensity * 0.5)})`;
        ctx.lineWidth = 1 + (intensity * 2);

        ctx.beginPath();
        if (intensity > 0.8) {
            ctx.moveTo(-size, size); ctx.lineTo(0, -size); ctx.lineTo(size, size); ctx.closePath();
        } else {
            ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
            ctx.moveTo(0, -size); ctx.lineTo(0, size);
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 8 + (intensity * 4), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color}, ${0.3 + intensity})`;
        ctx.stroke();

        ctx.restore();

        const time = Date.now() / 1000;
        const alpha = 0.1 + Math.sin(time * 3) * 0.05;
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ─── Particles & Ripples ────────────────────────────────
    spawnParticles(x, y, color) {
        const count = 12;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color,
                size: Math.random() * 3 + 2,
            });
        }
    }

    updateAndDrawParticles() {
        const ctx = this.ctx;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.03;
            p.size *= 0.95;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            } else {
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
            }
        }
    }

    updateAndDrawRipples() {
        const ctx = this.ctx;
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.radius += 5;
            r.opacity -= 0.05;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${r.opacity})`;
            ctx.stroke();
            if (r.opacity <= 0) this.ripples.splice(i, 1);
        }
    }

    addRipple(x, y) {
        this.ripples.push({ x, y, radius: 0, opacity: 1 });
    }

    // ─── Flash Scene ────────────────────────────────────────
    drawFlashScene(manifest, user, lastFlashRadius, distractors) {
        this.clear();
        this.drawEchoes();

        // Secondary THREAT Satellite (T5+ / Dual Bogeys)
        if (user.level5 || user.level6) {
            const angle2 = manifest.sat2DirIdx * Math.PI * 0.25;
            const sat2X = this.centerX + Math.cos(angle2) * lastFlashRadius * 1.2; // Slightly further out to avoid crowding
            const sat2Y = this.centerY + Math.sin(angle2) * lastFlashRadius * 1.2;
            const threatColor = '#ef4444'; // Red for secondary
            this.drawShape(manifest.sat2Shape, sat2X, sat2Y, this.minDim * 0.045, threatColor);
        }

        // Primary Satellite
        const angle = manifest.satDirIdx * Math.PI * 0.25;
        const satX = this.centerX + Math.cos(angle) * lastFlashRadius;
        const satY = this.centerY + Math.sin(angle) * lastFlashRadius;

        distractors.forEach(d => this.drawShape(d.shape, d.x, d.y, this.minDim * 0.05, '#334155'));

        // Target Core (with Polarity T6+ and Spectrum T4+)
        const coreColor = (user.level4 || user.level5 || user.level6) ? L2_COLORS[manifest.targetColorIdx] : '#fff';
        const isSolid = user.level6 ? manifest.targetSolid : true;

        this.drawShape(manifest.targetShape, this.centerX, this.centerY, this.minDim * 0.06, coreColor, isSolid);

        this.drawShape(manifest.satShape, satX, satY, this.minDim * 0.05,
            (user.level2 || user.level3 || user.level4 || user.level5 || user.level6) ? L2_COLORS[manifest.satColorIdx] : '#8b5cf6');
    }

    // ─── Question UI ────────────────────────────────────────
    drawQuestionUI(currentTask, selectionBoxes, lastSelectionIndex, timerPct) {
        const ctx = this.ctx;
        this.clear();
        this.drawNeuralNetwork();
        this.drawEchoes();

        // Timer bar with rounded caps
        const barColor = timerPct < 0.2 ? '#ef4444' : (timerPct < 0.5 ? '#f59e0b' : '#0ea5e9');
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, 0, this.canvas.width, 4);
        ctx.fillStyle = barColor;
        ctx.shadowColor = barColor;
        ctx.shadowBlur = 12;
        ctx.fillRect(0, 0, this.canvas.width * timerPct, 4);
        ctx.shadowBlur = 0;

        let title = "", sub = "";
        if (currentTask === 'CENTER') { title = "CORE ID"; sub = "SELECT CENTER SHAPE"; }
        else if (currentTask === 'SATELLITE') { title = "PERIPHERAL ID"; sub = "SELECT SATELLITE SHAPE"; }
        else if (currentTask === 'COLOR') { title = "SPECTRUM ID"; sub = "MATCH SATELLITE COLOR"; }
        else if (currentTask === 'DIRECTION') { title = "VECTOR ID"; sub = "INDICATE ORIGIN (NUMPAD OR ARROWS)"; }
        else if (currentTask === 'TARGET_COLOR') { title = "CORE SPECTRUM"; sub = "MATCH CENTER SHAPE COLOR"; }
        else if (currentTask === 'SAT2_SHAPE') { title = "THREAT ID"; sub = "SELECT SECONDARY THREAT SHAPE"; }
        else if (currentTask === 'SAT2_DIR') { title = "THREAT VECTOR"; sub = "INDICATE SECONDARY THREAT ORIGIN"; }
        else if (currentTask === 'POLARITY') { title = "POLARITY INVERSION"; sub = "WAS CORE SOLID OR HOLLOW?"; }

        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${this.minDim * 0.06}px 'Inter', system-ui`;
        ctx.fillText(title, this.centerX, this.centerY - this.minDim * 0.15);
        ctx.fillStyle = "rgba(14, 165, 233, 0.8)";
        ctx.font = `700 ${this.minDim * 0.025}px 'JetBrains Mono', monospace`;
        ctx.fillText(sub, this.centerX, this.centerY - this.minDim * 0.08);

        // Draw selection items
        selectionBoxes.length = 0;

        if (currentTask === 'DIRECTION' || currentTask === 'SAT2_DIR') {
            this._drawDirectionButtons(selectionBoxes, lastSelectionIndex);
        } else if (currentTask === 'POLARITY') {
            this._drawPolarityButtons(selectionBoxes, lastSelectionIndex);
        } else {
            const items = (currentTask === 'COLOR' || currentTask === 'TARGET_COLOR') ? L2_COLORS : SHAPES;
            this._drawItemRow(items, currentTask, selectionBoxes, lastSelectionIndex);
        }

        this.updateAndDrawParticles();
        this.updateAndDrawRipples();

        return selectionBoxes;
    }

    _drawDirectionButtons(selectionBoxes, lastSelectionIndex) {
        const ctx = this.ctx;
        const layoutRadius = this.minDim * 0.3;
        const btnSize = this.minDim * 0.07;
        DIR_MAP.forEach(dir => {
            const x = this.centerX + Math.cos(dir.angle) * layoutRadius;
            const y = this.centerY + Math.sin(dir.angle) * layoutRadius;
            const isSelected = (dir.id === lastSelectionIndex);
            ctx.beginPath();
            if (isSelected) {
                ctx.shadowBlur = 24;
                ctx.shadowColor = "rgba(14, 165, 233, 0.8)";
                ctx.fillStyle = "rgba(14, 165, 233, 0.3)";
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
            }
            ctx.strokeStyle = isSelected ? "#0ea5e9" : "rgba(255,255,255,0.08)";
            ctx.lineWidth = 2;
            ctx.arc(x, y, btnSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = isSelected ? "#fff" : "#64748b";
            ctx.font = `800 ${this.minDim * 0.05}px 'JetBrains Mono', monospace`;
            ctx.textBaseline = "middle";
            ctx.fillText(dir.label, x, y);
            ctx.textBaseline = "alphabetic";
            selectionBoxes.push({ key: dir.id, val: dir.id, x1: x - btnSize, x2: x + btnSize, y1: y - btnSize, y2: y + btnSize, cx: x, cy: y });
        });
    }

    _drawPolarityButtons(selectionBoxes, lastSelectionIndex) {
        const ctx = this.ctx;
        const btnWidth = this.minDim * 0.3;
        const btnHeight = this.minDim * 0.12;
        const spacing = this.minDim * 0.05;
        const startX = this.centerX - btnWidth - spacing;
        const y = this.centerY;

        const options = [
            { id: 1, label: 'SOLID', cx: startX + btnWidth / 2 },
            { id: 0, label: 'HOLLOW', cx: startX + btnWidth + spacing * 2 + btnWidth / 2 }
        ];

        options.forEach(opt => {
            const isSelected = (opt.id === lastSelectionIndex);
            ctx.beginPath();
            ctx.roundRect(opt.cx - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);

            if (isSelected) {
                ctx.shadowBlur = 24;
                ctx.shadowColor = "rgba(14, 165, 233, 0.8)";
                ctx.fillStyle = "rgba(14, 165, 233, 0.3)";
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
            }
            ctx.strokeStyle = isSelected ? "#0ea5e9" : "rgba(255,255,255,0.08)";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = isSelected ? "#fff" : "#64748b";
            ctx.font = `800 ${this.minDim * 0.04}px 'JetBrains Mono', monospace`;
            ctx.textBaseline = "middle";
            ctx.fillText(opt.label, opt.cx, y);
            ctx.textBaseline = "alphabetic";

            selectionBoxes.push({
                key: opt.id, val: (opt.id === 1),
                x1: opt.cx - btnWidth / 2, x2: opt.cx + btnWidth / 2,
                y1: y - btnHeight / 2, y2: y + btnHeight / 2,
                cx: opt.cx, cy: y
            });
        });
    }

    _drawItemRow(items, currentTask, selectionBoxes, lastSelectionIndex) {
        const ctx = this.ctx;
        const rowWidth = this.canvas.width * 0.85;
        const spacing = rowWidth / (items.length - 1);
        const startX = (this.canvas.width - rowWidth) / 2;

        items.forEach((item, i) => {
            const x = startX + (i * spacing);
            const y = this.centerY + 60;
            const isSelected = (i === lastSelectionIndex);

            if (isSelected) {
                ctx.save();
                ctx.shadowBlur = 24;
                ctx.shadowColor = "rgba(14, 165, 233, 0.8)";
                ctx.fillStyle = "rgba(14, 165, 233, 0.15)";
                ctx.beginPath();
                ctx.arc(x, y, this.minDim * 0.08, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            if (currentTask === 'COLOR' || currentTask === 'TARGET_COLOR') {
                ctx.fillStyle = item;
                ctx.beginPath();
                ctx.arc(x, y, this.minDim * 0.06, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const itemSize = this.minDim * 0.05;
                this.drawShape(item, x, y, itemSize, '#fff', true);
            }

            selectionBoxes.push({
                key: item, val: i,
                x1: x - spacing / 2, x2: x + spacing / 2,
                y1: y - 100, y2: y + 100,
                cx: x, cy: y,
            });

            if (!('ontouchstart' in window)) {
                ctx.fillStyle = "rgba(255,255,255,0.25)";
                ctx.font = `600 ${this.minDim * 0.022}px 'JetBrains Mono', monospace`;
                ctx.fillText(`[${i + 1}]`, x, y + this.minDim * 0.09);
            }
        });
    }

    // ─── Session Timer ──────────────────────────────────────
    drawSessionTimer(elapsedMs, targetMs, roundsPlayed) {
        const ctx = this.ctx;
        const progress = Math.min(1, elapsedMs / targetMs);
        const radius = 28;
        const x = this.canvas.width - 50;
        const y = 50;

        ctx.save();

        // Background ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Progress ring
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (Math.PI * 2 * progress);

        // Color shifts based on progress
        let color;
        if (progress < 0.5) color = '#0ea5e9';
        else if (progress < 0.8) color = '#a855f7';
        else color = '#f59e0b';

        ctx.beginPath();
        ctx.arc(x, y, radius, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Time text
        const totalSec = Math.floor(elapsedMs / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const timeStr = `${min}:${sec.toString().padStart(2, '0')}`;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = `800 10px 'JetBrains Mono', monospace`;
        ctx.fillText(timeStr, x, y - 3);

        // Rounds count
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `600 8px 'JetBrains Mono', monospace`;
        ctx.fillText(`R${roundsPlayed}`, x, y + 10);

        ctx.restore();
    }
}
