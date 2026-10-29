import { describe, expect, it } from "vitest";
import { fleissKappa, hitAndRr, median, rng, shuffle, wilson } from "./lib.ts";

describe("eval statistics", () => {
  it("wilson interval matches the textbook value for 8/10", () => {
    const w = wilson(8, 10);
    expect(w.p).toBe(0.8);
    expect(w.lo).toBeCloseTo(0.49, 2);
    expect(w.hi).toBeCloseTo(0.943, 2);
  });
  it("wilson handles n = 0", () => {
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 0 });
  });
  it("fleiss kappa is 1 for perfect agreement and ~0 or below for chance", () => {
    expect(fleissKappa([[3, 0], [0, 3], [3, 0]])).toBeCloseTo(1, 6);
    const k = fleissKappa([[1, 1], [1, 1], [1, 1]]);
    expect(k).toBeLessThanOrEqual(0);
    expect(fleissKappa([[1, 0]])).toBeUndefined();
  });
  it("fleiss kappa matches the Wikipedia worked example", () => {
    const table = [
      [0, 0, 0, 0, 14],
      [0, 2, 6, 4, 2],
      [0, 0, 3, 5, 6],
      [0, 3, 9, 2, 0],
      [2, 2, 8, 1, 1],
      [7, 7, 0, 0, 0],
      [3, 2, 6, 3, 0],
      [2, 5, 3, 2, 2],
      [6, 5, 2, 1, 0],
      [0, 2, 2, 3, 7],
    ];
    expect(fleissKappa(table)).toBeCloseTo(0.21, 2);
  });
  it("hit@10 and reciprocal rank", () => {
    const ranked = ["a", "b", "c", "d"];
    expect(hitAndRr(ranked, new Set(["c"]))).toEqual({ hit: true, rr: 1 / 3 });
    expect(hitAndRr(ranked, new Set(["z"]))).toEqual({ hit: false, rr: 0 });
    expect(hitAndRr([...Array(12).keys()].map(String), new Set(["11"]), 10).hit).toBe(false);
  });
  it("seeded shuffle is reproducible", () => {
    expect(shuffle([1, 2, 3, 4, 5], rng(7))).toEqual(shuffle([1, 2, 3, 4, 5], rng(7)));
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
