"use client";

import { useState } from "react";
import { formatDate } from "@/engine/calendar";
import { INDUSTRIES, INDUSTRY_IDS } from "@/engine/industries";
import { MARKETS } from "@/engine/markets";
import { ROLE_LABEL } from "@/engine/team";
import type { Role, WeeklyPlan } from "@/engine/types";
import { useRun } from "@/lib/store";
import { Page, useUI } from "./Shell";
import { Button, cx, Empty, List, Money, NumberInput, Row, Section, Segmented, Stepper } from "./ui";

const PLAN_ROWS: { key: keyof Pick<WeeklyPlan, "emailHours" | "linkedinHours" | "networkingHours" | "contentHours" | "deliveryHours">; label: string; hint: string }[] = [
  { key: "emailHours", label: "Cold email", hint: "Finite list. Personalised emails convert ~3× better but take longer." },
  { key: "linkedinHours", label: "LinkedIn outreach", hint: "Max ~100 connection requests a week." },
  { key: "networkingHours", label: "Network & events", hint: "Your warm contacts first, then meetups. Best conversion early on." },
  { key: "contentHours", label: "Posting content", hint: "Slow to compound: months before the first inbound lead." },
  { key: "deliveryHours", label: "Client delivery", hint: "Building and supporting. Goes back to outreach when you have no clients." },
];

function PlanEditor() {
  const { s, act } = useRun();
  const { toast } = useUI();
  const [plan, setPlan] = useState<WeeklyPlan>(s.plan);
  const total = plan.emailHours + plan.linkedinHours + plan.networkingHours + plan.contentHours + plan.deliveryHours;
  const dirty = JSON.stringify(plan) !== JSON.stringify(s.plan);
  const toggleIndustry = (id: (typeof INDUSTRY_IDS)[number]) => setPlan({ ...plan, targetIndustries: plan.targetIndustries.includes(id) ? plan.targetIndustries.filter((x) => x !== id) : [...plan.targetIndustries, id] });

  return (
    <div className="mx-4 space-y-4 rounded-2xl border border-rule bg-sheet p-4">
      {PLAN_ROWS.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{r.label}</p>
            <p className="text-xs text-ink-3">{r.hint}</p>
          </div>
          <Stepper value={plan[r.key]} onChange={(n) => setPlan({ ...plan, [r.key]: n })} suffix="h" />
        </div>
      ))}
      <p className={cx("num text-sm", total > 55 ? "text-out" : "text-ink-2")}>
        {total}h a week{total > 55 ? ". Sustained, this burns you out." : s.situation.keepsJob ? " on top of your day job." : "."} Calls and proposals come on top.
      </p>
      <div>
        <p className="mb-1 text-sm font-medium">Outreach personalisation</p>
        <Segmented value={plan.personalization} onChange={(v) => setPlan({ ...plan, personalization: v })} options={[{ value: "low", label: "Template" }, { value: "medium", label: "Light" }, { value: "high", label: "Researched" }]} />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Target industries <span className="font-normal text-ink-3">({plan.targetIndustries.length ? `${plan.targetIndustries.length} picked` : "everyone"})</span></p>
        <div className="flex flex-wrap gap-1.5">
          {INDUSTRY_IDS.map((id) => {
            const left = s.companies.filter((c) => c.industry === id && c.status === "untouched").length;
            const on = plan.targetIndustries.includes(id);
            return (
              <button key={id} onClick={() => toggleIndustry(id)} className={cx("rounded-full border px-2.5 py-1 text-xs", on ? "border-ink bg-ink text-paper" : "border-rule text-ink-2")}>
                {INDUSTRIES[id].label} <span className="num opacity-70">{left}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-ink-3">Numbers are companies you haven&apos;t contacted yet. A narrow niche gets better replies but runs out sooner.</p>
      </div>
      <Button className="w-full" disabled={!dirty} onClick={() => toast(act("set_weekly_plan", plan as unknown as Record<string, unknown>).message)}>
        Save my week
      </Button>
    </div>
  );
}

function Team() {
  const { s, act } = useRun();
  const { openChat, toast } = useUI();
  const m = MARKETS[s.market];
  const [role, setRole] = useState<Role>("junior_dev");
  const [offers, setOffers] = useState<Record<string, number>>({});
  const staff = s.employees.filter((e) => e.status !== "left");
  const cands = s.candidates.filter((c) => c.status === "applied" || c.status === "offered");
  return (
    <>
      <Section title="Team">
        {staff.length ? (
          <List>
            {staff.map((e) => (
              <Row key={e.id}>
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-sm text-ink-2">{ROLE_LABEL[e.role]}{s.day < e.startDay ? `, starts ${formatDate(s.startDate, e.startDay)}` : ""}{e.status === "notice_incoming" ? ", leaving" : ""}</p>
                  </div>
                  <div className="text-right text-sm">
                    <Money s={s} n={e.salary} />/yr
                    {e.status === "active" && <button className="block text-xs text-out" onClick={() => toast(act("let_go", { employeeId: e.id }).message)}>Let go</button>}
                  </div>
                </div>
              </Row>
            ))}
          </List>
        ) : (
          <Empty>Just you. Hiring adds capacity but payroll comes before your own salary, every month.</Empty>
        )}
      </Section>
      <Section title="Hiring">
        <div className="mx-4 space-y-3">
          {s.jobOpen ? (
            <p className="text-sm text-ink-2">Job ad open for {ROLE_LABEL[s.jobOpen.role]} since {formatDate(s.startDate, s.jobOpen.openedDay)}.</p>
          ) : (
            <div className="flex gap-2">
              <select className="min-w-0 flex-1 rounded-xl border border-rule bg-sheet px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]} (~{m.symbol}{Math.round(m.salaries[r] / 1000)}k)</option>
                ))}
              </select>
              <Button variant="ghost" onClick={() => toast(act("open_job", { role }).message)}>Post job ad</Button>
            </div>
          )}
        </div>
        {cands.length > 0 && (
          <List className="mt-3">
            {cands.map((c) => (
              <Row key={c.id}>
                <p className="font-medium">{c.name} <span className="font-normal text-ink-3">{ROLE_LABEL[c.role]}</span></p>
                <p className="text-sm text-ink-2">{c.background}. Asking <Money s={s} n={c.salaryAsk} />/yr.</p>
                {c.status === "offered" ? (
                  <p className="mt-2 text-sm text-ink-3">Offer sent, waiting for an answer.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openChat({ kind: "interview", ref: c.id })}>Interview</Button>
                    <div className="w-32"><NumberInput value={offers[c.id] ?? c.salaryAsk} onChange={(n) => setOffers({ ...offers, [c.id]: n })} prefix={m.symbol} step={500} /></div>
                    <Button size="sm" onClick={() => toast(act("make_offer", { candidateId: c.id, salary: offers[c.id] ?? c.salaryAsk }).message)}>Offer</Button>
                    <Button size="sm" variant="quiet" onClick={() => toast(act("reject_candidate", { candidateId: c.id }).message)}>Reject</Button>
                  </div>
                )}
              </Row>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}

export function WorkScreen() {
  const { s } = useRun();
  const projects = s.projects.filter((p) => p.status === "active");
  const done = s.projects.filter((p) => p.status === "delivered").slice(-5).reverse();
  const retainers = s.retainers.filter((r) => r.status === "active");
  const name = (id: string) => s.companies.find((c) => c.id === id)?.name;
  return (
    <Page>
      <Section title="Your week" aside={`Energy ${Math.round(s.situation.energy * 100)}%`}>
        <PlanEditor key={JSON.stringify(s.plan)} />
      </Section>
      <Section title="Projects">
        {projects.length ? (
          <List>
            {projects.map((p) => {
              const pct = Math.min(100, (p.effortDone / p.effortTrue) * 100);
              const late = s.day > p.dueDay;
              return (
                <Row key={p.id} mark={late}>
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{name(p.companyId)}</p>
                    <Money s={s} n={p.price} className="text-sm" />
                  </div>
                  <p className="text-sm text-ink-2">{p.name}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-rule"><div className={cx("h-1.5 rounded-full", late ? "bg-out" : "bg-ink")} style={{ width: `${pct}%` }} /></div>
                  <p className="num mt-1 text-xs text-ink-3">
                    {Math.round(pct)}%, {Math.round(p.hoursLogged)}h of {p.estimateHours}h estimated. Due {formatDate(s.startDate, p.dueDay)}{late ? " (late)" : ""}
                  </p>
                </Row>
              );
            })}
          </List>
        ) : (
          <Empty>No client work yet. Your delivery hours go to finding clients until you win one.</Empty>
        )}
      </Section>
      {retainers.length > 0 && (
        <Section title="Maintenance clients">
          <List>
            {retainers.map((r) => (
              <Row key={r.id}>
                <div className="flex justify-between">
                  <p className="font-medium">{name(r.companyId)}</p>
                  <p className="text-sm"><Money s={s} n={r.monthly} />/mo</p>
                </div>
                <p className="text-xs text-ink-3">Run costs <Money s={s} n={r.runCost} />/mo{s.policies.passThroughRunCosts ? ", billed to client" : ", paid by you"}</p>
              </Row>
            ))}
          </List>
        </Section>
      )}
      {done.length > 0 && (
        <Section title="Delivered">
          <List>
            {done.map((p) => (
              <Row key={p.id}>
                <div className="flex justify-between">
                  <p className="font-medium">{name(p.companyId)}</p>
                  <p className="num text-sm">{Math.round(p.satisfaction * 100)}/100</p>
                </div>
                <p className="num text-xs text-ink-3">{Math.round(p.hoursLogged)}h vs {p.estimateHours}h estimated, <Money s={s} n={p.price / Math.max(1, p.hoursLogged)} />/h effective</p>
              </Row>
            ))}
          </List>
        </Section>
      )}
      <Team />
    </Page>
  );
}
