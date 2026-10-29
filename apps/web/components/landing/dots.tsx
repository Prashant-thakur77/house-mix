"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";

/** Cheap value noise (no dependencies). */
function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]!;
  const grad = (h: number) => (h / 255) * 2 - 1;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const a = grad(perm[perm[xi]! + yi]!);
    const b = grad(perm[perm[xi + 1]! + yi]!);
    const c = grad(perm[perm[xi]! + yi + 1]!);
    const d = grad(perm[perm[xi + 1]! + yi + 1]!);
    const u = fade(xf);
    const v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/**
 * Dot-matrix terrain: dots where drifting noise passes a threshold, denser towards the bottom.
 * Decorative only; paused off-screen and drawn once for reduced motion.
 */
export function DotField({ color = "#3A3A3A", step = 5, className, seed = 7, rise = 0.55 }: { color?: string; step?: number; className?: string; seed?: number; rise?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const noise = makeNoise(seed);
    // Phones and reduced motion get one still frame; the drift only runs on larger screens.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 767px)").matches;
    let raf = 0;
    let visible = true;
    let last = 0;
    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const drift = t * 0.00004;
      for (let y = 0; y < h; y += step) {
        const bias = (y / h - (1 - rise)) * 1.6; // more land towards the bottom
        for (let x = 0; x < w; x += step) {
          const n = noise(x * 0.006 + drift, y * 0.009) * 0.7 + noise(x * 0.018 - drift * 2, y * 0.02) * 0.3;
          if (n + bias > 0.32) ctx.fillRect(x, y, 1.6, 1.6);
        }
      }
    };
    const loop = (t: number) => {
      if (visible && t - last > 120) {
        draw(t);
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)));
    io.observe(canvas);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);
    const onResize = () => draw(performance.now());
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [color, step, seed, rise]);
  return <canvas ref={ref} className={cn("pointer-events-none absolute inset-0 size-full", className)} aria-hidden />;
}
