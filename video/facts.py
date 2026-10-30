"""Every number the film shows or says, read from the repository at build time (never typed in by hand).

    python3 video/facts.py   ->  ~/Videos/housemix/build/facts.json

Sources: eval/results/*.json (written by the eval scripts against live Qloo) and the live-contract check.
"""

from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.expanduser("~/Videos/housemix")
OUT = f"{WORK}/build/facts.json"


def read(name: str) -> dict:
    with open(os.path.join(ROOT, "eval", "results", f"{name}.json")) as f:
        return json.load(f)


def facts() -> dict:
    ev, judge, v1, verify = read("evidence"), read("ab_judge"), read("ab_judge_v1"), read("verify")
    for r in (ev, judge, v1):
        assert r.get("qlooMode") == "live", "film numbers come from live Qloo runs only"
    openers = judge["perSlot"].get("openers", {"wins": 0, "losses": 0})
    return {
        "tools": verify["tools"],
        "toolsPassed": verify["passed"],
        "cited": ev["houseMix"]["valid"],
        "citedOf": ev["houseMix"]["items"],
        "criticDrops": ev["houseMix"]["criticDrops"],
        "l0Picks": ev["l0"]["items"],
        "l0Ambiguous": ev["l0"]["ambiguousInQloo"],
        "l0AmbiguousPct": round(100 * ev["l0"]["ambiguousInQloo"] / ev["l0"]["items"]),
        "shows": judge["pairs"],
        "wins": judge["overall"]["wins"],
        "losses": judge["overall"]["losses"],
        "ties": judge["overall"]["ties"],
        "v1Wins": v1["overall"]["wins"],
        "v1Losses": v1["overall"]["losses"],
        "openersWins": openers["wins"],
        "openersLosses": openers["losses"],
        "judgeModel": judge["model"],
        "date": judge["generatedAt"][:10],
    }


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    f = facts()
    json.dump(f, open(OUT, "w"), indent=1)
    print(json.dumps(f, indent=1))
