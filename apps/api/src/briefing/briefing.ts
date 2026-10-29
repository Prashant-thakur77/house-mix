import { z } from "zod";
import type { Briefing, BriefingLine, Evidence, Show } from "@housemix/shared";
import { structured } from "../llm.ts";
import { synthesize } from "./tts.ts";

/** Facts the script may cite: the crowd read and every live plan item, each with its evidence. */
function factSheet(show: Show) {
  const plan = show.plan!;
  const facts: { id: string; text: string; evidence: Evidence[] }[] = [];
  plan.crowd.qlooSays.forEach((t, n) => facts.push({ id: `crowd_${n}`, text: `Qloo says: ${t}`, evidence: plan.crowd.evidence }));
  plan.crowd.interpretation.forEach((t, n) => facts.push({ id: `crowdi_${n}`, text: `Our interpretation of the crowd: ${t}`, evidence: plan.crowd.evidence }));
  for (const slot of plan.slots) {
    for (const it of slot.items) {
      if (it.approval.state === "rejected" || it.approval.state === "swapped") continue;
      facts.push({
        id: it.id,
        text: `${slot.label} (${slot.timeRange}): ${it.pick.name}${it.isWildcard ? " [stretch pick]" : ""}. Action: ${it.action}. Qloo says: ${it.qlooSays} Our interpretation: ${it.interpretation}`,
        evidence: it.evidence,
      });
    }
  }
  return facts;
}

const Script = z.object({
  lines: z.array(z.object({ speaker: z.enum(["A", "B"]), text: z.string(), fact_ids: z.array(z.string()) })).min(4).max(18),
});

const WRITER = `You write a pre-show audio briefing for venue staff (doors, bar, stage crew): two voices, A (the show caller) and B (the floor lead), about 90 seconds (~220 words total).
Cover: who tonight's crowd is (aggregate taste only), what will land in each slot, the stretch picks, and what to avoid.
Every line must cite the fact_ids it is based on, and may only say what those facts say. Do not add facts, numbers, names or claims that are not in the cited facts. Never describe individual people or sensitive traits; talk about "the crowd" in aggregate.
Natural, spoken, concise. No stage directions.`;

const Verdict = z.object({ verdicts: z.array(z.object({ index: z.number().int(), supported: z.boolean(), reason: z.string() })) });

const JUDGE = `You are the evidence judge for an audio briefing. For each line you get the line and the facts it cites.
supported = true only if every claim in the line is stated in or directly follows from the cited facts (spoken paraphrase is fine). Any added fact, number, name, ranking, causal claim or claim about individual people → supported = false, with the reason.`;

/** Script → evidence judge → two-voice audio. Lines the judge cannot support are dropped and listed. */
export async function buildBriefing(show: Show): Promise<{ briefing: Briefing; costUsd: number }> {
  if (!show.plan) throw new Error("Plan the show before building a briefing.");
  const facts = factSheet(show);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const written = await structured({
    purpose: "briefing_writer",
    schema: Script,
    system: WRITER,
    user: `Show: ${show.title}, ${show.input.venue}, ${show.input.city}, ${show.input.date}, doors ${show.input.doorsTime}.\nFacts:\n${facts.map((f) => `[${f.id}] ${f.text}`).join("\n")}`,
    effort: "medium",
  });
  const dropped: Briefing["dropped"] = [];
  const candidates = written.data.lines
    .map((l) => ({ ...l, fact_ids: l.fact_ids.filter((id) => byId.has(id)) }))
    .filter((l) => {
      if (l.fact_ids.length === 0) dropped.push({ text: l.text, reason: "Cites no fact from the plan." });
      return l.fact_ids.length > 0;
    });
  const judged = await structured({
    purpose: "briefing_judge",
    schema: Verdict,
    system: JUDGE,
    user: JSON.stringify(candidates.map((l, index) => ({ index, line: l.text, cited_facts: l.fact_ids.map((id) => byId.get(id)!.text) })), null, 1),
  });
  const verdicts = new Map(judged.data.verdicts.map((v) => [v.index, v]));
  const lines: BriefingLine[] = [];
  candidates.forEach((l, i) => {
    const v = verdicts.get(i);
    if (v && !v.supported) {
      dropped.push({ text: l.text, reason: v.reason });
      return;
    }
    const evidence = l.fact_ids.flatMap((id) => byId.get(id)!.evidence);
    const seen = new Set<string>();
    lines.push({ speaker: l.speaker, text: l.text, evidence: evidence.filter((e) => !seen.has(e.callId) && seen.add(e.callId)).slice(0, 4) });
  });
  const audio = await synthesize(show.id, show.version, lines);
  return {
    briefing: { lines: audio.lines, dropped, audio: audio.audio, createdAt: new Date().toISOString(), planVersion: show.version },
    costUsd: written.costUsd + judged.costUsd,
  };
}
