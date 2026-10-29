import { CircleCheck, CircleDashed, CircleHelp, CircleX, Contrast, LoaderCircle, Mic, Music, Sparkles, Tent, TrendingUp, TriangleAlert, Trophy } from "lucide-react";
import type { Mode, QlooStatus } from "@housemix/shared";
import { cn } from "cn";
import { PixelGlyph } from "@/components/pixel-glyph";

const STATUS: Record<QlooStatus | "running", { icon: typeof CircleCheck; label: string; cls: string }> = {
  ok: { icon: CircleCheck, label: "ok", cls: "bg-status-ok-bg text-status-ok" },
  empty: { icon: CircleDashed, label: "empty", cls: "bg-status-empty-bg text-status-empty" },
  needs_input: { icon: CircleHelp, label: "needs input", cls: "bg-status-needs-input-bg text-status-needs-input" },
  partial: { icon: Contrast, label: "partial", cls: "bg-status-partial-bg text-status-partial" },
  degraded: { icon: TriangleAlert, label: "degraded", cls: "bg-status-degraded-bg text-status-degraded" },
  error: { icon: CircleX, label: "error", cls: "bg-status-error-bg text-status-error" },
  running: { icon: LoaderCircle, label: "running", cls: "bg-muted text-muted-foreground" },
};

export function StatusChip({ status, className, compact }: { status: QlooStatus | "running"; className?: string; compact?: boolean }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-label font-medium normal-case tracking-normal", s.cls, className)}
      title={`Qloo status: ${s.label}`}
    >
      <Icon className={cn("size-3", status === "running" && "animate-spin motion-reduce:animate-none")} aria-hidden />
      <span className="sr-only">Status: </span>
      <span className={compact ? "sr-only" : undefined}>{s.label}</span>
    </span>
  );
}

export function ConfidenceChip({ confidence }: { confidence: "high" | "reduced" | "low" }) {
  const bars = confidence === "high" ? 3 : confidence === "reduced" ? 2 : 1;
  const label = confidence === "high" ? "High confidence" : confidence === "reduced" ? "Reduced confidence" : "Low confidence";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-label font-medium",
        confidence === "high" ? "border-border text-foreground" : "border-status-partial/40 bg-status-partial-bg text-status-partial",
      )}
      title={confidence === "high" ? "Every Qloo call behind this item returned ok." : "At least one Qloo call behind this item was partial or degraded."}
    >
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("w-[3px] rounded-[1px]", n <= bars ? "bg-current" : "bg-current/25")} style={{ height: 4 + n * 2 }} />
        ))}
      </span>
      {label}
    </span>
  );
}

export function StretchBadge() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-stretch-bg px-1.5 text-label font-medium text-stretch" title="Deliberately adjacent pick, outside the crowd's top tags">
      <Sparkles className="size-3" aria-hidden />
      Stretch
    </span>
  );
}

export function RisingBadge() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-status-ok-bg px-1.5 text-label font-medium text-status-ok" title="qloo_trends shows rising popularity over the last 90 days">
      <TrendingUp className="size-3" aria-hidden />
      Rising
    </span>
  );
}

export const MODE_META: Record<Mode, { label: string; icon: typeof Music }> = {
  concert: { label: "Concert", icon: Music },
  comedy: { label: "Comedy", icon: Mic },
  sports: { label: "Sports", icon: Trophy },
  festival: { label: "Festival", icon: Tent },
};

export function ModeChip({ mode, className }: { mode: Mode; className?: string }) {
  const m = MODE_META[mode];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-small font-medium", className)}>
      <PixelGlyph mode={mode} className="size-3.5" />
      {m.label}
    </span>
  );
}

export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  // The red "//" prefix is a CSS pseudo-element, so it never enters the text or the accessible name.
  return <div className={cn("kicker text-label font-medium uppercase text-muted-foreground", className)}>{children}</div>;
}
