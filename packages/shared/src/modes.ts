import type { Mode, SideRole } from "./schemas.ts";

export type SlotKind = "music" | "act" | "food" | "brand" | "local" | "split";

export interface SlotTemplate {
  key: string;
  label: string;
  /** Offset from doors in minutes, and length. */
  offsetMin: number;
  lengthMin: number;
  kind: SlotKind;
  /** What the Programmer is asked to produce for this slot. */
  brief: string;
  /** Qloo chain the slot must use (tool names, in order). */
  chain: string[];
  targetType: "artist" | "brand" | "place" | "podcast" | "person";
  picks: number;
}

export interface ModeTemplate {
  mode: Mode;
  label: string;
  tagline: string;
  sideRoles: { role: SideRole; label: string; required: boolean; max: number }[];
  compareLabel: (a: string, b: string) => string;
  slots: SlotTemplate[];
}

const walkIn = (label: string, offset: number, len: number): SlotTemplate => ({
  key: "walk_in",
  label,
  offsetMin: offset,
  lengthMin: len,
  kind: "music",
  brief: "Walk-in playlist artists from doors to the first act. Order them so energy builds toward the first act.",
  chain: ["qloo_recommend", "qloo_rank"],
  targetType: "artist",
  picks: 6,
});

const food = (label: string, offset: number, len: number): SlotTemplate => ({
  key: "food_drink",
  label,
  offsetMin: offset,
  lengthMin: len,
  kind: "food",
  brief: "Food and drink partners and dishes that fit tonight's crowd around the venue.",
  chain: ["qloo_where_popular", "qloo_recommend", "qloo_rank"],
  targetType: "place",
  picks: 4,
});

const sponsors = (label: string, offset: number, len: number): SlotTemplate => ({
  key: "brands",
  label,
  offsetMin: offset,
  lengthMin: len,
  kind: "brand",
  brief: "Merch collaborations and brand activations with a sponsor-fit score against the crowd.",
  chain: ["qloo_recommend", "qloo_compare_audiences", "qloo_rank"],
  targetType: "brand",
  picks: 4,
});

const local = (key: string, label: string, offset: number, len: number): SlotTemplate => ({
  key,
  label,
  offsetMin: offset,
  lengthMin: len,
  kind: "local",
  brief: "Neighbourhood spots for the pre-show and after-party guide, where the crowd's taste is strong.",
  chain: ["qloo_where_popular", "qloo_recommend"],
  targetType: "place",
  picks: 4,
});

export const MODES: Record<Mode, ModeTemplate> = {
  concert: {
    mode: "concert",
    label: "Concert",
    tagline: "Headliner, support and a room to fill",
    sideRoles: [
      { role: "headliner", label: "Headliner", required: true, max: 1 },
      { role: "support", label: "Support", required: false, max: 3 },
    ],
    compareLabel: (a, b) => `${a} fans vs ${b} fans`,
    slots: [
      walkIn("Doors & walk-in", 0, 60),
      {
        key: "openers",
        label: "Opener & changeover",
        offsetMin: 60,
        lengthMin: 45,
        kind: "act",
        brief: "Rank opener candidates (local acts supplied by the venue plus Qloo recommendations) and flag rising acts.",
        chain: ["qloo_recommend", "qloo_rank", "qloo_trends"],
        targetType: "artist",
        picks: 3,
      },
      food("Bars & food", 0, 240),
      sponsors("Merch & activations", 0, 240),
      local("after_party", "After-party guide", 225, 120),
    ],
  },
  comedy: {
    mode: "comedy",
    label: "Comedy",
    tagline: "Openers, room vibe and the interval",
    sideRoles: [
      { role: "headliner", label: "Headliner", required: true, max: 1 },
      { role: "support", label: "MC / openers", required: false, max: 3 },
    ],
    compareLabel: (a, b) => `${a} crowd vs ${b} crowd`,
    slots: [
      { ...walkIn("Doors & room music", 0, 30), picks: 5, brief: "Room music before the show: warm, talk-over-able artists that fit the crowd." },
      {
        key: "openers",
        label: "MC & openers",
        offsetMin: 30,
        lengthMin: 30,
        kind: "act",
        brief: "Rank opener comedians (local acts supplied by the room plus Qloo recommendations) and flag rising acts.",
        chain: ["qloo_recommend", "qloo_rank", "qloo_trends"],
        targetType: "person",
        picks: 3,
      },
      {
        key: "interval",
        label: "Interval clips & podcasts",
        offsetMin: 60,
        lengthMin: 15,
        kind: "act",
        brief: "Podcasts and shows to clip on the interval screens, ranked for this crowd.",
        chain: ["qloo_recommend", "qloo_rank"],
        targetType: "podcast",
        picks: 3,
      },
      food("Bar & snacks", 0, 150),
      sponsors("Sponsors", 0, 150),
      local("after_party", "After-show spots", 135, 90),
    ],
  },
  sports: {
    mode: "sports",
    label: "Sports",
    tagline: "Home vs away, halftime and the concourse",
    sideRoles: [
      { role: "home", label: "Home team", required: true, max: 1 },
      { role: "away", label: "Away team", required: true, max: 1 },
    ],
    compareLabel: (a, b) => `${a} vs ${b} supporters`,
    slots: [
      { ...walkIn("Gates & warm-up playlist", 0, 75), brief: "Warm-up playlist from gates to kick-off: music both fan bases share, building energy to kick-off." },
      {
        key: "halftime",
        label: "Halftime act",
        offsetMin: 120,
        lengthMin: 15,
        kind: "act",
        brief: "Rank halftime / interval act candidates (local acts supplied by the venue plus Qloo recommendations); prefer acts both fan bases share.",
        chain: ["qloo_recommend", "qloo_rank", "qloo_trends"],
        targetType: "artist",
        picks: 3,
      },
      { ...food("Concourse food", 0, 210), brief: "Concourse food and drink vendors that fit both fan bases around the stadium." },
      sponsors("Sponsor activations", 0, 210),
      local("fan_zone", "City fan zone & post-match", -120, 120),
    ],
  },
  festival: {
    mode: "festival",
    label: "Festival",
    tagline: "Stage by stage for the day",
    sideRoles: [{ role: "stage_act", label: "Stage acts", required: true, max: 8 }],
    compareLabel: (a, b) => `${a} vs ${b} audiences`,
    slots: [
      { ...walkIn("Gates & between-sets music", 0, 600), picks: 8 },
      {
        key: "openers",
        label: "Discovery stage",
        offsetMin: 60,
        lengthMin: 480,
        kind: "act",
        brief: "Rank discovery-stage acts (local acts supplied by the organiser plus Qloo recommendations) and flag rising acts.",
        chain: ["qloo_recommend", "qloo_rank", "qloo_trends"],
        targetType: "artist",
        picks: 4,
      },
      food("Food village", 0, 600),
      sponsors("Brand village", 0, 600),
      local("after_party", "After-parties", 600, 180),
    ],
  },
  dining: {
    mode: "dining",
    label: "Dining",
    tagline: "Restaurants and bars, service by service",
    sideRoles: [
      { role: "house", label: "Your restaurant or bar", required: true, max: 1 },
      { role: "theme", label: "Theme or guest (artist, film, brand)", required: false, max: 2 },
    ],
    compareLabel: (a, b) => `${a} regulars vs ${b} fans`,
    slots: [
      {
        ...walkIn("Arrivals & early seating", 0, 90),
        picks: 5,
        brief: "Dining-room playlist for arrivals and the first seating: warm, talk-over-able artists that fit the room's crowd. Keep the volume low and the energy gentle.",
      },
      {
        key: "peak",
        label: "Peak service",
        offsetMin: 90,
        lengthMin: 120,
        kind: "music",
        brief: "Playlist for the busiest part of service: a lift in energy that still sits under conversation. Order the artists so the room warms up.",
        chain: ["qloo_recommend", "qloo_rank"],
        targetType: "artist",
        picks: 5,
      },
      {
        ...sponsors("Drinks & pairings", 0, 300),
        brief: "Wine, spirits, beer and soft-drink brands to pour or feature tonight, with a sponsor-fit score against the room's crowd. Respect the age rating.",
      },
      {
        key: "collab",
        label: "Guest collab & pop-up",
        offsetMin: 0,
        lengthMin: 300,
        kind: "food",
        brief: "Other restaurants, bakeries or bars in the city whose audience overlaps tonight's: candidates for a guest dish, a pop-up or a cross-promotion.",
        chain: ["qloo_where_popular", "qloo_recommend", "qloo_rank"],
        targetType: "place",
        picks: 4,
      },
      {
        key: "late",
        label: "Late lounge set",
        offsetMin: 210,
        lengthMin: 90,
        kind: "music",
        brief: "Late-evening lounge playlist for dessert, the bar and the last orders: slower, deeper picks that fit the crowd.",
        chain: ["qloo_recommend", "qloo_rank"],
        targetType: "artist",
        picks: 4,
      },
      local("after_party", "After-dinner guide", 270, 90),
    ],
  },
};

export const LIMITATIONS: string[] = [
  "Qloo results describe aggregate cultural affinities of audiences. They say nothing about any individual attendee's identity, preferences or behaviour.",
  "An affinity score is a relative signal, not a probability that tonight's crowd will like or buy something, and not a causal claim.",
  "Scores from separate Qloo calls are not comparable; each ranking only orders the options it was given.",
  "Coverage is uneven: local acts, small vendors and niche comedians can have thin or no Qloo signal. Those are labelled, never invented.",
  "Demographic charts are aggregate distributions from Qloo, used only for tone and pricing. They are never used to admit, exclude or target people.",
  "House Mix does not make eligibility decisions (entry, employment, credit, housing, insurance) and refuses requests to.",
];

export function slotTime(doors: string, offsetMin: number, lengthMin: number): string {
  const [h, m] = doors.split(":").map(Number) as [number, number];
  const fmt = (mins: number) => {
    const t = ((mins % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  const start = h * 60 + m + offsetMin;
  return `${fmt(start)}–${fmt(start + lengthMin)}`;
}
