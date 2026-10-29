# Awwwards round (29 Oct 2026): references for the landing page

Collected with Playwright + headless Chromium (`scripts/awwwards-capture.mjs`, `scripts/awwwards-sheets.py`) from the current Awwwards Sites of the Day and the "3D" and "Colorful" collections, plus four 3D/motion studios. For each site: three intro frames (0.6 s, 1.8 s, 3.8 s, to catch loaders and entrance motion), a pointer sweep, up to 14 frames of wheel-driven scrolling (so scroll-linked animation actually fires), a hover frame and a three-frame mobile pass (390 × 844). The contact sheets are in `design/refs-awwwards/`.

| Site | Why it was in the set | What House Mix takes from it |
| --- | --- | --- |
| [bar-topas.ch](refs-awwwards/bar-topas.jpg) | Colorful, 3D, hospitality | The five-stripe gig-poster palette; a loader of stripes with one witty line; tilted marquee ribbons; a **pinned section that assembles the product step by step** with a numbered list; huge condensed display type |
| [showcase.8am.com](refs-awwwards/showcase-8am.jpg) | Colorful product showcase | The **fanned deck of gradient cards** that opens as you scroll (our ten Qloo tools) |
| [31-for-31.com](refs-awwwards/31-for-31.jpg) | 3D storytelling, SOTD | Broadcast chrome: REC dot, timecode, progress counter (our "On air · 18:30:04" chip) |
| [rive.app](refs-awwwards/rive.jpg) | Interactive animation product | Dark hero with a **glowing gradient-bordered panel** (our live trace panel) |
| [spline.design](refs-awwwards/spline.jpg) | 3D product landing | A four/five-step "how it works" with a small visual per step; restraint in type |
| [heronaiapp.com](refs-awwwards/heron-ai.jpg) | AI agent product, SOTD | Line art that draws itself; one accent colour carrying the page |
| [lusion.co](refs-awwwards/lusion.jpg) | 3D studio | Glossy instanced 3D objects as the hero; a counted loader (rejected: too slow for a demo) |
| [offforum.com](refs-awwwards/offforum.jpg) | Event / festival, SOTD | Event facts as a compact grid near the logo |
| [overworldaudio.com](refs-awwwards/overworld-audio.jpg), [a24.raviklaassens.com](refs-awwwards/a24.jpg), [awards.racing](refs-awwwards/awards-racing.jpg), [emotion-agency.com](refs-awwwards/emotion-agency.jpg), [format.obys.agency](refs-awwwards/format-obys.jpg), [signal-a.studio](refs-awwwards/signal-a.jpg), [unbelievablycrap.com](refs-awwwards/unbelievably-crap.jpg), [garcy.studio](refs-awwwards/garcy-studio.jpg), [igloo.inc](refs-awwwards/igloo.jpg), [imogen](refs-awwwards/imogen-agentic-ai.jpg) | SOTD / 3D | Mostly confirmed what to avoid for a product judges must use quickly: sound gates, multi-second loaders, scroll-jacking that hides content, low-contrast micro type |

What we did not copy: no sound gate, no loader longer than about one second (and none on repeat visits or for reduced motion), no scroll-jacking (the pinned section uses normal scrolling with `position: sticky`), no text below 4.5:1 contrast.
