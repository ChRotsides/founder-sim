import type { AiAttitude, IndustryId, MarketId, Role } from "./types";

export interface TaxBand {
  upTo: number; // upper bound of the band (Infinity for the last)
  rate: number;
}

export interface MarketPreset {
  id: MarketId;
  label: string;
  currency: string;
  symbol: string;
  locale: string;
  vatRate: number;
  vatThreshold: number; // trailing-12-month turnover that forces registration
  corporateTax: number;
  incomeTax: TaxBand[];
  employerContrib: number; // employer social contributions as share of gross
  employeeContrib: number;
  selfEmployedContrib: number;
  thirteenthSalary: boolean;
  defaultLiving: number; // single founder, monthly
  salaries: Record<Role, number>; // annual gross medians
  aiRateRef: number; // market reference hourly rate for a mid-level AI consultant
  smbHourlyCost: number; // loaded cost of an SMB employee hour, used to value pains
  revenuePerEmployee: number;
  ltdSetupCost: number;
  ltdSetupDays: number;
  soleTraderSetupCost: number;
  accountantMonthly: number;
  auditAnnual: number; // Cyprus requires audited accounts for every Ltd
  insuranceAnnual: number;
  coworkingMonthly: number;
  lateShare: number; // share of invoices paid after the due date
  lateMedianDays: number; // median lateness when late
  chaseShare: number; // share of late invoices that stall until you chase
  smbLoanRate: number;
  attitudes: Record<AiAttitude, number>;
  poolSize: number; // reachable SMBs in the sample market
  industryWeights: Partial<Record<IndustryId, number>>;
  cities: string[];
  firstNames: string[];
  lastNames: string[];
  notes: string[];
}

const CY: MarketPreset = {
  id: "CY",
  label: "Cyprus",
  currency: "EUR",
  symbol: "€",
  locale: "en-CY",
  vatRate: 0.19,
  vatThreshold: 15_600,
  corporateTax: 0.15,
  incomeTax: [
    { upTo: 22_000, rate: 0 },
    { upTo: 32_000, rate: 0.2 },
    { upTo: 42_000, rate: 0.25 },
    { upTo: 72_000, rate: 0.3 },
    { upTo: Infinity, rate: 0.35 },
  ],
  employerContrib: 0.154, // SI 8.8% + GESY 2.9% + cohesion 2% + redundancy 1.2% + HRDA 0.5%
  employeeContrib: 0.1145,
  selfEmployedContrib: 0.206, // 16.6% social insurance + 4% GESY
  thirteenthSalary: true,
  defaultLiving: 1_700,
  salaries: { ai_engineer: 70_000, junior_dev: 24_000, sales: 35_000, project_manager: 43_000 },
  aiRateRef: 70,
  smbHourlyCost: 18,
  revenuePerEmployee: 95_000,
  ltdSetupCost: 1_300,
  ltdSetupDays: 21,
  soleTraderSetupCost: 150,
  accountantMonthly: 175, // bookkeeping + registered office/secretary
  auditAnnual: 1_800,
  insuranceAnnual: 700,
  coworkingMonthly: 220,
  lateShare: 0.55,
  lateMedianDays: 22,
  chaseShare: 0.25,
  smbLoanRate: 0.07,
  attitudes: { skeptic: 0.45, curious: 0.43, eager: 0.12 },
  poolSize: 3_000,
  industryWeights: {
    shipping_logistics: 1.4,
    fintech_broker: 1.3,
    real_estate: 1.4,
    hotel: 1.3,
    law_firm: 1.2,
    accounting_firm: 1.3,
    dental_clinic: 0.9,
    private_clinic: 0.8,
    construction: 1,
    ecommerce: 0.6,
    manufacturing: 0.5,
    recruitment: 0.7,
    restaurant: 1.1,
    insurance_broker: 0.8,
  },
  cities: ["Nicosia", "Limassol", "Larnaca", "Paphos", "Paralimni"],
  firstNames: [
    "Andreas", "Maria", "Christos", "Eleni", "Giorgos", "Andri", "Panayiotis", "Stella", "Michalis", "Despo",
    "Marios", "Katerina", "Nicos", "Elena", "Kyriakos", "Anna", "Savvas", "Christina", "Loizos", "Georgia",
    "Stelios", "Ioanna", "Antonis", "Marina", "Costas", "Sofia", "Demetris", "Natalia", "Pavlos", "Irene",
    "Alexei", "Olga", "James", "Sarah", "Petros", "Rafaella",
  ],
  lastNames: [
    "Georgiou", "Christodoulou", "Ioannou", "Charalambous", "Constantinou", "Nicolaou", "Panayiotou", "Demetriou",
    "Kyriacou", "Andreou", "Michael", "Savva", "Hadjigeorgiou", "Papadopoulos", "Neophytou", "Loizou", "Theodorou",
    "Christofi", "Stylianou", "Pavlou", "Antoniou", "Efstathiou", "Hadjinicolaou", "Petrou",
  ],
  notes: [
    "Small market: a few thousand SMBs in your reachable niches, so cold lists run out fast.",
    "Relationships and referrals matter more than in the UK/US; cold outreach converts worse.",
    "B2B invoices are frequently paid late; plan for 30–60 days to get your money.",
    "Every Ltd needs an annual audit (or a review engagement under €300k turnover); VAT registration is mandatory above €15,600.",
    "Corporate tax is 15% from 2026; AI adoption among small firms is ~8% vs ~17% EU average: untapped, but buyers need educating.",
  ],
};

const UK: MarketPreset = {
  id: "UK",
  label: "United Kingdom",
  currency: "GBP",
  symbol: "£",
  locale: "en-GB",
  vatRate: 0.2,
  vatThreshold: 90_000,
  corporateTax: 0.25,
  incomeTax: [
    { upTo: 12_570, rate: 0 },
    { upTo: 50_270, rate: 0.2 },
    { upTo: 125_140, rate: 0.4 },
    { upTo: Infinity, rate: 0.45 },
  ],
  employerContrib: 0.15,
  employeeContrib: 0.08,
  selfEmployedContrib: 0.06,
  thirteenthSalary: false,
  defaultLiving: 2_100,
  salaries: { ai_engineer: 92_000, junior_dev: 35_000, sales: 45_000, project_manager: 55_000 },
  aiRateRef: 85,
  smbHourlyCost: 22,
  revenuePerEmployee: 110_000,
  ltdSetupCost: 50,
  ltdSetupDays: 2,
  soleTraderSetupCost: 0,
  accountantMonthly: 150,
  auditAnnual: 0,
  insuranceAnnual: 600,
  coworkingMonthly: 250,
  lateShare: 0.45,
  lateMedianDays: 14,
  chaseShare: 0.2,
  smbLoanRate: 0.085,
  attitudes: { skeptic: 0.35, curious: 0.47, eager: 0.18 },
  poolSize: 6_000,
  industryWeights: {
    law_firm: 1.3,
    accounting_firm: 1.3,
    ecommerce: 1.3,
    recruitment: 1.2,
    real_estate: 1.2,
    dental_clinic: 1,
    private_clinic: 0.9,
    construction: 1,
    manufacturing: 0.9,
    hotel: 0.8,
    restaurant: 1,
    insurance_broker: 1,
    shipping_logistics: 0.8,
    fintech_broker: 0.7,
  },
  cities: ["Manchester", "Birmingham", "Leeds", "Bristol", "London"],
  firstNames: [
    "Oliver", "Amelia", "Harry", "Isla", "Jack", "Ava", "George", "Mia", "Noah", "Grace", "Leo", "Freya",
    "Arthur", "Lily", "Thomas", "Emily", "Priya", "Mohammed", "Chloe", "Daniel", "Sophie", "Aisha",
  ],
  lastNames: [
    "Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Patel", "Robinson", "Wright",
    "Thompson", "Evans", "Walker", "White", "Roberts", "Green", "Hall", "Khan", "Clarke",
  ],
  notes: [
    "Large market with many competing AI freelancers and agencies.",
    "Company formation is cheap and fast; small companies are audit-exempt.",
    "Late payment is common but less severe than southern Europe.",
  ],
};

const US: MarketPreset = {
  id: "US",
  label: "United States",
  currency: "USD",
  symbol: "$",
  locale: "en-US",
  vatRate: 0,
  vatThreshold: Infinity,
  corporateTax: 0.21,
  incomeTax: [
    { upTo: 15_000, rate: 0 },
    { upTo: 26_600, rate: 0.1 },
    { upTo: 63_475, rate: 0.12 },
    { upTo: 118_350, rate: 0.22 },
    { upTo: 212_300, rate: 0.24 },
    { upTo: Infinity, rate: 0.32 },
  ],
  employerContrib: 0.0765,
  employeeContrib: 0.0765,
  selfEmployedContrib: 0.153,
  thirteenthSalary: false,
  defaultLiving: 3_300,
  salaries: { ai_engineer: 170_000, junior_dev: 85_000, sales: 80_000, project_manager: 100_000 },
  aiRateRef: 150,
  smbHourlyCost: 32,
  revenuePerEmployee: 150_000,
  ltdSetupCost: 500,
  ltdSetupDays: 7,
  soleTraderSetupCost: 50,
  accountantMonthly: 250,
  auditAnnual: 0,
  insuranceAnnual: 1_200,
  coworkingMonthly: 350,
  lateShare: 0.4,
  lateMedianDays: 12,
  chaseShare: 0.18,
  smbLoanRate: 0.11,
  attitudes: { skeptic: 0.3, curious: 0.48, eager: 0.22 },
  poolSize: 8_000,
  industryWeights: {
    dental_clinic: 1.3,
    law_firm: 1.3,
    real_estate: 1.3,
    ecommerce: 1.3,
    private_clinic: 1.2,
    insurance_broker: 1.1,
    construction: 1.1,
    accounting_firm: 1.1,
    recruitment: 1,
    manufacturing: 1,
    restaurant: 1,
    hotel: 0.7,
    shipping_logistics: 0.8,
    fintech_broker: 0.6,
  },
  cities: ["Austin", "Denver", "Atlanta", "Phoenix", "Columbus"],
  firstNames: [
    "James", "Olivia", "Michael", "Emma", "David", "Sophia", "Chris", "Ava", "Daniel", "Isabella", "Matthew",
    "Mia", "Carlos", "Maria", "Tyler", "Ashley", "Brandon", "Jessica", "Kevin", "Lauren",
  ],
  lastNames: [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
    "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Lee", "Harris", "Clark", "Lewis",
  ],
  notes: [
    "Biggest market and highest rates, also the most crowded with AI agencies.",
    "No VAT on most services; health insurance is part of your living costs.",
  ],
};

export const MARKETS: Record<MarketId, MarketPreset> = { CY, UK, US };
