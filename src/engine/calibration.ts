import type { Archetype } from "./types";

// Base rates the engine is tuned against. Every number either has a published source or is
// marked as an estimate; the Reality Check screen renders this list so the player can see
// exactly what the world assumes.

export const FUNNEL = {
  email: {
    perHour: { low: 15, medium: 6, high: 3 },
    replyRate: { low: 0.025, medium: 0.045, high: 0.08 },
    positiveShare: { low: 0.25, medium: 0.33, high: 0.38 },
    dailySpamThreshold: 40, // beyond this, a new domain's deliverability degrades
  },
  linkedin: { perHour: 12, weeklyCap: 100, accept: 0.28, reply: 0.1, positiveShare: 0.13 },
  network: { contactsPerHour: 1, leadChance: 0.35, meetingChance: 0.6 },
  events: { hoursPerEvent: 4, peopleMet: 4, leadChance: 0.025, costMax: 40 },
  content: { followersPerHour: 4, followersPerLeadPerWeek: 1500 },
  referralChancePerHappyProject: 0.35,
  meetingFromPositive: 0.8,
  discoveryToProposal: 0.45,
  noDecisionShareOfLosses: 0.5,
  ghostShareOfNoDecision: 0.45,
  decisionDaysSmall: 30, // deals under ~15k
  decisionDaysLarge: 75,
} as const;

export const DELIVERY = {
  overrunMedian: 1.2,
  overrunSigma: 0.36, // ~8% of projects end up >2x the estimate
  estimateNoise: 0.15,
  scopeChangeWeekly: 0.07,
  retainerChurnMonthly: 0.035,
  incidentHoursPerRetainer: 3,
} as const;

export const ARCHETYPES: Record<
  Archetype,
  { label: string; effort: [number, number]; run: [number, number]; aiFit: [number, number] }
> = {
  support_chatbot: { label: "Customer support assistant", effort: [40, 90], run: [40, 120], aiFit: [0.5, 0.7] },
  voice_receptionist: { label: "AI phone receptionist", effort: [60, 140], run: [150, 500], aiFit: [0.5, 0.75] },
  doc_extraction: { label: "Document extraction pipeline", effort: [50, 140], run: [30, 150], aiFit: [0.55, 0.8] },
  workflow_automation: { label: "Workflow automation", effort: [30, 100], run: [20, 80], aiFit: [0.6, 0.85] },
  knowledge_assistant: { label: "Internal knowledge assistant (RAG)", effort: [60, 160], run: [40, 150], aiFit: [0.4, 0.65] },
  content_generation: { label: "Content generation workflow", effort: [20, 60], run: [20, 80], aiFit: [0.5, 0.75] },
  lead_qualification: { label: "Lead response & qualification", effort: [40, 100], run: [30, 120], aiFit: [0.45, 0.7] },
  reporting_analytics: { label: "Automated reporting", effort: [50, 120], run: [20, 60], aiFit: [0.4, 0.6] },
  compliance_review: { label: "Compliance / KYC review assistant", effort: [80, 200], run: [50, 200], aiFit: [0.35, 0.6] },
  not_ai: { label: "Process / tooling fix (not really an AI problem)", effort: [10, 40], run: [0, 20], aiFit: [0.05, 0.15] },
};

export interface SourceNote {
  topic: string;
  value: string;
  source: string;
  estimate?: boolean;
}

export const SOURCES: SourceNote[] = [
  { topic: "Cold email reply rate", value: "~3.7% average; 5–15% when well personalised", source: "https://saleshandy.com/blog/cold-email-statistics/" },
  { topic: "Positive replies", value: "~1% generic, ~3% personalised", source: "https://help.lemlist.com/en/articles/13942005-lemcoach-cold-email-benchmarks-and-metrics-what-good-looks-like" },
  { topic: "Meetings per 100 cold emails", value: "~1 average, 2–3 when done well", source: "https://instantly.ai/blog/meeting-email-metrics-to-track-response-booking-rates/" },
  { topic: "LinkedIn acceptance / reply", value: "28% accept, ~10% reply", source: "https://salesflow.io/blog/linkedin-outreach-templates" },
  { topic: "LinkedIn meetings per connection", value: "~1.3%", source: "https://belkins.io/blog/linkedin-outreach-study.md" },
  { topic: "Warm intro → meeting", value: "~50%", source: "No solid published benchmark", estimate: true },
  { topic: "Discovery → proposal", value: "~45% (28% weak discovery, 59% strong)", source: "https://optif.ai/learn/questions/sales-meeting-to-proposal-rate/" },
  { topic: "Proposal win rate", value: "~25% new firm, ~42% established", source: "https://loopio.com/blog/rfp-statistics-win-rates" },
  { topic: "Losses to 'no decision'", value: "40–60% of lost deals", source: "https://challengerinc.com/losing-to-customer-indecision/" },
  { topic: "Sales cycle", value: "~30 days for €5–15k, ~75 days for €15–50k", source: "https://www.zeliq.com/blog/sales-cycle" },
  { topic: "Time to first client (solo consultancy)", value: "~4 months; ~80% of first clients from personal network", source: "https://samlandenwitsch.substack.com/p/report-the-surprising-truth-about" },
  { topic: "Inbound from content", value: "3–6 months before first signals", source: "https://lagrowthmachine.com/glossary/b2b-inbound-marketing", estimate: true },
  { topic: "AI build prices", value: "FAQ bot €1.5–3k, integrated agent €8–30k", source: "https://www.eesel.ai/blog/chatbot-development-cost" },
  { topic: "AI consultant rates (Cyprus)", value: "€50–80/h mid, €90–150/h senior", source: "https://www.index.dev/blog/european-developer-hourly-rates", estimate: true },
  { topic: "Retainer churn", value: "1.6%–4.2% per month for agencies", source: "https://focus-digital.co/?p=6135" },
  { topic: "Effort overruns", value: "30–40% average; ~60% of projects overrun", source: "https://doi.org/10.1109/ISESE.2003.1237981" },
  { topic: "AI adoption in Cyprus", value: "7.7% of small firms (EU 17%)", source: "https://cyprus-mail.com/2025/12/12/cyprus-firms-slow-to-adopt-ai-despite-steady-improvement" },
  { topic: "Barriers to AI adoption", value: "Lack of expertise 71%, legal uncertainty 53%", source: "https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Use_of_artificial_intelligence_in_enterprises" },
  { topic: "Cyprus corporate tax", value: "15% from 1 Jan 2026", source: "https://taxnews.ey.com/news/2026-0140-cyprus-enacts-major-tax-reform-legislation" },
  { topic: "Cyprus VAT", value: "19%, registration above €15,600", source: "https://www.vatcalc.com/cyprus/cyprus-vat-guide/" },
  { topic: "Cyprus payroll", value: "Employer ~15.4%, employee ~11.45%", source: "https://www.zenolegal.com/resources/cyprus-social-insurance-ghs-gesy-2026" },
  { topic: "Cyprus Ltd formation", value: "€800–2,000; audit mandatory", source: "https://www.lawyer.com.cy/company-fees" },
  { topic: "EU late payment", value: "Terms 43 days, actually paid at 63; >50% of invoices late", source: "https://www.inderes.dk/en/releases/intrums-european-payment-report-2026-late-payments-are-holding-back-european-growth" },
  { topic: "Cyprus living costs", value: "Nicosia €1,500–1,900/month single", source: "https://cyprus-mail.com/2026/07/23/limassol-remains-cyprus-most-expensive-city-for-renters" },
  { topic: "Startup bank loans", value: "Need 2–3 years of accounts, guarantee, collateral; 10–25% approval pre-revenue", source: "Banking practice", estimate: true },
  { topic: "RIF Pre-Seed grant", value: "≈3% success (284 proposals, €1m budget)", source: "https://cyprus-mail.com/2026/09/14/high-demand-for-startup-funding-highlights-growth-in-cyprus-tech-scene", estimate: true },
  { topic: "Business survival", value: "US 1-year 79%; solo agencies likely lower (~65%)", source: "https://www.bls.gov/opub/ted/2024/1-year-survival-rates-for-new-business-establishments-by-year-and-location.htm", estimate: true },
];

export const LIMITATIONS = [
  "A simulation cannot prove demand. It can only tell you whether a plan works under these base rates. Your real network, offer and market are the actual test.",
  "Client behaviour is decided by a numeric model; the AI agents only voice those decisions. They will not reward clever phrasing that a real buyer would see through.",
  "Benchmarks come mostly from US/EU vendor data and are averaged. Your niche may be easier or harder.",
  "Taxes are simplified to headline rates and annual due dates. Use a real accountant before acting.",
  "Your founder profile is inferred from your CV/LinkedIn/GitHub. If it flatters you, the simulation will flatter you.",
];
