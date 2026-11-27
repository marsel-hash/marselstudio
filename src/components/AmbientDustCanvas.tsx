import { useEffect, useRef } from 'react';

interface DustParticle {
  x: number;
  y: number;
  size: number;
  depth: number;
  vx: number;
  vy: number;
  swayPhase: number;
  swayFreq: number;
  swayAmp: number;
  pulsePhase: number;
  pulseFreq: number;
  baseAlpha: number;
  spriteIdx: 0 | 1 | 2;
}

function createGlowSprite(
  innerColor: string,
  midColor: string,
  outerColor: string
): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const center = size / 2;
    const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.32, midColor);
    grad.addColorStop(1, outerColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}

function createParticle(width: number, height: number): DustParticle {
  const depth = 0.25 + Math.random() * 0.75;
  const randTint = Math.random();
  const spriteIdx: 0 | 1 | 2 = randTint < 0.52 ? 0 : randTint < 0.86 ? 1 : 2;
  const isBokeh = Math.random() < 0.22;

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    size: isBokeh ? 7 + depth * 9 : 2.6 + depth * 4.4,
    depth,
    vx: (Math.random() - 0.35) * (3 + depth * 5),
    vy: -(3.5 + depth * 8.5),
    swayPhase: Math.random() * Math.PI * 2,
    swayFreq: 0.18 + Math.random() * 0.34,
    swayAmp: 3 + Math.random() * 7,
    pulsePhase: Math.random() * Math.PI * 2,
    pulseFreq: 0.35 + Math.random() * 0.55,
    baseAlpha: isBokeh ? 0.08 + depth * 0.1 : 0.14 + depth * 0.22,
    spriteIdx,
  };
}

export function AmbientDustCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    const sprites = [
      createGlowSprite(
        'rgba(244, 239, 230, 0.92)',
        'rgba(244, 239, 230, 0.32)',
        'rgba(244, 239, 230, 0)'
      ),
      createGlowSprite(
        'rgba(218, 184, 118, 0.9)',
        'rgba(198, 161, 91, 0.3)',
        'rgba(198, 161, 91, 0)'
      ),
      createGlowSprite(
        'rgba(232, 148, 102, 0.78)',
        'rgba(216, 87, 42, 0.22)',
        'rgba(216, 87, 42, 0)'
      ),
    ];

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let particles: DustParticle[] = [];

    const resize = () => {
      width = Math.max(window.innerWidth, 300);
      height = Math.max(window.innerHeight, 300);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = Math.min(
        68,
        Math.max(26, Math.round((width * height) / 26000))
      );
      if (particles.length === 0) {
        particles = Array.from({ length: targetCount }, () =>
          createParticle(width, height)
        );
      } else if (particles.length < targetCount) {
        while (particles.length < targetCount) {
          particles.push(createParticle(width, height));
        }
      } else if (particles.length > targetCount) {
        particles.length = targetCount;
      }
    };

    resize();

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;

    const drawFrame = (dt: number, animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      const margin = 20;
      for (const p of particles) {
        if (animate) {
          p.x +=
            (p.vx + Math.sin(elapsed * p.swayFreq + p.swayPhase) * p.swayAmp) * dt;
          p.y += p.vy * dt;

          if (p.y < -margin) {
            p.y = height + margin;
            p.x = Math.random() * width;
          } else if (p.y > height + margin) {
            p.y = -margin;
          }

          if (p.x < -margin) {
            p.x = width + margin;
          } else if (p.x > width + margin) {
            p.x = -margin;
          }
        }

        const pulse = animate
          ? 0.72 + 0.28 * Math.sin(elapsed * p.pulseFreq + p.pulsePhase)
          : 0.85;
        ctx.globalAlpha = p.baseAlpha * pulse;
        const half = p.size / 2;
        ctx.drawImage(sprites[p.spriteIdx], p.x - half, p.y - half, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      if (disposed) return;
      if (document.hidden || motionQuery?.matches) {
        rafId = 0;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;
      drawFrame(dt, true);
      rafId = requestAnimationFrame(tick);
    };

    const startOrRenderStatic = () => {
      if (disposed) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
      if (motionQuery?.matches) {
        drawFrame(0, false);
        return;
      }
      if (!document.hidden) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
        startOrRenderStatic();
      }
    };

    const handleResize = () => {
      resize();
      if (motionQuery?.matches) {
        drawFrame(0, false);
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    motionQuery?.addEventListener?.('change', startOrRenderStatic);

    startOrRenderStatic();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      motionQuery?.removeEventListener?.('change', startOrRenderStatic);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[8] mix-blend-screen"
    />
  );
}
