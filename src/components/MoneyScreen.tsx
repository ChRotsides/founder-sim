"use client";

import { useState } from "react";
import { formatDate } from "@/engine/calendar";
import { LOAN_TERMS } from "@/engine/finance";
import { MARKETS } from "@/engine/markets";
import { metrics } from "@/engine/selectors";
import type { LoanKind } from "@/engine/types";
import { useRun } from "@/lib/store";
import { Page, useUI } from "./Shell";
import { Button, cx, Empty, List, money, Money, NumberInput, Row, Section } from "./ui";

function Setup() {
  const { s, act } = useRun();
  const { toast } = useUI();
  const m = MARKETS[s.market];
  const f = s.finance;
  const run = (n: string, a: Record<string, unknown> = {}) => toast(act(n, a).message);
  if (f.legalForm === "none") {
    return (
      <div className="mx-4 space-y-3 rounded-2xl border border-mark bg-sheet p-4">
        <p className="font-medium">You can&apos;t invoice anyone until you register.</p>
        <div className="space-y-2 text-sm text-ink-2">
          <p><strong className="text-ink">Sole trader</strong> ({m.symbol}{m.soleTraderSetupCost}): ready today, cheap to run. You are the business: its debts are your debts, and profit is taxed as your income.</p>
          <p><strong className="text-ink">Limited company</strong> ({m.symbol}{m.ltdSetupCost.toLocaleString()}, ~{m.ltdSetupDays} days): limited liability and {Math.round(m.corporateTax * 100)}% corporate tax, but an accountant{m.auditAnnual ? `, a yearly audit (~${m.symbol}${m.auditAnnual.toLocaleString()})` : ""} and more admin. Clients and banks take it more seriously.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => run("register_business", { form: "sole_trader" })}>Register as sole trader</Button>
          <Button className="flex-1" onClick={() => run("register_business", { form: "ltd" })}>Start a Ltd</Button>
        </div>
      </div>
    );
  }
  return (
    <List>
      <Row>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{f.legalForm === "ltd" ? "Limited company" : f.legalForm === "ltd_pending" ? `Ltd being registered (ready ${formatDate(s.startDate, f.ltdReadyDay!)})` : "Sole trader"}</p>
            <p className="text-sm text-ink-2">{f.vatRegistered ? `VAT registered (${Math.round(m.vatRate * 100)}%)` : isFinite(m.vatThreshold) ? `Not VAT registered (mandatory above ${money(s, m.vatThreshold)}/yr)` : "No VAT in this market"}</p>
          </div>
          {f.legalForm === "sole_trader" && <Button size="sm" variant="ghost" onClick={() => run("register_business", { form: "ltd" })}>Incorporate</Button>}
        </div>
      </Row>
      <Row>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{f.insurance ? "Professional indemnity insured" : "No professional indemnity insurance. One unhappy client could sue you."}</p>
          {!f.insurance && <Button size="sm" variant="ghost" onClick={() => run("buy_insurance")}>Buy ({money(s, m.insuranceAnnual)}/yr)</Button>}
        </div>
      </Row>
      {!f.vatRegistered && isFinite(m.vatThreshold) && (
        <Row>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-2">Register for VAT voluntarily</p>
            <Button size="sm" variant="quiet" onClick={() => run("register_vat")}>Register</Button>
          </div>
        </Row>
      )}
    </List>
  );
}

function Transfers() {
  const { s, act } = useRun();
  const { toast } = useUI();
  const m = MARKETS[s.market];
  const [amount, setAmount] = useState(2000);
  const [salary, setSalary] = useState(s.policies.founderSalaryMonthly);
  if (s.finance.legalForm === "none") return null;
  return (
    <Section title="You and the company">
      <div className="mx-4 space-y-4 rounded-2xl border border-rule bg-sheet p-4">
        <div>
          <p className="mb-1 text-sm font-medium">Move savings into the company</p>
          <div className="flex gap-2">
            <div className="flex-1"><NumberInput value={amount} onChange={setAmount} prefix={m.symbol} step={500} /></div>
            <Button variant="ghost" onClick={() => toast(act("transfer_to_company", { amount }).message)}>Transfer</Button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">{s.finance.legalForm === "ltd" ? "Your monthly gross salary" : "Monthly drawings for yourself"}</p>
          <div className="flex gap-2">
            <div className="flex-1"><NumberInput value={salary} onChange={setSalary} prefix={m.symbol} step={100} /></div>
            <Button variant="ghost" disabled={salary === s.policies.founderSalaryMonthly} onClick={() => toast(act("set_policies", { founderSalaryMonthly: salary }).message)}>Set</Button>
          </div>
          <p className="mt-1 text-xs text-ink-3">{s.finance.legalForm === "ltd" ? `The company also pays ${Math.round(m.employerContrib * 100)}% employer contributions; you receive it after income tax and social insurance.` : "Drawings aren't a cost; you're taxed on the business's profit at year end."}</p>
        </div>
      </div>
    </Section>
  );
}

function Loans() {
  const { s, act } = useRun();
  const { toast } = useUI();
  const m = MARKETS[s.market];
  const [kind, setKind] = useState<LoanKind>("credit_card");
  const [amount, setAmount] = useState(5000);
  return (
    <Section title="Financing">
      {s.finance.loans.length > 0 && (
        <List className="mb-3">
          {s.finance.loans.map((l) => (
            <Row key={l.id}>
              <div className="flex justify-between gap-2">
                <p className="font-medium">{LOAN_TERMS[l.kind].label}</p>
                <p className={cx("text-sm", l.status === "rejected" && "text-out", l.status === "active" && "text-in")}>{l.status}</p>
              </div>
              <p className="num text-sm text-ink-2">
                <Money s={s} n={l.principal} />
                {l.status === "active" && l.monthlyPayment > 0 && <>, balance <Money s={s} n={l.balance} />, <Money s={s} n={l.monthlyPayment} />/mo at {(l.annualRate * 100).toFixed(1)}%</>}
                {l.status === "pending" && <>, decision around {formatDate(s.startDate, l.decisionDay)}</>}
              </p>
              {l.decisionReason && <p className="text-xs text-ink-3">{l.decisionReason}</p>}
            </Row>
          ))}
        </List>
      )}
      <div className="mx-4 space-y-2 rounded-2xl border border-rule bg-sheet p-4">
        <select className="w-full rounded-xl border border-rule bg-sheet px-3 py-2.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as LoanKind)}>
          {(Object.keys(LOAN_TERMS) as LoanKind[]).map((k) => (
            <option key={k} value={k}>{LOAN_TERMS[k].label} (up to {m.symbol}{LOAN_TERMS[k].max.toLocaleString()})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <div className="flex-1"><NumberInput value={amount} onChange={setAmount} prefix={m.symbol} step={1000} /></div>
          <Button variant="ghost" onClick={() => toast(act("apply_loan", { kind, amount }).message)}>Apply</Button>
        </div>
        <p className="text-xs text-ink-3">Banks want trading history and collateral. Cards are easy but cost ~19%. Grants are slow and rarely approved.</p>
      </div>
    </Section>
  );
}

export function MoneyScreen() {
  const { s, act } = useRun();
  const { toast } = useUI();
  const mt = metrics(s);
  const open = s.finance.invoices.filter((i) => i.status === "open").sort((a, b) => a.dueDay - b.dueDay);
  const taxes = s.finance.taxes.filter((t) => !t.paid);
  const months = s.months.slice(-6).reverse();
  const ledger = s.finance.ledger.slice(-25).reverse();
  const name = (id: string) => s.companies.find((c) => c.id === id)?.name ?? "Client";

  return (
    <Page>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-rule bg-sheet p-3">
          <p className="text-xs text-ink-3">Company account</p>
          <p className={cx("display num text-2xl font-semibold", s.finance.cash < 0 && "text-out")}><Money s={s} n={s.finance.cash} /></p>
          <p className="num text-xs text-ink-3">{isFinite(mt.companyRunwayMonths) ? `${mt.companyRunwayMonths.toFixed(1)} months at current burn` : "Not burning cash"}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-sheet p-3">
          <p className="text-xs text-ink-3">Your savings</p>
          <p className={cx("display num text-2xl font-semibold", s.situation.personalCash < s.situation.monthlyLiving * 2 && "text-out")}><Money s={s} n={s.situation.personalCash} /></p>
          <p className="num text-xs text-ink-3">−<Money s={s} n={mt.personalBurn} />/mo net living costs</p>
        </div>
      </div>
      {mt.taxesDue > 0 && <p className="num mx-4 mt-3 rounded-xl bg-mark-soft px-3 py-2 text-sm">Set aside for tax: <Money s={s} n={mt.taxesDue} />. Part of your balance isn&apos;t really yours.</p>}

      <Section title="Business setup"><Setup /></Section>
      <Transfers />

      <Section title="Invoices" aside={open.length ? <Money s={s} n={mt.receivables} /> : undefined}>
        {open.length ? (
          <List>
            {open.map((i) => {
              const late = s.day > i.dueDay;
              return (
                <Row key={i.id} mark={late}>
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{name(i.companyId)}</p>
                    <Money s={s} n={i.net + i.vat} className="text-sm font-medium" />
                  </div>
                  <p className="text-sm text-ink-2">{i.memo}</p>
                  <p className={cx("num text-xs", late ? "text-out" : "text-ink-3")}>Due {formatDate(s.startDate, i.dueDay)}{late ? `, ${s.day - i.dueDay} days late` : ""}</p>
                  {late && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => toast(act("chase_invoice", { invoiceId: i.id }).message)}>Chase</Button>
                      <Button size="sm" variant="quiet" onClick={() => toast(act("legal_letter", { invoiceId: i.id }).message)}>Lawyer&apos;s letter</Button>
                    </div>
                  )}
                </Row>
              );
            })}
          </List>
        ) : (
          <Empty>No open invoices.</Empty>
        )}
      </Section>

      {taxes.length > 0 && (
        <Section title="Taxes due">
          <List>
            {taxes.map((t) => (
              <Row key={t.id}>
                <div className="flex justify-between"><p className="text-sm">{t.memo}</p><Money s={s} n={t.amount} className="text-sm" /></div>
                <p className="text-xs text-ink-3">Due {formatDate(s.startDate, t.dueDay)}</p>
              </Row>
            ))}
          </List>
        </Section>
      )}

      <Section title="Month by month">
        {months.length ? (
          <div className="mx-4 overflow-x-auto rounded-2xl border border-rule bg-sheet">
            <table className="num w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr><th className="px-3 py-2 font-normal">Month</th><th className="px-2 font-normal">In</th><th className="px-2 font-normal">Out</th><th className="px-2 font-normal">Profit</th><th className="px-3 font-normal">Savings</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {months.map((m) => (
                  <tr key={m.month}>
                    <td className="px-3 py-2">{m.month}</td>
                    <td className="px-2 text-in">{money(s, m.revenue)}</td>
                    <td className="px-2 text-out">{money(s, m.costs)}</td>
                    <td className={cx("px-2 font-medium", m.profit < 0 && "text-out")}>{money(s, m.profit)}</td>
                    <td className="px-3">{money(s, m.personalCash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Your first month&apos;s figures appear on the 1st.</Empty>
        )}
        <p className="mx-4 mt-2 text-xs text-ink-3">Cash basis: revenue counts when clients actually pay.</p>
      </Section>

      <Loans />

      {ledger.length > 0 && (
        <Section title="Bank statement">
          <List>
            {ledger.map((l, i) => (
              <Row key={i} className="py-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{l.memo}</span>
                  <Money s={s} n={l.amount} sign />
                </div>
                <p className="text-xs text-ink-3">{formatDate(s.startDate, l.day)}</p>
              </Row>
            ))}
          </List>
        </Section>
      )}
    </Page>
  );
}
