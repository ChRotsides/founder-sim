import type { GameState } from "./types";

export interface Metrics {
  mrr: number;
  pipelineValue: number;
  activeClients: number;
  receivables: number;
  overdue: number;
  taxesDue: number;
  monthlyBurn: number; // average net cash out per month over the last 3 months (company)
  companyRunwayMonths: number;
  personalBurn: number;
  personalRunwayMonths: number;
  winRate: number;
  avgSatisfaction: number;
  deliveryBacklogHours: number;
  unresolved: number;
}

export function metrics(s: GameState): Metrics {
  const mrr = s.retainers.filter((r) => r.status === "active").reduce((a, r) => a + r.monthly, 0);
  const open = s.deals.filter((d) => d.stage === "proposal_sent" || d.stage === "negotiating");
  const pipelineValue = Math.round(open.reduce((a, d) => a + (d.proposal ? d.proposal.workshopFee + d.proposal.buildPrice : 0), 0));
  const clientIds = new Set([...s.projects.filter((p) => p.status === "active").map((p) => p.companyId), ...s.retainers.filter((r) => r.status === "active").map((r) => r.companyId)]);
  const openInv = s.finance.invoices.filter((i) => i.status === "open");
  const receivables = openInv.reduce((a, i) => a + i.net + i.vat, 0);
  const overdue = openInv.filter((i) => i.dueDay < s.day).reduce((a, i) => a + i.net + i.vat, 0);
  const taxesDue = s.finance.taxes.filter((t) => !t.paid).reduce((a, t) => a + t.amount, 0) + s.finance.vatOwed;
  const recent = s.months.slice(-3);
  const fixedGuess = s.finance.legalForm === "none" ? 0 : 250;
  const monthlyBurn = recent.length ? Math.max(0, recent.reduce((a, m) => a + (m.costs - m.revenue), 0) / recent.length) : fixedGuess;
  const sit = s.situation;
  const personalBurn = Math.max(0, sit.monthlyLiving - (sit.keepsJob ? sit.jobNetMonthly : 0) - s.policies.founderSalaryMonthly * 0.75);
  const decided = s.funnel.proposalsWon + s.funnel.proposalsLost;
  const delivered = s.projects.filter((p) => p.status === "delivered");
  return {
    mrr,
    pipelineValue,
    activeClients: clientIds.size,
    receivables: Math.round(receivables),
    overdue: Math.round(overdue),
    taxesDue: Math.round(taxesDue),
    monthlyBurn: Math.round(monthlyBurn),
    companyRunwayMonths: monthlyBurn > 0 ? Math.max(0, s.finance.cash - taxesDue) / monthlyBurn : Infinity,
    personalBurn: Math.round(personalBurn),
    personalRunwayMonths: personalBurn > 0 ? Math.max(0, sit.personalCash) / personalBurn : Infinity,
    winRate: decided ? s.funnel.proposalsWon / decided : 0,
    avgSatisfaction: delivered.length ? delivered.reduce((a, p) => a + p.satisfaction, 0) / delivered.length : 0,
    deliveryBacklogHours: Math.round(s.projects.filter((p) => p.status === "active").reduce((a, p) => a + (p.effortTrue - p.effortDone), 0)),
    unresolved: s.events.filter((e) => e.attention && !e.resolved).length,
  };
}
