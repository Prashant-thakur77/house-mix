"""The drawn scenes' lengths and cues, from the narrator takes' real durations and word times (never hand-placed).

    python3 video/timeline.py   ->  ~/Videos/housemix/build/timeline.json

Each scene lists its narrator lines with their start inside the scene; the 3D stack (arch) also gets the moments its
layers rise, landed on the words that name them.
"""

from __future__ import annotations

import json
import os

WORK = os.path.expanduser("~/Videos/housemix")
LEAD, GAP = 0.3, 0.45

lines = json.load(open(f"{WORK}/audio/lines.json"))
words = json.load(open(f"{WORK}/audio/words.json"))


def said(lid: str, prefix: str, fallback: float) -> float:
    for w, a, _ in words.get(lid, []):
        if w.lower().strip(".,?!").startswith(prefix):
            return a
    return fallback


def scene(name: str, ids: list[str], tail: float) -> dict:
    t, out = LEAD, []
    for lid in ids:
        out.append({"id": lid, "start": round(t, 3), "dur": lines[lid]["s"]})
        t += lines[lid]["s"] + GAP
    return {"name": name, "start": 0.0, "lines": out, "dur": round(t - GAP + tail, 2)}


scenes = [scene("turn", ["n9"], 0.7), scene("proof", ["n27"], 1.2), scene("recap", ["n29"], 0.8)]
arch = scene("arch", ["n22", "n23", "n24", "n25"], 2.0)
at = {l["id"]: l["start"] for l in arch["lines"]}
arch["cues"] = {
    "intake": round(at["n22"] + said("n22", "name", 1.2), 2),
    "agents": round(at["n23"] + said("n23", "agents", 0.1), 2),
    "qloo": round(at["n23"] + said("n23", "clue", 1.1), 2),
    "gate": round(at["n24"] + said("n24", "gate", 0.2), 2),
    "you": round(at["n25"] + said("n25", "person", 0.6), 2),
}
scenes += [arch, {"name": "judge", "start": 0.0, "lines": [], "dur": 6.5, "cues": {}}, {"name": "end", "start": 0.0, "lines": [], "dur": 6.5, "cues": {}}]

os.makedirs(f"{WORK}/build", exist_ok=True)
json.dump({"scenes": scenes}, open(f"{WORK}/build/timeline.json", "w"), indent=1)
for s in scenes:
    print(f"{s['name']:6s} {s['dur']:5.2f}s", s.get("cues") or "")
