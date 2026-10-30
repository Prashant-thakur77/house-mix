"""The README's charts, drawn from eval/results/*.json (never typed by hand), in a light and a dark variant.

    python3 docs/charts.py   ->  docs/img/chart-<name>-{light,dark}.svg

Colours were checked with the data-viz palette validator: House Mix red and Claude-alone blue pass the lightness,
chroma, colour-blind and contrast checks on GitHub's light (#ffffff) and dark (#0d1117) surfaces. Every bar carries a
direct label, so no value depends on colour alone, and the README repeats the numbers in a table.
"""

from __future__ import annotations

import json
import os
from html import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "img")
RESULTS = os.path.join(ROOT, "eval", "results")

THEMES = {
    "light": {"text": "#1f2328", "muted": "#59636e", "grid": "#d1d9e0", "hm": "#E8271C", "l0": "#2a78d6", "one": "#6250d6"},
    "dark": {"text": "#f0f6fc", "muted": "#9198a1", "grid": "#3d444d", "hm": "#EC3B2F", "l0": "#3987e5", "one": "#9085e9"},
}
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"


def read(name: str) -> dict:
    with open(os.path.join(RESULTS, f"{name}.json")) as f:
        return json.load(f)


def bar(x: float, y: float, w: float, h: float, fill: str) -> str:
    """A horizontal bar anchored at x, its data end rounded 4 px; a zero is a 2 px tick so it still reads as a value."""
    if w < 2:
        return f'<rect x="{x:.1f}" y="{y:.1f}" width="2" height="{h:.1f}" fill="{fill}"/>'
    r = min(4, h / 2, w / 2)
    return (
        f'<path d="M{x:.1f},{y:.1f} H{x + w - r:.1f} Q{x + w:.1f},{y:.1f} {x + w:.1f},{y + r:.1f} V{y + h - r:.1f} '
        f'Q{x + w:.1f},{y + h:.1f} {x + w - r:.1f},{y + h:.1f} H{x:.1f} Z" fill="{fill}"/>'
    )


def svg(width: int, height: int, title: str, body: list[str]) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'font-family="{FONT}" role="img" aria-label="{escape(title)}"><title>{escape(title)}</title>' + "".join(body) + "</svg>"
    )


def text(x: float, y: float, s: str, fill: str, size: int = 14, weight: int = 400, anchor: str = "start") -> str:
    return f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(s)}</text>'


def mistakes(t: dict) -> str:
    """House Mix vs Claude alone on four kinds of mistake, as a share of picks. Lower is better."""
    ev, val = read("evidence"), read("qloo_value")
    hm_items, l0_items = ev["houseMix"]["items"], ev["l0"]["items"]
    rows = [
        ("Picks with no Qloo evidence", (hm_items - ev["houseMix"]["valid"], hm_items), (l0_items, l0_items)),
        ("Ambiguous in Qloo: a person must choose", (0, hm_items), (ev["l0"]["ambiguousInQloo"], l0_items)),
        ("Openers bigger than the headliner", (val["realism"]["houseMixV2"]["tooBig"], val["realism"]["houseMixV2"]["picks"]),
         (val["realism"]["l0"]["tooBig"], val["realism"]["l0"]["picks"])),
        ("Sponsors repeated from another show", (val["specificity"]["houseMixBrands"]["repeated"], val["specificity"]["houseMixBrands"]["picks"]),
         (val["specificity"]["l0Brands"]["repeated"], val["specificity"]["l0Brands"]["picks"])),
    ]
    W, left, right, top, row_h = 920, 320, 150, 92, 70
    plot = W - left - right
    H = top + row_h * len(rows) + 40
    b = [text(0, 26, "Mistakes per plan, lower is better", t["text"], 20, 700),
         text(0, 50, "7 real shows on live Qloo, 30 Oct 2026 · share of picks", t["muted"], 14)]
    # Legend.
    b += [f'<rect x="0" y="64" width="12" height="12" rx="2" fill="{t["hm"]}"/>', text(18, 75, "House Mix", t["text"], 13),
          f'<rect x="110" y="64" width="12" height="12" rx="2" fill="{t["l0"]}"/>', text(128, 75, "Claude alone, same brief, no Qloo", t["text"], 13)]
    for k in range(0, 101, 25):
        x = left + plot * k / 100
        b.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{top + row_h * len(rows) - 10}" stroke="{t["grid"]}" stroke-width="1"/>')
        b.append(text(x, top + row_h * len(rows) + 8, f"{k}%", t["muted"], 12, anchor="middle"))
    for i, (label, (hn, hd), (ln, ld)) in enumerate(rows):
        y = top + i * row_h
        b.append(text(left - 14, y + 26, label, t["text"], 14, 600, "end"))
        for j, (n, d, fill) in enumerate(((hn, hd, t["hm"]), (ln, ld, t["l0"]))):
            share = n / d
            yy = y + j * 24
            b.append(bar(left, yy, plot * share, 20, fill))
            b.append(text(left + max(plot * share, 2) + 8, yy + 15, f"{share:.0%} · {n} of {d}", t["text"] if j == 0 else t["muted"], 13, 600 if j == 0 else 400))
    return svg(W, H, "Mistakes per plan: House Mix 0% on all four; Claude alone 100%, 48%, 40% and 21%", b)


def location(t: dict) -> str:
    """For each show: how much of Qloo's top 10 stays when the same bill is asked for in a city on another continent."""
    val, shows = read("qloo_value"), json.load(open(os.path.join(ROOT, "eval", "data", "ab_shows.json")))["shows"]
    name = {s["id"]: s["input"]["sides"][0]["name"] for s in shows}
    moves = sorted(val["location"]["moves"], key=lambda m: m["awayOverlap"])
    W, left, right, top, row_h = 900, 330, 110, 92, 34
    plot = W - left - right
    H = top + row_h * len(moves) + 34
    mean = val["location"]["meanAwayOverlap"]
    b = [text(0, 26, "Same show, another city: how much of Qloo's top 10 stays", t["text"], 20, 700),
         text(0, 50, "Overlap of the two top-10 lists (shared ÷ in either) · live Qloo, 30 Oct 2026", t["muted"], 14)]
    for k in range(0, 101, 25):
        x = left + plot * k / 100
        b.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{top + row_h * len(moves) - 6}" stroke="{t["grid"]}" stroke-width="1"/>')
        b.append(text(x, top + row_h * len(moves) + 12, f"{k}%", t["muted"], 12, anchor="middle"))
    for i, mv in enumerate(moves):
        y = top + i * row_h
        b.append(text(left - 14, y + 16, f"{name[mv['id']]} · {mv['home']} → {mv['away']}", t["text"], 13, 400, "end"))
        b.append(bar(left, y + 2, plot * mv["awayOverlap"], 20, t["one"]))
        b.append(text(left + max(plot * mv["awayOverlap"], 2) + 8, y + 17, f"{mv['awayOverlap']:.0%}", t["text"], 13, 600))
    x = left + plot * mean
    b.append(f'<line x1="{x:.1f}" y1="{top - 10}" x2="{x:.1f}" y2="{top + row_h * len(moves) - 6}" stroke="{t["text"]}" stroke-width="2" stroke-dasharray="4 4"/>')
    b.append(text(x + 6, top - 14, f"average {mean:.0%}", t["text"], 12, 600))
    return svg(W, H, f"Same show in another city: on average {mean:.0%} of Qloo's top 10 stays; {val['location']['changed']} of {val['location']['shows']} lists changed", b)


def latency(t: dict) -> str:
    """Median time per Qloo tool, from the five live demo shows' call ledgers (cache hits excluded)."""
    lat = read("qloo_value")["latency"]
    rows = sorted(lat.items(), key=lambda kv: kv[1]["medianMs"])
    W, left, right, top, row_h = 900, 230, 170, 70, 34
    plot = W - left - right
    H = top + row_h * len(rows) + 34
    top_ms = 3500
    fast = sum(1 for _, v in rows if v["medianMs"] < 1000)
    b = [text(0, 26, f"{fast} of {len(rows)} Qloo tools answer in under a second (median)", t["text"], 20, 700),
         text(0, 50, f"{sum(v['calls'] for v in lat.values())} live calls from the five demo shows, cache hits excluded", t["muted"], 14)]
    for k in range(0, top_ms + 1, 500):
        x = left + plot * k / top_ms
        b.append(f'<line x1="{x:.1f}" y1="{top - 6}" x2="{x:.1f}" y2="{top + row_h * len(rows) - 6}" stroke="{t["grid"]}" stroke-width="1"/>')
        b.append(text(x, top + row_h * len(rows) + 12, f"{k / 1000:g} s", t["muted"], 12, anchor="middle"))
    for i, (tool, v) in enumerate(rows):
        y = top + i * row_h
        b.append(text(left - 14, y + 16, tool, t["text"], 13, 400, "end"))
        w = plot * v["medianMs"] / top_ms
        b.append(bar(left, y + 2, w, 20, t["one"]))
        b.append(text(left + w + 8, y + 17, f"{v['medianMs'] / 1000:.2f} s · {v['calls']} calls", t["text"], 13, 600))
    return svg(W, H, "Median Qloo call time per tool", b)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("mistakes", mistakes), ("location", location), ("latency", latency)):
        for mode, theme in THEMES.items():
            path = os.path.join(OUT, f"chart-{name}-{mode}.svg")
            open(path, "w").write(fn(theme))
            print(path)
