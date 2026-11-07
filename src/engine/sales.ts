import { ARCHETYPES, FUNNEL } from "./calibration";
import { addBusinessDays, seasonality } from "./calendar";
import { milestone, pushEvent } from "./events";
import { book, fmt, market } from "./finance";
import { INDUSTRIES } from "./industries";
import { clamp, Rng, sigmoid } from "./rng";
import type { Archetype, CallRecord, Company, Deal, GameState, LeadSource, Pain, Proposal, ProposalItem } from "./types";

const SOURCE_TRUST: Record<LeadSource, number> = { cold_email: 0.2, linkedin: 0.25, content: 0.35, event: 0.35, network: 0.5, referral: 0.6 };
const SOURCE_LABEL: Record<LeadSource, string> = { cold_email: "cold email", linkedin: "LinkedIn", content: "your content", event: "a networking event", network: "your network", referral: "a client referral" };

export function sourceLabel(src: LeadSource) {
  return SOURCE_LABEL[src];
}

function reputationMult(s: GameState) {
  const r = s.reputation;
  return Math.min(1.7, 1 + 0.12 * r.caseStudies + 0.05 * r.testimonials + r.brand * 0.5);
}

function targetPool(s: GameState): Company[] {
  const t = s.plan.targetIndustries;
  return s.companies.filter((c) => c.status === "untouched" && (t.length === 0 || t.includes(c.industry)));
}

function nicheMult(s: GameState, c: Company) {
  const t = s.plan.targetIndustries;
  let m = t.length > 0 && t.length <= 2 ? 1.25 : 1;
  if (s.founder.industriesKnown.includes(c.industry)) m *= 1.2;
  return m;
}

const ATTITUDE_REPLY = { skeptic: 0.55, curious: 1, eager: 1.7 } as const;

export function createDeal(s: GameState, c: Company, source: LeadSource): Deal {
  const rng = new Rng(s.rng);
  const trust = clamp(SOURCE_TRUST[source] + 0.15 * (s.founder.skills.credibility - 0.5) + 0.05 * (reputationMult(s) - 1) + rng.normal(0, 0.05), 0.05, 0.9);
  const d: Deal = { id: rng.id("deal"), companyId: c.id, source, stage: "lead", createdDay: s.day, trust, calls: [], notes: [] };
  c.status = "in_pipeline";
  s.deals.push(d);
  s.monthAcc.leads++;
  milestone(s, "first_lead", "First lead!", `${c.contact.name} at ${c.name} is open to talking. Most founders remember this one.`);
  return d;
}

function leadEvent(s: GameState, d: Deal, c: Company, kind: "reply_positive" | "warm_intro" | "inbound_lead" | "referral") {
  const ind = INDUSTRIES[c.industry].label.toLowerCase();
  const titles = {
    reply_positive: `${c.contact.name} (${c.name}) replied: "Happy to have a quick call"`,
    warm_intro: `Warm intro: ${c.contact.name}, ${c.contact.role} at ${c.name}`,
    inbound_lead: `Inbound: ${c.contact.name} from ${c.name} saw your posts`,
    referral: `Referral: ${c.contact.name} at ${c.name} was recommended to you`,
  };
  pushEvent(s, kind, titles[kind], `${c.name}: ${ind}, ${c.employees} people, ${c.city}. Came via ${SOURCE_LABEL[d.source]}. Book a discovery call while they're warm; leads go cold within days.`, { attention: true, ref: { dealId: d.id } });
}

/** One weekday of outreach work. Hours are what the founder (and sales staff) actually spend today. */
export function dailyOutreach(s: GameState, hours: { email: number; linkedin: number; networking: number; content: number }) {
  const rng = new Rng(s.rng);
  const m = market(s);
  const season = seasonality(s.startDate, s.day) * s.marketMood;
  const cred = s.founder.skills.credibility;
  const pers = s.plan.personalization;

  // Cold email
  const emailsExpected = hours.email * FUNNEL.email.perHour[pers] + s.week.emailCarry;
  const emails = Math.floor(emailsExpected);
  s.week.emailCarry = emailsExpected - emails;
  if (emails > 0) {
    const pool = targetPool(s);
    const n = Math.min(emails, pool.length);
    const deliverability = emails > FUNNEL.email.dailySpamThreshold ? 0.6 : 1;
    for (let i = 0; i < n; i++) {
      const c = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      c.status = "contacted";
      c.lastTouchDay = s.day;
      s.funnel.emailsSent++;
      const p = FUNNEL.email.replyRate[pers] * ATTITUDE_REPLY[c.aiAttitude] * nicheMult(s, c) * (0.7 + 0.6 * cred) * reputationMult(s) * season * deliverability * (m.id === "CY" ? 0.75 : 1) * (0.7 + 0.6 * c.urgency);
      if (rng.chance(p)) {
        const positive = rng.chance(FUNNEL.email.positiveShare[pers] * (0.8 + 0.4 * cred));
        s.pendingReplies.push({ companyId: c.id, day: addBusinessDays(s.startDate, s.day, rng.int(1, 6)), kind: positive ? "positive" : rng.chance(0.5) ? "info" : "negative", source: "cold_email" });
      }
    }
    if (n < emails) listExhausted(s);
  }

  // LinkedIn
  const liExpected = Math.min(FUNNEL.linkedin.weeklyCap - s.week.linkedinSent, hours.linkedin * FUNNEL.linkedin.perHour + s.week.linkedinCarry);
  const requests = Math.max(0, Math.floor(liExpected));
  s.week.linkedinCarry = Math.max(0, liExpected - requests);
  if (requests > 0) {
    const pool = targetPool(s);
    const n = Math.min(requests, pool.length);
    for (let i = 0; i < n; i++) {
      const c = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      c.status = "contacted";
      c.lastTouchDay = s.day;
      s.funnel.linkedinSent++;
      s.week.linkedinSent++;
      if (!rng.chance(FUNNEL.linkedin.accept * (0.7 + 0.6 * cred) * Math.min(1.3, reputationMult(s)))) continue;
      s.funnel.linkedinAccepted++;
      if (rng.chance(FUNNEL.linkedin.reply * ATTITUDE_REPLY[c.aiAttitude] * nicheMult(s, c) * season)) {
        const positive = rng.chance(FUNNEL.linkedin.positiveShare * (0.8 + 0.4 * cred));
        s.pendingReplies.push({ companyId: c.id, day: addBusinessDays(s.startDate, s.day, rng.int(2, 8)), kind: positive ? "positive" : "info", source: "linkedin" });
      }
    }
    if (n < requests) listExhausted(s);
  }

  // Networking: your warm network first, then events
  if (hours.networking > 0) {
    const warmLeft = s.founder.warmNetwork - s.warmContactsUsed;
    if (warmLeft > 0) {
      const reached = Math.min(warmLeft, rng.poisson(hours.networking * FUNNEL.network.contactsPerHour));
      s.warmContactsUsed += reached;
      for (let i = 0; i < reached; i++) {
        if (!rng.chance(FUNNEL.network.leadChance * (0.7 + 0.6 * s.founder.skills.sales) * season)) continue;
        const pool = s.companies.filter((c) => c.status === "untouched" || c.status === "contacted");
        const known = pool.filter((c) => s.founder.industriesKnown.includes(c.industry));
        const c = rng.pick(known.length && rng.chance(0.6) ? known : pool);
        if (!c) continue;
        if (rng.chance(FUNNEL.network.meetingChance)) s.pendingReplies.push({ companyId: c.id, day: addBusinessDays(s.startDate, s.day, rng.int(5, 20)), kind: "positive", source: "network" });
      }
      if (s.warmContactsUsed >= s.founder.warmNetwork && !s.flags.warmDone) {
        s.flags.warmDone = 1;
        pushEvent(s, "list_exhausted", "You've reached out to your whole warm network", "From now on networking hours go to events and meetups, which convert far less. This is when many consultancies stall.", { attention: true });
      }
    } else {
      s.flags.eventHours = (s.flags.eventHours ?? 0) + hours.networking;
      while (s.flags.eventHours >= FUNNEL.events.hoursPerEvent) {
        s.flags.eventHours -= FUNNEL.events.hoursPerEvent;
        const cost = rng.int(0, FUNNEL.events.costMax);
        if (s.finance.legalForm === "none") s.situation.personalCash -= cost;
        else book(s, -cost, "events", "Networking event");
        for (let i = 0; i < FUNNEL.events.peopleMet; i++) {
          if (!rng.chance(FUNNEL.events.leadChance * (0.6 + 0.8 * s.founder.skills.sales) * season)) continue;
          const pool = s.companies.filter((c) => c.status === "untouched" || c.status === "contacted");
          if (pool.length) s.pendingReplies.push({ companyId: rng.pick(pool).id, day: addBusinessDays(s.startDate, s.day, rng.int(5, 20)), kind: "positive", source: "event" });
        }
      }
    }
  }

  // Content compounds slowly
  if (hours.content > 0) {
    s.reputation.followers += hours.content * FUNNEL.content.followersPerHour * (0.6 + 0.8 * cred) * (1 + 2 * s.reputation.brand);
    s.reputation.brand = clamp(s.reputation.brand + hours.content * 0.0006);
  }
}

function listExhausted(s: GameState) {
  const key = `exhausted_${s.plan.targetIndustries.join("_") || "all"}`;
  if (s.flags[key]) return;
  s.flags[key] = 1;
  const what = s.plan.targetIndustries.length ? s.plan.targetIndustries.map((i) => INDUSTRIES[i].label).join(" & ") : "the whole market";
  pushEvent(s, "list_exhausted", `You've contacted every company in ${what}`, `There's nobody left to cold-contact in your target list. Widen your target industries, re-engage people later, or rely on referrals and content. In a small market like ${market(s).label} this happens sooner than you'd think.`, { attention: true });
}

/** Weekly (Mondays): inbound leads from content. */
export function weeklyInbound(s: GameState) {
  const rng = new Rng(s.rng);
  const lambda = (s.reputation.followers / FUNNEL.content.followersPerLeadPerWeek) * (0.5 + s.reputation.brand) * seasonality(s.startDate, s.day) * s.marketMood;
  const n = rng.poisson(lambda);
  for (let i = 0; i < n; i++) {
    const pool = s.companies.filter((c) => c.status === "untouched" || c.status === "contacted");
    if (!pool.length) return;
    const c = rng.pick(pool);
    const d = createDeal(s, c, "content");
    leadEvent(s, d, c, "inbound_lead");
  }
}

export function processReplies(s: GameState) {
  const due = s.pendingReplies.filter((r) => r.day <= s.day);
  if (!due.length) return;
  s.pendingReplies = s.pendingReplies.filter((r) => r.day > s.day);
  for (const r of due) {
    const c = s.companies.find((x) => x.id === r.companyId);
    if (!c || c.status === "in_pipeline" || c.status === "client" || c.status === "do_not_contact") continue;
    s.funnel.replies++;
    if (r.kind === "negative") {
      c.status = "do_not_contact";
      continue;
    }
    if (r.kind === "info") {
      pushEvent(s, "reply_info", `${c.contact.name} (${c.name}): "Send me some info"`, `A soft reply. Most of these go nowhere unless you follow up with something specific to them.`, {});
      continue;
    }
    s.funnel.positiveReplies++;
    const d = createDeal(s, c, r.source);
    const kind = r.source === "network" || r.source === "event" ? "warm_intro" : r.source === "referral" ? "referral" : "reply_positive";
    leadEvent(s, d, c, kind);
  }
}

/** Leads that are not acted on go cold. */
export function decayLeads(s: GameState) {
  for (const d of s.deals) {
    if (d.stage !== "lead") continue;
    const age = s.day - d.createdDay;
    if (age > 10) {
      d.stage = "lost";
      d.lostReason = "You didn't follow up in time and the lead went cold.";
      d.trueLostReason = d.lostReason;
      const c = s.companies.find((x) => x.id === d.companyId)!;
      c.status = "lost";
      pushEvent(s, "proposal_ghosted", `Lead went cold: ${c.name}`, d.lostReason);
    }
  }
}

// ---------- Discovery ----------

export function company(s: GameState, id: string): Company {
  return s.companies.find((c) => c.id === id)!;
}

/** How open the prospect is going into the call, decided by the engine and handed to the AI agent. */
export function openness(s: GameState, d: Deal): number {
  const c = company(s, d.companyId);
  const att = c.aiAttitude === "eager" ? 0.6 : c.aiAttitude === "curious" ? 0 : -0.7;
  const biggest = Math.max(...c.pains.map((p) => p.annualCost * p.aiFit));
  const fit = Math.log(Math.max(1, biggest) / Math.max(1, c.techBudget * 0.5));
  return sigmoid(att + 2 * (d.trust - 0.35) + 1.2 * (c.urgency - 0.35) + 0.4 * fit + 0.3 * (c.contact.decisionMaker ? 1 : 0) - 0.4);
}

export function quickCall(s: GameState, d: Deal): CallRecord {
  const rng = new Rng(s.rng);
  const c = company(s, d.companyId);
  const k = s.founder.skills.consulting;
  const discovered: string[] = [];
  const quantified: string[] = [];
  for (const p of c.pains) {
    if (rng.chance(p.aware ? 0.45 + 0.45 * k : 0.1 + 0.45 * k)) {
      discovered.push(p.id);
      if (rng.chance(0.25 + 0.6 * k)) quantified.push(p.id);
    }
  }
  const trustDelta = clamp(rng.normal(0.03 + 0.12 * (k - 0.5) + 0.06 * (s.founder.skills.sales - 0.5), 0.05), -0.2, 0.2);
  const open = openness(s, d) * (discovered.length ? 1 : 0.3) * (0.7 + 0.6 * k);
  const roll = rng.next();
  const nextStep: CallRecord["nextStep"] = roll < open * 0.85 ? "proposal_requested" : roll < open + 0.2 ? "follow_up_later" : "not_interested";
  return {
    day: s.day,
    mode: "quick",
    transcript: [],
    discoveredPainIds: discovered,
    quantifiedPainIds: quantified,
    trustDelta,
    nextStep,
    coaching: ["Quick calls are simulated from your consulting skill. Take calls live to actually practise discovery and get specific coaching."],
  };
}

export function applyCall(s: GameState, d: Deal, call: CallRecord) {
  const c = company(s, d.companyId);
  d.calls.push(call);
  d.trust = clamp(d.trust + call.trustDelta, 0.02, 0.95);
  s.funnel.callsHeld++;
  s.monthAcc.calls++;
  s.week.hoursBooked += 1;
  milestone(s, "first_call", "First discovery call done", "Real discovery is asking about their business, not pitching yours.");
  const known = new Set(d.calls.flatMap((x) => x.discoveredPainIds));
  if (call.nextStep === "proposal_requested" && known.size > 0) {
    d.stage = "proposal_requested";
    d.notes.push(`${c.contact.name} asked for a proposal.`);
  } else if (call.nextStep === "not_interested") {
    d.stage = "lost";
    d.lostReason = `${c.contact.name} said it's not a priority right now.`;
    d.trueLostReason = known.size === 0 ? "You didn't uncover any real pain during the call, so there was nothing to buy." : d.lostReason;
    c.status = "lost";
  } else {
    d.stage = "nurture";
    d.nurtureUntil = s.day + 30;
    d.notes.push(`${c.contact.name} said to check back in a few weeks.`);
  }
}

// ---------- Proposals ----------

function itemFit(p: Pain, a: Archetype): number {
  if (p.archetype === "not_ai") return a === "not_ai" ? 0.6 : 0.1;
  if (a === p.archetype) return p.aiFit;
  if (a === "not_ai") return 0.1;
  return p.aiFit * 0.45;
}

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** The founder's own effort estimate: noisy but stable for the same pain + solution. */
export function founderEstimate(s: GameState, painId: string, archetype: Archetype): number {
  const c = s.companies.find((x) => x.pains.some((p) => p.id === painId))!;
  const p = c.pains.find((x) => x.id === painId)!;
  const base = archetype === p.archetype ? p.effortHours : ARCHETYPES[archetype].effort[0] * 0.5 + ARCHETYPES[archetype].effort[1] * 0.5;
  const z = (hash01(painId + archetype) - 0.5) * 2; // -1..1
  // Inexperienced founders underestimate: the planning fallacy.
  const bias = 0.95 - 0.12 * (1 - s.founder.skills.delivery);
  return Math.round(base * bias * Math.exp(z * 0.25 * (1.2 - s.founder.skills.technical)));
}

export function marketRange(s: GameState, archetype: Archetype): [number, number] {
  const a = ARCHETYPES[archetype];
  const r = market(s).aiRateRef;
  return [Math.round((a.effort[0] * r * 0.8) / 100) * 100, Math.round((a.effort[1] * r * 1.3) / 100) * 100];
}

export interface ProposalDraft {
  items: ProposalItem[];
  workshopFee: number;
  buildPrice: number;
  retainerMonthly: number;
  upfrontPct: number;
  netDays: number;
  timelineWeeks: number;
}

interface Valuation {
  utility: number;
  value: number;
  yearCost: number;
  budgetRatio: number;
}

function valuation(s: GameState, d: Deal, draft: ProposalDraft, buildPrice = draft.buildPrice): Valuation {
  const c = company(s, d.companyId);
  const known = new Set(d.calls.flatMap((x) => x.discoveredPainIds));
  const quant = new Set(d.calls.flatMap((x) => x.quantifiedPainIds));
  let value = 0;
  let trueEffort = 0;
  for (const it of draft.items) {
    const p = c.pains.find((x) => x.id === it.painId);
    if (!p) continue;
    const recognised = quant.has(p.id) ? 1 : known.has(p.id) ? 0.6 : 0.25;
    value += p.annualCost * itemFit(p, it.archetype) * recognised;
    trueEffort += p.effortHours;
  }
  const vat = s.finance.vatRegistered ? 1 + market(s).vatRate * 0.3 : 1; // many small clients can't fully reclaim VAT
  const yearCost = (draft.workshopFee + buildPrice + 12 * draft.retainerMonthly) * vat;
  const firstYearCash = (draft.workshopFee + buildPrice + 6 * draft.retainerMonthly) * vat;
  const roi = value / Math.max(1, yearCost);
  const budgetRatio = firstYearCash / Math.max(500, c.techBudget);
  const rep = s.reputation;
  const newFirmRisk = rep.completedProjects === 0 ? 0.55 : 0.35 / (1 + rep.caseStudies);
  const tooCheap = buildPrice < trueEffort * market(s).aiRateRef * 0.3 ? 0.4 : 0;
  const attitude = c.aiAttitude === "skeptic" ? 0.45 : c.aiAttitude === "eager" ? -0.3 : 0;
  const upfront = draft.upfrontPct > 50 ? (draft.upfrontPct - 50) / 100 : 0;
  const tightTimeline = draft.timelineWeeks < 2 ? 0.2 : 0;
  const utility =
    1.1 * Math.log(Math.max(0.05, roi)) +
    2.4 * (d.trust - 0.45) +
    0.9 * (c.urgency - 0.35) -
    2.5 * Math.max(0, budgetRatio - 1) -
    newFirmRisk -
    tooCheap -
    attitude -
    upfront -
    tightTimeline -
    (c.contact.decisionMaker ? 0 : 0.35) +
    0.15 * (s.founder.industriesKnown.includes(c.industry) ? 1 : 0);
  return { utility, value, yearCost, budgetRatio };
}

const ACCEPT_BIAS = -0.55;

export function acceptProbability(s: GameState, d: Deal, draft: ProposalDraft): number {
  return sigmoid(valuation(s, d, draft).utility + ACCEPT_BIAS);
}

/** Highest build price at which the client would still be ~50/50. */
export function reservationPrice(s: GameState, d: Deal, draft: ProposalDraft): number {
  let lo = 0;
  let hi = Math.max(5_000, draft.buildPrice * 4);
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (valuation(s, d, draft, mid).utility + ACCEPT_BIAS > 0) lo = mid;
    else hi = mid;
  }
  return Math.round(lo / 50) * 50;
}

export function submitProposal(s: GameState, d: Deal, draft: ProposalDraft) {
  const rng = new Rng(s.rng);
  const c = company(s, d.companyId);
  const total = draft.workshopFee + draft.buildPrice;
  const base = total < 15_000 ? FUNNEL.decisionDaysSmall : FUNNEL.decisionDaysLarge;
  const decisionIn = Math.round(rng.lognormal(base * c.decisionDays * 0.6, 0.45) / Math.max(0.5, seasonality(s.startDate, s.day)));
  const estimateHours = draft.items.reduce((a, it) => a + founderEstimate(s, it.painId, it.archetype), 0);
  const prop: Proposal = {
    ...draft,
    estimateHours,
    submittedDay: s.day,
    decisionDay: s.day + Math.max(3, decisionIn),
    status: "pending",
    reservationPrice: reservationPrice(s, d, draft),
    followUps: 0,
  };
  d.proposal = prop;
  d.stage = "proposal_sent";
  s.funnel.proposalsSent++;
  s.monthAcc.proposals++;
  s.week.hoursBooked += 3;
  milestone(s, "first_proposal", "First proposal sent", "Now the hardest part: waiting. Most proposals die of silence, not rejection.");
}

/** Called every day: proposals whose decision day arrived get decided. */
export function decideProposals(s: GameState) {
  const rng = new Rng(s.rng);
  for (const d of s.deals) {
    const p = d.proposal;
    if (!p || p.status !== "pending" || d.stage !== "proposal_sent" || p.decisionDay > s.day) continue;
    const c = company(s, d.companyId);
    const v = valuation(s, d, p);
    let pAccept = sigmoid(v.utility + ACCEPT_BIAS);
    const competitor = rng.chance(0.4) ? rng.pick(s.competitors) : undefined;
    if (competitor) {
      const theirUtility = v.utility + 1.1 * Math.log(1 / competitor.priceLevel) * 0.5 + (competitor.reputation - 0.4) - (competitor.quality < 0.5 ? 0.3 : 0);
      pAccept *= sigmoid(2 * (v.utility - theirUtility)) * 1.6;
    }
    pAccept = clamp(pAccept, 0.01, 0.95);
    if (rng.chance(pAccept)) {
      p.status = "accepted";
      pushEvent(s, "proposal_response", `${c.name} accepted your proposal!`, `${c.contact.name}: "Let's go ahead." Total ${fmt(s, p.workshopFee + p.buildPrice)}${p.retainerMonthly ? ` + ${fmt(s, p.retainerMonthly)}/month` : ""}. Confirm to kick off the project and send the first invoice.`, { attention: true, ref: { dealId: d.id } });
      continue;
    }
    // Not accepted: work out what actually happened.
    if (v.budgetRatio > 1.05 && v.value / v.yearCost > 0.9 && rng.chance(0.55)) {
      p.status = "countered";
      d.stage = "negotiating";
      p.counterPrice = Math.max(500, Math.round(Math.min(p.reservationPrice, c.techBudget - p.workshopFee - 6 * p.retainerMonthly) / 100) * 100);
      pushEvent(s, "proposal_response", `${c.name} came back with a counter-offer`, `${c.contact.name}: "We like it, but the budget is ${fmt(s, p.counterPrice)} for the build." You can accept, hold your price, or negotiate live.`, { attention: true, ref: { dealId: d.id } });
      continue;
    }
    if (competitor && rng.chance(0.5)) {
      p.status = "rejected";
      d.stage = "lost";
      c.status = "lost";
      d.lostReason = `They went with ${competitor.name}.`;
      d.trueLostReason = `${competitor.name} looked like the safer or cheaper choice. Your perceived value was ${fmt(s, v.value)}/yr vs a first-year cost of ${fmt(s, v.yearCost)}${s.reputation.caseStudies === 0 ? ", and you had no case studies" : ""}.`;
      s.funnel.proposalsLost++;
      pushEvent(s, "proposal_response", `Lost ${c.name} to a competitor`, `${c.contact.name}: "We decided to go with ${competitor.name}. Thanks for your time."`, { attention: true, ref: { dealId: d.id } });
      continue;
    }
    if (rng.chance(FUNNEL.ghostShareOfNoDecision)) {
      p.status = "ghosted";
      pushEvent(s, "proposal_ghosted", `No reply from ${c.name}`, `It's been ${s.day - p.submittedDay} days since you sent the proposal. Silence is the most common outcome. A polite, useful follow-up sometimes revives it.`, { attention: true, ref: { dealId: d.id } });
      continue;
    }
    p.status = "rejected";
    d.stage = "lost";
    c.status = "lost";
    const roi = v.value / Math.max(1, v.yearCost);
    d.lostReason = `${c.contact.name}: "It's not the right time for us."`;
    d.trueLostReason = roi < 1 ? `They didn't see enough value: they believed it would save ${fmt(s, v.value)}/yr against ${fmt(s, v.yearCost)} cost. Better discovery (quantifying the pain) or a smaller first step would help.` : v.budgetRatio > 1 ? "It was beyond what they could spend this year." : d.trust < 0.4 ? "They didn't trust a new, unknown firm enough yet." : "No decision. The status quo won, as it often does.";
    s.funnel.proposalsLost++;
    pushEvent(s, "proposal_response", `${c.name} declined`, d.lostReason, { attention: true, ref: { dealId: d.id } });
  }
}

export function followUpProposal(s: GameState, d: Deal): string {
  const rng = new Rng(s.rng);
  const p = d.proposal!;
  const c = company(s, d.companyId);
  p.followUps++;
  s.week.hoursBooked += 0.5;
  if (rng.chance(0.35 / p.followUps)) {
    p.status = "pending";
    d.stage = "proposal_sent";
    d.trust = clamp(d.trust - 0.03);
    p.decisionDay = s.day + rng.int(5, 15);
    return `${c.contact.name} replied: "Sorry, it's been hectic. Let me get back to you shortly."`;
  }
  if (p.followUps >= 3) {
    d.stage = "lost";
    c.status = "lost";
    d.lostReason = "Never replied.";
    d.trueLostReason = "No decision. The status quo won.";
    s.funnel.proposalsLost++;
    return `Still no reply after ${p.followUps} follow-ups. Marked as lost.`;
  }
  return "No reply yet.";
}

/** Prospects answer the written summaries founders send after inconclusive calls. */
export function processSummaries(s: GameState) {
  const rng = new Rng(s.rng);
  for (const d of s.deals) {
    const due = s.flags[`summary_${d.id}`];
    if (due === undefined || due < 0 || due > s.day) continue;
    s.flags[`summary_${d.id}`] = -1;
    if (d.stage !== "nurture") continue;
    const c = company(s, d.companyId);
    const quantified = d.calls.some((x) => x.quantifiedPainIds.length > 0);
    if (rng.chance(openness(s, d) * 0.6 + (quantified ? 0.15 : 0))) {
      d.stage = "proposal_requested";
      d.trust = clamp(d.trust + 0.04);
      pushEvent(s, "reply_positive", `${c.contact.name}: "Thanks for the summary. Can you send a proposal?"`, `Your follow-up landed. ${c.name} wants to see what you'd do and what it costs.`, { attention: true, ref: { dealId: d.id } });
    } else {
      pushEvent(s, "reply_info", `${c.contact.name}: "Thanks, we'll keep it in mind"`, `${c.name} isn't ready. They'll stay on your 'check back later' list.`);
    }
  }
}
