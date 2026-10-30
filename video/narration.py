"""The narrator's lines, as data, with every number read from facts.json (video/facts.py).

Each line: (scene, id, caption, spoken, exaggeration, cfg_weight, voice). Two narrators share the film: a female voice
for the story, the sponsors and the proof, and a male voice for the product, under the hood and the recap (refs/). The caption is what the screen shows; the spoken
text is what the voice reads (numbers in words, names spelled for the voice). Prashant's own lines are in
FACE_SCRIPT.txt and are cut from his recording, not voiced here. The ids match video/storyboard.md (n<shot>).
"""

from __future__ import annotations

import json
import os

WORK = os.path.expanduser("~/Videos/housemix")
FACTS = f"{WORK}/build/facts.json"

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n: int) -> str:
    """A whole number from 0 to 999 as the voice should say it."""
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    rest = n % 100
    return ONES[n // 100] + " hundred" + ("" if rest == 0 else " and " + words(rest))


# Energetic throughout; the opening a touch slower and warmer, the recap the most lift.
OPEN = (0.75, 0.35)
PRODUCT = (0.75, 0.4)
LIFT = (0.95, 0.3)


FEMALE = {"open", "sponsor", "proof"}


def share(pct: int) -> tuple[str, str]:
    """A share as the caption writes it and as the voice says it: a quarter when it is one, else the percentage."""
    if 22 <= pct <= 28:
        return "a quarter", "a quarter"
    return f"{pct}%", f"{words(pct)} percent"


def lines(f: dict) -> list[tuple[str, str, str, str, float, float, str]]:
    cited, of = f["cited"], f["citedOf"]
    assert cited == of, "n27 says all of them"
    assert f["brandsRepeated"] == 0, "n35 says not one sponsor repeats"
    out = [
        ("open", "n1", "6:58. Doors open in two minutes, and the queue is round the block.",
         "Six fifty-eight. Doors open in two minutes, and the queue is round the block.", *OPEN),
        ("open", "n2", "Who’s actually coming tonight? What will they sing? Where will they drink after?",
         "Who's actually coming tonight? What will they sing? Where will they drink after?", *OPEN),
        ("open", "n3", "And the sponsor paying for all of it wants one answer: do we fit this crowd?",
         "And the sponsor paying for all of it wants one answer. Do we fit this crowd?", *OPEN),
        ("loop", "n10", "Watch. A promoter types tonight’s fixture, and every name goes to Qloo first. Dodger Stadium has a twin in Iowa, so House Mix asks. It never guesses.",
         "Watch. A promoter types tonight's fixture, and every name goes to Clue first. Dodger Stadium has a twin, in Iowa. So House Mix asks. It never guesses.", *PRODUCT),
        ("loop", "n12", "Then the agents go to work, and every Qloo call lands in the trace.",
         "Then the agents go to work, and every Clue call lands in the trace.", *PRODUCT),
        ("loop", "n13", "Here’s the crowd: what both fan bases share, and what only one side carries.",
         "Here's the crowd. What both fan bases share, and what only one side carries.", *PRODUCT),
        ("loop", "n14", "Open any pick: exactly what Qloo returned, our reading of it, even which act drove it.",
         "Open any pick. Exactly what Clue returned, our reading of it, even which act drove it.", *PRODUCT),
        ("sponsor", "n17", "First, Qloo recommends the brands this exact crowd already loves, ranked for this city.",
         "First, Clue recommends the brands this exact crowd already loves, ranked for this city.", *PRODUCT),
        ("sponsor", "n18", "Then it compares the crowd with each brand’s own audience. When they share no taste, it says so. No invented fit score.",
         "Then it compares the crowd with each brand's own audience. When they share no taste, it says so. No invented fit score.", *PRODUCT),
        ("run", "n31", "Then it gets the night ready. Every artist Qloo picked becomes real music, timed to each part of the night. Short on songs? The agent asks Qloo for more.",
         "Then it gets the night ready. Every artist Clue picked becomes real music, timed to each part of the night. Short on songs? The agent asks Clue for more.", *PRODUCT),
        ("run", "n32", "Every partner gets a message built from Qloo’s evidence, ready to send from your own email.",
         "Every partner gets a message built from Clue's evidence, ready to send from your own email.", *PRODUCT),
        ("run", "n21", "And on the night, every crew gets its cue on time, with the music already playing.",
         "And on the night, every crew gets its cue on time, with the music already playing.", *PRODUCT),
        ("hood", "n22", f"Under the hood: agents use {f['tools']} Qloo tools over MCP. A gate rejects anything Qloo did not return.",
         f"Under the hood, the agents use {words(f['tools'])} Clue tools, over M C P. A gate rejects anything Clue did not return.", *PRODUCT),
        ("proof", "n27", "Every House Mix pick traces back to a real Qloo call. All of them. Claude alone? Nearly half its picks, Qloo couldn’t pin down.",
         "Every House Mix pick traces back to a real Clue call. All of them. Claude alone? Nearly half its picks, Clue couldn't pin down.", *PRODUCT),
        ("recap", "n29", "Every name, confirmed. Every pick, cited. Every sponsor, matched honestly. Every cue, on time.",
         "Every name, confirmed. Every pick, cited. Every sponsor, matched honestly. Every cue, on time.", *LIFT),
        ("proof", "n35", f"Why Qloo? Move the same show to another city, and only {share(f['awayPct'])[0]} of its top 10 survives. Across {f['valueShows']} shows, not one sponsor repeats. Claude alone pitched {f['l0TopBrand']} to {f['l0TopBrandShows']}.",
         f"Why Clue? Move the same show to another city, and only {share(f['awayPct'])[1]} of its top ten survives. Across {words(f['valueShows'])} shows, not one sponsor repeats. Claude alone pitched {f['l0TopBrand']} to {words(f['l0TopBrandShows'])}.", *PRODUCT),
    ]
    return [(*line, "female" if line[0] in FEMALE else "male") for line in out]


def load() -> list[tuple[str, str, str, str, float, float, str]]:
    return lines(json.load(open(FACTS)))
