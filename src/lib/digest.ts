// What the founder (and their assistant / mentor) can see. Hidden engine state (true pains,
// budgets, reservation prices, true effort) never leaves the engine through these functions,
// except true loss reasons in post-mortems.
import { ARCHETYPES } from "@/engine/calibration";
import { formatDate } from "@/engine/calendar";
import { fmt, LOAN_TERMS } from "@/engine/finance";
import { INDUSTRIES } from "@/engine/industries";
import { MARKETS } from "@/engine/markets";
import { metrics } from "@/engine/selectors";
import { sourceLabel } from "@/engine/sales";
import { ROLE_LABEL } from "@/engine/team";
import type { Deal, GameState } from "@/engine/types";

export function knownPains(s: GameState, d: Deal) {
  const c = s.companies.find((x) => x.id === d.companyId)!;
  const disc = new Set(d.calls.flatMap((x) => x.discoveredPainIds));
  const quant = new Set(d.calls.flatMap((x) => x.quantifiedPainIds));
  return c.pains
    .filter((p) => disc.has(p.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      whatYouLearned: p.detail,
      quantified: quant.has(p.id),
      hoursPerWeek: quant.has(p.id) ? p.hoursPerWeek : undefined,
      estimatedAnnualCost: quant.has(p.id) ? Math.round(p.annualCost / 500) * 500 : undefined,
    }));
}

function dealSummary(s: GameState, d: Deal) {
  const c = s.companies.find((x) => x.id === d.companyId)!;
  const p = d.proposal;
  return {
    dealId: d.id,
    company: c.name,
    industry: INDUSTRIES[c.industry].label,
    employees: c.employees,
    contact: `${c.contact.name} (${c.contact.role})`,
    stage: d.stage,
    source: sourceLabel(d.source),
    callDay: d.callDay !== undefined ? formatDate(s.startDate, d.callDay) : undefined,
    proposal: p ? { status: p.status, buildPrice: p.buildPrice, workshopFee: p.workshopFee, retainerMonthly: p.retainerMonthly, counterPrice: p.counterPrice, sent: formatDate(s.startDate, p.submittedDay) } : undefined,
    lostReason: d.lostReason,
  };
}

export function details(s: GameState, section: string, id?: string): unknown {
  const m = MARKETS[s.market];
  const mt = metrics(s);
  switch (section) {
    case "overview":
      return {
        date: formatDate(s.startDate, s.day),
        dayOfGame: s.day,
        market: m.label,
        currency: m.currency,
        business: s.businessName,
        legalForm: s.finance.legalForm,
        vatRegistered: s.finance.vatRegistered,
        companyCash: Math.round(s.finance.cash),
        personalSavings: Math.round(s.situation.personalCash),
        personalMonthlyLiving: s.situation.monthlyLiving,
        keepsDayJob: s.situation.keepsJob,
        energy: Math.round(s.situation.energy * 100),
        ...mt,
        companyRunwayMonths: isFinite(mt.companyRunwayMonths) ? +mt.companyRunwayMonths.toFixed(1) : "no burn",
        personalRunwayMonths: isFinite(mt.personalRunwayMonths) ? +mt.personalRunwayMonths.toFixed(1) : "no burn",
        reputation: s.reputation,
        founderSkills: s.founder.skills,
        lastMonths: s.months.slice(-3),
        status: s.status,
      };
    case "inbox":
      return s.events.filter((e) => e.attention && !e.resolved).map((e) => ({ eventId: e.id, date: formatDate(s.startDate, e.day), kind: e.kind, title: e.title, body: e.body, ref: e.ref }));
    case "pipeline":
      return s.deals.filter((d) => !["won", "lost"].includes(d.stage)).map((d) => dealSummary(s, d));
    case "deal": {
      const d = s.deals.find((x) => x.id === id);
      if (!d) return { error: "No such deal" };
      return { ...dealSummary(s, d), knownPains: knownPains(s, d), calls: d.calls.map((c) => ({ date: formatDate(s.startDate, c.day), mode: c.mode, nextStep: c.nextStep, coaching: c.coaching })), notes: d.notes, solutionTypes: Object.fromEntries(Object.entries(ARCHETYPES).map(([k, v]) => [k, v.label])) };
    }
    case "projects":
      return {
        projects: s.projects.map((p) => ({ projectId: p.id, client: s.companies.find((c) => c.id === p.companyId)?.name, name: p.name, status: p.status, price: p.price, progressPct: Math.round((p.effortDone / p.effortTrue) * 100), hoursLogged: Math.round(p.hoursLogged), estimateHours: p.estimateHours, due: formatDate(s.startDate, p.dueDay), late: s.day > p.dueDay && p.status === "active" })),
        retainers: s.retainers.map((r) => ({ client: s.companies.find((c) => c.id === r.companyId)?.name, monthly: r.monthly, runCost: r.runCost, status: r.status, churnReason: r.churnReason })),
      };
    case "finance":
      return {
        companyCash: Math.round(s.finance.cash),
        personalSavings: Math.round(s.situation.personalCash),
        openInvoices: s.finance.invoices.filter((i) => i.status === "open").map((i) => ({ invoiceId: i.id, client: s.companies.find((c) => c.id === i.companyId)?.name, amount: i.net + i.vat, due: formatDate(s.startDate, i.dueDay), overdueDays: Math.max(0, s.day - i.dueDay) })),
        taxes: s.finance.taxes.filter((t) => !t.paid).map((t) => ({ memo: t.memo, amount: t.amount, due: formatDate(s.startDate, t.dueDay) })),
        vatOwedThisQuarter: Math.round(s.finance.vatOwed),
        loans: s.finance.loans.map((l) => ({ type: LOAN_TERMS[l.kind].label, status: l.status, principal: l.principal, balance: Math.round(l.balance), monthlyPayment: l.monthlyPayment, reason: l.decisionReason })),
        months: s.months.slice(-6),
      };
    case "team":
      return {
        employees: s.employees.filter((e) => e.status !== "left").map((e) => ({ employeeId: e.id, name: e.name, role: ROLE_LABEL[e.role], salary: e.salary, starts: formatDate(s.startDate, e.startDay), status: e.status })),
        jobOpen: s.jobOpen ? ROLE_LABEL[s.jobOpen.role] : null,
        candidates: s.candidates.filter((c) => c.status === "applied" || c.status === "offered").map((c) => ({ candidateId: c.id, name: c.name, role: ROLE_LABEL[c.role], background: c.background, salaryAsk: c.salaryAsk, status: c.status })),
        marketSalaries: m.salaries,
        employerContributionPct: Math.round(m.employerContrib * 100),
      };
    case "policies":
      return { plan: s.plan, policies: s.policies };
    case "market":
      return {
        market: m.label,
        notes: m.notes,
        referenceHourlyRate: m.aiRateRef,
        vatRate: m.vatRate,
        vatThreshold: m.vatThreshold,
        corporateTax: m.corporateTax,
        costs: { soleTraderSetup: m.soleTraderSetupCost, ltdSetup: m.ltdSetupCost, ltdSetupDays: m.ltdSetupDays, accountantMonthly: m.accountantMonthly, auditAnnual: m.auditAnnual, insuranceAnnual: m.insuranceAnnual, coworkingMonthly: m.coworkingMonthly },
        employerContribution: m.employerContrib,
        selfEmployedContribution: m.selfEmployedContrib,
        competitors: s.competitors.map((c) => ({ name: c.name, kind: c.kind, priceLevel: c.priceLevel })),
        industries: Object.values(INDUSTRIES).map((i) => ({ id: i.id, label: i.label })),
        untouchedCompaniesByIndustry: Object.fromEntries(Object.keys(INDUSTRIES).map((k) => [k, s.companies.filter((c) => c.industry === k && c.status === "untouched").length])),
      };
    case "funnel":
      return s.funnel;
  }
  return { error: `Unknown section ${section}` };
}

/** Plain-text digest for the mentor. */
export function mentorDigest(s: GameState, revealTruth: boolean): string {
  const lost = s.deals.filter((d) => d.stage === "lost").slice(-12);
  return [
    `GAME DATA (${MARKETS[s.market].label}, ${formatDate(s.startDate, s.day)}, day ${s.day})`,
    `Founder: ${s.founder.name}, ${s.founder.headline}. Skills: ${JSON.stringify(s.founder.skills)}. Warm network ${s.founder.warmNetwork} (used ${s.warmContactsUsed}). Known industries: ${s.founder.industriesKnown.join(", ")}.`,
    `Situation: ${s.situation.keepsJob ? "keeps day job" : "full-time"}, savings ${fmt(s, s.situation.personalCash)}, living costs ${fmt(s, s.situation.monthlyLiving)}/month, energy ${Math.round(s.situation.energy * 100)}%.`,
    `Overview: ${JSON.stringify(details(s, "overview"))}`,
    `Weekly plan & policies: ${JSON.stringify(details(s, "policies"))}`,
    `Funnel: ${JSON.stringify(s.funnel)}`,
    `Monthly history: ${JSON.stringify(s.months)}`,
    `Pipeline: ${JSON.stringify(details(s, "pipeline"))}`,
    `Projects: ${JSON.stringify(details(s, "projects"))}`,
    `Recent losses: ${JSON.stringify(lost.map((d) => ({ company: s.companies.find((c) => c.id === d.companyId)?.name, reasonGiven: d.lostReason, ...(revealTruth ? { realReason: d.trueLostReason } : {}) })))}`,
    `Recent decisions: ${s.decisionsLog.slice(-25).map((x) => `${formatDate(s.startDate, x.day)}: ${x.text}`).join("; ")}`,
    s.gameOver ? `GAME OVER: ${s.gameOver.reason}` : "",
  ].join("\n");
}
