import { formatDate, isMonday, isMonthStart, isWeekday, monthKey } from "./calendar";
import { dailyDelivery, deliveryCapacity, monthlyRetainers, weeklyScopeChanges } from "./delivery";
import { milestone, pushEvent } from "./events";
import { book, checkVatThreshold, decideLoans, fmt, market, monthStart, payTaxes, processInvoices } from "./finance";
import { clamp, Rng } from "./rng";
import { company, decayLeads, decideProposals, dailyOutreach, processReplies, processSummaries, weeklyInbound } from "./sales";
import { metrics } from "./selectors";
import { dailyHiring, monthlyTeam, salesStaffHours } from "./team";
import type { GameState } from "./types";

function snapshotMonth(s: GameState) {
  const prevDay = s.day - 1;
  const mt = metrics(s);
  const a = s.monthAcc;
  s.months.push({
    month: monthKey(s.startDate, prevDay),
    revenue: Math.round(a.revenue),
    costs: Math.round(a.costs),
    profit: Math.round(a.revenue - a.costs),
    cash: Math.round(s.finance.cash),
    personalCash: Math.round(s.situation.personalCash),
    mrr: mt.mrr,
    pipeline: mt.pipelineValue,
    clients: mt.activeClients,
    hoursWorked: Math.round(a.hoursWorked),
    leads: a.leads,
    calls: a.calls,
    proposals: a.proposals,
    wins: a.wins,
  });
  s.monthAcc = { revenue: 0, costs: 0, profit: 0, hoursWorked: 0, leads: 0, calls: 0, proposals: 0, wins: 0 };
}

const NEWS: { title: string; body: string; mood: number }[] = [
  { title: "Big AI chatbot failure in the news", body: "A well-known company's chatbot gave customers wrong refunds. SMB owners are more cautious this month.", mood: 0.85 },
  { title: "Government announces digital transition subsidies", body: "SMBs can get part of digital projects subsidised. Expect more interest, and slower decisions while they apply.", mood: 1.12 },
  { title: "New model release makes AI cheaper", body: "API prices dropped again. Prospects have heard that 'AI is basically free now' and push back on build prices.", mood: 0.95 },
  { title: "AI is all over the local business press", body: "Conferences and articles everywhere. More owners are curious, though many just want to 'learn more'.", mood: 1.1 },
  { title: "EU AI Act obligations in the headlines", body: "Clients ask about compliance and data residency. Those who can answer confidently stand out.", mood: 0.97 },
  { title: "Economic slowdown worries", body: "Banks tighten lending and SMBs freeze discretionary spending.", mood: 0.88 },
];

function monthlyNews(s: GameState) {
  const rng = new Rng(s.rng);
  s.marketMood = 1 + (s.marketMood - 1) * 0.6;
  if (rng.chance(0.22)) {
    const n = rng.pick(NEWS);
    s.marketMood = clamp(s.marketMood * n.mood, 0.7, 1.3);
    pushEvent(s, "market_news", n.title, n.body);
  }
  if (rng.chance(0.15)) {
    const c = rng.pick(s.competitors);
    pushEvent(s, "competitor_news", `${c.name} is running a promotion`, `They're advertising AI solutions at ${c.priceLevel < 1 ? "low prices" : "premium prices with big-name references"}. Expect it to come up in negotiations.`);
  }
}

function monthReport(s: GameState) {
  const last = s.months[s.months.length - 1];
  if (!last || s.day < 14) return; // no report for a partial first month
  const mt = metrics(s);
  pushEvent(
    s,
    "month_report",
    `${formatDate(s.startDate, s.day - 1, { month: "long", year: "numeric" })} in review`,
    `Revenue ${fmt(s, last.revenue)}, costs ${fmt(s, last.costs)}, profit ${fmt(s, last.profit)}. Company cash ${fmt(s, s.finance.cash)}, your savings ${fmt(s, s.situation.personalCash)}. ${last.leads} leads, ${last.calls} calls, ${last.proposals} proposals, ${last.wins} wins. Personal runway: ${mt.personalRunwayMonths.toFixed(1)} months.`,
    { attention: true },
  );
}

function weekStart(s: GameState) {
  const sit = s.situation;
  const worked = s.week.hoursWorked + s.week.hoursBooked;
  if (s.day > 6) {
    if (worked > 55) sit.energy = clamp(sit.energy - (worked - 55) * 0.006);
    else if (worked < 45) sit.energy = clamp(sit.energy + 0.04);
    if (sit.energy < 0.4 && !s.flags.burnoutWarned) {
      s.flags.burnoutWarned = 1;
      pushEvent(s, "burnout", "You're running on empty", `You've averaged ${Math.round(worked)}h weeks. Your productivity and quality are dropping and you're making more mistakes. Founders burn out quietly. Cut hours or hire.`, { attention: true });
    }
    if (sit.energy > 0.7) s.flags.burnoutWarned = 0;
  }
  s.week = { weekStart: s.day, hoursWorked: 0, hoursBooked: 0, linkedinSent: 0, emailCarry: s.week.emailCarry, linkedinCarry: 0 };
  weeklyInbound(s);
  weeklyScopeChanges(s);
  for (const d of s.deals) {
    if (d.stage === "nurture" && (d.nurtureUntil ?? 0) <= s.day) {
      d.stage = "lead";
      d.createdDay = s.day;
      const c = company(s, d.companyId);
      pushEvent(s, "reply_positive", `Time to check back in with ${c.contact.name} (${c.name})`, `They asked you to follow up around now. A short call could restart the conversation.`, { attention: true, ref: { dealId: d.id } });
    }
  }
}

function workday(s: GameState) {
  const p = s.plan;
  const energy = 0.5 + 0.5 * s.situation.energy;
  const busy = s.projects.some((x) => x.status === "active") || s.retainers.some((r) => r.status === "active");
  let { emailHours: e, linkedinHours: l, networkingHours: n, contentHours: c } = p;
  let delivery = p.deliveryHours;
  if (!busy && delivery > 0) {
    // No client work: your delivery time goes back into finding clients.
    const out = e + l + n + c;
    if (out > 0) {
      const k = (out + delivery) / out;
      e *= k;
      l *= k;
      n *= k;
      c *= k;
    }
    delivery = 0;
  }
  const staff = salesStaffHours(s);
  dailyOutreach(s, {
    email: (e / 5) * energy + staff * 0.6,
    linkedin: (l / 5) * energy + staff * 0.4,
    networking: (n / 5) * energy,
    content: (c / 5) * energy,
  });
  const cap = deliveryCapacity(s, delivery / 5);
  dailyDelivery(s, cap);
  const hours = (e + l + n + c + delivery) / 5;
  s.week.hoursWorked += hours;
  s.monthAcc.hoursWorked += hours;
}

function solvency(s: GameState) {
  const f = s.finance;
  const sit = s.situation;
  if (f.cash < 0) {
    if (f.legalForm === "sole_trader" || f.legalForm === "none") {
      // Sole traders have unlimited liability: business debts are your debts.
      sit.personalCash += f.cash;
      f.ledger.push({ day: s.day, amount: -f.cash, category: "capital_in", memo: "Covered from personal savings (unlimited liability)" });
      f.cash = 0;
    } else {
      if (f.negativeSince === undefined) {
        f.negativeSince = s.day;
        pushEvent(s, "cash_warning", "Your company account is overdrawn", "The company can't pay its bills. Put money in from your savings, collect overdue invoices, get a loan, or cut costs. Directors who keep trading while insolvent can become personally liable.", { attention: true });
      } else if (s.day - f.negativeSince > 45) {
        endGame(s, `${s.businessName} became insolvent: the company couldn't pay its debts for over six weeks.`);
        return;
      }
    }
  } else f.negativeSince = undefined;

  const mt = metrics(s);
  if (f.legalForm !== "none" && mt.companyRunwayMonths < 2 && mt.monthlyBurn > 0 && (s.flags.cashWarnDay ?? -999) < s.day - 30) {
    s.flags.cashWarnDay = s.day;
    pushEvent(s, "cash_warning", "Less than 2 months of company cash left", `Average monthly burn ${fmt(s, mt.monthlyBurn)} against ${fmt(s, f.cash)} in the bank.`, { attention: true });
  }
  if (sit.personalCash < sit.monthlyLiving * 2 && (s.flags.personalWarnDay ?? -999) < s.day - 30) {
    s.flags.personalWarnDay = s.day;
    pushEvent(s, "personal_cash_warning", "Your personal savings are almost gone", `You have ${fmt(s, sit.personalCash)} left and spend ${fmt(s, sit.monthlyLiving)}/month to live. Founders quit when this hits zero, not when the business fails.`, { attention: true });
  }
  if (sit.personalCash < -sit.monthlyLiving * 2) {
    endGame(s, "You ran out of personal money and had to take a full-time job. This is how most first businesses actually end.");
  }
}

export function endGame(s: GameState, reason: string) {
  if (s.status === "game_over") return;
  s.status = "game_over";
  s.gameOver = { day: s.day, reason };
  pushEvent(s, "game_over", "Game over", reason, { attention: true });
}

export function advanceDay(s: GameState) {
  if (s.status !== "active") return;
  s.day++;
  if (isMonthStart(s.startDate, s.day)) {
    snapshotMonth(s);
    monthStart(s);
    monthlyRetainers(s);
    monthlyTeam(s);
    monthlyNews(s);
    monthReport(s);
  }
  if (isMonday(s.startDate, s.day)) weekStart(s);
  if (s.finance.legalForm === "ltd_pending" && (s.finance.ltdReadyDay ?? Infinity) <= s.day) {
    s.finance.legalForm = "ltd";
    pushEvent(s, "ltd_ready", `${s.businessName} Ltd is registered`, "You can now invoice as a company. Remember: the company's money isn't your money. Pay yourself a salary or dividends.", { attention: true });
  }
  if (isWeekday(s.startDate, s.day)) workday(s);
  processReplies(s);
  processSummaries(s);
  decayLeads(s);
  for (const d of s.deals) {
    if (d.stage === "call_scheduled" && d.callDay === s.day) {
      const c = company(s, d.companyId);
      pushEvent(s, "call_today", `Discovery call today with ${c.contact.name}`, `${c.contact.role} at ${c.name}. Take it live to practise discovery, or run a quick simulated call based on your consulting skill.`, { attention: true, ref: { dealId: d.id } });
    }
    if (d.stage === "call_scheduled" && (d.callDay ?? 0) < s.day - 2) {
      d.stage = "lost";
      d.lostReason = "You didn't show up to the call.";
      d.trueLostReason = d.lostReason;
      company(s, d.companyId).status = "lost";
    }
  }
  decideProposals(s);
  processInvoices(s);
  decideLoans(s);
  payTaxes(s);
  checkVatThreshold(s);
  dailyHiring(s);
  solvency(s);
  const mt = metrics(s);
  if (mt.mrr >= 1000) milestone(s, "mrr_1k", `${fmt(s, 1000)} in monthly recurring revenue`, "Recurring revenue is what makes an agency valuable and less stressful.");
  if (mt.mrr >= 5000) milestone(s, "mrr_5k", `${fmt(s, 5000)} MRR`, "This covers a salary in most markets.");
  const last = s.months[s.months.length - 1];
  if (last && last.profit > 0 && last.revenue > 0) milestone(s, "profitable_month", "First profitable month", "Revenue beat costs. Now do it three months in a row.");
  if (last && s.policies.founderSalaryMonthly >= s.situation.monthlyLiving && last.profit >= 0) milestone(s, "ramen", "Ramen profitable", "The business pays your living costs. Most founders never get here.");
}

export interface RunResult {
  days: number;
  stoppedBy?: string;
}

/** The "run until something happens" button. Stops on the first new event that needs the founder. */
export function runUntilEvent(s: GameState, maxDays = 120): RunResult {
  const seen = new Set(s.events.map((e) => e.id));
  for (let i = 1; i <= maxDays; i++) {
    advanceDay(s);
    const hit = s.events.find((e) => !seen.has(e.id) && e.attention && !e.resolved);
    if (hit || s.status !== "active") return { days: i, stoppedBy: hit?.title ?? s.gameOver?.reason };
  }
  return { days: maxDays };
}

export function advanceDays(s: GameState, n: number) {
  for (let i = 0; i < n && s.status === "active"; i++) advanceDay(s);
}

export function injectCapital(s: GameState, amount: number) {
  s.situation.personalCash -= amount;
  book(s, amount, "capital_in", "Founder capital injection");
}

export { market };
