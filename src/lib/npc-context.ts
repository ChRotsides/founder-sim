import { ARCHETYPES } from "@/engine/calibration";
import { formatDate } from "@/engine/calendar";
import { INDUSTRIES } from "@/engine/industries";
import { MARKETS } from "@/engine/markets";
import { openness, sourceLabel } from "@/engine/sales";
import { ROLE_LABEL } from "@/engine/team";
import type { Candidate, Deal, GameState } from "@/engine/types";
import type { DiscoveryContext, InterviewContext, NegotiationContext } from "./prompts";

function contactOf(s: GameState, d: Deal) {
  const c = s.companies.find((x) => x.id === d.companyId)!;
  const k = c.contact;
  return { c, contact: { name: k.name, role: k.role, decisionMaker: k.decisionMaker, ...k.personality, quirk: k.quirk } };
}

export function discoveryContext(s: GameState, d: Deal): DiscoveryContext {
  const m = MARKETS[s.market];
  const { c, contact } = contactOf(s, d);
  return {
    kind: "discovery",
    market: m.label,
    symbol: m.symbol,
    date: formatDate(s.startDate, s.day),
    businessName: s.businessName,
    founder: { name: s.founder.name, headline: s.founder.headline, publicSummary: s.founder.publicSummary },
    source: sourceLabel(d.source),
    company: { name: c.name, industry: INDUSTRIES[c.industry].label.toLowerCase(), employees: c.employees, city: c.city, revenue: c.revenue, attitude: c.aiAttitude, maturity: c.digitalMaturity, urgency: c.urgency, budget: c.techBudget },
    contact,
    pains: c.pains.map((p) => ({ id: p.id, title: p.title, detail: p.detail, aware: p.aware, hoursPerWeek: p.hoursPerWeek, annualCost: p.annualCost })),
    openness: openness(s, d),
    priorCalls: d.calls.map((x) => `${formatDate(s.startDate, x.day)}: next step ${x.nextStep.replace(/_/g, " ")}`),
  };
}

export function negotiationContext(s: GameState, d: Deal): NegotiationContext {
  const m = MARKETS[s.market];
  const { c, contact } = contactOf(s, d);
  const p = d.proposal!;
  return {
    kind: "negotiation",
    market: m.label,
    symbol: m.symbol,
    businessName: s.businessName,
    founder: { name: s.founder.name },
    company: { name: c.name, industry: INDUSTRIES[c.industry].label.toLowerCase() },
    contact,
    proposal: { solutions: p.items.map((it) => ARCHETYPES[it.archetype].label), buildPrice: p.buildPrice, workshopFee: p.workshopFee, retainerMonthly: p.retainerMonthly, timelineWeeks: p.timelineWeeks, upfrontPct: p.upfrontPct },
    counterPrice: p.counterPrice ?? p.buildPrice,
    ceiling: p.reservationPrice,
  };
}

export function interviewContext(s: GameState, cand: Candidate): InterviewContext {
  const m = MARKETS[s.market];
  const clients = new Set(s.projects.map((p) => p.companyId)).size;
  return {
    kind: "interview",
    market: m.label,
    symbol: m.symbol,
    businessName: s.businessName,
    founder: { name: s.founder.name },
    candidate: { name: cand.name, role: ROLE_LABEL[cand.role], background: cand.background, skill: cand.skill, salaryAsk: cand.salaryAsk, reliability: cand.reliability, ambition: cand.ambition },
    companyFacts: `Founded ${Math.round(s.day / 30)} months ago, ${clients} clients so far, ${s.employees.filter((e) => e.status === "active").length} employees.`,
  };
}
