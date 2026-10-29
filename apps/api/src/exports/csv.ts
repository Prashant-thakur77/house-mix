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
