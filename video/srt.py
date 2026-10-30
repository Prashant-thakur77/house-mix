"""Subtitles and YouTube chapters for the cut final.py just made, from its own captions and timeline.

    python3 video/srt.py  ->  ~/Videos/housemix/final/HouseMix-film.srt, chapters.txt

Each segment's captions (build/seg_NN.ass, a phrase at a time with the spoken word highlighted) become one subtitle
per phrase, moved to the segment's place in the film and scaled by the whole cut's pace.
"""

from __future__ import annotations

import json
import os
import re

HOME = os.path.expanduser("~/Videos/housemix/final")
B = f"{HOME}/build"


def secs(x: str) -> float:
    h, m, s = x.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def stamp(t: float) -> str:
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main() -> None:
    cut = json.load(open(f"{B}/cut.json"))
    pace = cut.get("pace", 1.0)
    cues: list[tuple[float, float, str]] = []
    for i, start in enumerate(cut["starts"]):
        path = f"{B}/seg_{i:02d}.ass"
        if not os.path.exists(path):
            continue
        phrases: dict[str, list[float]] = {}
        order: list[str] = []
        for line in open(path):
            if not line.startswith("Dialogue:"):
                continue
            _, a, b, *_, text = line.rstrip("\n").split(",", 9)
            plain = re.sub(r"\{[^}]*\}", "", text)
            key = f"{plain}@{len(order) if plain not in phrases else order.index(plain)}"
            if plain not in phrases:
                phrases[plain] = [secs(a), secs(b)]
                order.append(plain)
            else:
                phrases[plain][1] = max(phrases[plain][1], secs(b))
            del key
        for plain in order:
            a, b = phrases[plain]
            cues.append(((start + a) / pace, (start + b) / pace, plain))
    cues.sort()
    with open(f"{HOME}/HouseMix-film.srt", "w") as f:
        for n, (a, b, text) in enumerate(cues, 1):
            f.write(f"{n}\n{stamp(a)} --> {stamp(b)}\n{text}\n\n")
    # Chapters: each at least 10 s (YouTube's rule), the first at 0:00; one that comes too soon joins the one before.
    marks = sorted((t / pace, name) for name, t in cut["chapters"].items())
    lines, last = [], None
    for t, name in marks:
        t = 0.0 if not lines else t
        if last is not None and t - last < 10:
            lines[-1] += f" · {name}"
            continue
        lines.append(f"{int(t // 60)}:{int(t % 60):02d} {name}")
        last = t
    open(f"{HOME}/chapters.txt", "w").write("\n".join(lines) + "\n")
    print(f"{len(cues)} subtitles, {len(lines)} chapters")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
