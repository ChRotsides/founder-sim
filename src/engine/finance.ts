import { addBusinessDays, dateOf, monthIndex, nextDate } from "./calendar";
import { pushEvent } from "./events";
import { MARKETS, type TaxBand } from "./markets";
import { Rng } from "./rng";
import type { GameState, Invoice, LedgerCategory, Loan, LoanKind } from "./types";

const NON_PL: LedgerCategory[] = ["vat_collected", "vat_paid", "loan_in", "loan_repayment", "capital_in", "owner_pay"];

export const market = (s: GameState) => MARKETS[s.market];

/** Move money in or out of the company account. Positive = money in. */
export function book(s: GameState, amount: number, category: LedgerCategory, memo: string) {
  const a = Math.round(amount * 100) / 100;
  s.finance.cash += a;
  s.finance.ledger.push({ day: s.day, amount: a, category, memo });
  if (category === "revenue") s.monthAcc.revenue += a;
  else if (!NON_PL.includes(category) && a < 0) s.monthAcc.costs += -a;
  if (s.finance.ledger.length > 3000) s.finance.ledger.splice(0, s.finance.ledger.length - 3000);
}

/** Money spent personally (before you have a company, or for your own living). */
export function spendPersonal(s: GameState, amount: number) {
  s.situation.personalCash -= amount;
}

export function progressiveTax(income: number, bands: TaxBand[]): number {
  let tax = 0;
  let prev = 0;
  for (const b of bands) {
    if (income <= prev) break;
    tax += (Math.min(income, b.upTo) - prev) * b.rate;
    prev = b.upTo;
  }
  return tax;
}

export function canInvoice(s: GameState): boolean {
  return s.finance.legalForm === "sole_trader" || s.finance.legalForm === "ltd";
}

export function issueInvoice(s: GameState, companyId: string, net: number, memo: string, netDays?: number): Invoice | undefined {
  if (net <= 0) return;
  const rng = new Rng(s.rng);
  const m = market(s);
  const co = s.companies.find((c) => c.id === companyId)!;
  const vat = s.finance.vatRegistered ? Math.round(net * m.vatRate * 100) / 100 : 0;
  const terms = netDays ?? s.policies.netDays;
  const due = s.day + terms;
  const late = !rng.chance(co.payReliability);
  const needsChasing = late && rng.chance(m.chaseShare * 2);
  const payDay = needsChasing ? undefined : late ? due + Math.round(rng.lognormal(Math.max(3, co.paymentDelay), 0.6)) : due - rng.int(0, Math.min(7, terms));
  const inv: Invoice = { id: rng.id("inv"), companyId, memo, net, vat, issuedDay: s.day, dueDay: due, payDay, status: "open", chased: 0, needsChasing };
  s.finance.invoices.push(inv);
  s.finance.vatOwed += vat; // VAT is owed when you invoice, not when you get paid
  return inv;
}

export function processInvoices(s: GameState) {
  for (const inv of s.finance.invoices) {
    if (inv.status !== "open") continue;
    if (inv.payDay !== undefined && inv.payDay <= s.day) {
      inv.status = "paid";
      inv.paidDay = s.day;
      const co = s.companies.find((c) => c.id === inv.companyId);
      book(s, inv.net, "revenue", `Payment: ${inv.memo}`);
      if (inv.vat) book(s, inv.vat, "vat_collected", `VAT on ${inv.memo}`);
      pushEvent(s, "invoice_paid", `${co?.name ?? "Client"} paid ${fmt(s, inv.net + inv.vat)}`, `${inv.memo}. ${inv.paidDay > inv.dueDay ? `${inv.paidDay - inv.dueDay} days late.` : "On time."}`, { ref: { invoiceId: inv.id } });
    } else if (s.day === inv.dueDay + 21 || (s.day > inv.dueDay + 21 && (s.day - inv.dueDay) % 30 === 21)) {
      const co = s.companies.find((c) => c.id === inv.companyId);
      pushEvent(s, "invoice_overdue", `Invoice to ${co?.name ?? "client"} is ${s.day - inv.dueDay} days overdue`, `${fmt(s, inv.net + inv.vat)} for "${inv.memo}". Chasing costs you time and a little goodwill; a formal letter costs money; writing it off costs the whole amount.`, { attention: true, ref: { invoiceId: inv.id } });
    }
  }
}

export function amortizedPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export const LOAN_TERMS: Record<LoanKind, { label: string; months: number; decisionDays: [number, number]; max: number }> = {
  bank_sme: { label: "Bank SME loan", months: 60, decisionDays: [21, 45], max: 100_000 },
  credit_card: { label: "Business credit card", months: 36, decisionDays: [2, 5], max: 5_000 },
  friends_family: { label: "Friends & family loan", months: 36, decisionDays: [5, 14], max: 15_000 },
  startup_grant: { label: "Government startup grant", months: 0, decisionDays: [90, 150], max: 60_000 },
};

export function applyForLoan(s: GameState, kind: LoanKind, amount: number): Loan {
  const rng = new Rng(s.rng);
  const t = LOAN_TERMS[kind];
  const loan: Loan = {
    id: rng.id("loan"),
    kind,
    principal: Math.min(amount, t.max),
    balance: 0,
    annualRate: kind === "bank_sme" ? market(s).smbLoanRate : kind === "credit_card" ? 0.19 : kind === "friends_family" ? 0.02 : 0,
    monthlyPayment: 0,
    startDay: s.day,
    status: "pending",
    decisionDay: s.day + rng.int(t.decisionDays[0], t.decisionDays[1]),
    personalGuarantee: kind === "bank_sme",
  };
  s.finance.loans.push(loan);
  return loan;
}

function trailingRevenue(s: GameState, days: number): number {
  return s.finance.ledger.filter((l) => l.category === "revenue" && l.day > s.day - days).reduce((a, l) => a + l.amount, 0);
}

export function decideLoans(s: GameState) {
  const rng = new Rng(s.rng);
  for (const loan of s.finance.loans) {
    if (loan.status !== "pending" || loan.decisionDay > s.day) continue;
    const rev12 = trailingRevenue(s, 365);
    const monthsTrading = s.day / 30;
    let p = 0;
    let reason = "";
    switch (loan.kind) {
      case "bank_sme": {
        if (s.finance.legalForm === "none" || s.finance.legalForm === "ltd_pending") {
          reason = "The bank only lends to a registered business with a trading history.";
          break;
        }
        p = 0.04 + (s.situation.hasCollateral ? 0.3 : 0) + Math.min(0.3, rev12 / Math.max(1, loan.principal) * 0.15) + (monthsTrading >= 24 ? 0.2 : 0) + (s.finance.legalForm === "ltd" ? 0.05 : 0);
        reason = p < 0.2 ? "Not enough trading history or collateral. Banks typically want 2–3 years of accounts and a personal guarantee." : "Approved subject to a personal guarantee from the director.";
        break;
      }
      case "credit_card":
        p = s.finance.legalForm === "none" ? 0 : s.situation.keepsJob || s.situation.personalCash > 5_000 ? 0.85 : 0.45;
        reason = p === 0 ? "You need a registered business for a business card." : "Approved based on your personal credit profile.";
        break;
      case "friends_family":
        p = Math.min(0.75, 0.2 + s.founder.warmNetwork / 200);
        reason = "Your relatives/friends agreed; they expect repayment and will ask how it's going at every family lunch.";
        break;
      case "startup_grant":
        p = s.finance.legalForm === "ltd" ? 0.08 + 0.1 * s.founder.skills.credibility : 0;
        reason = p === 0 ? "Grants require a registered company." : "Highly competitive; most applications are rejected.";
        break;
    }
    const approved = rng.chance(p);
    loan.status = approved ? "active" : "rejected";
    loan.decisionReason = approved ? reason : loan.kind === "bank_sme" && p >= 0.2 ? "The credit committee declined. They want to see more revenue first." : loan.kind === "startup_grant" && p > 0 ? "Your application scored below the funding line this round." : reason;
    if (approved) {
      loan.balance = loan.kind === "startup_grant" ? 0 : loan.principal;
      loan.monthlyPayment = loan.kind === "startup_grant" ? 0 : Math.round(amortizedPayment(loan.principal, loan.annualRate, LOAN_TERMS[loan.kind].months));
      if (loan.kind === "startup_grant") book(s, loan.principal, "capital_in", "Startup grant (non-repayable)");
      else book(s, loan.principal, "loan_in", LOAN_TERMS[loan.kind].label);
    }
    pushEvent(s, "loan_decision", `${LOAN_TERMS[loan.kind].label}: ${approved ? "approved" : "rejected"}`, loan.decisionReason, { attention: true, ref: { loanId: loan.id } });
  }
}

/** Everything that happens on the 1st of a month. */
export function monthStart(s: GameState) {
  const m = market(s);
  const rng = new Rng(s.rng);
  const sit = s.situation;
  const registered = s.finance.legalForm !== "none";

  // Personal side
  sit.personalCash -= sit.monthlyLiving;
  if (sit.keepsJob) sit.personalCash += sit.jobNetMonthly;

  // Founder pay
  const gross = s.policies.founderSalaryMonthly;
  if (gross > 0 && registered && s.finance.legalForm !== "ltd_pending") {
    if (s.finance.legalForm === "ltd") {
      const employer = gross * m.employerContrib;
      const annualTax = progressiveTax(gross * 12, m.incomeTax) / 12;
      const net = gross * (1 - m.employeeContrib) - annualTax;
      book(s, -gross, "salaries", "Your salary (gross)");
      book(s, -employer, "employer_contrib", "Employer contributions on your salary");
      sit.personalCash += net;
    } else {
      book(s, -gross, "owner_pay", "Owner drawings");
      sit.personalCash += gross;
    }
  }

  // Team payroll
  const december = monthIndex(s.startDate, s.day) === 11;
  for (const e of s.employees) {
    if (e.status === "left" || s.day < e.startDay) continue;
    const monthly = e.salary / (m.thirteenthSalary ? 13 : 12);
    const pay = december && m.thirteenthSalary ? monthly * 2 : monthly;
    book(s, -pay, "salaries", `Salary: ${e.name}${december && m.thirteenthSalary ? " (incl. 13th salary)" : ""}`);
    book(s, -pay * m.employerContrib, "employer_contrib", `Employer contributions: ${e.name}`);
  }

  if (registered) {
    book(s, -m.accountantMonthly, "professional_fees", "Accountant & company secretary");
    const team = s.employees.filter((e) => e.status !== "left").length;
    book(s, -(45 + 20 * team), "software", "Software & tools (email, LinkedIn, AI APIs, hosting)");
    if (s.policies.coworking) book(s, -m.coworkingMonthly, "office", "Coworking desk");
  } else {
    sit.personalCash -= 30; // you're still paying for tools out of pocket
  }

  for (const r of s.retainers) if (r.status === "active") book(s, -r.runCost, "infra", `Run costs: ${s.companies.find((c) => c.id === r.companyId)?.name}`);

  for (const loan of s.finance.loans) {
    if (loan.status !== "active" || loan.monthlyPayment === 0) continue;
    const interest = (loan.balance * loan.annualRate) / 12;
    const principal = Math.min(loan.balance, loan.monthlyPayment - interest);
    book(s, -interest, "interest", `Interest: ${LOAN_TERMS[loan.kind].label}`);
    book(s, -principal, "loan_repayment", `Repayment: ${LOAN_TERMS[loan.kind].label}`);
    loan.balance -= principal;
    if (loan.balance <= 1) loan.status = "repaid";
  }

  const mi = monthIndex(s.startDate, s.day);
  // Annual audit for Ltd companies (Cyprus) falls due in spring
  if (s.finance.legalForm === "ltd" && m.auditAnnual > 0 && mi === 3 && s.day > 120) book(s, -m.auditAnnual, "professional_fees", "Annual statutory audit");

  // Quarterly VAT return: quarter ends Mar/Jun/Sep/Dec; payment due on the 10th of the second month after
  if (s.finance.vatRegistered && [0, 3, 6, 9].includes(mi) && s.finance.vatOwed > 0) {
    const due = nextDate(s.startDate, s.day, (mi + 1) % 12, 10);
    s.finance.taxes.push({ id: rng.id("tax"), kind: "vat_return", amount: Math.round(s.finance.vatOwed), dueDay: due, paid: false, memo: "Quarterly VAT return" });
    s.finance.vatOwed = 0;
  }

  // Year end: compute tax on last calendar year's profit
  if (mi === 0 && s.day > 20) yearEndTax(s);
}

function yearEndTax(s: GameState) {
  const m = market(s);
  const rng = new Rng(s.rng);
  const from = s.day - 365;
  let profit = 0;
  for (const l of s.finance.ledger) {
    if (l.day <= from || NON_PL.includes(l.category) || l.category === "tax") continue;
    profit += l.amount;
  }
  const due = nextDate(s.startDate, s.day, 6, 31);
  if (profit <= 0) {
    pushEvent(s, "tax_due", "Year closed with a loss", `No income tax due this year. Losses can usually be carried forward against future profits.`);
    return;
  }
  if (s.finance.legalForm === "ltd") {
    s.finance.taxes.push({ id: rng.id("tax"), kind: "corporate_tax", amount: Math.round(profit * m.corporateTax), dueDay: due, paid: false, memo: `Corporate tax on ${fmt(s, profit)} profit` });
  } else if (s.finance.legalForm === "sole_trader") {
    const tax = progressiveTax(profit, m.incomeTax);
    s.finance.taxes.push({ id: rng.id("tax"), kind: "income_tax", amount: Math.round(tax), dueDay: due, paid: false, memo: `Income tax on ${fmt(s, profit)} business profit` });
    s.finance.taxes.push({ id: rng.id("tax"), kind: "social_insurance", amount: Math.round(profit * m.selfEmployedContrib), dueDay: due, paid: false, memo: "Self-employed social insurance & health contributions" });
  }
  pushEvent(s, "tax_due", "Your tax bill for last year is in", `Profit last year: ${fmt(s, profit)}. Taxes are due by ${dateOf(s.startDate, due).toISOString().slice(0, 10)}. Keep that cash aside.`, { attention: true });
}

export function payTaxes(s: GameState) {
  for (const t of s.finance.taxes) {
    if (t.paid || t.dueDay > s.day) continue;
    t.paid = true;
    book(s, -t.amount, t.kind === "vat_return" ? "vat_paid" : "tax", t.memo);
  }
}

export function checkVatThreshold(s: GameState) {
  const m = market(s);
  if (s.finance.vatRegistered || !isFinite(m.vatThreshold) || s.flags.vatWarned) return;
  const invoiced = s.finance.invoices.filter((i) => i.issuedDay > s.day - 365).reduce((a, i) => a + i.net, 0);
  if (invoiced > m.vatThreshold * 0.85) {
    s.flags.vatWarned = 1;
    pushEvent(s, "vat_threshold", "You're near the VAT registration threshold", `You've invoiced ${fmt(s, invoiced)} in the last 12 months. Above ${fmt(s, m.vatThreshold)} you must register for VAT and add ${Math.round(m.vatRate * 100)}% to your invoices, which makes you more expensive for clients that can't reclaim VAT.`, { attention: true });
  }
  if (invoiced > m.vatThreshold && !s.flags.vatForced) {
    s.flags.vatForced = s.day + 30;
  }
  if (s.flags.vatForced && s.day >= s.flags.vatForced && !s.finance.vatRegistered) {
    s.finance.vatRegistered = true;
    book(s, -250, "professional_fees", "Late VAT registration penalty");
    pushEvent(s, "vat_threshold", "Registered for VAT (late, with penalty)", "You passed the threshold and didn't register within 30 days.", { attention: true });
  }
}

export function registerBusiness(s: GameState, form: "sole_trader" | "ltd") {
  const m = market(s);
  if (form === "sole_trader") {
    s.situation.personalCash -= m.soleTraderSetupCost;
    s.finance.legalForm = "sole_trader";
  } else {
    s.situation.personalCash -= m.ltdSetupCost;
    s.finance.legalForm = "ltd_pending";
    s.finance.ltdReadyDay = addBusinessDays(s.startDate, s.day, m.ltdSetupDays * 5 / 7);
  }
}

export function fmt(s: GameState, n: number): string {
  const m = MARKETS[s.market];
  return `${n < 0 ? "-" : ""}${m.symbol}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
