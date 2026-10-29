import type { Mode } from "@housemix/shared";
import { cn } from "cn";

/* 9×9 dot-matrix glyphs, one per mode. "X" is ink, "R" is the single red pixel. */
const GLYPHS: Record<Mode, string[]> = {
  concert: ["...XXXXXR", "...XXXXXX", "...X....X", "...X....X", "...X....X", ".XXX..XXX", "XXXX.XXXX", "XXX..XXX.", "........."],
  comedy: ["...XRX...", "..XXXXX..", "..XXXXX..", "..XXXXX..", "X.XXXXX.X", "X..XXX..X", ".X..X..X.", "....X....", "..XXXXX.."],
  sports: ["..XXXXX..", ".X..X..X.", "X..XXX..X", "X.XXRXX.X", "XX.XXX.XX", "X...X...X", "X.X...X.X", ".XXX.XXX.", "..XXXXX.."],
  festival: ["....XRR..", "....XR...", "....X....", "...XXX...", "..XX.XX..", "..X.X.X..", ".XX.X.XX.", ".X..X..X.", "XXXXXXXXX"],
};

export function PixelGlyph({ mode, className, title }: { mode: Mode; className?: string; title?: string }) {
  const rows = GLYPHS[mode];
  return (
    <svg viewBox="0 0 9 9" className={cn("size-4 shrink-0", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        row.split("").map((c, x) => (c === "." ? null : <rect key={`${x}-${y}`} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" fill={c === "R" ? "#E8271C" : "currentColor"} />)),
      )}
    </svg>
  );
}
