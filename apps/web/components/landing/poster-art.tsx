import { useId } from "react";
import type { Mode } from "@housemix/shared";
import { cn } from "cn";

/** Gig-poster art per mode: flat shapes in the stripe palette with a few looping details. Decorative only. */

function Concert() {
  const id = `g${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6B4CF6" />
          <stop offset="1" stopColor="#C4133C" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      <circle cx="300" cy="70" r="120" fill="#FF4F9A" opacity="0.35" />
      <g className="origin-[150px_165px] animate-spin-slow">
        <circle cx="150" cy="165" r="98" fill="#120F1C" />
        {[86, 74, 62, 50].map((r) => (
          <circle key={r} cx="150" cy="165" r={r} fill="none" stroke="#2D2840" strokeWidth="1.5" />
        ))}
        <circle cx="150" cy="165" r="30" fill="#FFC83D" />
        <path d="M150 140 a25 25 0 0 1 22 13" stroke="#160A12" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="150" cy="165" r="4" fill="#160A12" />
      </g>
      <g transform="translate(270 250)">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={i * 18}
            y={-110}
            width="11"
            height="110"
            rx="5"
            fill={["#FFC83D", "#FF9F1C", "#F2501E", "#FF4F9A", "#17A398", "#FFC83D"][i]}
            className="origin-bottom animate-eq"
            style={{ animationDelay: `${i * 0.13}s`, transformBox: "fill-box" }}
          />
        ))}
      </g>
    </svg>
  );
}

function Comedy() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
      <rect width="400" height="300" fill="#1A1020" />
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 9 }, (_, c) => (
          <rect key={`${r}-${c}`} x={c * 48 + (r % 2) * 24 - 24} y={r * 26 + 120} width="44" height="22" rx="2" fill="#7A1F2E" opacity={0.55 + ((r * 7 + c) % 5) * 0.06} />
        )),
      )}
      <path d="M200 0 L320 300 L80 300 Z" fill="#FFC83D" opacity="0.22" className="animate-live" style={{ animationDuration: "3.2s" }} />
      <ellipse cx="200" cy="292" rx="120" ry="16" fill="#FFC83D" opacity="0.35" />
      <g transform="translate(200 150)">
        <rect x="-4" y="20" width="8" height="120" fill="#C9C2D6" />
        <rect x="-26" y="-58" width="52" height="84" rx="26" fill="#2A2436" stroke="#C9C2D6" strokeWidth="4" />
        {[-36, -22, -8, 6].map((y) => (
          <line key={y} x1="-18" x2="18" y1={y} y2={y} stroke="#C9C2D6" strokeWidth="2" opacity="0.6" />
        ))}
      </g>
      <g className="animate-float" style={{ ["--r" as string]: "-8deg" }}>
        <path d="M56 70 h92 a14 14 0 0 1 14 14 v26 a14 14 0 0 1 -14 14 h-58 l-18 16 v-16 h-16 a14 14 0 0 1 -14 -14 v-26 a14 14 0 0 1 14 -14z" fill="#FF4F9A" />
        <text x="102" y="104" textAnchor="middle" fontSize="22" fontWeight="800" fill="#160A12">
          HA!
        </text>
      </g>
    </svg>
  );
}

function Sports() {
  const id = `g${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F7F75" />
          <stop offset="1" stopColor="#17A398" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} x={i * 50} y="0" width="25" height="300" fill="#FFFFFF" opacity="0.05" />
      ))}
      <g fill="none" stroke="#E9FFFB" strokeWidth="3" opacity="0.85">
        <rect x="30" y="40" width="340" height="220" />
        <line x1="200" y1="40" x2="200" y2="260" />
        <circle cx="200" cy="150" r="38" />
        <rect x="30" y="100" width="46" height="100" />
        <rect x="324" y="100" width="46" height="100" />
      </g>
      <path d="M90 200 Q 200 40 320 150" fill="none" stroke="#FFC83D" strokeWidth="3" strokeDasharray="6 8" className="animate-live" />
      <g className="animate-float">
        <circle cx="318" cy="148" r="16" fill="#FFFFFF" />
        <path d="M318 136 l8 6 -3 9 h-10 l-3 -9z" fill="#160A12" />
      </g>
      <rect x="0" y="270" width="200" height="30" fill="#6B4CF6" />
      <rect x="200" y="270" width="200" height="30" fill="#C4133C" />
    </svg>
  );
}

function Festival() {
  const id = `g${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF9F1C" />
          <stop offset="1" stopColor="#FF4F9A" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      <g className="origin-[290px_96px] animate-spin-slow">
        <circle cx="290" cy="96" r="44" fill="#FFC83D" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x="287" y="30" width="6" height="18" rx="3" fill="#FFC83D" transform={`rotate(${i * 30} 290 96)`} />
        ))}
      </g>
      <path d="M0 240 Q 100 200 200 230 T 400 220 V300 H0Z" fill="#6B4CF6" />
      <g>
        <path d="M60 250 L130 140 L200 250Z" fill="#C4133C" />
        <path d="M130 140 L150 250 L110 250Z" fill="#160A12" opacity="0.35" />
        <path d="M190 252 L250 168 L310 252Z" fill="#17A398" />
        <line x1="130" y1="140" x2="130" y2="108" stroke="#160A12" strokeWidth="3" />
        <path d="M130 108 l26 8 -26 8z" fill="#FFC83D" className="animate-live" />
        <line x1="250" y1="168" x2="250" y2="140" stroke="#160A12" strokeWidth="3" />
        <path d="M250 140 l22 7 -22 7z" fill="#FFFFFF" className="animate-live" style={{ animationDelay: "0.6s" }} />
      </g>
      <path d="M20 40 Q 120 80 220 40" fill="none" stroke="#160A12" strokeWidth="1.5" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${34 + i * 28} ${48 + Math.sin((i / 6) * Math.PI) * 14} l10 0 -5 12z`} fill={["#C4133C", "#FFC83D", "#17A398", "#6B4CF6", "#FFFFFF", "#F2501E", "#C4133C"][i]} />
      ))}
    </svg>
  );
}

const ART: Record<Mode, () => React.ReactElement> = { concert: Concert, comedy: Comedy, sports: Sports, festival: Festival };

export function PosterArt({ mode, className }: { mode: Mode; className?: string }) {
  const Art = ART[mode];
  return (
    <div className={cn("overflow-hidden", className)}>
      <Art />
    </div>
  );
}
