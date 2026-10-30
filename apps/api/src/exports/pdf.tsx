import { Document, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { PlanItem, Show } from "@housemix/shared";
import { BRAND_COLORS, BRAND_MARK, MODES } from "@housemix/shared";
import { topAreas } from "../insights/heatmap.ts";

const C = {
  ink: "#14161a",
  muted: "#5b616e",
  line: "#d9dce3",
  accent: "#3d4ed8",
  qloo: "#0f6e5f",
  ours: "#7a4b00",
  warn: "#8a5a00",
  bg: "#f5f6f8",
};

const s = StyleSheet.create({
  page: { padding: 36, paddingTop: 64, fontSize: 9, color: C.ink, fontFamily: "Helvetica" },
  eyebrow: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2, lineHeight: 1.2 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 },
  meta: { color: C.muted, marginTop: 3 },
  banner: { backgroundColor: "#fff4d6", color: C.warn, padding: 6, marginTop: 8, borderRadius: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 5 },
  time: { width: 62, color: C.muted, fontFamily: "Courier" },
  pick: { width: 150, fontFamily: "Helvetica-Bold" },
  body: { flex: 1 },
  qloo: { color: C.qloo, marginTop: 2 },
  ours: { color: C.ours, marginTop: 2 },
  chip: { fontSize: 7, color: C.muted },
  box: { backgroundColor: C.bg, padding: 8, borderRadius: 3, marginTop: 6 },
  foot: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
  big: { fontSize: 36, fontFamily: "Helvetica-Bold", color: C.accent, lineHeight: 1 },
});

const label = (it: PlanItem) =>
  [
    it.isWildcard ? "STRETCH" : "",
    it.confidence !== "high" ? "REDUCED CONFIDENCE" : "",
    it.approval.state.toUpperCase(),
    it.fitScore !== undefined ? `FIT ${it.fitScore}` : "",
    it.rising ? "RISING" : "",
  ]
    .filter(Boolean)
    .join(" · ");

/** The House Mix mark, top right of every page. */
function Mark() {
  return (
    <Svg viewBox="0 0 32 32" style={{ position: "absolute", top: 30, right: 36, width: 26, height: 26 }} fixed>
      <Rect x={0} y={0} width={32} height={32} rx={6} fill={BRAND_COLORS.ink} />
      {BRAND_MARK.flatMap((row, y) =>
        row
          .split("")
          .map((c, x) => (c === "." ? null : <Rect key={`${x}-${y}`} x={4.6 + x * 2.6} y={4.6 + y * 2.6} width={2.2} height={2.2} fill={c === "R" ? BRAND_COLORS.red : BRAND_COLORS.paper} />)),
      )}
    </Svg>
  );
}

function Footer({ show }: { show: Show }) {
  return (
    <View style={s.foot} fixed>
      <Text>
        House Mix · {show.title} · plan v{show.version}
        {show.lockedAt ? ` · locked ${show.lockedAt.slice(0, 16).replace("T", " ")} UTC` : " · draft"}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function RunOfShow({ show }: { show: Show }) {
  const plan = show.plan!;
  const i = show.input;
  return (
    <Document title={`Run of show: ${show.title}`} author="House Mix">
      <Page size="A4" style={s.page}>
        <Mark />
        <Text style={s.eyebrow}>{MODES[i.mode].label} · run of show</Text>
        <Text style={s.h1}>{show.title}</Text>
        <Text style={s.meta}>
          {i.venue}, {i.city} · {i.date} · doors {i.doorsTime} · {i.capacityTier}
        </Text>
        {show.qlooMode === "mock" ? <Text style={s.banner}>MOCK DATA: produced against fictional mock Qloo fixtures, not live Qloo results.</Text> : null}
        {plan.headline ? <Text style={{ marginTop: 8, fontSize: 10 }}>{plan.headline}</Text> : null}

        <Text style={s.h2}>Crowd read</Text>
        {plan.crowd.qlooSays.map((l, n) => (
          <Text key={`q${n}`} style={s.qloo}>
            Qloo says: {l}
          </Text>
        ))}
        {plan.crowd.interpretation.map((l, n) => (
          <Text key={`o${n}`} style={s.ours}>
            Our interpretation: {l}
          </Text>
        ))}

        {plan.slots.map((slot) => (
          // A slot may break across pages; a pick's row never does, and a heading keeps its first row with it.
          <View key={slot.key}>
            <Text style={s.h2} minPresenceAhead={60}>
              {slot.label} <Text style={s.chip}>{slot.timeRange}</Text>
            </Text>
            {slot.items.length === 0 ? <Text style={s.ours}>Needs manual input. {slot.note ?? ""}</Text> : null}
            {slot.items
              .filter((it) => it.approval.state !== "swapped")
              .map((it) => (
                <View key={it.id} style={s.row} wrap={false}>
                  <Text style={s.time}>{it.isWildcard ? "stretch" : it.pick.type}</Text>
                  <View style={s.pick}>
                    <Text>{it.pick.name}</Text>
                    <Text style={s.chip}>{label(it)}</Text>
                  </View>
                  <View style={s.body}>
                    {it.action ? <Text>{it.action}</Text> : null}
                    <Text style={s.qloo}>Qloo says: {it.qlooSays}</Text>
                    <Text style={s.ours}>Our interpretation: {it.interpretation}</Text>
                    {it.approval.reason ? <Text style={s.chip}>Reason: {it.approval.reason}</Text> : null}
                  </View>
                </View>
              ))}
          </View>
        ))}

        {show.heatmap?.layers.length ? (
          <View wrap={false}>
            <Text style={s.h2}>Street teams &amp; flyering · {show.heatmap.within}</Text>
            {topAreas(show.heatmap).map((a, n) => (
              <Text key={a.id} style={s.qloo}>
                {n + 1}. {a.km.toFixed(1)} km {a.bearing} of centre (area {a.id}){a.overlap ? ", strong for every side" : ""}:{" "}
                {a.values.map((v) => `${v.label} ${v.affinity === undefined ? "n/a" : v.affinity.toFixed(2)}`).join(", ")}
              </Text>
            ))}
            <Text style={s.chip}>Qloo where_popular, one call per side. Aggregate taste by area, not where individuals live.</Text>
          </View>
        ) : null}

        {show.counterfactual && show.counterfactual.planVersion === show.version ? (
          <View wrap={false}>
            <Text style={s.h2}>Without Qloo</Text>
            <Text>
              The same brief planned by {show.counterfactual.model} with no tools: {show.counterfactual.summary.llmResolved} of {show.counterfactual.summary.llmPicks} picks found in Qloo (
              {show.counterfactual.summary.llmAmbiguous} ambiguous, {show.counterfactual.summary.llmNotFound} not found), none with a Qloo citation. Qloo ranked a House Mix pick first in{" "}
              {show.counterfactual.summary.slotsQlooLed} of {show.counterfactual.summary.rankedSlots} slots.
            </Text>
            <Text style={s.chip}>Qloo is ranking House Mix&apos;s own picks here, so this is not an independent quality test; the blind A/B in eval/ is.</Text>
          </View>
        ) : null}

        <View style={s.box} wrap={false}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Limitations</Text>
          {plan.limitations.map((l, n) => (
            <Text key={n}>• {l}</Text>
          ))}
          <Text style={{ marginTop: 4, color: C.muted }}>
            Evidence: {plan.stats.qlooCalls} Qloo calls ({plan.stats.toolsUsed.length} tools), {plan.stats.cacheHits} cache hits, {plan.stats.criticDrops} items removed by the Critic.
          </Text>
        </View>
        <Footer show={show} />
      </Page>
    </Document>
  );
}

function SponsorOnePager({ show, item }: { show: Show; item: PlanItem }) {
  const crowd = show.plan!.crowd;
  const rankScores = item.evidence.find((e) => e.tool === "qloo_rank")?.scores;
  const rank = rankScores?.rank !== undefined && rankScores.of !== undefined ? { rank: rankScores.rank, of: rankScores.of } : undefined;
  return (
    <Document title={`Sponsor fit: ${item.pick.name}`} author="House Mix">
      <Page size="A4" style={s.page}>
        <Mark />
        <Text style={s.eyebrow}>Sponsor one-pager · {MODES[show.input.mode].label}</Text>
        <Text style={[s.h1, { paddingRight: 48 }]}>
          {item.pick.name} × {show.title}
        </Text>
        <Text style={s.meta}>
          {show.input.venue}, {show.input.city} · {show.input.date}
        </Text>
        {show.qlooMode === "mock" ? <Text style={s.banner}>MOCK DATA: fictional mock Qloo fixtures, not live Qloo results.</Text> : null}
        <View style={{ flexDirection: "row", marginTop: 14, alignItems: "center" }}>
          <Text style={s.big}>{item.fitScore ?? (rank ? `#${rank.rank}` : "–")}</Text>
          <Text style={{ marginLeft: 10, color: C.muted, flex: 1 }}>
            {item.fitScore !== undefined
              ? "audience similarity (0–100), from Qloo's crowd-vs-brand comparison. Our formula; not a Qloo score."
              : `${rank ? `Qloo rank among ${rank.of} brands for this crowd. ` : ""}No sponsor-fit score: Qloo's comparison of this crowd and the brand's audience shared no concepts, so none is claimed.`}
          </Text>
        </View>
        <Text style={s.h2}>Proposed activation</Text>
        <Text>{item.action || "To be agreed with the partner."}</Text>
        <Text style={s.h2}>Why this brand fits tonight</Text>
        <Text style={s.qloo}>Qloo says: {item.qlooSays}</Text>
        <Text style={s.ours}>Our interpretation: {item.interpretation}</Text>
        <Text style={s.h2}>Tonight's crowd</Text>
        {crowd.qlooSays.slice(0, 3).map((l, n) => (
          <Text key={n} style={s.qloo}>
            Qloo says: {l}
          </Text>
        ))}
        <Text style={s.h2}>Evidence</Text>
        {item.evidence.map((e) => (
          <View key={e.callId} style={s.row}>
            <Text style={{ width: 130, fontFamily: "Courier" }}>{e.tool}</Text>
            <Text style={{ width: 60 }}>{e.status}</Text>
            <Text style={s.body}>
              {Object.entries(e.scores)
                .map(([k, v]) => `${k} ${v}`)
                .join(", ") || "present in results"}
              {"  "}
              <Text style={s.chip}>call {e.callId}</Text>
            </Text>
          </View>
        ))}
        <View style={s.box}>
          <Text>
            Qloo results describe aggregate audience affinities. They do not predict any individual's behaviour or purchases, and the similarity figure is a relative signal, not a forecast of sales.
          </Text>
        </View>
        <Footer show={show} />
      </Page>
    </Document>
  );
}

const OWNER: Record<string, string> = { music: "Sound / DJ", act: "Stage manager", food: "F&B", brand: "Partnerships", local: "Front of house", split: "Front of house" };
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

/** The night on paper for the crew: every slot in running order, who owns it, and what happens when; music slots as timed songs. */
function CueSheet({ show }: { show: Show }) {
  const i = show.input;
  const playlist = (key: string) => show.music?.playlists.find((p) => p.slotKey === key);
  const live = (it: PlanItem) => it.approval.state !== "swapped" && it.approval.state !== "rejected";
  return (
    <Document title={`Cue sheet: ${show.title}`} author="House Mix">
      <Page size="A4" style={s.page}>
        <Mark />
        <Text style={s.eyebrow}>{MODES[i.mode].label} · cue sheet</Text>
        <Text style={s.h1}>{show.title}</Text>
        <Text style={s.meta}>
          {i.venue}, {i.city} · {i.date} · doors {i.doorsTime}
        </Text>
        {show.qlooMode === "mock" ? <Text style={s.banner}>MOCK DATA: produced against fictional mock Qloo fixtures, not live Qloo results.</Text> : null}
        <View style={s.box}>
          <Text>
            Songs are each picked artist's most popular recordings in Apple's catalogue. Play them through the venue's own licensed music service: a personal streaming account is not licensed for
            public performance.
          </Text>
        </View>
        {show.plan!.slots.map((slot) => {
          const pl = playlist(slot.key);
          return (
            <View key={slot.key}>
              <Text style={s.h2} minPresenceAhead={60}>
                {slot.timeRange} · {slot.label} <Text style={s.chip}>{OWNER[slot.kind] ?? ""}</Text>
              </Text>
              {pl
                ? pl.entries.map((e, n) => (
                    <View key={n} style={s.row} wrap={false}>
                      <Text style={s.time}>{e.at}</Text>
                      <Text style={s.pick}>{e.track.artist}</Text>
                      <Text style={s.body}>
                        {e.track.title} <Text style={s.chip}>{mmss(e.track.durationMs)}</Text>
                      </Text>
                    </View>
                  ))
                : slot.items.filter(live).map((it) => (
                    <View key={it.id} style={s.row} wrap={false}>
                      <Text style={s.time}>{it.isWildcard ? "stretch" : it.pick.type}</Text>
                      <Text style={s.pick}>{it.pick.name}</Text>
                      <Text style={s.body}>{it.action || it.interpretation}</Text>
                    </View>
                  ))}
            </View>
          );
        })}
        <Footer show={show} />
      </Page>
    </Document>
  );
}

export async function cueSheetPdf(show: Show): Promise<Buffer> {
  return renderToBuffer(<CueSheet show={show} />);
}

export async function runOfShowPdf(show: Show): Promise<Buffer> {
  return renderToBuffer(<RunOfShow show={show} />);
}

export async function sponsorPdf(show: Show, item: PlanItem): Promise<Buffer> {
  return renderToBuffer(<SponsorOnePager show={show} item={item} />);
}
