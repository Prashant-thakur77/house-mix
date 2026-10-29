"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Gig-poster stripes; each block of the crowd carries one "taste". */
const PALETTE = ["#C4133C", "#F2501E", "#FF9F1C", "#FFC83D", "#17A398", "#6B4CF6", "#FF4F9A"];

function Crowd({ cols, rows, still }: { cols: number; rows: number; still: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = cols * rows;
  const seats = useMemo(() => {
    const out: { x: number; z: number; phase: number; scale: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jitter = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
        const j = jitter - Math.floor(jitter);
        out.push({ x: (c - cols / 2) * 0.62 + (r % 2) * 0.31 + (j - 0.5) * 0.18, z: -r * 0.62 - (j - 0.5) * 0.2, phase: j * Math.PI * 2, scale: 0.85 + j * 0.3 });
      }
    }
    return out;
  }, [cols, rows]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const color = new THREE.Color();
    seats.forEach((s, i) => {
      // Colour by taste block: columns fan out like the stripes on a poster.
      const block = Math.floor((((s.x / (cols * 0.62) + 0.5) * PALETTE.length + s.z * 0.15) % PALETTE.length) + PALETTE.length) % PALETTE.length;
      color.set(PALETTE[block]!);
      m.setColorAt(i, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [seats, cols]);

  const origin = useRef(new THREE.Vector2(0, 0));
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = still ? 1.2 : state.clock.elapsedTime;
    // The wave starts where the pointer is, like a crowd reacting to the stage.
    origin.current.lerp(new THREE.Vector2(state.pointer.x * cols * 0.31, -2 - state.pointer.y * rows * 0.25), 0.05);
    seats.forEach((s, i) => {
      const d = Math.hypot(s.x - origin.current.x, s.z - origin.current.y);
      const jump = Math.max(0, Math.sin(t * 3.2 - d * 0.55 + s.phase * 0.25)) ** 2 * 0.55;
      dummy.position.set(s.x, 0.55 * s.scale + jump, s.z);
      dummy.rotation.set(0, 0, Math.sin(t * 1.7 + s.phase) * 0.08);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <capsuleGeometry args={[0.2, 0.55, 4, 10]} />
      <meshStandardMaterial roughness={0.35} metalness={0.15} />
    </instancedMesh>
  );
}

function Beams({ still }: { still: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current || still) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.45 + i * 1.7) * 0.5 + (i - 1.5) * 0.25;
    });
  });
  const colors = ["#FF4F9A", "#FFC83D", "#17A398", "#9D8CFF"];
  return (
    <group ref={group} position={[0, 7.2, -5]}>
      {colors.map((c, i) => (
        <mesh key={c} position={[(i - 1.5) * 3.2, 0, 0]} rotation={[0.35, 0, (i - 1.5) * 0.25]}>
          <coneGeometry args={[2.4, 11, 32, 1, true]} />
          <meshBasicMaterial color={c} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Vinyl({ still }: { still: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!ref.current || still) return;
    ref.current.rotation.y += dt * 0.6;
    ref.current.position.y = 3.3 + Math.sin(state.clock.elapsedTime * 0.9) * 0.18;
  });
  return (
    <group ref={ref} position={[3.6, 3.3, -1.5]} rotation={[1.1, 0, 0.25]}>
      <mesh>
        <cylinderGeometry args={[1.05, 1.05, 0.06, 64]} />
        <meshStandardMaterial color="#121018" roughness={0.25} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.01, 48]} />
        <meshStandardMaterial color="#FF9F1C" roughness={0.5} />
      </mesh>
      {[0.55, 0.72, 0.9].map((r) => (
        <mesh key={r} position={[0, 0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.006, 6, 64]} />
          <meshStandardMaterial color="#3A3550" />
        </mesh>
      ))}
    </group>
  );
}

function Token({ position, color, still, speed = 1 }: { position: [number, number, number]; color: string; still: boolean; speed?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    if (!ref.current || still) return;
    ref.current.rotation.x += dt * 0.5 * speed;
    ref.current.rotation.y += dt * 0.7 * speed;
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * speed + position[0]) * 0.22;
  });
  return (
    <mesh ref={ref} position={position}>
      <torusKnotGeometry args={[0.32, 0.11, 96, 12]} />
      <meshStandardMaterial color={color} roughness={0.2} metalness={0.35} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function Lights({ still }: { still: boolean }) {
  const a = useRef<THREE.PointLight>(null);
  const b = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (still) return;
    const t = state.clock.elapsedTime;
    if (a.current) a.current.position.set(Math.sin(t * 0.6) * 6, 4, Math.cos(t * 0.6) * 2 - 2);
    if (b.current) b.current.position.set(Math.cos(t * 0.5) * -6, 3.5, Math.sin(t * 0.5) * 2 - 3);
  });
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[0, 6, 6]} intensity={1.1} />
      <pointLight ref={a} color="#FF4F9A" intensity={40} distance={14} />
      <pointLight ref={b} color="#17A398" intensity={36} distance={14} />
    </>
  );
}

/** Stage-eye view of tonight's crowd. Pauses off-screen; a still frame for reduced motion. */
export default function HeroScene({ reduced }: { reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    setSmall(window.innerWidth < 768);
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={reduced || !visible ? "demand" : "always"}
        camera={{ position: [0, 3.4, 7.6], fov: 48 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(0, 1.2, -3)}
      >
        <fog attach="fog" args={["#0B0A12", 7, 17]} />
        <Lights still={reduced} />
        <Beams still={reduced} />
        <Crowd cols={small ? 14 : 26} rows={small ? 9 : 12} still={reduced} />
        <Vinyl still={reduced} />
        <Token position={[-4.2, 3.6, -2]} color="#6B4CF6" still={reduced} />
        <Token position={[-1.6, 4.6, -4]} color="#FFC83D" still={reduced} speed={0.7} />
      </Canvas>
    </div>
  );
}
