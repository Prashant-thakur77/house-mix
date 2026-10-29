import { BRAND_COLORS, BRAND_MARK } from "@housemix/shared";
import { cn } from "cn";

export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} shapeRendering="crispEdges">
      <rect width="32" height="32" rx="6" fill={BRAND_COLORS.ink} />
      {BRAND_MARK.flatMap((row, y) =>
        row.split("").map((c, x) => (c === "." ? null : <rect key={`${x}-${y}`} x={4.6 + x * 2.6} y={4.6 + y * 2.6} width="2.2" height="2.2" fill={c === "R" ? BRAND_COLORS.red : BRAND_COLORS.paper} />)),
      )}
    </svg>
  );
}
