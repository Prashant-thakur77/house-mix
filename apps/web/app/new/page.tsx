"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { checkText, MODES, type CapacityTier, type Mode, type ShowInput, type SideRole } from "@housemix/shared";
import { cn } from "cn";
import { api, ApiError } from "@/lib/api";
import { TopBar } from "@/components/app-shell";
import { Kicker, MODE_META } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TIERS: { id: CapacityTier; label: string; hint: string }[] = [
  { id: "club", label: "Club", hint: "< 500" },
  { id: "theatre", label: "Theatre", hint: "500–2k" },
  { id: "arena", label: "Arena", hint: "2k–20k" },
  { id: "stadium", label: "Stadium", hint: "20k+" },
];

const VIBE_SUGGESTIONS = ["groovy", "high energy", "family friendly", "late night", "nostalgic", "craft beer"];

interface SideRow {
  role: SideRole;
  name: string;
  stage?: string;
}

function defaultSides(mode: Mode): SideRow[] {
  if (mode === "sports") return [{ role: "home", name: "" }, { role: "away", name: "" }];
  if (mode === "festival") return [{ role: "stage_act", name: "", stage: "Main stage" }, { role: "stage_act", name: "", stage: "Second stage" }];
  return [{ role: "headliner", name: "" }];
}

function ChipInput({ id, label, values, onChange, placeholder, suggestions, hint }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[]; hint?: string }) {
  const [draft, setDraft] = useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t) && values.length < 6) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-3 focus-within:ring-ring/50">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-small">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded-sm text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-body outline-none placeholder:text-subtle-foreground"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      </div>
      {suggestions ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="rounded-full border px-2 py-0.5 text-small text-muted-foreground hover:bg-muted hover:text-foreground">
                + {s}
              </button>
            ))}
        </div>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function NewShow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("concert");
  const [sides, setSides] = useState<SideRow[]>(defaultSides("concert"));
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [doors, setDoors] = useState("18:30");
  const [tier, setTier] = useState<CapacityTier>("arena");
  const [budget, setBudget] = useState<"lean" | "standard" | "premium">("standard");
  const [age, setAge] = useState<"all_ages" | "16_plus" | "18_plus" | "21_plus">("all_ages");
  const [vibes, setVibes] = useState<string[]>([]);
  const [localActs, setLocalActs] = useState<string[]>([]);
  const [sponsors, setSponsors] = useState<string[]>([]);
  const [localOnly, setLocalOnly] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; body: string }>();
  const [touched, setTouched] = useState(false);

  const tpl = MODES[mode];
  const switchMode = (m: Mode) => {
    setMode(m);
    setSides(defaultSides(m));
  };

  const problems = useMemo(() => {
    const p: Record<string, string> = {};
    for (const r of tpl.sideRoles) {
      if (r.required && !sides.some((s) => s.role === r.role && s.name.trim())) p[`side_${r.role}`] = `Add the ${r.label.toLowerCase()}.`;
    }
    if (!venue.trim()) p.venue = "Add the venue.";
    if (!city.trim()) p.city = "Add the city.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) p.date = "Pick a date.";
    const guard = checkText([notes, ...vibes, ...localActs, ...sponsors, ...sides.map((s) => s.name)].join(" \n "));
    if (!guard.ok) p.guard = guard.message ?? "";
    return p;
  }, [tpl, sides, venue, city, date, notes, vibes, localActs, sponsors]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(problems).length) return;
    setSubmitting(true);
    setError(undefined);
    const input: ShowInput = {
      mode,
      sides: sides.filter((s) => s.name.trim()).map((s) => ({ role: s.role, name: s.name.trim(), ...(s.stage ? { stage: s.stage } : {}) })),
      venue: venue.trim(),
      city: city.trim(),
      date,
      doorsTime: doors,
      capacityTier: tier,
      houseRules: { budgetBand: budget, ageRating: age, vibeWords: vibes, localActs, sponsorExclusivities: sponsors, localOnlyVendors: localOnly, notes },
    };
    try {
      const show = await api.createShow(input);
      try {
        const mine = JSON.parse(localStorage.getItem("hm-my-shows") ?? "[]") as string[];
        localStorage.setItem("hm-my-shows", JSON.stringify([show.id, ...mine.filter((x) => x !== show.id)].slice(0, 20)));
      } catch {
        // storage unavailable (private mode): the show still opens; it just won't be listed on the landing page
      }
      toast.success(show.status === "needs_confirmation" ? "Qloo needs you to confirm a few names." : "Every name resolved with Qloo.");
      router.push(`/shows/${show.id}`);
    } catch (err) {
      const e2 = err as ApiError;
      setError({ title: e2.code === "personal_data" ? "Personal data is not accepted" : e2.code === "eligibility_request" ? "That request is out of scope" : "Could not create the show", body: e2.message });
      setSubmitting(false);
    }
  };

  const show = (k: string) => touched && problems[k];
  const roleRows = (role: SideRole) => sides.map((s, i) => ({ s, i })).filter(({ s }) => s.role === role);

  return (
    <>
      <TopBar />
      <main id="main" className="mx-auto max-w-[1280px] px-4 pb-20 pt-8 md:px-6">
        <Kicker>New show</Kicker>
        <h1 className="mt-1 text-h1 font-semibold">Describe tonight</h1>
        <p className="mt-1 max-w-[70ch] text-muted-foreground">Use public names only: acts, teams, venues, brands and places. Qloo resolves each one, and you confirm any that are ambiguous before the agent plans.</p>

        <form onSubmit={submit} noValidate className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="grid gap-6 lg:col-span-8">
            <fieldset className="grid gap-3 rounded-lg border bg-card p-4">
              <legend className="sr-only">Mode</legend>
              <Kicker>Mode</Kicker>
              <div role="radiogroup" aria-label="Event mode" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(MODES) as Mode[]).map((m) => {
                  const Icon = MODE_META[m].icon;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => switchMode(m)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                        mode === m ? "border-primary bg-accent text-accent-foreground" : "border-input hover:bg-muted",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span>
                        <span className="block font-medium">{MODES[m].label}</span>
                        <span className="block text-small text-muted-foreground">{MODES[m].tagline}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border bg-card p-4">
              <legend className="sr-only">The bill</legend>
              <Kicker>{mode === "sports" ? "The fixture" : mode === "festival" ? "Stage acts" : "The bill"}</Kicker>
              {mode === "sports" ? (
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  {(["home", "away"] as const).map((role, n) => (
                    <div key={role} className={cn("grid gap-1.5", n === 1 && "sm:order-3")}>
                      <Label htmlFor={`side-${role}`}>{role === "home" ? "Home team" : "Away team"}</Label>
                      <Input
                        id={`side-${role}`}
                        value={sides.find((s) => s.role === role)?.name ?? ""}
                        onChange={(e) => setSides((ss) => ss.map((s) => (s.role === role ? { ...s, name: e.target.value } : s)))}
                        placeholder={role === "home" ? "e.g. Los Angeles Dodgers" : "e.g. San Francisco Giants"}
                        aria-invalid={Boolean(show(`side_${role}`))}
                      />
                      {show(`side_${role}`) ? <p className="text-small text-destructive">{problems[`side_${role}`]}</p> : null}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="sm:order-2 sm:mb-0.5"
                    aria-label="Swap home and away"
                    onClick={() => setSides((ss) => ss.map((s) => ({ ...s, name: ss.find((x) => x.role === (s.role === "home" ? "away" : "home"))?.name ?? "" })))}
                  >
                    <ArrowLeftRight />
                  </Button>
                </div>
              ) : (
                tpl.sideRoles.map((r) => (
                  <div key={r.role} className="grid gap-2">
                    {roleRows(r.role).map(({ s, i }, n) => (
                      <div key={i} className="grid gap-1.5">
                        <Label htmlFor={`side-${i}`}>
                          {r.label}
                          {r.max > 1 ? ` ${n + 1}` : ""}
                          {!r.required ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
                        </Label>
                        <div className="flex gap-2">
                          {mode === "festival" ? (
                            <Input aria-label={`Stage for act ${n + 1}`} className="w-40" value={s.stage ?? ""} onChange={(e) => setSides((ss) => ss.map((x, j) => (j === i ? { ...x, stage: e.target.value } : x)))} placeholder="Stage" />
                          ) : null}
                          <Input
                            id={`side-${i}`}
                            value={s.name}
                            onChange={(e) => setSides((ss) => ss.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                            placeholder={r.role === "headliner" ? (mode === "comedy" ? "e.g. headlining comedian" : "e.g. Khruangbin") : mode === "comedy" ? "e.g. opener" : "e.g. Men I Trust"}
                            aria-invalid={Boolean(n === 0 && show(`side_${r.role}`))}
                          />
                          {(r.role !== "headliner" || n > 0) && roleRows(r.role).length > (r.required ? 1 : 0) ? (
                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${r.label.toLowerCase()} ${n + 1}`} onClick={() => setSides((ss) => ss.filter((_, j) => j !== i))}>
                              <X />
                            </Button>
                          ) : null}
                        </div>
                        {n === 0 && show(`side_${r.role}`) ? <p className="text-small text-destructive">{problems[`side_${r.role}`]}</p> : null}
                      </div>
                    ))}
                    {roleRows(r.role).length < r.max ? (
                      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setSides((ss) => [...ss, { role: r.role, name: "", ...(mode === "festival" ? { stage: "" } : {}) }])}>
                        <Plus data-icon="inline-start" /> Add {r.label.toLowerCase().replace(/s$/, "")}
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
              <legend className="sr-only">Venue and date</legend>
              <Kicker className="sm:col-span-2">Where and when</Kicker>
              <div className="grid gap-1.5">
                <Label htmlFor="venue">Venue</Label>
                <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Hollywood Bowl" aria-invalid={Boolean(show("venue"))} />
                {show("venue") ? <p className="text-small text-destructive">{problems.venue}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Los Angeles" aria-invalid={Boolean(show("city"))} />
                {show("city") ? <p className="text-small text-destructive">{problems.city}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(show("date"))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="doors">{mode === "sports" ? "Gates open" : "Doors"}</Label>
                <Input id="doors" type="time" value={doors} onChange={(e) => setDoors(e.target.value)} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <span id="tier-label" className="text-sm font-medium">
                  Capacity
                </span>
                <div role="radiogroup" aria-labelledby="tier-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TIERS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={tier === t.id}
                      onClick={() => setTier(t.id)}
                      className={cn("rounded-md border px-3 py-2 text-left", tier === t.id ? "border-primary bg-accent text-accent-foreground" : "border-input hover:bg-muted")}
                    >
                      <span className="block font-medium">{t.label}</span>
                      <span className="block font-mono text-small text-muted-foreground">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border bg-card p-4">
              <legend className="sr-only">House rules</legend>
              <Kicker>House rules</Kicker>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="budget">Budget band</Label>
                  <select id="budget" value={budget} onChange={(e) => setBudget(e.target.value as typeof budget)} className="h-8 rounded-md border border-input bg-background px-2 text-body">
                    <option value="lean">Lean</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="age">Age rating</Label>
                  <select id="age" value={age} onChange={(e) => setAge(e.target.value as typeof age)} className="h-8 rounded-md border border-input bg-background px-2 text-body">
                    <option value="all_ages">All ages</option>
                    <option value="16_plus">16+</option>
                    <option value="18_plus">18+</option>
                    <option value="21_plus">21+</option>
                  </select>
                </div>
              </div>
              <ChipInput id="vibes" label="Vibe words" values={vibes} onChange={setVibes} placeholder="Type and press Enter" suggestions={VIBE_SUGGESTIONS} hint="Matched to Qloo tags with qloo_find_tags. You pick the tag if the match is not exact." />
              <ChipInput id="local" label={mode === "comedy" ? "Local comedians to consider" : "Local acts to consider"} values={localActs} onChange={setLocalActs} placeholder="Names the venue already works with" hint="Ranked against tonight's crowd with qloo_rank. Acts Qloo has no signal for are listed, never invented." />
              <ChipInput id="sponsors" label="Exclusive sponsors" values={sponsors} onChange={setSponsors} placeholder="Brands with category exclusivity" hint="Scored for crowd fit with qloo_compare_audiences; competing brands are avoided." />
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                <Label htmlFor="local-only" className="font-normal">
                  Local vendors only for food and drink
                </Label>
                <Switch id="local-only" checked={localOnly} onCheckedChange={setLocalOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">Notes for the agent</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. no pyro, alcohol-free zone by the family stand" maxLength={500} />
              </div>
            </fieldset>

            {show("guard") ? (
              <Alert variant="destructive">
                <ShieldCheck />
                <AlertTitle>Only aggregate, public signals</AlertTitle>
                <AlertDescription>{problems.guard}</AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{error.title}</AlertTitle>
                <AlertDescription>{error.body}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" className="h-10 w-full px-5 text-sm sm:w-auto" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {submitting ? "Resolving names with Qloo…" : "Resolve and continue"}
              </Button>
              {touched && Object.keys(problems).length ? <p className="text-small text-destructive">Fix the highlighted fields first.</p> : null}
            </div>
          </div>

          <aside className="lg:col-span-4">
            <div className="sticky top-24 grid gap-3 rounded-lg border bg-card p-4">
              <Kicker>What the agent will do</Kicker>
              <ol className="grid gap-2 text-small">
                <li className="rounded-md bg-muted p-2">
                  <div className="font-medium">Resolve every name</div>
                  <div className="font-mono text-muted-foreground">qloo_describe · qloo_find_tags</div>
                </li>
                <li className="rounded-md bg-muted p-2">
                  <div className="font-medium">Read the crowd</div>
                  <div className="font-mono text-muted-foreground">compare_audiences · audience_demographics · entity_tags · trends</div>
                </li>
                {tpl.slots.map((s) => (
                  <li key={s.key} className="rounded-md border p-2">
                    <div className="font-medium">{s.label}</div>
                    <div className="font-mono text-muted-foreground">{s.chain.map((c) => c.replace("qloo_", "")).join(" → ")}</div>
                  </li>
                ))}
                <li className="rounded-md border border-dashed p-2">
                  <div className="font-medium">One stretch pick per slot, then the Critic</div>
                  <div className="text-muted-foreground">Anything without a Qloo citation is removed.</div>
                </li>
              </ol>
            </div>
          </aside>
        </form>
      </main>
    </>
  );
}
