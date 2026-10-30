/**
 * Synthesized cues for "Run the night". Nothing here is a real recording: each track gets a short
 * generated loop in a style chosen from tonight's crowd read (Qloo tags), seeded by the pick's ID
 * so the same pick always sounds the same. Scheduling follows the Web Audio lookahead pattern
 * ("A tale of two clocks"): a 25 ms timer queues notes for the next 120 ms on the audio clock.
 */

export type Profile = "groove" | "dream" | "drive" | "club" | "lounge" | "stadium";

export const PROFILE_LABEL: Record<Profile, string> = {
  groove: "groove (funk, soul, psych)",
  dream: "dreamy (indie, dream pop)",
  drive: "driving (rock, high energy)",
  club: "club (electronic, dance)",
  lounge: "lounge (jazz, comedy room)",
  stadium: "stadium (matchday)",
};

const PROFILE_WORDS: [Profile, RegExp][] = [
  ["club", /house|techno|electronic|edm|dance|garage/],
  ["groove", /funk|soul|disco|psychedelic|groove|r&b|hip hop|jazz funk|world/],
  ["drive", /rock|punk|metal|high energy|grunge/],
  ["dream", /dream|indie|shoegaze|ambient|chill|folk|bedroom/],
];

/** Chooses a style from the crowd's taste vocabulary: earlier (stronger) tags weigh more. */
export function profileFor(tags: string[], mode: string): Profile {
  if (mode === "sports") return "stadium";
  if (mode === "comedy") return "lounge";
  const score = new Map<Profile, number>();
  tags.forEach((tag, i) => {
    for (const [p, re] of PROFILE_WORDS) if (re.test(tag.toLowerCase())) score.set(p, (score.get(p) ?? 0) + 1 / (i + 1));
  });
  // A dining room defaults to lounge unless its crowd clearly leans somewhere else.
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (mode === "dining" ? "lounge" : "groove");
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BPM: Record<Profile, [number, number]> = { groove: [100, 112], dream: [82, 94], drive: [128, 140], club: [120, 126], lounge: [84, 96], stadium: [96, 104] };
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 4, 3],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
];
// Scale degrees → semitones (natural minor for most styles, major for lounge and stadium).
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export interface TrackStyle {
  profile: Profile;
  bpm: number;
  root: number; // MIDI note of the key's root
  progression: number[];
}

export function styleFor(id: string, profile: Profile): TrackStyle {
  const h = hash(id);
  const [lo, hi] = BPM[profile];
  return { profile, bpm: lo + (h % (hi - lo + 1)), root: 45 + ((h >>> 5) % 12), progression: PROGRESSIONS[(h >>> 9) % PROGRESSIONS.length]! };
}

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class CueSynth {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private master: GainNode;
  private el: HTMLAudioElement | undefined;
  private bus: GainNode | undefined;
  private noise: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | undefined;
  private style: TrackStyle | undefined;
  private step = 0;
  private nextTime = 0;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.analyser).connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  set volume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Crossfades to a new track (or to silence with undefined). */
  play(style: TrackStyle | undefined) {
    const now = this.ctx.currentTime;
    if (this.bus) {
      const old = this.bus;
      old.gain.setTargetAtTime(0, now, 0.25);
      setTimeout(() => old.disconnect(), 1500);
      this.bus = undefined;
    }
    this.style = style;
    if (!style) return this.stopTimer();
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(1, now, 0.3);
    this.bus.connect(this.master);
    this.step = 0;
    this.nextTime = now + 0.05;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  /**
   * The real song instead of a cue: a 30-second preview (Apple's catalogue) through the same gain and analyser, so the
   * mute button and the visualiser work on it. Undefined stops it. It loops while its artist is on.
   */
  preview(url: string | undefined) {
    if (!url) {
      this.el?.pause();
      return;
    }
    if (!this.el) {
      this.el = new Audio();
      this.el.crossOrigin = "anonymous";
      this.el.loop = true;
      const lift = this.ctx.createGain();
      lift.gain.value = 1.3;
      this.ctx.createMediaElementSource(this.el).connect(lift).connect(this.master);
    }
    if (this.el.src !== url) this.el.src = url;
    void this.el.play().catch(() => undefined);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  close() {
    this.stopTimer();
    this.el?.pause();
    void this.ctx.close();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private schedule() {
    const s = this.style;
    const bus = this.bus;
    if (!s || !bus) return;
    const sixteenth = 60 / s.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.note(s, bus, this.step, this.nextTime, sixteenth);
      const swing = s.profile === "groove" || s.profile === "lounge" ? (this.step % 2 ? -0.08 : 0.08) * sixteenth : 0;
      this.nextTime += sixteenth + swing;
      this.step = (this.step + 1) % 64;
    }
  }

  /** One sixteenth-note step of the pattern for this style. */
  private note(s: TrackStyle, bus: GainNode, step: number, t: number, len: number) {
    const beat = step % 16;
    const bar = Math.floor(step / 16);
    const scale = s.profile === "lounge" || s.profile === "stadium" ? MAJOR : MINOR;
    const degree = s.progression[bar % s.progression.length]!;
    const chordRoot = s.root + scale[degree % 7]!;
    const chord = [0, 2, 4].map((k) => s.root + scale[(degree + k) % 7]! + (degree + k >= 7 ? 12 : 0));
    const p = s.profile;
    // Drums
    const kick =
      p === "club" || p === "stadium"
        ? beat % 4 === 0
        : p === "drive"
          ? beat % 4 === 0 || beat === 10
          : p === "dream"
            ? beat === 0 || beat === 9
            : p === "lounge"
              ? beat === 0 || beat === 10
              : beat === 0 || beat === 7 || beat === 10;
    if (kick) this.kick(bus, t, p === "dream" || p === "lounge" ? 0.55 : 0.9);
    if (beat === 4 || beat === 12) p === "club" || p === "stadium" ? this.clap(bus, t) : this.snare(bus, t, p === "dream" || p === "lounge" ? 0.25 : 0.5);
    const hat = p === "club" ? beat % 4 === 2 : p === "drive" ? beat % 2 === 0 : p === "lounge" ? beat % 4 === 0 || beat % 4 === 3 : beat % 2 === 0 || (p === "groove" && beat % 4 === 3);
    if (hat) this.hat(bus, t, p === "club" && beat % 4 === 2 ? 0.12 : 0.05, p === "club" ? 0.18 : 0.05);
    // Bass
    const bassHit =
      p === "club"
        ? beat % 4 === 2
        : p === "drive"
          ? beat % 2 === 0
          : p === "lounge"
            ? beat % 4 === 0
            : p === "dream"
              ? beat === 0 || beat === 8
              : beat === 0 || beat === 3 || beat === 6 || beat === 10 || beat === 14;
    if (bassHit) this.tone(bus, mtof(chordRoot - 12 + (p === "lounge" && beat === 8 ? 7 : 0)), t, len * (p === "dream" ? 6 : 1.6), p === "drive" ? "sawtooth" : "triangle", 0.22, 600);
    // Harmony: stabs, pads or chords
    if (p === "dream" && beat === 0) chord.forEach((n) => this.tone(bus, mtof(n + 12), t, len * 15, "sine", 0.05, 1800, 0.4));
    if ((p === "groove" || p === "club") && (beat === 2 || beat === 10)) chord.forEach((n) => this.tone(bus, mtof(n + 12), t, len * 1.2, "square", 0.025, 2200));
    if (p === "drive" && beat % 8 === 0) [0, 7, 12].forEach((iv) => this.tone(bus, mtof(chordRoot + iv), t, len * 7, "sawtooth", 0.03, 1400));
    if (p === "lounge" && (beat === 0 || beat === 6)) [...chord, chord[0]! + 11].forEach((n) => this.tone(bus, mtof(n + 12), t, len * 5, "triangle", 0.03, 2500, 0.02));
    if (p === "stadium" && beat === 0 && bar % 2 === 0) this.crowd(bus, t, len * 30);
    // A little melody on top for the dreamier and groovier styles
    if ((p === "dream" || p === "groove") && (beat === 6 || beat === 14) && hash(`${s.root}|${step}`) % 3 === 0) this.tone(bus, mtof(chord[(step >> 2) % 3]! + 24), t, len * 2, "sine", 0.04, 4000);
  }

  private env(g: GainNode, t: number, peak: number, dur: number, attack = 0.004) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private kick(bus: GainNode, t: number, peak: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, peak, 0.35);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(bus: GainNode, t: number, peak: number, dur: number, type: BiquadFilterType, freq: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t, peak, dur, 0.002);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private snare(bus: GainNode, t: number, peak: number) {
    this.noiseHit(bus, t, peak, 0.18, "bandpass", 1800);
    this.tone(bus, 190, t, 0.08, "triangle", peak * 0.4, 3000);
  }

  private clap(bus: GainNode, t: number) {
    for (const d of [0, 0.012, 0.025]) this.noiseHit(bus, t + d, 0.35, 0.12, "bandpass", 1400);
  }

  private hat(bus: GainNode, t: number, peak: number, dur: number) {
    this.noiseHit(bus, t, peak, dur, "highpass", 7500);
  }

  private crowd(bus: GainNode, t: number, dur: number) {
    // A soft swell of filtered noise: the room, not a recording.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur);
  }

  private tone(bus: GainNode, freq: number, t: number, dur: number, type: OscillatorType, peak: number, cutoff: number, attack = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    this.env(g, t, peak, dur, attack);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
