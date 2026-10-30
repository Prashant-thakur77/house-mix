"""The House Mix film, cut from Prashant's own recording (his face and voice), the live site's recordings
(video/record.mjs), the drawn and 3D scenes (graphics.html, three.html) and the narrator's lines (synth.py).

    python3 video/final.py            ->  ~/Videos/housemix/final/HouseMix-film.mp4 (+ a 720p copy)
    python3 video/final.py --preview  ->  the same cut with a placeholder card for each of his lines (before he records)

Every segment is described in EDL below: what to show, at what speed, what is heard (his line, a narrator line, or the
take's own sound), what the captions say and where the camera pushes in. Each renders to the same format, then they
join, and the house groove (video/music.py, composed to this cut's length) plays under them, ducked under every voice.
His lines are found in his recording automatically: each line of FACE_SCRIPT.txt is matched against a Whisper
transcript, and the clearer of his two takes is kept.
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from narration import load as narrator_lines  # noqa: E402

HOME = os.path.expanduser("~/Videos/housemix")
CLIPS = f"{HOME}/clips"
STILLS = f"{HOME}/stills"
PREVIEW = "--preview" in sys.argv
OUT = f"{HOME}/{'preview' if PREVIEW else 'final'}"
B = f"{OUT}/build"
FONTS = f"{HOME}/fonts"
FONT = f"{FONTS}/Geist-SemiBold.ttf"
MONO = f"{FONTS}/GeistMono-Medium.ttf"
W, H, FPS = 1920, 1080, 30
DARK = "0x0a0a0a"
ACCENT_HEX = "0xE8271C"
ACCENT = "&H001C27E8&"  # House Mix red (#E8271C), as ASS writes it (blue, green, red)
LEAD, TAIL = 0.25, 0.4
NAR_AT = 0.35  # where the narrator starts speaking in a segment
GAP = 0.45  # between two narrator lines in one segment
VOICE_CLEAN = "afftdn=nr=12:nf=-38:tn=1,deesser=i=0.4:f=0.55"
SFX = f"{HOME}/sfx"
QR = f"{STILLS}/qr.png"
TARGET = 178.0  # seconds: under the three-minute rule with a little room

# His lines, as written in FACE_SCRIPT.txt.
SCRIPT = {
    1: "I'm Prashant, and I built House Mix for the people who run the room.",
    2: "Every night they guess the music, the opener, the bar and the sponsor, for a crowd they've never met.",
    3: "So House Mix asks Qloo who's really coming.",
    4: "This is House Mix.",
    5: "Now, the part sponsors care about.",
    6: "If you're the brand paying for tonight, here's how you know you belong.",
    7: "And it isn't only stadiums.",
    8: "A comedy club gets openers who fit the headliner's crowd, and podcasts for the interval.",
    9: "A festival gets every stage programmed for the crowd moving between them.",
    10: "And a restaurant gets its whole service: the playlist, the drinks partner, the late lounge set.",
    11: "Five kinds of nights. One crowd read. Every pick backed by Qloo.",
    12: "We tested it the hard way: seven real shows, against Claude on its own.",
    13: "And on taste alone, a blind judge still preferred Claude. We're showing you that too.",
    14: "Doors open at seven. This time, the room is ready.",
    15: "House Mix is live. Open a show and check every receipt.",
}
FACE = next(iter(sorted(glob.glob(f"{HOME}/from-mac/face.*"))), "")
WORDS = f"{HOME}/build/face-words.json"
# How Whisper hears names, and how they're written.
# How Whisper hears names and a few of his words in this take, and how they're written (checked against the script).
SPELLED = {"prasanth": "Prashant", "prashanth": "Prashant", "clue": "Qloo", "qlu": "Qloo", "klu": "Qloo", "housemix": "House Mix", "kiss": "guess",
           "raid": "read", "drinker": "drinks", "partners": "partner", "launch": "lounge", "services": "service", "podcast": "podcasts",
           "headliners": "headliner's", "everything": "Every", "picked": "pick"}


def face_words() -> list[dict]:
    """Every word of the face take with its time, transcribed once (Whisper, on this machine) and kept."""
    if not os.path.exists(WORDS):
        from faster_whisper import WhisperModel

        os.makedirs(os.path.dirname(WORDS), exist_ok=True)
        wav = f"{os.path.dirname(WORDS)}/face.wav"
        run("-i", FACE, "-vn", "-ac", "1", "-ar", "16000", wav)
        model = WhisperModel("small.en", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(wav, word_timestamps=True, vad_filter=True, beam_size=5)
        words = [{"w": w.word.strip(), "s": w.start, "e": w.end} for seg_ in segments for w in seg_.words]
        json.dump(words, open(WORDS, "w"))
    return json.load(open(WORDS))


# His one continuous take (30 Oct 2026), cut by word times from Whisper (re-timed on short slices where words run
# together, and on the loudness envelope): (start, end) of each piece of a line. Line 3 keeps the second of a stuttered
# "Qloo", line 7 drops a false start ("And it's not,") and line 11 a repeated "picked"; lines 14 and 15 split at
# "House Mix is live".
RANGES = {
    1: [(0.91, 5.99)],
    2: [(6.49, 12.51)],
    3: [(13.15, 14.86), (15.30, 17.29)],
    4: [(18.35, 19.27)],
    5: [(20.15, 21.79)],
    6: [(22.11, 25.43)],
    7: [(28.50, 30.10)],
    8: [(30.17, 35.79)],
    9: [(36.31, 40.57)],
    10: [(40.77, 46.79)],
    11: [(47.43, 51.25), (52.29, 53.03)],
    12: [(53.59, 57.71)],
    13: [(58.27, 63.13)],
    14: [(64.35, 67.06)],
    15: [(67.45, 70.17)],
}
# What he said in each line (his own wording, names spelled right): the captions.
SAID = {
    1: "I'm Prashant, and I built House Mix for the people who run the room.",
    2: "So every night, they guess the music, the opener, the bar, and the sponsor, for a crowd they have never met.",
    3: "So House Mix asks Qloo: who is really coming?",
    4: "This is House Mix.",
    5: "Now, the part sponsors care about.",
    6: "If you are a brand paying for tonight, here's how you know you belong.",
    7: "It is not only stadiums.",
    8: "A comedy club gets openers who fit the headliner's crowd, and podcasts for the interval.",
    9: "A festival gets every stage programmed for the crowd moving between them.",
    10: "And a restaurant gets its whole service: the playlist, the drinks partner, the late lounge set.",
    11: "Five kinds of night. One crowd read. Every pick, backed by Qloo.",
    12: "And we have tested it the hard way. Seven real shows, against Claude on its own.",
    13: "And on taste alone, a blind judge still preferred Claude. We are showing you that too.",
    14: "Doors open at seven. This time, the room is ready.",
    15: "House Mix is live. Open a show and check every receipt.",
}
LINE_WORDS: dict[int, list[dict]] = {}


def line_src(n: int) -> str:
    return f"{HOME}/build/lines/line_{n:02d}.mkv"


_asr = None


def prepare_lines() -> None:
    """Each line as its own clip: its pieces joined, with exactly LEAD before and TAIL after. Where the take has less
    room than that before the next or previous word, the edge frame is held and padded with silence instead, so no
    neighbouring word is heard."""
    words = face_words()
    os.makedirs(f"{HOME}/build/lines", exist_ok=True)
    for n, pieces in RANGES.items():
        first, last = pieces[0][0], pieces[-1][1]
        before = max([w["e"] for w in words if w["e"] <= first + 0.01] or [0.0])
        after = min([w["s"] for w in words if w["s"] >= last - 0.01] or [last + 5])
        lead = min(LEAD, max(0.0, first - before - 0.05))
        tail = min(TAIL, max(0.0, after - last - 0.05))
        cuts = []
        for k, (a, b) in enumerate(pieces):
            a0 = a - (lead if k == 0 else 0.03)
            b0 = b + (tail if k == len(pieces) - 1 else 0.06)
            cuts.append((a0, b0))
        hold_in, hold_out = LEAD - lead, TAIL - tail
        inputs, parts = [], []
        for k, (a0, b0) in enumerate(cuts):
            inputs += ["-ss", f"{a0:.3f}", "-t", f"{b0 - a0:.3f}", "-i", FACE]
            parts.append(f"[{k}:v]setpts=PTS-STARTPTS,fps={FPS},scale=1620:1080,setsar=1[v{k}];[{k}:a]asetpts=PTS-STARTPTS,aresample=48000[a{k}]")
        speech = sum(b0 - a0 for a0, b0 in cuts)
        total = round((hold_in + speech + hold_out) * FPS) / FPS
        ms = round(hold_in * 1000)
        graph = ";".join(parts) + ";" + "".join(f"[v{k}][a{k}]" for k in range(len(cuts))) + f"concat=n={len(cuts)}:v=1:a=1[cv][ca];"
        graph += f"[cv]tpad=start_mode=clone:start_duration={hold_in:.3f}:stop_mode=clone:stop_duration={hold_out + 0.1:.3f},trim=0:{total}[v];"
        graph += f"[ca]adelay={ms}|{ms},aresample=48000:async=1:first_pts=0,apad,atrim=end_sample={round(total * 48000)}[a]"
        run(*inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-c:a", "pcm_s16le", line_src(n))
        # His words on the clip's own clock: the clip is transcribed, and the words he said (SAID, spelled right) take
        # the times of Whisper's words in order, so pauses stay where he made them.
        from faster_whisper import WhisperModel

        global _asr
        _asr = _asr or WhisperModel("small.en", device="cpu", compute_type="int8")
        segs, _ = _asr.transcribe(line_src(n), word_timestamps=True, beam_size=5)
        heard = [(w.start, w.end) for seg_ in segs for w in seg_.words] or [(LEAD, total - TAIL)]
        said = SAID[n].replace("House Mix", "House\u00a0Mix").split()
        LINE_WORDS[n] = [{"w": word.replace("\u00a0", " "), "s": heard[k * len(heard) // len(said)][0],
                          "e": heard[min(len(heard) - 1, (k + 1) * len(heard) // len(said) - 1)][1]} for k, word in enumerate(said)]
        LINES[n] = (LEAD, total - TAIL, SAID[n])
        print(f"line {n:2d}: {total:5.2f}s  | {LINES[n][2]}")


LINES: dict[int, tuple[float, float, str]] = {}


def line_len(n: int) -> float:
    """How long his line lasts: from his recording, or estimated from the script for the preview."""
    if n in LINES:
        return LINES[n][1] - LINES[n][0]
    return len(SCRIPT[n].split()) / 2.6 + 0.3


def spelled(word: str) -> str:
    core = word.strip(".,!?").lower()
    fixed = SPELLED.get(core)
    return word.replace(word.strip(".,!?"), fixed) if fixed else word


def sung(n: int, offset: float) -> list[tuple[float, float, str]]:
    """His line as captions that follow him word by word; `offset` is where the line's first word lands in the segment."""
    if n not in LINES:
        return pop(evenly(SCRIPT[n], offset, offset + line_len(n)))
    start = LINES[n][0]
    timed = [(w["w"], offset + w["s"] - start, offset + w["e"] - start) for w in LINE_WORDS[n]]
    # "House" then "Mix" stays one name on screen.
    merged: list[tuple[str, float, float]] = []
    for w in timed:
        if merged and merged[-1][0].lower() == "house" and w[0].lower().startswith("mix"):
            merged[-1] = (f"House {w[0].replace('mix', 'Mix')}", merged[-1][1], w[2])
        else:
            merged.append(w)
    return pop(merged)


def chunks(words: list[tuple[str, float, float]], max_chars: int = 34) -> list[list[tuple[str, float, float]]]:
    """Words grouped into short phrases: a phrase ends at punctuation, and a longer run is split into even parts."""
    runs, cur = [], []
    for w in words:
        cur.append(w)
        if w[0][-1:] in ".?!,:…”" and len(cur) >= 2:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    out = []
    for run_ in runs:
        size = len(" ".join(w[0] for w in run_))
        parts = -(-size // max_chars)
        target, piece = size / parts, []
        for w in run_:
            if piece and len(" ".join(x[0] for x in piece + [w])) > target + 4:
                out.append(piece)
                piece = []
            piece.append(w)
        out.append(piece)
    return out


def pop(words: list[tuple[str, float, float]]) -> list[tuple[float, float, str]]:
    """A phrase at a time, the word being said popping in red."""
    events = []
    phrases = chunks(words)
    for n, phrase in enumerate(phrases):
        end = phrase[-1][2] + 0.3
        if n + 1 < len(phrases):
            end = min(end, phrases[n + 1][0][1] - 0.02)
        for k, (_, at, _) in enumerate(phrase):
            until = phrase[k + 1][1] if k + 1 < len(phrase) else end
            text = " ".join(f"{{\\c{ACCENT}\\fscx108\\fscy108}}{w}{{\\r}}" if j == k else w for j, (w, _, _) in enumerate(phrase))
            events.append((at, max(until, at + 0.05), text))
    return events


def evenly(text: str, t0: float, t1: float) -> list[tuple[str, float, float]]:
    words = text.split()
    step = (t1 - t0) / max(1, len(words))
    return [(w, t0 + k * step, t0 + (k + 1) * step) for k, w in enumerate(words)]


NAR = {lid: (caption, spoken) for _, lid, caption, spoken, *_ in narrator_lines()}
NAR_WORDS = json.load(open(f"{HOME}/audio/words.json"))


def narrator(lid: str) -> tuple[str, float, list[tuple[str, float, float]]]:
    """A narrator line from synth.py: its take, its length, and its words timed (Whisper)."""
    wav = f"{HOME}/audio/lines/{lid}.wav"
    return wav, probe(wav), [(w, a, b) for w, a, b in NAR_WORDS[lid]]


def nar_caps(lid: str, offset: float) -> list[tuple[float, float, str]]:
    """The narrator's line as captions: the caption's own spelling, on Whisper's timing."""
    _, _, words = narrator(lid)
    script = NAR[lid][0].split()
    if len(words) == len(script):
        return pop([(script[k], offset + a, offset + b) for k, (_, a, b) in enumerate(words)])
    t0 = words[0][1] if words else 0.0
    t1 = words[-1][2] if words else 2.0
    return pop(evenly(NAR[lid][0], offset + t0, offset + t1))


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def probe(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(out.stdout.strip())


def marks(clip: str) -> dict[str, float]:
    return json.load(open(f"{CLIPS}/{clip}.marks.json"))


def ass_time(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def write_ass(path: str, events: list[tuple[float, float, str]]) -> None:
    """Captions: bold white with a soft outline and shadow, no box, low and centred."""
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Cap,Atkinson Hyperlegible,72,&H00FFFFFF,&H00FFFFFF,&H66000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,160,160,96,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = [f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{text}" for a, b, text in events]
    open(path, "w").write(head + "\n".join(lines) + "\n")


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


def label_filter(text: str) -> str:
    """The segment's label, sliding in from the left and easing to a stop."""
    p = "min(t/0.45,1)"
    return (
        f"drawtext=fontfile='{FONT}':text='{esc(text)}':x='40-(1-{p})*(1-{p})*(1-{p})*(tw+90)':y=36:fontsize=28:fontcolor=white:"
        f"box=1:boxcolor=black@0.66:boxborderw=14:alpha='{p}'"
    )


def zoom_filter(zooms: list, w: int, h: int) -> str:
    """Pushes in on a box and back out, eased, for each (from, to, zoom, centre x, centre y) in segment seconds; or a
    slow drift, so a screen is never quite still."""
    if not zooms:
        return ""
    if zooms[0][0] == "drift":
        frames = max(1, round(zooms[0][1] * FPS))
        return f"scale={2 * w}:{2 * h},zoompan=z='1+0.035*on/{frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps={FPS}"
    t0, t1, z, cx, cy = zooms[0]
    ramp = 0.6
    t = f"(on/{FPS})"
    k = f"(if(lt({t},{t0}),0,if(lt({t},{t0 + ramp}),({t}-{t0})/{ramp},if(lt({t},{t1 - ramp}),1,if(lt({t},{t1}),({t1}-{t})/{ramp},0)))))"
    zz = f"(1+({z}-1)*{k}*{k}*(3-2*{k}))"
    return (
        f"scale={2 * w}:{2 * h},zoompan=z='{zz}':x='max(0,min(iw-iw/zoom,{2 * cx}-iw/zoom/2))':"
        f"y='max(0,min(ih-ih/zoom,{2 * cy}-ih/zoom/2))':d=1:s={w}x{h}:fps={FPS}"
    )


def chip_filter(title: str, number: int, fresh: bool) -> str:
    """The chapter in the bottom left corner, fading in where the chapter starts."""
    alpha = "min(1,t/0.4)" if fresh else "1"
    return (
        f"drawtext=fontfile='{MONO}':text='{number:02d}  {esc(title.upper())}':x=40:y=h-th-44:fontsize=20:"
        f"fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10:alpha='{alpha}'"
    )


def shade() -> str:
    """A soft dark gradient along the bottom of product footage, so white captions read over a light page."""
    return "drawbox=x=0:y=ih-300:w=iw:h=300:color=black@0.0:t=fill," + ",".join(
        f"drawbox=x=0:y=ih-{300 - k * 30}:w=iw:h=30:color=black@{0.05 + k * 0.045:.3f}:t=fill" for k in range(10)
    )


def seg(**kw):
    return kw


def face(n, **kw):
    return seg(kind="face", line=n, **kw)


def m(clip: str, name: str, d: float = 0.0) -> float:
    return marks(clip)[name] + d


CROWD = [(-1.0, 60.0, 1.45, 960, 372)]  # a held push-in (it starts already at full zoom)


def build_edl() -> list[dict]:
    hero, intake, crowd, sponsor, night, plan = (marks(c) for c in ("hero", "intake", "crowd", "sponsor", "night", "plan"))
    tl = {s["name"]: s for s in json.load(open(f"{HOME}/build/timeline.json"))["scenes"]}
    arch = tl["arch"]
    live = "Live site · house-mix.vercel.app · recorded 30 Oct 2026"
    # The live plan runs for minutes; it plays fast enough to fit the narrator's line, and says how much faster.
    plan_a, plan_b = plan["build"] - 0.5, plan["ready"] + 1.5
    plan_speed = round((plan_b - plan_a) / 5.2, 1)
    return [
        # 1. The opening: doors at 6:58, the questions, the sponsor's question; then Prashant, and the turn.
        seg(kind="screen", src=f"{CLIPS}/hero.mp4", a=0.4, b=4.6, nar=["n1"], fade_in=0.4),
        # Pushed in on the crowd, so the landing's own caption at the bottom stays out of frame.
        seg(kind="screen", src=f"{CLIPS}/hero.mp4", a=4.6, b=hero["crowd"] - 0.5, speed=1.5, nar=["n2"], zoom=CROWD),
        seg(kind="screen", src=f"{CLIPS}/hero.mp4", a=hero["crowd"] - 0.5, b=hero["end"], nar=["n3"], zoom=CROWD, sfx=[(2.4, "riser", 0.3)]),
        face(1, label="Prashant · built House Mix", sfx=[(0.0, "hit", 0.45)]),
        face(2),
        face(3),
        seg(kind="screen", src=f"{CLIPS}/finale.mp4", a=0.5, b=4.0, voice=4, sfx=[(0.1, "hit", 0.6)]),
        # 2. The live loop: a fixture, every name to Qloo, the twin in Iowa, a real plan, the crowd, the evidence.
        seg(kind="screen", src=f"{CLIPS}/intake.mp4", a=0.4, b=intake["end"], speed=2.2, nar=["n10"], label=live, shade=True,
            zoom=[((intake["confirm"] - 0.4) / 2.2, (intake["end"] - 0.4) / 2.2 + 0.5, 1.4, 900, 560)], sfx=[((intake["venueConfirmed"] - 0.4) / 2.2, "click", 0.5)]),
        seg(kind="screen", src=f"{CLIPS}/plan.mp4", a=plan_a, b=plan_b, speed=plan_speed, nar=["n12"], shade=True,
            label=f"A real live plan · live Qloo · local build of the same app · sped up ×{plan_speed:g}"),
        seg(kind="screen", src=f"{CLIPS}/crowd.mp4", a=crowd["crowd"] - 0.3, b=crowd["drawer"] - 0.8, nar=["n13"], shade=True,
            zoom=[(0.3, 6.0, 1.45, 900, 330)], label="Seeded show · planned on live Qloo"),
        seg(kind="screen", src=f"{CLIPS}/crowd.mp4", a=crowd["drawer"] - 0.6, b=crowd["end"], nar=["n14"], shade=True,
            zoom=[(0.5, 9.0, 1.5, 1600, 470)]),
        # 3. Sponsors, in depth.
        seg(kind="screen", src=f"{CLIPS}/sponsor.mp4", a=0.4, b=sponsor["slot"] + 2.4, pip=5, shade=True, label="Seeded fixture · Chelsea vs Arsenal · live Qloo"),
        seg(kind="screen", src=f"{CLIPS}/sponsor.mp4", a=sponsor["slot"] + 0.4, b=sponsor["evidence"] - 0.3, pip=6, shade=True,
            zoom=[(0.3, 5.0, 1.35, 960, 480)]),
        seg(kind="screen", src=f"{CLIPS}/sponsor.mp4", a=sponsor["evidence"] - 0.3, b=sponsor["compare"] - 0.2, nar=["n17"], shade=True,
            zoom=[(0.4, 6.5, 1.6, 1620, 430)]),
        seg(kind="screen", src=f"{CLIPS}/sponsor.mp4", a=sponsor["compare"] - 0.2, b=sponsor["export"] - 0.4, nar=["n18"], shade=True,
            zoom=[(0.4, 7.5, 1.6, 1620, 560)], sfx=[(4.2, "click", 0.4)]),
        seg(kind="screen", src=f"{CLIPS}/onepager.mp4", a=0.0, b=5.5, nar=["n20"], label="Real output · the sponsor one-pager (PDF)"),
        seg(kind="screen", src=f"{CLIPS}/night.mp4", a=night["play"] - 0.3, b=night["called"] + 1.4, speed=1.6, nar=["n21"], shade=True,
            label="Run the night · cues for the partnerships crew", zoom=[(0.4, 9.0, 1.4, 1460, 620)], sfx=[((night["called"] - night["play"] + 0.3) / 1.6, "click", 0.6)]),
        # 4. Every kind of night: comedy, a festival, a restaurant, each a seeded show planned on live Qloo.
        seg(kind="screen", src=f"{CLIPS}/modes.mp4", a=0.4, b=7.4, speed=1.4, pip=7, shade=True, label="Five modes · the intake"),
        seg(kind="screen", src=f"{CLIPS}/comedy.mp4", a=0.4, b=7.6, speed=1.25, pip=8, shade=True, label="Comedy · Taylor Tomlinson at The Comedy Store", zoom=[(0.2, 9.0, 1.3, 760, 520)]),
        seg(kind="screen", src=f"{CLIPS}/festival.mp4", a=0.4, b=7.6, speed=1.25, pip=9, shade=True, label="Festival · Victoria Park, London", zoom=[(0.2, 9.0, 1.3, 760, 520)]),
        seg(kind="screen", src=f"{CLIPS}/dining.mp4", a=0.4, b=10.8, speed=1.45, pip=10, shade=True, label="Dining · Dishoom Shoreditch, Ezra Collective jazz night", zoom=[(0.2, 12.0, 1.3, 760, 520)]),
        seg(kind="screen", src=f"{CLIPS}/gfx-turn.mp4", a=0.0, b=3.0, pip=11, sfx=[(0.1, "hit", 0.4)]),
        # 5. Under the hood: the 3D stack, its lines landing where the layers rise.
        seg(kind="screen", src=f"{CLIPS}/gfx-arch.mp4", a=0.0, b=arch["dur"], nar=[(l["id"], l["start"]) for l in arch["lines"]], keep_speed=True),
        # 6. Proof, and the honest result.
        face(12),
        seg(kind="screen", src=f"{CLIPS}/gfx-proof.mp4", a=0.0, b=tl["proof"]["dur"], nar=["n27"], keep_speed=True, sfx=[(3.0, "hit", 0.4), (5.6, "hit", 0.3)]),
        seg(kind="screen", src=f"{CLIPS}/gfx-judge.mp4", a=0.0, b=6.5, pip=13),
        # 7. The recap, the callback, the end card.
        seg(kind="screen", src=f"{CLIPS}/gfx-recap.mp4", a=0.0, b=tl["recap"]["dur"], nar=["n29"], keep_speed=True, sfx=[(-1.4, "riser", 0.35), (0.3, "hit", 0.4)]),
        seg(kind="screen", src=f"{CLIPS}/hero.mp4", a=0.4, b=5.0, pip=14),
        seg(kind="screen", src=f"{CLIPS}/gfx-end.mp4", a=0.0, b=6.0, voice=15, fade_out=1.2, sfx=[(0.0, "hit", 0.5)]),
    ]


CHAPTERS = {0: "Doors at 6:58", 7: "Live on the site", 11: "For sponsors", 17: "Every kind of night", 22: "Under the hood", 23: "Proof", 26: None}
XFADE = {3: 0.4, 6: 0.3, 7: 0.4, 11: 0.4, 17: 0.4, 22: 0.4, 23: 0.4, 26: 0.35, 28: 0.4}


def chapters(edl: list[dict]) -> list[tuple[str | None, int, bool]]:
    out, title, number = [], None, 0
    for i in range(len(edl)):
        fresh = i in CHAPTERS
        if fresh:
            title = CHAPTERS[i]
            number += 1 if title else 0
        out.append((title, number, fresh and title is not None))
    return out


def placeholder(n: int, dur: float, pip: bool) -> str:
    """For the preview: a card saying which of his lines goes here."""
    text = esc(f"Prashant, line {n}: {SCRIPT[n]}")
    y = "h-260" if pip else "(h-th)/2"
    return f"drawtext=fontfile='{FONT}':text='{text}':x=(w-tw)/2:y={y}:fontsize=40:fontcolor=white:box=1:boxcolor=0x6A3DF5@0.85:boxborderw=24"


def render(i: int, s: dict) -> str:
    out = f"{B}/seg_{i:02d}.mkv"
    filters: list[str] = []
    inputs: list[str] = []
    caps: list[tuple[float, float, str]] = []

    if s["kind"] == "face":
        n = s["line"]
        if LINES:
            start, end, _ = LINES[n]
            a = start - LEAD
            dur = round((end - start + LEAD + TAIL) * FPS) / FPS
            inputs = ["-ss", f"{a}", "-t", f"{dur}", "-i", line_src(n)]
            filters.append(
                f"[0:v]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,"
                f"scale=w='trunc(1920*(1+0.05*t/{dur})/2)*2':h='trunc(1080*(1+0.05*t/{dur})/2)*2':eval=frame,crop=1920:1080,"
                f"eq=contrast=1.04:saturation=1.06,vignette=angle=PI/5[v0]"
            )
            filters.append(f"[0:a]asetpts=PTS-STARTPTS,highpass=f=80,{VOICE_CLEAN},loudnorm=I=-16:TP=-2:LRA=7,apad,atrim=0:{dur}[a]")
            caps = sung(n, LEAD)
        else:
            dur = round((line_len(n) + LEAD + TAIL) * FPS) / FPS
            filters.append(f"color=c={DARK}:s={W}x{H}:d={dur}:r={FPS},{placeholder(n, dur, False)}[v0]")
            filters.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{dur}[a]")
        vlabel = "[v0]"
        if s.get("label"):
            filters[0] = filters[0].replace("[v0]", f",{label_filter(s['label'])}[v0]")
    else:
        a, b = s["a"], s["b"]
        speed = s.get("speed", 1.0)
        visual = (b - a) / speed
        voice = s.get("pip") or s.get("voice")
        vlen = (line_len(voice) + LEAD + TAIL + 0.3) if voice else 0.0
        # Narrator lines: in order from NAR_AT (or after his line), or at given times (the 3D stack).
        nar_in, t = [], (0.15 + line_len(voice) + LEAD + TAIL + 0.15) if voice else NAR_AT
        for item in s.get("nar", []):
            lid, at = (item, None) if isinstance(item, str) else item
            wav, length, _ = narrator(lid)
            at = t if at is None else at
            nar_in.append((lid, wav, at))
            t = at + length + GAP
        vdur = max(vlen, (t - GAP + 0.6) if nar_in else 0.0)
        if vdur > visual and not s.get("keep_speed"):
            # A longer explanation slows the take (to no less than 55% of its pace) before any frame is held.
            speed = max(speed * visual / vdur, speed * 0.55)
            visual = (b - a) / speed
        dur = round(max(visual, vdur) * FPS) / FPS
        inputs = ["-ss", f"{a}", "-t", f"{b - a}", "-i", s["src"]]
        voice_in = None
        if voice and LINES:
            vs, ve, _ = LINES[voice]
            voice_in = inputs.count("-i")
            inputs += ["-ss", f"{vs - LEAD}", "-t", f"{ve - vs + LEAD + TAIL}", "-i", line_src(voice)]
        nar_idx = []
        for lid, wav, at in nar_in:
            nar_idx.append((inputs.count("-i"), at))
            inputs += ["-i", wav]
            caps += nar_caps(lid, at)
        chain = f"[0:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale=1920:1080,setsar=1"
        z = zoom_filter(s.get("zoom") or [("drift", dur)], 1920, 1080)
        chain += f",{z}" if z else ""
        if dur > visual + 0.05:
            chain += f",tpad=stop_mode=clone:stop_duration={dur - visual:.2f}"
        if s.get("shade"):
            chain += "," + shade()
        if s.get("label"):
            chain += "," + label_filter(s["label"])
        if voice and not LINES:
            chain += "," + placeholder(voice, dur, True)
        filters.append(chain + "[v0]")
        vlabel = "[v0]"
        if s.get("pip") and LINES:
            # His face in a ring at the bottom right, saying the line.
            filters.append(
                f"[{voice_in}:v]setpts=PTS-STARTPTS,fps={FPS},tpad=start_mode=clone:start_duration=0.15,"
                f"scale=-2:720,crop=720:720,scale=340:340,format=rgba,"
                f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-170,Y-170),168),255,0)',tpad=stop_mode=clone:stop_duration=1[pip]"
            )
            ring_len = 0.15 + line_len(voice) + LEAD + TAIL + 1.0
            filters.append(f"color=c=white:s=352x352:d={ring_len:.2f},format=rgba,geq=r=255:g=255:b=255:a='if(lte(hypot(X-176,Y-176),175),255,0)'[ring]")
            y = 1080 - 352 - 60
            filters.append(f"[v0][ring]overlay=x=1920-352-40:y={y}:eof_action=pass[v1];[v1][pip]overlay=x=1920-346-40:y={y + 6}:eof_action=pass[v2]")
            vlabel = "[v2]"
        if voice:
            caps = sung(voice, 0.15 + LEAD) + caps
        # Sound: his line, then the narrator's lines, each levelled and placed.
        mix = []
        if voice and LINES:
            ms = 150
            filters.append(
                f"[{voice_in}:a]asetpts=PTS-STARTPTS,highpass=f=80,{VOICE_CLEAN},loudnorm=I=-16:TP=-2:LRA=7,aformat=channel_layouts=stereo,"
                f"adelay={ms}|{ms},aresample=48000:async=1:first_pts=0,apad,atrim=0:{dur}[af]"
            )
            mix.append("[af]")
        for k, (idx, at) in enumerate(nar_idx):
            ms = round(at * 1000)
            filters.append(
                f"[{idx}:a]asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-2:LRA=7,aformat=channel_layouts=stereo,adelay={ms}|{ms},"
                f"aresample=48000:async=1:first_pts=0,apad,atrim=0:{dur}[an{k}]"
            )
            mix.append(f"[an{k}]")
        if len(mix) > 1:
            filters.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0[a]")
        elif mix:
            filters[-1] = filters[-1][: -len(mix[0])] + "[a]"
        else:
            filters.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{dur}[a]")

    if caps:
        ass = f"{B}/seg_{i:02d}.ass"
        write_ass(ass, caps)
        filters.append(f"{vlabel}ass={ass}:fontsdir='{FONTS}'[vc]")
        vlabel = "[vc]"
    fades = []
    if s.get("fade_in"):
        fades.append(f"fade=t=in:st=0:d={s['fade_in']}")
    if s.get("fade_out"):
        fades.append(f"fade=t=out:st={dur - s['fade_out']:.2f}:d={s['fade_out']}")
    chip = chip_filter(*s["chip"]) + "," if s.get("chip") else ""
    filters.append(
        f"{vlabel}tpad=stop_mode=clone:stop_duration={dur},{chip}{''.join(f + ',' for f in fades)}"
        f"scale=out_color_matrix=bt709:out_range=tv,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709,"
        f"format=yuv420p,trim=0:{dur}[vout]"
    )
    filters = [f.replace("[a]", "[araw]") if f.endswith("[a]") else f for f in filters]
    filters.append(f"[araw]aresample=48000:async=1:first_pts=0,apad,atrim=end_sample={round(dur * 48000)}[a]")
    run(*inputs, "-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "[a]", "-t", f"{dur:.4f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-r", str(FPS),
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", out)
    return out


def sound_cues(edl: list[dict], starts: list[float], seams: list[float]) -> list[tuple[float, str, float]]:
    cues = [(t - 0.3, "whoosh", 0.3) for t in seams]
    for i, s in enumerate(edl):
        cues += [(starts[i] + t, name, vol) for t, name, vol in s.get("sfx", [])]
    return sorted(cues)


def effects_track(cues: list[tuple[float, str, float]], total: float) -> str:
    """All the effects laid on one track, sample by sample."""
    import numpy as np
    import soundfile as sf

    track = np.zeros((round(total * 48000), 2), dtype=np.float32)
    for t, name, vol in cues:
        sound, rate = sf.read(f"{SFX}/{name}.wav", dtype="float32", always_2d=True)
        start = max(0, round(t * 48000))
        end = min(len(track), start + len(sound))
        track[start:end] += vol * sound[: end - start, :2]
    path = f"{B}/effects.wav"
    sf.write(path, track, 48000)
    return path


def main() -> None:
    os.makedirs(B, exist_ok=True)
    if not PREVIEW:
        assert FACE, f"Put his recording at {HOME}/from-mac/face.mov (or .mp4), or run with --preview."
        prepare_lines()
    edl = build_edl()
    parts, lengths = [], []
    marks_ = chapters(edl)
    for i, s in enumerate(edl):
        title, number, fresh = marks_[i]
        path = render(i, dict(s, chip=(title, number, fresh)) if title else s)
        parts.append(path)
        lengths.append(probe(path))
        print(f"seg {i:02d} {s['kind']:6s} {lengths[-1]:5.1f}s", flush=True)

    sections: list[list[int]] = []
    for i in range(len(edl)):
        if i == 0 or i in XFADE:
            sections.append([])
        sections[-1].append(i)
    files, durations = [], []
    for k, idx in enumerate(sections):
        listing = f"{B}/section_{k:02d}.txt"
        open(listing, "w").write("".join(f"file '{parts[i]}'\n" for i in idx))
        path = f"{B}/section_{k:02d}.mkv"
        run("-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", path)
        files.append(path)
        durations.append(sum(lengths[i] for i in idx))

    starts, t = [], 0.0
    for i in range(len(edl)):
        t -= XFADE.get(i, 0.0) if i else 0.0
        starts.append(t)
        t += lengths[i]
    total = t
    turn = starts[6]
    recap = starts[26]
    end = starts[-1]
    pace = min(1.04, max(1.0, total / TARGET))
    json.dump({"total": total, "pace": pace, "starts": starts, "chapters": {CHAPTERS[i]: starts[i] for i in CHAPTERS if CHAPTERS[i]}}, open(f"{B}/cut.json", "w"), indent=1)
    subprocess.run([os.path.expanduser("~/Videos/debrief/.venv-music/bin/python"), os.path.join(os.path.dirname(os.path.abspath(__file__)), "music.py"),
                    f"{total:.2f}", f"{turn:.2f}", f"{recap:.2f}", f"{end:.2f}"], check=True)
    music = f"{HOME}/music/theme.wav"

    graph, v, length, at = [], "[v0]", durations[0], [0.0]
    for k in range(1, len(files)):
        d = XFADE[sections[k][0]]
        at.append(length - d)
        length += durations[k] - d
    for k in range(len(files)):
        graph.append(f"[{k}:v]settb=AVTB,setpts=N/{FPS}/TB,fps={FPS},format=yuv420p[v{k}]")
        d_in = XFADE[sections[k][0]] if k else 0.0
        d_out = XFADE[sections[k + 1][0]] if k + 1 < len(files) else 0.0
        seams = (f",afade=t=in:d={d_in}" if d_in else "") + (f",afade=t=out:st={durations[k] - d_out:.4f}:d={d_out}" if d_out else "")
        ms = round(at[k] * 1000)
        graph.append(f"[{k}:a]aresample=48000,asetpts=N/SR/TB,atrim=0:{durations[k]:.4f}{seams},adelay={ms}|{ms},aresample=48000:async=1:first_pts=0[a{k}]")
    for k in range(1, len(files)):
        d = XFADE[sections[k][0]]
        graph.append(f"{v}[v{k}]xfade=transition=fade:duration={d}:offset={at[k]:.4f}[vx{k}]")
        v = f"[vx{k}]"
    n = len(files)
    graph.append(f"{''.join(f'[a{k}]' for k in range(n))}amix=inputs={n}:duration=longest:normalize=0,atrim=0:{total:.3f}[voices]")
    fx = effects_track(sound_cues(edl, starts, at[1:]), total)
    graph.append(
        f"[voices]asplit=2[voice][key];[{n}:a]volume=0.34,equalizer=f=2500:t=q:w=1.2:g=-4,atrim=0:{total:.3f}[m];"
        "[m][key]sidechaincompress=threshold=0.02:ratio=9:attack=20:release=450[duck];"
        f"[{n + 1}:a]aresample=48000[fx];[voice][duck][fx]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-15:TP=-2:LRA=11,alimiter=limit=0.79:level=false[aout]"
    )
    # The rules allow under three minutes: the whole cut plays up to 4% faster to land at TARGET; atempo keeps pitch.
    if pace > 1.0:
        graph.append(f"{v}setpts=PTS/{pace:.4f},fps={FPS}[vp];[aout]atempo={pace:.4f}[ap]")
        v, aout = "[vp]", "[ap]"
    else:
        aout = "[aout]"
    final = f"{OUT}/HouseMix-{'preview' if PREVIEW else 'film'}.mp4"
    inputs = [x for f in files for x in ("-reinit_filter", "0", "-i", f)] + ["-i", music] + ["-i", fx]
    run(*inputs, "-filter_complex", ";".join(graph), "-map", v, "-map", aout, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "film",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final)
    run("-i", final, "-vf", "scale=1280:720", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-c:a", "aac", "-b:a", "128k", final.replace(".mp4", "-720p.mp4"))
    print(f"wrote {final} ({probe(final):.1f} s)")


if __name__ == "__main__":
    main()
