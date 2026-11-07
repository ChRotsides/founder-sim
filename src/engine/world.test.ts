import { describe, expect, it } from "vitest";
import { botGame } from "./bot";

describe("world generation", () => {
  it("gives every company a unique, number-free name", () => {
    for (const market of ["CY", "UK", "US"] as const) {
      const s = botGame(7, { market });
      const names = s.companies.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.filter((n) => /\d/.test(n))).toEqual([]);
    }
  });
});
