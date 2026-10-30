"""The narrator's lines, as data, with every number read from facts.json (video/facts.py).

Each line: (scene, id, caption, spoken, exaggeration, cfg_weight). The caption is what the screen shows; the spoken
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


def lines(f: dict) -> list[tuple[str, str, str, str, float, float]]:
    cited, of = f["cited"], f["citedOf"]
    return [
        ("open", "n1", "6:58. Doors open in two minutes, and the queue is round the block.",
         "Six fifty-eight. Doors open in two minutes, and the queue is round the block.", *OPEN),
        ("open", "n2", "Who’s actually coming tonight? What will they sing? Where will they drink after?",
         "Who's actually coming tonight? What will they sing? Where will they drink after?", *OPEN),
        ("open", "n3", "And the sponsor paying for all of it wants one answer: do we fit this crowd?",
         "And the sponsor paying for all of it wants one answer. Do we fit this crowd?", *OPEN),
        ("loop", "n10", "Watch. A promoter types tonight’s fixture, and every name goes to Qloo first. Dodger Stadium has a twin in Iowa, so House Mix asks. It never guesses.",
         "Watch. A promoter types tonight's fixture, and every name goes to Clue first. Dodger Stadium has a twin, in Iowa. So House Mix asks. It never guesses.", *PRODUCT),
        ("loop", "n12", "Then Claude agents go to work, and every Qloo call lands in the trace.",
         "Then Claude agents go to work, and every Clue call lands in the trace.", *PRODUCT),
        ("loop", "n13", "Here’s the crowd: what both fan bases share, and what only one side carries.",
         "Here's the crowd. What both fan bases share, and what only one side carries.", *PRODUCT),
        ("loop", "n14", "Open any pick: exactly what Qloo returned, our reading of it, even which act drove it.",
         "Open any pick. Exactly what Clue returned, our reading of it, even which act drove it.", *PRODUCT),
        ("sponsor", "n17", "First, Qloo recommends the brands this exact crowd already loves, ranked for this city.",
         "First, Clue recommends the brands this exact crowd already loves, ranked for this city.", *PRODUCT),
        ("sponsor", "n18", "Then it compares the crowd with each brand’s own audience. When they share no taste, it says so. No invented fit score.",
         "Then it compares the crowd with each brand's own audience. When they share no taste, it says so. No invented fit score.", *PRODUCT),
        ("sponsor", "n20", "One click, and the sponsor gets a one-pager: the activation, and the evidence behind it.",
         "One click, and the sponsor gets a one-pager. The activation, and the evidence behind it.", *PRODUCT),
        ("sponsor", "n21", "And on the night, the partnerships crew gets the cue, right on time.",
         "And on the night, the partnerships crew gets the cue, right on time.", *PRODUCT),
        ("hood", "n22", f"Under the hood: every name becomes a confirmed Qloo ID, and agents call {f['tools']} Qloo tools through MCP.",
         f"Under the hood. Every name becomes a confirmed Clue I D, and agents call {words(f['tools'])} Clue tools, through M C P.", *PRODUCT),
        ("hood", "n24", "A gate rejects anything Qloo didn’t return. Then a person approves every line.",
         "A gate rejects anything Clue didn't return. Then a person approves every line.", *PRODUCT),
        ("proof", "n27", f"Every House Mix pick traces back to a real Qloo call: {cited} of {of}. Claude alone? Nearly half its picks, Qloo couldn’t pin down.",
         f"Every House Mix pick traces back to a real Clue call. {words(cited)}, of {words(of)}. Claude alone? Nearly half its picks, Clue couldn't pin down.", *PRODUCT),
        ("recap", "n29", "Every name, confirmed. Every pick, cited. Every sponsor, matched honestly. Every cue, on time.",
         "Every name, confirmed. Every pick, cited. Every sponsor, matched honestly. Every cue, on time.", *LIFT),
    ]


def load() -> list[tuple[str, str, str, str, float, float]]:
    return lines(json.load(open(FACTS)))
