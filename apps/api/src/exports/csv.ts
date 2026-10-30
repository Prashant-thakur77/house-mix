import type { Show } from "@housemix/shared";

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Ops CSV: one row per plan item, with its evidence reduced to tool/status/call IDs. */
export function planCsv(show: Show): string {
  const header = [
    "slot",
    "time",
    "pick",
    "type",
    "qloo_id",
    "wildcard",
    "approval",
    "approval_reason",
    "confidence",
    "fit_score",
    "rising",
    "action",
    "qloo_says",
    "our_interpretation",
    "evidence_tools",
    "evidence_status",
    "evidence_call_ids",
  ];
  const rows = [header.join(",")];
  for (const slot of show.plan?.slots ?? []) {
    for (const it of slot.items) {
      rows.push(
        [
          slot.label,
          slot.timeRange,
          it.pick.name,
          it.pick.type,
          it.pick.qlooId,
          it.isWildcard ? "stretch" : "",
          it.approval.state,
          it.approval.reason ?? "",
          it.confidence,
          it.fitScore ?? "",
          it.rising === undefined ? "" : it.rising ? "rising" : "steady",
          it.action,
          it.qlooSays,
          it.interpretation,
          it.evidence.map((e) => e.tool).join(" | "),
          it.evidence.map((e) => e.status).join(" | "),
          it.evidence.map((e) => e.callId).join(" | "),
        ]
          .map(cell)
          .join(","),
      );
    }
    if (slot.items.length === 0) rows.push([slot.label, slot.timeRange, "", "", "", "", "needs_manual_input", slot.note ?? ""].map(cell).join(","));
  }
  return `${rows.join("\n")}\n`;
}

const spotifySearch = (artist: string, title: string) => `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;

/**
 * The night's playlists, one row per song with its start time: ready to rebuild in the venue's licensed music service
 * (most import a CSV or an Apple Music / Spotify link) or to hand to the DJ.
 */
export function playlistCsv(show: Show): string {
  const rows = [["slot", "start", "artist", "song", "album", "length", "explicit", "apple_music", "spotify_search", "preview"].join(",")];
  for (const p of show.music?.playlists ?? []) {
    for (const e of p.entries) {
      const t = e.track;
      const len = `${Math.floor(t.durationMs / 60000)}:${String(Math.round((t.durationMs % 60000) / 1000)).padStart(2, "0")}`;
      rows.push([p.label, e.at, t.artist, t.title, t.album ?? "", len, t.explicit ? "yes" : "no", t.url, spotifySearch(t.artist, t.title), t.previewUrl ?? ""].map(cell).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

/** The same playlists as an extended M3U, each song pointing at its Apple Music page. */
export function playlistM3u(show: Show): string {
  const lines = ["#EXTM3U", `#PLAYLIST:${show.title}`];
  for (const p of show.music?.playlists ?? []) {
    lines.push(`#EXTGRP:${p.label} (${p.timeRange})`);
    for (const e of p.entries) lines.push(`#EXTINF:${Math.round(e.track.durationMs / 1000)},${e.track.artist} - ${e.track.title}`, e.track.url);
  }
  return `${lines.join("\n")}\n`;
}
