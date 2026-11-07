import type { Archetype, IndustryId } from "./types";

export interface PainTemplate {
  title: string;
  detail: string;
  archetype: Archetype;
  awareChance: number;
  hoursPerWeek: [number, number]; // at a 10-person company, scales sub-linearly with size
  lostRevenue?: [number, number]; // extra yearly revenue lost, at a 10-person company
}

export interface Industry {
  id: IndustryId;
  label: string;
  employeesMedian: number;
  revenueMult: number;
  maturity: number;
  decisionMult: number;
  roles: string[];
  nameParts: [string[], string[]];
  pains: PainTemplate[];
}

export const INDUSTRIES: Record<IndustryId, Industry> = {
  dental_clinic: {
    id: "dental_clinic",
    label: "Dental clinic",
    employeesMedian: 7,
    revenueMult: 0.9,
    maturity: 0.35,
    decisionMult: 0.8,
    roles: ["Owner dentist", "Practice manager"],
    nameParts: [["Smile", "Bright", "Pearl", "City", "Family", "Coastal"], ["Dental Care", "Dental Clinic", "Dentistry", "Dental Studio"]],
    pains: [
      { title: "Phone booking overload", detail: "Reception misses ~25% of calls at peak hours; each missed call is often a lost new patient. They have never measured it.", archetype: "voice_receptionist", awareChance: 0.7, hoursPerWeek: [8, 15], lostRevenue: [8_000, 25_000] },
      { title: "No-shows", detail: "No-show rate ~12%; reminders are sent manually by SMS when staff remember.", archetype: "workflow_automation", awareChance: 0.8, hoursPerWeek: [2, 5], lostRevenue: [6_000, 18_000] },
      { title: "Insurance and GESY paperwork", detail: "Claims are filled by hand from patient files; frequent rejections from typos.", archetype: "doc_extraction", awareChance: 0.6, hoursPerWeek: [5, 10] },
      { title: "Patient records on paper and Excel", detail: "Really they need proper practice-management software first; AI on top of this mess would not help.", archetype: "not_ai", awareChance: 0.4, hoursPerWeek: [3, 6] },
    ],
  },
  law_firm: {
    id: "law_firm",
    label: "Law firm",
    employeesMedian: 9,
    revenueMult: 1.3,
    maturity: 0.4,
    decisionMult: 1.3,
    roles: ["Managing partner", "Partner", "Office manager"],
    nameParts: [["Christou", "Andreou", "Hadji", "Koumi", "Pavlides", "Neocleous"], ["& Associates LLC", "Law Firm", "Advocates", "Legal"]],
    pains: [
      { title: "Contract review time", detail: "Associates spend whole days first-pass reviewing standard contracts; partners worry about confidentiality with AI.", archetype: "compliance_review", awareChance: 0.7, hoursPerWeek: [10, 25] },
      { title: "Client intake and KYC documents", detail: "Collecting and checking ID/proof-of-address documents by email, chasing missing ones.", archetype: "doc_extraction", awareChance: 0.6, hoursPerWeek: [6, 12] },
      { title: "Finding precedent in their own files", detail: "Years of past opinions on a shared drive; nobody can find anything; work gets redone.", archetype: "knowledge_assistant", awareChance: 0.4, hoursPerWeek: [5, 12] },
      { title: "Billing time leakage", detail: "Lawyers forget to log ~10% of billable time; reconstructed at month end from emails.", archetype: "workflow_automation", awareChance: 0.3, hoursPerWeek: [3, 6], lostRevenue: [15_000, 50_000] },
    ],
  },
  accounting_firm: {
    id: "accounting_firm",
    label: "Accounting / audit firm",
    employeesMedian: 10,
    revenueMult: 1,
    maturity: 0.5,
    decisionMult: 1,
    roles: ["Managing director", "Partner", "Operations manager"],
    nameParts: [["Prime", "Ledger", "Kyriacou", "Apex", "Trust", "Ioannou"], ["Accountants", "Audit Ltd", "& Co", "Advisory"]],
    pains: [
      { title: "Invoice and receipt data entry", detail: "Juniors key in hundreds of client invoices per month into accounting software.", archetype: "doc_extraction", awareChance: 0.9, hoursPerWeek: [15, 30] },
      { title: "Chasing clients for documents", detail: "Every VAT quarter staff send dozens of chasing emails and calls for missing documents.", archetype: "workflow_automation", awareChance: 0.8, hoursPerWeek: [6, 12] },
      { title: "Answering repetitive client questions", detail: "Same tax-deadline and GESY questions from clients by phone and email.", archetype: "support_chatbot", awareChance: 0.5, hoursPerWeek: [4, 8] },
      { title: "Staff turnover in busy season", detail: "Juniors leave after a year; the real fix is pay and workload, not AI.", archetype: "not_ai", awareChance: 0.6, hoursPerWeek: [4, 8] },
    ],
  },
  real_estate: {
    id: "real_estate",
    label: "Real estate agency",
    employeesMedian: 6,
    revenueMult: 1.1,
    maturity: 0.4,
    decisionMult: 0.7,
    roles: ["Owner / broker", "Sales director"],
    nameParts: [["Blue", "Seaview", "Prime", "Island", "Golden", "Urban"], ["Properties", "Estates", "Realty", "Homes"]],
    pains: [
      { title: "Slow response to portal leads", detail: "Leads from Bazaraki and portals get answered hours later, often by then they called a competitor.", archetype: "lead_qualification", awareChance: 0.6, hoursPerWeek: [6, 12], lostRevenue: [20_000, 60_000] },
      { title: "Writing listings in 3 languages", detail: "Greek/English/Russian listing descriptions written manually for every property.", archetype: "content_generation", awareChance: 0.7, hoursPerWeek: [4, 8] },
      { title: "Scheduling viewings", detail: "Back-and-forth WhatsApp messages to schedule viewings with owners and buyers.", archetype: "workflow_automation", awareChance: 0.5, hoursPerWeek: [5, 9] },
    ],
  },
  hotel: {
    id: "hotel",
    label: "Hotel / holiday rentals",
    employeesMedian: 25,
    revenueMult: 0.8,
    maturity: 0.4,
    decisionMult: 1.1,
    roles: ["General manager", "Owner", "Revenue manager"],
    nameParts: [["Azure", "Aphrodite", "Coral", "Olive", "Sunset", "Harbour"], ["Hotel", "Resort", "Suites", "Boutique Hotel"]],
    pains: [
      { title: "Guest messages in many languages", detail: "Front desk answers the same pre-arrival questions by email/WhatsApp in 5 languages, 24/7.", archetype: "support_chatbot", awareChance: 0.7, hoursPerWeek: [12, 25] },
      { title: "Replying to online reviews", detail: "Reviews on Booking/TripAdvisor go unanswered for weeks; ratings matter for bookings.", archetype: "content_generation", awareChance: 0.5, hoursPerWeek: [3, 6], lostRevenue: [10_000, 30_000] },
      { title: "Direct booking conversion", detail: "Website enquiries are slow to get answers; guests then book via OTAs paying 15–18% commission.", archetype: "lead_qualification", awareChance: 0.4, hoursPerWeek: [4, 8], lostRevenue: [15_000, 50_000] },
    ],
  },
  shipping_logistics: {
    id: "shipping_logistics",
    label: "Shipping / logistics",
    employeesMedian: 15,
    revenueMult: 1.4,
    maturity: 0.5,
    decisionMult: 1.4,
    roles: ["Operations director", "Managing director", "IT manager"],
    nameParts: [["Med", "Poseidon", "Aegean", "Levant", "Marine", "Cargo"], ["Shipping Ltd", "Logistics", "Ship Management", "Freight"]],
    pains: [
      { title: "Orders and bookings arriving by email", detail: "Ops staff copy booking details from emails and PDFs into their system, with costly errors.", archetype: "doc_extraction", awareChance: 0.8, hoursPerWeek: [15, 35] },
      { title: "Where-is-my-shipment queries", detail: "Customers email and call for status updates that are already in the tracking system.", archetype: "support_chatbot", awareChance: 0.7, hoursPerWeek: [8, 15] },
      { title: "Vessel and crew document compliance", detail: "Certificates and crew documents tracked in spreadsheets; expiries get missed.", archetype: "compliance_review", awareChance: 0.5, hoursPerWeek: [5, 10] },
      { title: "Weekly management reports", detail: "Someone spends a day every week assembling reports from 4 systems.", archetype: "reporting_analytics", awareChance: 0.6, hoursPerWeek: [6, 10] },
    ],
  },
  ecommerce: {
    id: "ecommerce",
    label: "E-commerce shop",
    employeesMedian: 6,
    revenueMult: 1.2,
    maturity: 0.65,
    decisionMult: 0.7,
    roles: ["Founder", "Head of operations"],
    nameParts: [["Nest", "Urban", "Pure", "Nordic", "Little", "Wild"], ["Store", "Shop", "Goods", "Co"]],
    pains: [
      { title: "Support tickets about orders", detail: "60% of tickets are 'where is my order' and returns questions.", archetype: "support_chatbot", awareChance: 0.9, hoursPerWeek: [10, 20] },
      { title: "Product descriptions and SEO", detail: "New products go live with thin descriptions; SEO traffic is weak.", archetype: "content_generation", awareChance: 0.6, hoursPerWeek: [3, 8], lostRevenue: [5_000, 20_000] },
      { title: "Bad ad spend decisions", detail: "Marketing decisions made on gut; ROAS reports pulled manually.", archetype: "reporting_analytics", awareChance: 0.4, hoursPerWeek: [3, 6], lostRevenue: [5_000, 25_000] },
    ],
  },
  fintech_broker: {
    id: "fintech_broker",
    label: "Fintech / forex broker",
    employeesMedian: 40,
    revenueMult: 2,
    maturity: 0.8,
    decisionMult: 1.6,
    roles: ["COO", "Head of compliance", "CTO"],
    nameParts: [["Trade", "Alpha", "Nova", "Capital", "Vertex", "Atlas"], ["Markets Ltd", "FX", "Capital Ltd", "Investments"]],
    pains: [
      { title: "KYC onboarding backlog", detail: "Compliance manually checks onboarding documents; backlog delays funded accounts by days.", archetype: "compliance_review", awareChance: 0.9, hoursPerWeek: [25, 50], lostRevenue: [30_000, 120_000] },
      { title: "Support in many languages", detail: "Tier-1 support for platform questions in 8 languages.", archetype: "support_chatbot", awareChance: 0.7, hoursPerWeek: [20, 40] },
      { title: "Regulatory report preparation", detail: "CySEC reporting assembled by hand from several systems.", archetype: "reporting_analytics", awareChance: 0.6, hoursPerWeek: [8, 15] },
    ],
  },
  construction: {
    id: "construction",
    label: "Construction / contractor",
    employeesMedian: 18,
    revenueMult: 1.1,
    maturity: 0.25,
    decisionMult: 1.2,
    roles: ["Owner", "Commercial manager", "Project director"],
    nameParts: [["Stone", "Cyfield", "Atlas", "Solid", "Pyramid", "Petra"], ["Construction", "Builders", "Developers", "Contractors"]],
    pains: [
      { title: "Tender and quote preparation", detail: "Estimators spend days per tender pulling quantities and supplier prices together.", archetype: "doc_extraction", awareChance: 0.7, hoursPerWeek: [10, 20], lostRevenue: [20_000, 80_000] },
      { title: "Site reports and photos", detail: "Daily site reports come as WhatsApp voice notes and photos; nothing is searchable.", archetype: "workflow_automation", awareChance: 0.4, hoursPerWeek: [5, 10] },
      { title: "Cash flow surprises", detail: "They don't track project costs against budget; that's an accounting/process problem.", archetype: "not_ai", awareChance: 0.5, hoursPerWeek: [4, 8] },
    ],
  },
  manufacturing: {
    id: "manufacturing",
    label: "Manufacturing / food production",
    employeesMedian: 30,
    revenueMult: 1.2,
    maturity: 0.35,
    decisionMult: 1.4,
    roles: ["Plant manager", "Managing director", "Operations manager"],
    nameParts: [["Olympia", "Kean", "Troodos", "Mesogi", "Alpha", "Delta"], ["Foods", "Industries", "Manufacturing", "Products"]],
    pains: [
      { title: "Order entry from distributors", detail: "Distributor orders arrive in varied PDFs/emails and are retyped into the ERP.", archetype: "doc_extraction", awareChance: 0.8, hoursPerWeek: [10, 20] },
      { title: "Production planning in Excel", detail: "One person's spreadsheet runs planning; if she's sick, chaos.", archetype: "reporting_analytics", awareChance: 0.5, hoursPerWeek: [6, 12] },
      { title: "Quality incident documentation", detail: "HACCP/QA records are paper-based and audits are stressful.", archetype: "workflow_automation", awareChance: 0.5, hoursPerWeek: [4, 8] },
    ],
  },
  recruitment: {
    id: "recruitment",
    label: "Recruitment agency",
    employeesMedian: 8,
    revenueMult: 1,
    maturity: 0.6,
    decisionMult: 0.8,
    roles: ["Director", "Head of delivery"],
    nameParts: [["Talent", "People", "Hire", "Bridge", "Next", "Core"], ["Recruitment", "Partners", "Staffing", "Search"]],
    pains: [
      { title: "CV screening", detail: "Consultants read hundreds of CVs per role to shortlist 5.", archetype: "doc_extraction", awareChance: 0.9, hoursPerWeek: [12, 25] },
      { title: "Candidate follow-ups", detail: "Candidates go cold because nobody follows up after interviews.", archetype: "workflow_automation", awareChance: 0.5, hoursPerWeek: [4, 8], lostRevenue: [10_000, 40_000] },
      { title: "Writing job ads", detail: "Job ads rewritten from client briefs for every board.", archetype: "content_generation", awareChance: 0.6, hoursPerWeek: [3, 6] },
    ],
  },
  private_clinic: {
    id: "private_clinic",
    label: "Private medical clinic",
    employeesMedian: 14,
    revenueMult: 1.1,
    maturity: 0.4,
    decisionMult: 1.2,
    roles: ["Clinic director", "Administrator"],
    nameParts: [["Iasis", "Medi", "Health", "Ygeia", "Care", "Vita"], ["Clinic", "Medical Centre", "Polyclinic", "Health"]],
    pains: [
      { title: "Appointment phone lines", detail: "Patients wait on hold; many give up and book elsewhere.", archetype: "voice_receptionist", awareChance: 0.6, hoursPerWeek: [10, 20], lostRevenue: [15_000, 40_000] },
      { title: "Doctor's notes and referral letters", detail: "Doctors type referral letters after hours.", archetype: "content_generation", awareChance: 0.5, hoursPerWeek: [6, 12] },
      { title: "GESY claim rejections", detail: "Claims rejected for missing codes; re-submissions done manually.", archetype: "compliance_review", awareChance: 0.6, hoursPerWeek: [5, 10] },
    ],
  },
  restaurant: {
    id: "restaurant",
    label: "Restaurant group",
    employeesMedian: 12,
    revenueMult: 0.5,
    maturity: 0.25,
    decisionMult: 0.6,
    roles: ["Owner", "General manager"],
    nameParts: [["Meze", "Taverna", "Olive", "Salt", "Harbour", "Fig"], ["Kitchen", "Taverna", "Bistro", "Group"]],
    pains: [
      { title: "Reservations by phone and Instagram DM", detail: "Bookings arrive in four channels and get double-booked.", archetype: "workflow_automation", awareChance: 0.7, hoursPerWeek: [5, 10], lostRevenue: [3_000, 10_000] },
      { title: "Staff scheduling", detail: "Rota done by hand weekly; it's a scheduling-tool problem more than AI.", archetype: "not_ai", awareChance: 0.6, hoursPerWeek: [3, 5] },
      { title: "Social media posting", detail: "Owner posts when he remembers; wants consistent content.", archetype: "content_generation", awareChance: 0.6, hoursPerWeek: [2, 4] },
    ],
  },
  insurance_broker: {
    id: "insurance_broker",
    label: "Insurance broker",
    employeesMedian: 10,
    revenueMult: 1,
    maturity: 0.45,
    decisionMult: 1.1,
    roles: ["Managing director", "Operations manager"],
    nameParts: [["Shield", "Secure", "Prime", "Unity", "Safe", "Allied"], ["Insurance Agents", "Brokers", "Insurance Ltd", "Cover"]],
    pains: [
      { title: "Comparing insurer quotes", detail: "Staff copy quotes from 6 insurer portals into a comparison sheet for every client.", archetype: "doc_extraction", awareChance: 0.8, hoursPerWeek: [10, 20] },
      { title: "Renewal reminders and upsell", detail: "Renewals are missed; clients lapse to competitors.", archetype: "workflow_automation", awareChance: 0.6, hoursPerWeek: [3, 6], lostRevenue: [10_000, 40_000] },
      { title: "Claims first notice", detail: "Clients call with claims; details captured inconsistently.", archetype: "support_chatbot", awareChance: 0.4, hoursPerWeek: [4, 8] },
    ],
  },
};

export const INDUSTRY_IDS = Object.keys(INDUSTRIES) as IndustryId[];
