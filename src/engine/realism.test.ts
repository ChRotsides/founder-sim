import { describe, expect, it } from "vitest";
import { AVERAGE_FOUNDER, botGame, botStep } from "./bot";

function season(opts: { priceMult?: number; founder?: typeof AVERAGE_FOUNDER; days?: number }, n = 60) {
  let won = 0;
  let lost = 0;
  let withClient = 0;
  for (let i = 0; i < n; i++) {
    const s = botGame(5000 + i, { founder: opts.founder });
    for (let d = 0; d < (opts.days ?? 300) && s.status === "active"; d++) botStep(s, opts.priceMult);
    won += s.funnel.proposalsWon;
    lost += s.funnel.proposalsLost;
    if (s.projects.length) withClient++;
  }
  return { winRate: won / Math.max(1, won + lost), withClient: withClient / n };
}

describe("the market punishes bad plans", () => {
  it("overpricing 3x collapses the win rate", { timeout: 120_000 }, () => {
    const fair = season({ priceMult: 1.15 });
    const greedy = season({ priceMult: 3.5 });
    process.stdout.write(`\nREALISM fair=${JSON.stringify(fair)} greedy=${JSON.stringify(greedy)}\n`);
    expect(greedy.winRate).toBeLessThan(fair.winRate * 0.6);
  });

  it("a founder with no network and no sales skill struggles", { timeout: 120_000 }, () => {
    const weak = season({ founder: { ...AVERAGE_FOUNDER, warmNetwork: 0, skills: { technical: 0.5, sales: 0.1, consulting: 0.25, delivery: 0.3, credibility: 0.2 }, industriesKnown: [] }, days: 180 });
    const avg = season({ days: 180 });
    process.stdout.write(`\nREALISM weak=${JSON.stringify(weak)} avg=${JSON.stringify(avg)}\n`);
    expect(weak.withClient).toBeLessThan(avg.withClient);
  });
});
