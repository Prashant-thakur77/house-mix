"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { FlaskConical, Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { useHealth } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight" aria-label="House Mix home">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 18V9M9 18V5M14 18v-7M19 18V8" />
        </svg>
      </span>
      <span className="text-h3">House Mix</span>
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The stored theme is only known after mount; render "system" until then so server and client HTML match.
  const current = mounted ? (theme ?? "system") : "system";
  const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : SunMoon;
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`Theme: ${current}. Switch to ${next}.`} title={`Theme: ${current}`}>
      <Icon />
    </Button>
  );
}

export function HealthBadge() {
  const { health, error } = useHealth();
  const state = error ? "down" : !health ? "checking" : !health.qlooReady ? "degraded" : health.qlooMode;
  const label = { down: "API offline", checking: "Checking", degraded: "Qloo not ready", mock: "Qloo mock", live: "Qloo live" }[state];
  const dot = { down: "bg-status-error", checking: "bg-muted-foreground", degraded: "bg-status-degraded", mock: "bg-signal", live: "bg-status-ok" }[state];
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button type="button" className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-small font-medium" aria-label={`Qloo connection: ${label}`}>
            <span className={cn("size-2 rounded-full", dot)} aria-hidden />
            {label}
          </button>
        }
      />
      <HoverCardContent className="w-72 text-small">
        <div className="mb-2 font-medium">qloo_capabilities</div>
        {error ? (
          <p className="text-muted-foreground">{error}</p>
        ) : health ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="font-mono">{health.qlooMode}</dd>
            <dt className="text-muted-foreground">Ready</dt>
            <dd className="font-mono">{String(health.qlooReady)}</dd>
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="font-mono">{health.contractVersion ?? "n/a"}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-mono">{health.model}</dd>
            <dt className="text-muted-foreground">Audio</dt>
            <dd className="font-mono">{health.ttsAvailable ? "Cloud TTS" : "device voices"}</dd>
          </dl>
        ) : (
          <p className="text-muted-foreground">Checking the Qloo MCP server…</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function MockBanner() {
  const { health } = useHealth();
  if (health?.qlooMode !== "mock") return null;
  return (
    <div role="note" className="no-print flex min-h-8 items-center justify-center gap-2 bg-signal-bg px-4 py-1 text-center text-small font-medium text-signal">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold tracking-wide">MOCK DATA</strong> · Qloo responses are fictional fixtures until the live key is connected. Nothing here is measured.
      </span>
    </div>
  );
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <span className="pointer-events-none absolute -bottom-px left-0 h-[2px] w-16 bg-ring" aria-hidden />
      <MockBanner />
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 md:px-6">
        <Logo />
        <nav className="ml-2 hidden items-center gap-1 text-small md:flex" aria-label="Main">
          <Link className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" href="/new">
            Plan a show
          </Link>
          <Link className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" href="/compare">
            Compare
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {children}
          <HealthBadge />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
