"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* A standing figure sampled into points from simple body parts (one arm raised, phone to face). */
type Part = { kind: "ellipsoid"; c: [number, number, number]; r: [number, number, number]; w: number } | { kind: "capsule"; a: [number, number, number]; b: [number, number, number]; r: number; w: number };

const PARTS: Part[] = [
  { kind: "ellipsoid", c: [0, 1.63, 0.01], r: [0.11, 0.13, 0.12], w: 0.07 },
  { kind: "ellipsoid", c: [0, 1.71, 0.05], r: [0.13, 0.04, 0.15], w: 0.03 }, // cap
  { kind: "capsule", a: [0, 1.44, 0], b: [0, 1.52, 0.01], r: 0.05, w: 0.015 },
  { kind: "ellipsoid", c: [0, 1.18, 0], r: [0.22, 0.27, 0.13], w: 0.22 },
  { kind: "ellipsoid", c: [0, 0.9, 0], r: [0.18, 0.12, 0.12], w: 0.07 },
  { kind: "capsule", a: [0.24, 1.38, 0], b: [0.29, 1.08, 0.02], r: 0.055, w: 0.05 },
  { kind: "capsule", a: [0.29, 1.08, 0.02], b: [0.25, 0.86, 0.08], r: 0.048, w: 0.04 },
  { kind: "capsule", a: [-0.24, 1.38, 0], b: [-0.3, 1.12, 0.08], r: 0.055, w: 0.05 },
  { kind: "capsule", a: [-0.3, 1.12, 0.08], b: [-0.11, 1.5, 0.15], r: 0.048, w: 0.04 },
  { kind: "ellipsoid", c: [-0.09, 1.58, 0.15], r: [0.03, 0.06, 0.015], w: 0.01 }, // phone
  { kind: "capsule", a: [0.1, 0.84, 0], b: [0.12, 0.45, 0.02], r: 0.075, w: 0.11 },
  { kind: "capsule", a: [0.12, 0.45, 0.02], b: [0.13, 0.08, 0], r: 0.062, w: 0.08 },
  { kind: "capsule", a: [-0.1, 0.84, 0], b: [-0.12, 0.45, 0.02], r: 0.075, w: 0.11 },
  { kind: "capsule", a: [-0.12, 0.45, 0.02], b: [-0.13, 0.08, 0], r: 0.062, w: 0.08 },
  { kind: "ellipsoid", c: [0.14, 0.04, 0.06], r: [0.06, 0.04, 0.12], w: 0.02 },
  { kind: "ellipsoid", c: [-0.14, 0.04, 0.06], r: [0.06, 0.04, 0.12], w: 0.02 },
];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function sampleFigure(n: number): Float32Array {
  const r = rng(39);
  const out = new Float32Array(n * 3);
  const total = PARTS.reduce((a, p) => a + p.w, 0);
  let i = 0;
  for (const p of PARTS) {
    const count = Math.round((p.w / total) * n);
    for (let k = 0; k < count && i < n; k++, i++) {
      // A random direction on the unit sphere, then onto the part's surface.
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const d = [s * Math.cos(th), u, s * Math.sin(th)] as const;
      if (p.kind === "ellipsoid") {
        out.set([p.c[0] + d[0] * p.r[0], p.c[1] + d[1] * p.r[1], p.c[2] + d[2] * p.r[2]], i * 3);
      } else {
        const t = r();
        const x = p.a[0] + (p.b[0] - p.a[0]) * t;
        const y = p.a[1] + (p.b[1] - p.a[1]) * t;
        const z = p.a[2] + (p.b[2] - p.a[2]) * t;
        out.set([x + d[0] * p.r, y + d[1] * p.r * 0.35, z + d[2] * p.r], i * 3);
      }
    }
  }
  for (; i < n; i++) out.set(out.subarray(0, 3), i * 3);
  return out;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uDisperse;
  uniform float uSize;
  attribute vec3 aTarget;
  attribute float aSeed;
  varying float vY;
  varying float vSeed;
  varying float vMix;
  void main() {
    // Each point leaves the figure at its own moment, so the figure crumbles into the crowd.
    float m = smoothstep(aSeed * 0.55, aSeed * 0.55 + 0.45, uDisperse);
    vec3 p = mix(position, aTarget, m);
    p.y += sin(uTime * 2.4 + aSeed * 40.0) * 0.012 * m;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 / -mv.z);
    vY = position.y;
    vSeed = aSeed;
    vMix = m;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  varying float vY;
  varying float vSeed;
  varying float vMix;
  void main() {
    // Scanlines with a faint RGB fringe, and one red scan line sweeping up the body.
    float line = fract(vY * 46.0 - uTime * 0.35);
    float band = smoothstep(0.0, 0.25, line) * smoothstep(1.0, 0.6, line);
    vec3 base = vec3(0.78, 0.8, 0.84);
    vec3 fringe = vec3(0.5 + 0.5 * sin(vY * 70.0 + uTime), 0.5 + 0.5 * sin(vY * 70.0 + uTime + 2.1), 0.5 + 0.5 * sin(vY * 70.0 + uTime + 4.2));
    vec3 col = mix(base, fringe, 0.16) * (0.5 + 0.5 * band);
    float scan = 1.0 - smoothstep(0.0, 0.035, abs(vY - mod(uTime * 0.38, 2.2) + 0.2));
    col = mix(col, vec3(0.91, 0.15, 0.11), scan * (1.0 - vMix));
    col = mix(col, vec3(0.78), vMix * 0.6);
    gl_FragColor = vec4(col, 0.55 + 0.45 * band);
  }
`;

function Figure({ count, disperse, still, pointer }: { count: number; disperse: React.RefObject<number>; still: boolean; pointer: React.RefObject<[number, number]> }) {
  const group = useRef<THREE.Group>(null);
  const geom = useMemo(() => {
    const fig = sampleFigure(count);
    const target = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const r = rng(7);
    // The crowd: the same figure, tiny, repeated on a floor grid in front of and around it.
    const COLS = 11;
    const ROWS = 4;
    const per = Math.floor(count / (COLS * ROWS));
    for (let i = 0; i < count; i++) {
      const k = Math.min(COLS * ROWS - 1, Math.floor(i / per));
      const cx = (k % COLS) - (COLS - 1) / 2;
      const cz = Math.floor(k / COLS);
      const jitter = (r() - 0.5) * 0.18;
      // Each mini figure takes an even spread of the big figure's points.
      const src = Math.floor(((i % per) / per) * count);
      target[i * 3] = cx * 0.44 + (cz % 2) * 0.22 + jitter * 0.4 + fig[src * 3]! * 0.2;
      target[i * 3 + 1] = fig[src * 3 + 1]! * 0.2 + cz * 0.06;
      target[i * 3 + 2] = 0.4 - cz * 0.5 + fig[src * 3 + 2]! * 0.2;
      seeds[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(fig, 3));
    g.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return g;
  }, [count]);
  // Built once and handed to the constructor, so the compiled program reads these exact uniform objects.
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: { value: 0 }, uDisperse: { value: 0 }, uSize: { value: 5 } }, transparent: true, depthWrite: false }),
    [],
  );
  const uniforms = material.uniforms as { uTime: { value: number }; uDisperse: { value: number }; uSize: { value: number } };
  useFrame((state, dt) => {
    uniforms.uTime.value = still ? 1.5 : uniforms.uTime.value + dt;
    // Ease towards the scroll position so the crowd forms smoothly between scroll events.
    uniforms.uDisperse.value += ((disperse.current ?? 0) - uniforms.uDisperse.value) * 0.12;
    uniforms.uSize.value = 5.2 * state.viewport.dpr;
    const g = group.current;
    if (g && !still) {
      const [px, py] = pointer.current;
      g.rotation.y += ((px * 0.6 - 0.35) - g.rotation.y) * 0.05;
      g.rotation.x += ((py * 0.08) - g.rotation.x) * 0.05;
    }
  });
  return (
    <group ref={group} position={[0, -0.95, 0]} rotation={[0, -0.35, 0]}>
      <points geometry={geom} material={material} />
    </group>
  );
}

/** The aggregate figure. Pauses off-screen; one still frame for reduced motion. */
export default function FigureScene({ disperse, reduced }: { disperse: React.RefObject<number>; reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef<[number, number]>([0, 0]);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0 });
    io.observe(el);
    const move = (e: PointerEvent) => (pointer.current = [(e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1]);
    window.addEventListener("pointermove", move);
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", move);
    };
  }, []);
  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden>
      <Canvas dpr={[1, 1.5]} frameloop={reduced || !visible ? "demand" : "always"} camera={{ position: [0, 0.2, 5.1], fov: 36 }} gl={{ antialias: false, alpha: true }}>
        <Figure count={14000} disperse={disperse} still={reduced} pointer={pointer} />
      </Canvas>
    </div>
  );
}
