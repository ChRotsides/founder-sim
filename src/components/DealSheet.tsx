"use client";

import { useMemo, useState } from "react";
import { ARCHETYPES } from "@/engine/calibration";
import { formatDate } from "@/engine/calendar";
import { canInvoice, market } from "@/engine/finance";
import { INDUSTRIES } from "@/engine/industries";
import { founderEstimate, marketRange, sourceLabel } from "@/engine/sales";
import type { Archetype, Deal, GameState } from "@/engine/types";
import { knownPains } from "@/lib/digest";
import { useRun } from "@/lib/store";
import { STAGE_LABEL } from "./PipelineScreen";
import { useUI } from "./Shell";
import { Button, cx, Field, inputCls, money, NumberInput, Pill, Sheet } from "./ui";

const ARCH_IDS = Object.keys(ARCHETYPES) as Archetype[];

function ProposalBuilder({ s, d, onDone }: { s: GameState; d: Deal; onDone: () => void }) {
  const { act } = useRun();
  const { toast } = useUI();
  const pains = knownPains(s, d);
  const [picked, setPicked] = useState<Record<string, Archetype | null>>(() => Object.fromEntries(pains.map((p) => [p.id, null])));
  const items = Object.entries(picked).filter(([, a]) => a).map(([painId, archetype]) => ({ painId, archetype: archetype! }));
  const est = useMemo(() => items.reduce((a, it) => a + founderEstimate(s, it.painId, it.archetype), 0), [items, s]);
  const rate = s.policies.hourlyRate;
  const [buildPrice, setBuildPrice] = useState<number | null>(null);
  const [workshop, setWorkshop] = useState(0);
  const [retainer, setRetainer] = useState(0);
  const [upfront, setUpfront] = useState(s.policies.defaultUpfrontPct);
  const [netDays, setNetDays] = useState(s.policies.netDays);
  const [weeks, setWeeks] = useState<number | null>(null);
  const price = buildPrice ?? Math.round((est * rate) / 100) * 100;
  const deliveryPerWeek = Math.max(4, s.plan.deliveryHours * 0.8);
  const timeline = weeks ?? Math.max(2, Math.ceil(est / deliveryPerWeek));
  const yearOne = workshop + price + retainer * 12;
  const vat = s.finance.vatRegistered ? market(s).vatRate : 0;
  const knownCost = items.reduce((acc, it) => acc + (pains.find((p) => p.id === it.painId)?.estimatedAnnualCost ?? 0), 0);
  const allQuantified = items.every((it) => pains.find((p) => p.id === it.painId)?.quantified);

  function send() {
    const r = act("send_proposal", { dealId: d.id, items, workshopFee: workshop, buildPrice: price, retainerMonthly: retainer, upfrontPct: upfront, netDays, timelineWeeks: timeline });
    toast(r.message);
    if (r.ok) onDone();
  }

  return (
    <div className="space-y-4 px-4">
      <p className="text-sm text-ink-2">Pick which problems you&apos;ll solve and how. You can only propose against problems you actually uncovered on your calls.</p>
      {pains.map((p) => (
        <div key={p.id} className="rounded-2xl border border-rule bg-sheet p-3">
          <p className="font-medium">{p.title}</p>
          <p className="text-sm text-ink-2">{p.whatYouLearned}</p>
          {p.quantified ? (
            <p className="num mt-1 text-sm">About {p.hoursPerWeek}h/week, roughly {money(s, p.estimatedAnnualCost!)} a year</p>
          ) : (
            <p className="mt-1 text-sm text-ink-3">You didn&apos;t pin down what this costs them. They&apos;ll value a fix less.</p>
          )}
          <select className={cx(inputCls, "mt-2")} value={picked[p.id] ?? ""} onChange={(e) => setPicked({ ...picked, [p.id]: (e.target.value || null) as Archetype | null })}>
            <option value="">Don&apos;t include</option>
            {ARCH_IDS.map((a) => (
              <option key={a} value={a}>{ARCHETYPES[a].label}</option>
            ))}
          </select>
          {picked[p.id] && (
            <p className="num mt-1 text-xs text-ink-3">
              Your estimate {founderEstimate(s, p.id, picked[p.id]!)}h. Typical market price {money(s, marketRange(s, picked[p.id]!)[0])}–{money(s, marketRange(s, picked[p.id]!)[1])}
            </p>
          )}
        </div>
      ))}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Build price" hint={`${est}h × your ${money(s, rate)}/h = ${money(s, est * rate)}`}>
              <NumberInput value={price} onChange={setBuildPrice} prefix={market(s).symbol} step={100} />
            </Field>
            <Field label="Paid workshop" hint="Optional paid discovery first">
              <NumberInput value={workshop} onChange={setWorkshop} prefix={market(s).symbol} step={100} />
            </Field>
            <Field label="Maintenance /month" hint="Recurring revenue">
              <NumberInput value={retainer} onChange={setRetainer} prefix={market(s).symbol} step={50} />
            </Field>
            <Field label="Timeline" hint={`At ~${Math.round(deliveryPerWeek)}h/week delivery`}>
              <NumberInput value={timeline} onChange={setWeeks} suffix="weeks" min={1} />
            </Field>
            <Field label="Upfront">
              <NumberInput value={upfront} onChange={setUpfront} suffix="%" step={10} />
            </Field>
            <Field label="Payment terms">
              <NumberInput value={netDays} onChange={setNetDays} suffix="days" step={15} />
            </Field>
          </div>
          <div className="num rounded-2xl bg-mark-soft p-3 text-sm">
            <p>First-year cost to the client: <strong>{money(s, yearOne)}</strong>{vat > 0 && ` + ${Math.round(vat * 100)}% VAT`}</p>
            {knownCost > 0 && (
              <p>
                {allQuantified ? "They" : "For what you quantified, they"} lose about {money(s, knownCost)} a year to this. Even if you removed all of it, they&apos;d earn back {money(s, workshop + price)} in {Math.round(((workshop + price) / knownCost) * 12)} months{(workshop + price) / knownCost > 1.5 ? ". That's a hard sell." : "."}
              </p>
            )}
            <p className="text-ink-2">If your estimate holds you earn {money(s, est ? (price / est) : 0)}/h on the build. Most projects run 20–30% over.</p>
          </div>
          <Button className="w-full" onClick={send}>Send proposal to {s.companies.find((c) => c.id === d.companyId)!.contact.name.split(" ")[0]}</Button>
        </>
      )}
    </div>
  );
}

export function DealSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { s, act } = useRun();
  const { openChat, toast, setTab } = useUI();
  const [building, setBuilding] = useState(false);
  const d = id ? s.deals.find((x) => x.id === id) : undefined;
  if (!d) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const c = s.companies.find((x) => x.id === d.companyId)!;
  const pains = knownPains(s, d);
  const p = d.proposal;
  const run = (name: string, args: Record<string, unknown> = {}) => toast(act(name, { dealId: d.id, ...args }).message);
  const close = () => {
    setBuilding(false);
    onClose();
  };

  return (
    <Sheet open onClose={close} title={c.name} full>
      {building ? (
        <ProposalBuilder s={s} d={d} onDone={() => setBuilding(false)} />
      ) : (
        <div className="space-y-5 px-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={d.stage === "won" ? "in" : d.stage === "lost" ? "out" : "neutral"}>{STAGE_LABEL[d.stage]}</Pill>
              <span className="text-sm text-ink-3">via {sourceLabel(d.source)}, {formatDate(s.startDate, d.createdDay)}</span>
            </div>
            <p className="mt-2 text-sm">
              {c.contact.name}, {c.contact.role}. A {c.employees}-person {INDUSTRIES[c.industry].label.toLowerCase()} in {c.city}.
            </p>
            {d.lostReason && <p className="mt-2 text-sm text-out">{d.lostReason}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {d.stage === "lead" && <Button onClick={() => run("schedule_call")}>Book discovery call</Button>}
            {d.stage === "call_scheduled" && ((d.callDay ?? Infinity) <= s.day ? (
              <>
                <Button onClick={() => { close(); openChat({ kind: "discovery", ref: d.id }); }}>Take the call live</Button>
                <Button variant="ghost" onClick={() => run("quick_call")}>Quick call</Button>
              </>
            ) : (
              <p className="text-sm text-ink-2">Call booked for {formatDate(s.startDate, d.callDay!, { weekday: "long", day: "numeric", month: "short" })}.</p>
            ))}
            {["proposal_requested", "nurture"].includes(d.stage) && pains.length > 0 && <Button onClick={() => setBuilding(true)}>Write proposal</Button>}
            {d.stage === "nurture" && d.calls.length > 0 && s.flags[`summary_${d.id}`] === undefined && <Button onClick={() => run("send_summary")}>Send a follow-up summary</Button>}
            {d.stage === "nurture" && <Button variant="ghost" onClick={() => { close(); openChat({ kind: "discovery", ref: d.id }); }}>Call them again</Button>}
            {p?.status === "ghosted" && <Button onClick={() => run("follow_up")}>Send a follow-up</Button>}
            {p?.status === "countered" && <Button onClick={() => { close(); openChat({ kind: "negotiation", ref: d.id }); }}>Negotiate live</Button>}
            {p?.status === "accepted" && d.stage !== "won" && (canInvoice(s) ? <Button onClick={() => run("start_project")}>Kick off project</Button> : <Button onClick={() => { close(); setTab("money"); }}>Register to invoice first</Button>)}
            {!["won", "lost"].includes(d.stage) && <Button variant="danger" size="sm" onClick={() => run("mark_lost")}>Close as lost</Button>}
          </div>

          <div>
            <h3 className="display font-semibold">What you know</h3>
            {pains.length ? (
              <ul className="mt-2 space-y-2">
                {pains.map((x) => (
                  <li key={x.id} className="rounded-xl border border-rule bg-sheet p-3 text-sm">
                    <p className="font-medium">{x.title}</p>
                    <p className="text-ink-2">{x.whatYouLearned}</p>
                    {x.quantified && <p className="num mt-1">≈{x.hoursPerWeek}h/week, ≈{money(s, x.estimatedAnnualCost!)}/year</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-2">Nothing concrete yet. You find their real problems on a discovery call.</p>
            )}
          </div>

          {p && (
            <div className="text-sm">
              <h3 className="display font-semibold">Proposal</h3>
              <p className="num mt-1">
                {p.items.map((it) => ARCHETYPES[it.archetype].label).join(" + ")}: build {money(s, p.buildPrice)}
                {p.workshopFee > 0 && `, workshop ${money(s, p.workshopFee)}`}
                {p.retainerMonthly > 0 && `, ${money(s, p.retainerMonthly)}/month`}. {p.timelineWeeks} weeks, {p.upfrontPct}% upfront. Sent {formatDate(s.startDate, p.submittedDay)}.
              </p>
              {p.counterPrice && p.status === "countered" && <p className="mt-1">They offered {money(s, p.counterPrice)} for the build.</p>}
            </div>
          )}

          {d.calls.length > 0 && (
            <div>
              <h3 className="display font-semibold">Calls</h3>
              {d.calls.map((call, i) => (
                <div key={i} className="mt-2 rounded-xl border border-rule bg-sheet p-3 text-sm">
                  <p className="text-ink-3">
                    {formatDate(s.startDate, call.day)}, {call.mode === "live" ? "live call" : "quick call"}. Next step: {call.nextStep.replace(/_/g, " ")}
                  </p>
                  {call.coaching.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {call.coaching.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
