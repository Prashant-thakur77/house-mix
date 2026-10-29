/**
 * The House Mix mark: a dot-matrix house whose inside is an EQ meter, with one red pixel at the
 * peak. 9×9 cells on a 32-unit ink tile; "X" is paper, "R" is signal red. Drawn by the web app,
 * the PDF exports and apps/web/app/icon.svg.
 */
export const BRAND_MARK = ["....R....", "...X.X...", "..X...X..", ".X.....X.", "X...X...X", "X...X...X", "X.X.X...X", "X.X.X.X.X", "XXXXXXXXX"];
export const BRAND_COLORS = { ink: "#0A0A0A", paper: "#F1F1F1", red: "#E8271C" } as const;
