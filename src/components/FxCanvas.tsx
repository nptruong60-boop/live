import React, { useEffect, useRef } from 'react';
import type { AmbientFxType, LiveAlert } from '../types/studio';
import { STAGE_H, STAGE_W } from '../utils/canvasMath';

interface FxCanvasProps {
  ambientType: AmbientFxType;
  ambientDensity: number;
  accentColor: string;
  accentColor2: string;
  performanceMode: boolean;
  activeAlert: LiveAlert | null;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  phase: number;
  alpha: number;
  color: string;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: string;
  life: number;
  decay: number;
}

/**
 * Resource-optimized Canvas FX layer.
 * Stops its animation loop completely when ambientType === 'none' and no burst is active (0% idle CPU).
 * In Performance Mode, disables ambient loops and caps particle counts tightly.
 */
export const FxCanvas: React.FC<FxCanvasProps> = React.memo(
  ({
    ambientType,
    ambientDensity,
    accentColor,
    accentColor2,
    performanceMode,
    activeAlert,
  }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const burstsRef = useRef<BurstParticle[]>([]);
    const lastAlertIdRef = useRef<string | null>(null);
    const wakeRef = useRef<() => void>(() => {});

    // Trigger burst when activeAlert changes
    useEffect(() => {
      if (!activeAlert || activeAlert.id === lastAlertIdRef.current) return;
      lastAlertIdRef.current = activeAlert.id;
      if (performanceMode) return;

      const palette = [accentColor, accentColor2, '#ffffff', '#fde047'];
      const count = 20;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const speed = 1.8 + Math.random() * 3.0;
        burstsRef.current.push({
          x: STAGE_W * 0.5 + (Math.random() - 0.5) * 70,
          y: STAGE_H * 0.24,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.4,
          gravity: 0.08,
          size: 2.2 + Math.random() * 2.6,
          color: palette[i % palette.length],
          life: 1,
          decay: 0.018 + Math.random() * 0.008,
        });
      }
      wakeRef.current();
    }, [activeAlert, accentColor, accentColor2, performanceMode]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = STAGE_W;
      canvas.height = STAGE_H;

      const effectiveAmbient = performanceMode ? 'none' : ambientType;
      const count =
        effectiveAmbient === 'none'
          ? 0
          : Math.max(4, Math.min(36, Math.round(ambientDensity)));

      const rising = effectiveAmbient === 'bokeh' || effectiveAmbient === 'sparkle';
      const createParticle = (randomY: boolean): AmbientParticle => ({
        x: Math.random() * STAGE_W,
        y: randomY ? Math.random() * STAGE_H : rising ? STAGE_H + 14 : -14,
        vx: (Math.random() - 0.5) * 0.3,
        vy: rising ? -(0.18 + Math.random() * 0.32) : 0.4 + Math.random() * 0.65,
        size:
          effectiveAmbient === 'bokeh'
            ? 8 + Math.random() * 14
            : effectiveAmbient === 'petals'
              ? 5 + Math.random() * 5
              : 2 + Math.random() * 3.5,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.03,
        phase: Math.random() * Math.PI * 2,
        alpha: effectiveAmbient === 'bokeh' ? 0.14 + Math.random() * 0.2 : 0.42 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? '#fda4af' : '#fde68a',
      });

      const pool: AmbientParticle[] = Array.from({ length: count }, () => createParticle(true));
      let rafId: number | null = null;
      let lastFrame = performance.now();

      const draw = (now: number) => {
        // Throttle to ~30fps for low CPU overhead
        if (now - lastFrame < 30) {
          rafId = requestAnimationFrame(draw);
          return;
        }
        const dt = Math.min((now - lastFrame) / 16.67, 2.2);
        lastFrame = now;

        ctx.clearRect(0, 0, STAGE_W, STAGE_H);

        for (let i = 0; i < pool.length; i++) {
          const p = pool[i];
          p.phase += 0.02 * dt;
          p.x += (p.vx + Math.sin(p.phase) * 0.35) * dt;
          p.y += p.vy * dt;
          p.angle += p.spin * dt;
          if (!rising && p.y > STAGE_H + 18) pool[i] = createParticle(false);
          else if (rising && p.y < -18) pool[i] = createParticle(false);

          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          if (effectiveAmbient === 'snow') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (effectiveAmbient === 'petals') {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size * 0.45, p.size * 0.85, 0.3, 0, Math.PI * 2);
            ctx.fill();
          } else if (effectiveAmbient === 'bokeh') {
            ctx.fillStyle = accentColor2;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (effectiveAmbient === 'sparkle') {
            const s = p.size;
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.3, -s * 0.3);
            ctx.lineTo(s, 0);
            ctx.lineTo(s * 0.3, s * 0.3);
            ctx.lineTo(0, s);
            ctx.lineTo(-s * 0.3, s * 0.3);
            ctx.lineTo(-s, 0);
            ctx.lineTo(-s * 0.3, -s * 0.3);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }

        const bursts = burstsRef.current;
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i];
          b.vy += b.gravity * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= b.decay * dt;
          if (b.life <= 0) {
            bursts.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, b.life);
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (pool.length > 0 || bursts.length > 0) {
          rafId = requestAnimationFrame(draw);
        } else {
          rafId = null;
        }
      };

      wakeRef.current = () => {
        if (rafId === null) {
          lastFrame = performance.now();
          rafId = requestAnimationFrame(draw);
        }
      };

      if (pool.length > 0 || burstsRef.current.length > 0) {
        rafId = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, STAGE_W, STAGE_H);
      }

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }, [ambientType, ambientDensity, accentColor, accentColor2, performanceMode]);

    return (
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-[35]"
      />
    );
  }
);
FxCanvas.displayName = 'FxCanvas';
