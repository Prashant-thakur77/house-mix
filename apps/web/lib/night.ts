import type { PlanItem, Show, Slot } from "@housemix/shared";

/** Minutes from midnight on the show day; times after midnight continue past 1440. */
export function toMin(hhmm: string, after = 0): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  let v = h * 60 + m;
  while (v < after - 6 * 60) v += 1440;
  return v;
}

export function fmt(min: number): string {
  const t = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export type Owner = "Sound / DJ" | "Stage manager" | "F&B" | "Partnerships" | "Front of house";
export const OWNERS: Owner[] = ["Sound / DJ", "Stage manager", "F&B", "Partnerships", "Front of house"];

const OWNER_BY_KIND: Record<Slot["kind"], Owner> = { music: "Sound / DJ", act: "Stage manager", food: "F&B", brand: "Partnerships", local: "Front of house", split: "Front of house" };

export interface Segment {
  id: string;
  slotKey: string;
  slotLabel: string;
  kind: Slot["kind"];
  start: number;
  end: number;
  item: PlanItem;
  /** Something you hear: a track on the walk-in, or a performer's set. */
  audible: boolean;
}

export interface Cue {
  id: string;
  at: number;
  owner: Owner;
  title: string;
  detail: string;
  slotLabel: string;
  itemId: string;
}

export interface Night {
  start: number;
  end: number;
  slots: { key: string; label: string; kind: Slot["kind"]; start: number; end: number }[];
  segments: Segment[];
  cues: Cue[];
}

const live = (i: PlanItem) => i.approval.state !== "swapped" && i.approval.state !== "rejected";

/**
 * Lays the plan out as a night: music slots become a sequence of tracks, act slots a sequence of
 * sets, and every other slot a set of openings at its start. Each line becomes a crew cue.
 */
export function buildNight(show: Show): Night {
  const doors = toMin(show.input.doorsTime ?? "18:30");
  const slots = (show.plan?.slots ?? []).map((s) => {
    const [a, b] = s.timeRange.split("–") as [string, string];
    const start = toMin(a, doors);
    let end = toMin(b, start);
    if (end <= start) end += 1440;
    return { key: s.key, label: s.label, kind: s.kind, start, end, items: s.items.filter(live) };
  });
  const segments: Segment[] = [];
  const cues: Cue[] = [];
  for (const s of slots) {
    const owner = OWNER_BY_KIND[s.kind];
    // Stretch picks go last in a sequence, as the wildcard of the set.
    const ordered = [...s.items].sort((x, y) => Number(x.isWildcard) - Number(y.isWildcard));
    if (s.kind === "music" || s.kind === "act") {
      const n = Math.max(1, ordered.length);
      const len = (s.end - s.start) / n;
      ordered.forEach((item, k) => {
        const start = s.start + k * len;
        segments.push({ id: `${s.key}-${item.id}`, slotKey: s.key, slotLabel: s.label, kind: s.kind, start, end: start + len, item, audible: item.pick.type === "artist" });
        cues.push({ id: `c-${item.id}`, at: start, owner, title: s.kind === "music" ? `Play ${item.pick.name}` : `${item.pick.name} on stage`, detail: item.action || item.interpretation, slotLabel: s.label, itemId: item.id });
      });
    } else {
      ordered.forEach((item, k) => {
        segments.push({ id: `${s.key}-${item.id}`, slotKey: s.key, slotLabel: s.label, kind: s.kind, start: s.start, end: s.end, item, audible: false });
        cues.push({ id: `c-${item.id}`, at: s.start + k * 2, owner, title: s.kind === "brand" ? `Activate ${item.pick.name}` : s.kind === "food" ? `Open ${item.pick.name}` : `Point guests to ${item.pick.name}`, detail: item.action || item.interpretation, slotLabel: s.label, itemId: item.id });
      });
    }
  }
  cues.sort((a, b) => a.at - b.at || a.owner.localeCompare(b.owner));
  const start = Math.min(doors, ...slots.map((s) => s.start));
  const end = Math.max(start + 60, ...slots.map((s) => s.end));
  return { start, end, slots, segments, cues };
}

/** A delay pushes every cue at or after `from` later, as a show caller re-times the night. */
export function shifted(at: number, from: number, delay: number) {
  return at >= from ? at + delay : at;
}
