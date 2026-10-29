/**
 * Responsible-use guardrails shared by the API (enforcement) and the web app (early feedback).
 * Only aggregate, public cultural signals may flow in or out.
 */

const PII_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "email address", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "phone number", re: /(?:\+?\d[\s().-]?){9,}\d/ },
  { name: "card or account number", re: /\b(?:\d[ -]?){13,19}\b/ },
  { name: "social handle", re: /(?:^|\s)@[A-Za-z0-9_]{3,}/ },
  { name: "IP address", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: "MAC or device address", re: /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i },
];

const ELIGIBILITY_PATTERNS: RegExp[] = [
  /\b(deny|refuse|block|ban|reject|screen out|turn away|exclude)\b.{0,40}\b(entry|admission|people|fans|attendees|guests|customers|applicants|ticket holders)\b/i,
  /\b(who|which (people|fans|guests|attendees))\b.{0,30}\b(let in|admit|allow in|should (we )?(ban|refuse|deny))\b/i,
  /\b(credit ?score|creditworth|loan|mortgage|insurance (premium|eligib)|hire|hiring|employ(ment|ee screening)|tenant|housing eligib)\b/i,
  /\b(religio|ethnic|race|racial|sexual orientation|immigration status|disabilit|pregnan|political (view|affiliation))\w*\b.{0,40}\b(target|exclude|identify|infer|profile)\b/i,
  /\b(target|exclude|identify|infer|profile)\b.{0,40}\b(religio|ethnic|race|racial|sexual orientation|immigration status|disabilit|pregnan|political (view|affiliation))/i,
];

export const ELIGIBILITY_REFUSAL =
  "House Mix only programmes a show for an aggregate crowd. It does not decide who may attend, work, borrow, rent or be insured, and it does not profile people by sensitive traits. Rephrase the request as a programming question about the event.";

export const PII_REFUSAL =
  "House Mix does not accept personal data (emails, phone numbers, handles, account or device IDs). Use public names of acts, teams, venues, brands and places only.";

export interface GuardResult {
  ok: boolean;
  kind?: "pii" | "eligibility";
  detail?: string;
  message?: string;
}

/** Qloo entity UUIDs and tag URNs are public catalogue IDs, not personal data. */
const QLOO_ID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\burn:[a-z0-9:_.-]+/gi;

export function checkText(raw: string): GuardResult {
  const text = raw.replace(QLOO_ID_RE, " ");
  for (const p of PII_PATTERNS) {
    if (p.re.test(text)) return { ok: false, kind: "pii", detail: p.name, message: PII_REFUSAL };
  }
  for (const re of ELIGIBILITY_PATTERNS) {
    if (re.test(text)) return { ok: false, kind: "eligibility", detail: "eligibility-type request", message: ELIGIBILITY_REFUSAL };
  }
  return { ok: true };
}

/** Walks any JSON-like value and checks every string it contains. */
export function checkValue(value: unknown, path = "$"): GuardResult & { path?: string } {
  if (typeof value === "string") {
    const r = checkText(value);
    return r.ok ? r : { ...r, path };
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = checkValue(value[i], `${path}[${i}]`);
      if (!r.ok) return r;
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const r = checkValue(v, `${path}.${k}`);
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}
