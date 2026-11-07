import type { RngState } from "./rng";

export type Day = number; // days since the game's start date
export type MarketId = "CY" | "UK" | "US";

export type IndustryId =
  | "dental_clinic"
  | "law_firm"
  | "accounting_firm"
  | "real_estate"
  | "hotel"
  | "shipping_logistics"
  | "ecommerce"
  | "fintech_broker"
  | "construction"
  | "manufacturing"
  | "recruitment"
  | "private_clinic"
  | "restaurant"
  | "insurance_broker";

export type Archetype =
  | "support_chatbot"
  | "voice_receptionist"
  | "doc_extraction"
  | "workflow_automation"
  | "knowledge_assistant"
  | "content_generation"
  | "lead_qualification"
  | "reporting_analytics"
  | "compliance_review"
  | "not_ai"; // the honest answer for some problems: a process fix, a CRM, training

export interface FounderSkills {
  technical: number; // 0..1 ability to build AI solutions
  sales: number; // outreach, persuasion, closing
  consulting: number; // discovery, listening, framing problems
  delivery: number; // project management, estimation discipline
  credibility: number; // how a stranger perceives you from your public profile
}

export interface FounderProfile {
  name: string;
  headline: string;
  location: string;
  publicSummary: string; // what a prospect would see when they look you up
  strengths: string[];
  gaps: string[];
  skills: FounderSkills;
  industriesKnown: IndustryId[];
  warmNetwork: number; // business contacts who would take your call
  yearsExperience: number;
  evidence: string[]; // which sources the profile was built from
}

export interface FounderSituation {
  personalCash: number;
  monthlyLiving: number;
  hoursPerWeek: number;
  keepsJob: boolean;
  jobNetMonthly: number;
  energy: number; // 0..1, drops with sustained overwork
  hasCollateral: boolean;
}

export interface Personality {
  skepticism: number;
  talkativeness: number;
  formality: number;
  patience: number;
}

export interface Contact {
  name: string;
  role: string;
  decisionMaker: boolean;
  personality: Personality;
  quirk: string;
}

export interface Pain {
  id: string;
  title: string;
  detail: string; // hidden truth, only revealed through good discovery
  archetype: Archetype;
  aware: boolean; // does the client themselves recognise this as a problem?
  hoursPerWeek: number;
  annualCost: number; // what the problem really costs them per year
  aiFit: number; // 0..1 share of the cost an AI solution can realistically remove
  effortHours: number; // true build effort
  monthlyRunCost: number; // LLM / hosting cost once live
}

export type AiAttitude = "skeptic" | "curious" | "eager";

export interface Company {
  id: string;
  name: string;
  industry: IndustryId;
  city: string;
  employees: number;
  revenue: number;
  aiAttitude: AiAttitude;
  digitalMaturity: number;
  techBudget: number; // annual discretionary budget they could free up for this
  urgency: number;
  decisionDays: number; // median days to make a buying decision
  paymentDelay: number; // mean days late on invoices
  payReliability: number; // probability an invoice gets paid without chasing
  dataMess: number; // 0..1, inflates build effort
  pains: Pain[];
  contact: Contact;
  status: "untouched" | "contacted" | "in_pipeline" | "client" | "lost" | "do_not_contact";
  lastTouchDay?: Day;
  inHouseThreat: number; // chance they try to build it themselves / with ChatGPT
}

export type LeadSource = "cold_email" | "linkedin" | "network" | "event" | "content" | "referral";

export type DealStage =
  | "lead" // replied or introduced, no call yet
  | "call_scheduled"
  | "discovered" // call done, deciding what to do next
  | "proposal_requested"
  | "proposal_sent"
  | "negotiating"
  | "won"
  | "lost"
  | "nurture";

export interface ChatMessage {
  role: "founder" | "npc";
  text: string;
}

export interface CallRecord {
  day: Day;
  mode: "live" | "quick";
  transcript: ChatMessage[];
  discoveredPainIds: string[];
  quantifiedPainIds: string[];
  trustDelta: number;
  nextStep: "proposal_requested" | "follow_up_later" | "not_interested" | "send_info";
  coaching: string[];
}

export interface ProposalItem {
  painId: string;
  archetype: Archetype;
}

export interface Proposal {
  items: ProposalItem[];
  workshopFee: number; // paid discovery / AI audit
  buildPrice: number;
  retainerMonthly: number;
  upfrontPct: number;
  netDays: number;
  timelineWeeks: number;
  estimateHours: number; // the founder's own estimate at the time
  submittedDay: Day;
  decisionDay: Day;
  status: "pending" | "accepted" | "countered" | "rejected" | "ghosted";
  counterPrice?: number;
  reservationPrice: number; // hidden: the most they would pay for the build
  followUps: number;
}

export interface Deal {
  id: string;
  companyId: string;
  source: LeadSource;
  stage: DealStage;
  createdDay: Day;
  trust: number;
  callDay?: Day;
  calls: CallRecord[];
  proposal?: Proposal;
  lostReason?: string;
  trueLostReason?: string; // revealed in post-mortems only
  nurtureUntil?: Day;
  notes: string[];
}

export interface Project {
  id: string;
  dealId: string;
  companyId: string;
  name: string;
  painIds: string[];
  price: number;
  effortTrue: number;
  effortDone: number;
  estimateHours: number;
  startDay: Day;
  dueDay: Day;
  hoursLogged: number;
  quality: number;
  satisfaction: number;
  status: "active" | "delivered" | "cancelled";
  overrunEvents: number;
  changeRequests: number;
  retainerOffered: number;
  deliveredDay?: Day;
  finalInvoiced: boolean;
}

export interface Retainer {
  id: string;
  companyId: string;
  projectId: string;
  monthly: number;
  runCost: number;
  startDay: Day;
  satisfaction: number;
  status: "active" | "churned";
  churnReason?: string;
}

export type Role = "ai_engineer" | "junior_dev" | "sales" | "project_manager";

export interface Person {
  id: string;
  name: string;
  role: Role;
  skill: number;
  salaryAsk: number; // annual gross
  reliability: number;
  ambition: number; // likelihood they eventually leave to start their own thing
  background: string;
}

export interface Employee extends Person {
  salary: number;
  startDay: Day;
  morale: number;
  status: "notice_incoming" | "active" | "left";
  leaveDay?: Day;
}

export interface Candidate extends Person {
  appliedDay: Day;
  status: "applied" | "offered" | "declined" | "hired" | "withdrawn";
}

export interface Competitor {
  id: string;
  name: string;
  kind: "freelancer" | "local_agency" | "big_consultancy" | "offshore" | "saas_tool";
  priceLevel: number; // relative to market reference, 1 = market
  quality: number;
  reputation: number;
}

export type LedgerCategory =
  | "revenue"
  | "vat_collected"
  | "vat_paid"
  | "salaries"
  | "employer_contrib"
  | "contractors"
  | "software"
  | "infra"
  | "marketing"
  | "events"
  | "professional_fees"
  | "insurance"
  | "office"
  | "loan_in"
  | "loan_repayment"
  | "interest"
  | "tax"
  | "capital_in"
  | "owner_pay"
  | "setup"
  | "other";

export interface LedgerEntry {
  day: Day;
  amount: number; // + into company cash, - out
  category: LedgerCategory;
  memo: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  memo: string;
  net: number;
  vat: number;
  issuedDay: Day;
  dueDay: Day;
  payDay?: Day; // hidden: when it will be paid if nothing changes
  paidDay?: Day;
  status: "open" | "paid" | "written_off";
  chased: number;
  needsChasing: boolean;
}

export type LoanKind = "bank_sme" | "credit_card" | "friends_family" | "startup_grant";

export interface Loan {
  id: string;
  kind: LoanKind;
  principal: number;
  balance: number;
  annualRate: number;
  monthlyPayment: number;
  startDay: Day;
  status: "pending" | "active" | "repaid" | "rejected";
  decisionDay: Day;
  decisionReason?: string;
  personalGuarantee: boolean;
}

export interface TaxBill {
  id: string;
  kind: "vat_return" | "corporate_tax" | "income_tax" | "social_insurance";
  amount: number;
  dueDay: Day;
  paid: boolean;
  memo: string;
}

export interface Finance {
  cash: number;
  ledger: LedgerEntry[];
  invoices: Invoice[];
  loans: Loan[];
  taxes: TaxBill[];
  legalForm: "none" | "sole_trader" | "ltd" | "ltd_pending";
  ltdReadyDay?: Day;
  vatRegistered: boolean;
  vatOwed: number; // collected minus paid, accrued this quarter
  negativeSince?: Day;
  insurance: boolean;
}

export interface Reputation {
  completedProjects: number;
  caseStudies: number;
  testimonials: number;
  satisfactionSum: number;
  brand: number; // 0..1 awareness in your niche
  followers: number;
  referralsReceived: number;
}

export interface WeeklyPlan {
  emailHours: number;
  linkedinHours: number;
  networkingHours: number;
  contentHours: number;
  deliveryHours: number;
  personalization: "low" | "medium" | "high";
  targetIndustries: IndustryId[];
}

export interface Policies {
  hourlyRate: number;
  workshopFee: number;
  defaultUpfrontPct: number;
  netDays: number;
  scopeCreep: "ask" | "absorb_small" | "change_order";
  passThroughRunCosts: boolean;
  founderSalaryMonthly: number; // gross salary the company pays you
  coworking: boolean;
}

export type EventKind =
  | "welcome"
  | "reply_positive"
  | "reply_info"
  | "warm_intro"
  | "inbound_lead"
  | "referral"
  | "call_today"
  | "proposal_response"
  | "proposal_ghosted"
  | "project_overrun"
  | "scope_change"
  | "project_delivered"
  | "project_late"
  | "invoice_paid"
  | "invoice_overdue"
  | "retainer_churn"
  | "candidate_applied"
  | "employee_resigned"
  | "loan_decision"
  | "vat_threshold"
  | "tax_due"
  | "cash_warning"
  | "personal_cash_warning"
  | "burnout"
  | "competitor_news"
  | "market_news"
  | "month_report"
  | "ltd_ready"
  | "milestone"
  | "list_exhausted"
  | "offer_response"
  | "game_over";

export interface GameEvent {
  id: string;
  day: Day;
  kind: EventKind;
  title: string;
  body: string;
  attention: boolean; // stops "run until something happens"
  resolved: boolean;
  ref?: { dealId?: string; projectId?: string; invoiceId?: string; candidateId?: string; loanId?: string; employeeId?: string; retainerId?: string };
  choice?: string;
}

export interface MonthSnapshot {
  month: string; // YYYY-MM
  revenue: number;
  costs: number;
  profit: number;
  cash: number;
  personalCash: number;
  mrr: number;
  pipeline: number;
  clients: number;
  hoursWorked: number;
  leads: number;
  calls: number;
  proposals: number;
  wins: number;
}

export interface Funnel {
  emailsSent: number;
  linkedinSent: number;
  linkedinAccepted: number;
  replies: number;
  positiveReplies: number;
  callsHeld: number;
  proposalsSent: number;
  proposalsWon: number;
  proposalsLost: number;
}

export interface PendingReply {
  companyId: string;
  day: Day;
  kind: "positive" | "info" | "negative";
  source: LeadSource;
}

export interface WeekLog {
  weekStart: Day;
  hoursWorked: number;
  hoursBooked: number; // calls, proposals, admin booked on top of the plan
  linkedinSent: number;
  emailCarry: number;
  linkedinCarry: number;
}

export interface ChatSession {
  id: string;
  kind: "discovery" | "negotiation" | "interview";
  ref: string; // dealId or candidateId
  messages: ChatMessage[];
  open: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rng: RngState;
  day: Day;
  startDate: string; // ISO date of day 0
  market: MarketId;
  businessName: string;
  founder: FounderProfile;
  situation: FounderSituation;
  companies: Company[];
  deals: Deal[];
  projects: Project[];
  retainers: Retainer[];
  employees: Employee[];
  candidates: Candidate[];
  jobOpen?: { role: Role; openedDay: Day };
  competitors: Competitor[];
  finance: Finance;
  reputation: Reputation;
  plan: WeeklyPlan;
  policies: Policies;
  events: GameEvent[];
  funnel: Funnel;
  pendingReplies: PendingReply[];
  warmContactsUsed: number;
  week: WeekLog;
  months: MonthSnapshot[];
  monthAcc: Omit<MonthSnapshot, "month" | "cash" | "personalCash" | "mrr" | "pipeline" | "clients">;
  chats: ChatSession[];
  milestones: string[];
  marketMood: number; // 1 = normal demand; news events move it
  flags: Record<string, number>;
  status: "active" | "game_over";
  gameOver?: { day: Day; reason: string };
  decisionsLog: { day: Day; text: string }[];
}
