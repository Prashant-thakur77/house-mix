/**
 * Mirror of the harness's natural-language demographic parser (docs/QLOO_CONTRACT.md §3),
 * used to check that a phrase maps before it is sent, and by the mock server.
 */
export const AGE_BUCKETS: [string, number, number][] = [
  ["24_and_younger", 0, 24],
  ["25_to_29", 25, 29],
  ["30_to_34", 30, 34],
  ["35_to_44", 35, 44],
  ["45_to_54", 45, 54],
  ["55_and_older", 55, 120],
];

export function parseDemographic(text: string): { gender?: string; age?: string } | undefined {
  const t = text.normalize("NFKC").toLowerCase().trim();
  const out: { gender?: string; age?: string } = {};
  if (/\b(women|woman|female|ladies)\b/.test(t)) out.gender = "female";
  else if (/\b(men|man|male|guys)\b/.test(t)) out.gender = "male";
  const pick = (lo: number, hi: number) =>
    AGE_BUCKETS.filter(([, a, b]) => b >= lo && a <= hi)
      .map(([k]) => k)
      .join(",");
  const range = t.match(/(\d{2})\s*(?:-|–|to)\s*(\d{2,3})/);
  if (range) out.age = pick(Number(range[1]), Number(range[2]));
  else if (/\b(teens?|teenagers?|gen z)\b/.test(t)) out.age = "24_and_younger";
  else if (/\byoung\b/.test(t)) out.age = "24_and_younger,25_to_29";
  else if (/\bmillennials?\b/.test(t)) out.age = "30_to_34,35_to_44";
  else if (/\b(seniors?|elderly|retirees?)\b/.test(t)) out.age = "55_and_older";
  else if (/\bmiddle aged\b/.test(t)) out.age = "35_to_44,45_to_54";
  else {
    const over = t.match(/\b(?:over|older than|above)\s+(\d{2})/);
    const under = t.match(/\b(?:under|younger than|below)\s+(\d{2})/);
    if (over) out.age = pick(Number(over[1]), 120);
    else if (under) out.age = pick(0, Number(under[1]));
  }
  return out.gender || out.age ? out : undefined;
}

const LABEL: Record<string, [number, number]> = {
  "24_and_younger": [18, 24],
  "25_to_29": [25, 29],
  "30_to_34": [30, 34],
  "35_to_44": [35, 44],
  "45_to_54": [45, 54],
  "55_and_older": [55, 70],
};

/**
 * Builds an age-only phrase ("adults 25-34") from Qloo's aggregate age affinities: the strongest
 * bucket, widened to its neighbour when that neighbour is nearly as strong. Gender is never used.
 */
export function phraseFromAges(age: { bucket: string; value: number }[]): string {
  const known = age.filter((a) => LABEL[a.bucket]);
  if (!known.length) return "";
  const order = AGE_BUCKETS.map(([k]) => k);
  const sorted = [...known].sort((a, b) => b.value - a.value);
  const top = sorted[0]!;
  const i = order.indexOf(top.bucket);
  const neighbours = known.filter((a) => Math.abs(order.indexOf(a.bucket) - i) === 1).sort((a, b) => b.value - a.value);
  const pair = neighbours[0] && top.value - neighbours[0].value < 0.1 ? [top, neighbours[0]] : [top];
  const lo = Math.min(...pair.map((p) => LABEL[p.bucket]![0]));
  const hi = Math.max(...pair.map((p) => LABEL[p.bucket]![1]));
  return `adults ${lo}-${hi}`;
}
