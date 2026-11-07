import { describe, expect, it } from "vitest";
import { botGame, botStep } from "./bot";
import { metrics } from "./selectors";
import type { GameState } from "./types";

function play(seed: number, days: number, mutate?: (s: GameState) => void) {
  const s = botGame(seed);
  mutate?.(s);
  let firstClient: number | undefined;
  for (let d = 0; d < days && s.status === "active"; d++) {
    botStep(s);
    if (firstClient === undefined && s.projects.length) firstClient = s.day;
  }
  return { s, firstClient };
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

describe("calibration against real-world base rates", () => {
  const N = 120;
  const runs = Array.from({ length: N }, (_, i) => play(1000 + i, 365));

  it("summary", () => {
    const f = runs.map((r) => r.s.funnel);
    const sum = (k: keyof (typeof f)[0]) => f.reduce((a, x) => a + x[k], 0);
    const firsts = runs.map((r) => r.firstClient ?? 999);
    const summary = {
      emailsSent: sum("emailsSent") / N,
      meetingsPer100Emails: (100 * runs.reduce((a, r) => a + r.s.deals.filter((d) => d.source === "cold_email").length, 0)) / Math.max(1, sum("emailsSent")),
      callsHeld: sum("callsHeld") / N,
      discoveryToProposal: sum("proposalsSent") / Math.max(1, sum("callsHeld")),
      winRate: sum("proposalsWon") / Math.max(1, sum("proposalsWon") + sum("proposalsLost")),
      medianDaysToFirstClient: median(firsts),
      clientWithin6Months: firsts.filter((d) => d <= 182).length / N,
      survived12Months: runs.filter((r) => r.s.status === "active").length / N,
      medianRevenueYear1: median(runs.map((r) => r.s.finance.ledger.filter((l) => l.category === "revenue").reduce((a, l) => a + l.amount, 0))),
      medianMrr: median(runs.map((r) => metrics(r.s).mrr)),
      firstWinSources: runs.reduce((acc, r) => {
        const first = r.s.projects[0] && r.s.deals.find((d) => d.id === r.s.projects[0].dealId);
        if (first) acc[first.source] = (acc[first.source] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      networkShareOfWins: runs.reduce((a, r) => a + r.s.deals.filter((d) => d.stage === "won" && (d.source === "network" || d.source === "referral")).length, 0) / Math.max(1, sum("proposalsWon")),
    };
    process.stdout.write("\nCALIBRATION " + JSON.stringify(summary, null, 1) + "\n");
    expect(summary.discoveryToProposal).toBeGreaterThan(0.3);
    expect(summary.discoveryToProposal).toBeLessThan(0.6);
    expect(summary.winRate).toBeGreaterThan(0.15);
    expect(summary.winRate).toBeLessThan(0.42);
    expect(summary.medianDaysToFirstClient).toBeGreaterThan(45);
    expect(summary.medianDaysToFirstClient).toBeLessThan(220);
    expect(summary.meetingsPer100Emails).toBeGreaterThan(0.4);
    expect(summary.meetingsPer100Emails).toBeLessThan(3);
  });

  it("is deterministic for a seed", () => {
    const a = play(42, 120).s;
    const b = play(42, 120).s;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
