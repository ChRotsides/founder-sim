// A simple competent-but-average player used for calibration tests and balance checks.
import { runAction } from "./actions";
import { founderEstimate } from "./sales";
import { advanceDay } from "./sim";
import type { FounderProfile, GameState, MarketId } from "./types";
import { newGame } from "./world";

export const AVERAGE_FOUNDER: FounderProfile = {
  name: "Test Founder",
  headline: "Software engineer turned AI consultant",
  location: "Nicosia",
  publicSummary: "8 years as a software engineer, recent LLM projects.",
  strengths: [],
  gaps: [],
  skills: { technical: 0.65, sales: 0.4, consulting: 0.45, delivery: 0.5, credibility: 0.45 },
  industriesKnown: ["accounting_firm", "shipping_logistics"],
  warmNetwork: 40,
  yearsExperience: 8,
  evidence: [],
};

export function botGame(seed: number, opts: { market?: MarketId; founder?: FounderProfile; savings?: number } = {}): GameState {
  return newGame({
    seed,
    market: opts.market ?? "CY",
    businessName: "Test AI",
    founder: opts.founder ?? AVERAGE_FOUNDER,
    situation: { personalCash: opts.savings ?? 25_000, monthlyLiving: 1_700, hoursPerWeek: 50, keepsJob: false, jobNetMonthly: 0, hasCollateral: false },
    startDate: "2026-11-02",
  });
}

function tryRun(s: GameState, name: string, args: Record<string, unknown>) {
  try {
    return runAction(s, name, args);
  } catch {
    return undefined;
  }
}

/** One day of bot decisions, then advance. */
export function botStep(s: GameState, priceMult = 1.15) {
  if (s.day === 0) tryRun(s, "register_business", { form: "sole_trader" });
  for (const e of s.events.filter((x) => x.attention && !x.resolved)) {
    const dealId = e.ref?.dealId;
    switch (e.kind) {
      case "reply_positive":
      case "warm_intro":
      case "inbound_lead":
      case "referral":
        if (dealId) tryRun(s, "schedule_call", { dealId });
        break;
      case "call_today":
        if (dealId) tryRun(s, "quick_call", { dealId });
        break;
      case "proposal_response": {
        const d = s.deals.find((x) => x.id === dealId);
        if (d?.proposal?.status === "accepted") tryRun(s, "start_project", { dealId });
        else if (d?.proposal?.status === "countered") tryRun(s, "respond_counter", { dealId, choice: "split" });
        break;
      }
      case "proposal_ghosted":
        if (dealId) tryRun(s, "follow_up", { dealId });
        break;
      case "invoice_overdue":
        if (e.ref?.invoiceId) tryRun(s, "chase_invoice", { invoiceId: e.ref.invoiceId });
        break;
      case "list_exhausted":
        s.plan.targetIndustries = [];
        break;
      case "scope_change":
        if (e.ref?.projectId) tryRun(s, "resolve_scope_change", { projectId: e.ref.projectId, choice: "change_order" });
        break;
    }
    e.resolved = true;
  }
  for (const d of s.deals) {
    if (d.stage !== "proposal_requested") continue;
    const c = s.companies.find((x) => x.id === d.companyId)!;
    const known = new Set(d.calls.flatMap((x) => x.discoveredPainIds));
    const items = c.pains.filter((p) => known.has(p.id)).map((p) => ({ painId: p.id, archetype: p.archetype }));
    const est = items.reduce((a, it) => a + founderEstimate(s, it.painId, it.archetype), 0);
    tryRun(s, "send_proposal", { dealId: d.id, items, buildPrice: Math.round(est * s.policies.hourlyRate * priceMult), retainerMonthly: 400, timelineWeeks: Math.max(3, Math.ceil(est / 15)) });
  }
  advanceDay(s);
}
