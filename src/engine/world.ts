import { ARCHETYPES } from "./calibration";
import { INDUSTRIES, INDUSTRY_IDS, type PainTemplate } from "./industries";
import { MARKETS, type MarketPreset } from "./markets";
import { clamp, Rng } from "./rng";
import type {
  AiAttitude,
  Candidate,
  Company,
  Competitor,
  Contact,
  FounderProfile,
  FounderSituation,
  GameState,
  IndustryId,
  MarketId,
  Pain,
  Role,
} from "./types";

const QUIRKS = [
  "hates long calls and checks the time constantly",
  "was burned by a software vendor who never finished a project",
  "asks about price very early",
  "loves talking about their company's history",
  "is very data driven and wants numbers",
  "is polite but non-committal; says 'interesting' a lot",
  "has a nephew who 'does AI' and keeps mentioning him",
  "worries about GDPR and where data is stored",
  "is under pressure from their own boss to cut costs",
  "is enthusiastic but has no budget authority",
  "prefers to speak in Greek but switches to English for you",
  "is skeptical of consultants in general",
];

function localize(text: string, m: MarketPreset): string {
  if (m.id === "CY") return text;
  const map: [RegExp, string][] =
    m.id === "UK"
      ? [[/GESY/g, "NHS"], [/Bazaraki and portals/g, "Rightmove and Zoopla"], [/CySEC/g, "FCA"], [/Greek\/English\/Russian/g, "English/Polish/Arabic"], [/in Greek but switches to English for you/g, "in short sentences"]]
      : [[/GESY/g, "insurance"], [/Bazaraki and portals/g, "Zillow and portals"], [/CySEC/g, "SEC/FINRA"], [/Greek\/English\/Russian/g, "English/Spanish"], [/in Greek but switches to English for you/g, "in short sentences"]];
  return map.reduce((s, [re, r]) => s.replace(re, r), text);
}

function personName(rng: Rng, m: MarketPreset): string {
  return `${rng.pick(m.firstNames)} ${rng.pick(m.lastNames)}`;
}

function companyName(rng: Rng, m: MarketPreset, industry: IndustryId, used: Set<string>): string {
  const ind = INDUSTRIES[industry];
  const [prefixes, suffixes] = ind.nameParts;
  const professional = industry === "law_firm" || industry === "accounting_firm" || industry === "insurance_broker";
  const letters = "ABCDEGKLMNPST";
  const patterns: (() => string)[] = [
    () => `${rng.pick(prefixes)} ${rng.pick(suffixes)}`,
    () => `${rng.pick(m.lastNames)} ${rng.pick(suffixes)}`,
    () => {
      const a = rng.pick(m.lastNames);
      let b = rng.pick(m.lastNames);
      while (b === a) b = rng.pick(m.lastNames);
      return `${a} & ${b} ${rng.pick(suffixes)}`;
    },
    () => `${rng.pick(prefixes)} ${rng.pick(m.cities)} ${rng.pick(suffixes)}`,
    () => `${rng.pick(letters.split(""))}${rng.pick(letters.split(""))}${rng.chance(0.5) ? rng.pick(letters.split("")) : ""} ${rng.pick(suffixes)}`,
  ];
  const weights = professional ? [0.5, 3, 3, 0.5, 1] : [3, 1.5, 1, 1.5, 1];
  for (let i = 0; i < 60; i++) {
    const name = patterns[rng.weighted(patterns.map((_, k) => [k, weights[k]] as const))]();
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `${rng.pick(m.lastNames)} ${rng.pick(m.lastNames)} ${rng.pick(suffixes)}`;
  used.add(fallback);
  return fallback;
}

function makePain(rng: Rng, m: MarketPreset, t: PainTemplate, employees: number, dataMess: number): Pain {
  const scale = Math.pow(Math.max(1, employees) / 10, 0.7);
  const hours = Math.max(1, rng.range(t.hoursPerWeek[0], t.hoursPerWeek[1]) * scale);
  const lost = t.lostRevenue ? rng.range(t.lostRevenue[0], t.lostRevenue[1]) * scale * (m.revenuePerEmployee / 95_000) : 0;
  const a = ARCHETYPES[t.archetype];
  const sizeEffort = Math.pow(Math.max(1, employees) / 10, 0.2);
  return {
    id: rng.id("pain"),
    title: t.title,
    detail: localize(t.detail, m),
    archetype: t.archetype,
    aware: rng.chance(t.awareChance),
    hoursPerWeek: Math.round(hours),
    annualCost: Math.round(hours * 46 * m.smbHourlyCost * 1.25 + lost),
    aiFit: rng.range(a.aiFit[0], a.aiFit[1]),
    effortHours: Math.round(rng.range(a.effort[0], a.effort[1]) * (1 + dataMess * 0.5) * sizeEffort),
    monthlyRunCost: Math.round(rng.range(a.run[0], a.run[1]) * Math.pow(Math.max(1, employees) / 10, 0.3)),
  };
}

function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeContact(rng: Rng, m: MarketPreset, industry: IndustryId): Contact {
  const ind = INDUSTRIES[industry];
  const roleIdx = rng.chance(0.65) ? 0 : rng.int(0, ind.roles.length - 1);
  return {
    name: personName(rng, m),
    role: ind.roles[roleIdx],
    decisionMaker: roleIdx === 0 || rng.chance(0.3),
    personality: {
      skepticism: rng.range(0.2, 0.9),
      talkativeness: rng.range(0.2, 0.9),
      formality: rng.range(0.2, 0.9),
      patience: rng.range(0.2, 0.9),
    },
    quirk: localize(rng.pick(QUIRKS), m),
  };
}

export function makeCompany(rng: Rng, m: MarketPreset, used: Set<string>, industry?: IndustryId): Company {
  const weights = INDUSTRY_IDS.map((id) => [id, m.industryWeights[id] ?? 1] as const);
  const ind = INDUSTRIES[industry ?? rng.weighted(weights)];
  const employees = Math.round(clamp(rng.lognormal(ind.employeesMedian, 0.7), 1, 250));
  const revenue = Math.round(employees * m.revenuePerEmployee * ind.revenueMult * rng.lognormal(1, 0.3));
  const maturity = clamp(rng.normal(ind.maturity, 0.15), 0.05, 0.95);
  const attitude = rng.weighted<AiAttitude>([
    ["skeptic", m.attitudes.skeptic * (1.3 - maturity)],
    ["curious", m.attitudes.curious],
    ["eager", m.attitudes.eager * (0.6 + maturity)],
  ]);
  const dataMess = clamp(1 - maturity + rng.normal(0, 0.15));
  const nPains = rng.chance(0.4) ? 3 : 2;
  const pains = shuffle(rng, ind.pains)
    .slice(0, nPains)
    .map((t) => makePain(rng, m, t, employees, dataMess));
  const budgetMult = attitude === "eager" ? 1.5 : attitude === "curious" ? 1 : 0.6;
  return {
    id: rng.id("co"),
    name: companyName(rng, m, ind.id, used),
    industry: ind.id,
    city: rng.pick(m.cities),
    employees,
    revenue,
    aiAttitude: attitude,
    digitalMaturity: maturity,
    techBudget: Math.round(revenue * rng.lognormal(0.012, 0.6) * budgetMult),
    urgency: clamp(rng.lognormal(0.35, 0.6)),
    decisionDays: ind.decisionMult * (m.id === "CY" ? 1.2 : 1) * rng.lognormal(1, 0.3),
    paymentDelay: Math.round(m.lateMedianDays * rng.lognormal(1, 0.5)),
    payReliability: clamp(1 - m.lateShare + rng.normal(0, 0.15), 0.1, 0.95),
    dataMess,
    pains,
    contact: makeContact(rng, m, ind.id),
    status: "untouched",
    inHouseThreat: clamp(maturity * 0.4 + rng.normal(0, 0.08)),
  };
}

export function makeCompetitors(rng: Rng, m: MarketPreset): Competitor[] {
  const city = m.cities[0];
  return [
    { id: rng.id("cmp"), name: `${rng.pick(m.firstNames)} (freelance AI dev)`, kind: "freelancer", priceLevel: 0.6, quality: 0.5, reputation: 0.3 },
    { id: rng.id("cmp"), name: `${city} Digital (web agency adding AI)`, kind: "local_agency", priceLevel: 0.9, quality: 0.5, reputation: 0.55 },
    { id: rng.id("cmp"), name: `Nexa AI Solutions`, kind: "local_agency", priceLevel: 1.1, quality: 0.7, reputation: 0.5 },
    { id: rng.id("cmp"), name: `Big Four advisory arm`, kind: "big_consultancy", priceLevel: 2.5, quality: 0.75, reputation: 0.9 },
    { id: rng.id("cmp"), name: `Offshore dev shop`, kind: "offshore", priceLevel: 0.45, quality: 0.4, reputation: 0.25 },
    { id: rng.id("cmp"), name: `Off-the-shelf SaaS chatbot`, kind: "saas_tool", priceLevel: 0.25, quality: 0.45, reputation: 0.5 },
  ];
}

const BACKGROUNDS: Record<Role, string[]> = {
  ai_engineer: ["3 years building LLM apps at a Limassol fintech", "PhD dropout, strong in ML, weak communicator", "ex-agency full-stack dev who learned AI on the side", "senior engineer leaving a big tech remote job"],
  junior_dev: ["fresh CS graduate, eager, needs mentoring", "bootcamp graduate with two small projects", "self-taught, built automations for a family business"],
  sales: ["5 years selling software to SMBs", "ex-real estate agent with a large network", "telecom B2B sales, very target driven"],
  project_manager: ["PMP certified, ran IT projects at a bank", "scrum master from a software house", "ops manager wanting to move into tech"],
};

export function makeCandidate(rng: Rng, m: MarketPreset, role: Role, day: number): Candidate {
  const skill = clamp(rng.normal(0.55, 0.18), 0.15, 0.95);
  return {
    id: rng.id("cand"),
    name: personName(rng, m),
    role,
    skill,
    salaryAsk: Math.round((m.salaries[role] * (0.75 + 0.5 * skill) * rng.lognormal(1, 0.1)) / 500) * 500,
    reliability: clamp(rng.normal(0.7, 0.15)),
    ambition: clamp(rng.normal(0.4, 0.25)),
    background: rng.pick(BACKGROUNDS[role]),
    appliedDay: day,
    status: "applied",
  };
}

export interface NewGameParams {
  seed: number;
  market: MarketId;
  businessName: string;
  founder: FounderProfile;
  situation: Omit<FounderSituation, "energy">;
  startDate: string;
}

export function newGame(p: NewGameParams): GameState {
  const m = MARKETS[p.market];
  const rng = new Rng({ s: p.seed });
  const used = new Set<string>();
  const companies = Array.from({ length: m.poolSize }, () => makeCompany(rng, m, used));
  const keeps = p.situation.keepsJob;
  const state: GameState = {
    version: 1,
    seed: p.seed,
    rng: rng.st,
    day: 0,
    startDate: p.startDate,
    market: p.market,
    businessName: p.businessName,
    founder: p.founder,
    situation: { ...p.situation, energy: 1 },
    companies,
    deals: [],
    projects: [],
    retainers: [],
    employees: [],
    candidates: [],
    competitors: makeCompetitors(rng, m),
    finance: { cash: 0, ledger: [], invoices: [], loans: [], taxes: [], legalForm: "none", vatRegistered: false, vatOwed: 0, insurance: false },
    reputation: { completedProjects: 0, caseStudies: 0, testimonials: 0, satisfactionSum: 0, brand: 0.02, followers: Math.round(p.founder.warmNetwork * 1.5), referralsReceived: 0 },
    plan: keeps
      ? { emailHours: 3, linkedinHours: 3, networkingHours: 4, contentHours: 2, deliveryHours: 3, personalization: "medium", targetIndustries: p.founder.industriesKnown.slice(0, 2) }
      : { emailHours: 10, linkedinHours: 5, networkingHours: 8, contentHours: 4, deliveryHours: 18, personalization: "medium", targetIndustries: p.founder.industriesKnown.slice(0, 2) },
    policies: {
      hourlyRate: m.aiRateRef,
      workshopFee: Math.round((m.aiRateRef * 30) / 100) * 100,
      defaultUpfrontPct: 40,
      netDays: 30,
      scopeCreep: "ask",
      passThroughRunCosts: true,
      founderSalaryMonthly: 0,
      coworking: false,
    },
    events: [],
    funnel: { emailsSent: 0, linkedinSent: 0, linkedinAccepted: 0, replies: 0, positiveReplies: 0, callsHeld: 0, proposalsSent: 0, proposalsWon: 0, proposalsLost: 0 },
    pendingReplies: [],
    warmContactsUsed: 0,
    week: { weekStart: 0, hoursWorked: 0, hoursBooked: 0, linkedinSent: 0, emailCarry: 0, linkedinCarry: 0 },
    months: [],
    monthAcc: { revenue: 0, costs: 0, profit: 0, hoursWorked: 0, leads: 0, calls: 0, proposals: 0, wins: 0 },
    chats: [],
    milestones: [],
    marketMood: 1,
    flags: {},
    status: "active",
    decisionsLog: [],
  };
  return state;
}
