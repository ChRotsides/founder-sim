"use client";

import { useRef, useState } from "react";
import { formatDate } from "@/engine/calendar";
import { canInvoice } from "@/engine/finance";
import { metrics } from "@/engine/selectors";
import { advanceDay } from "@/engine/sim";
import type { GameEvent } from "@/engine/types";
import { useRun } from "@/lib/store";
import { Page, useUI } from "./Shell";
import { Button, cx, Empty, List, Money, Row, Section } from "./ui";

function months(n: number) {
  if (!isFinite(n)) return "∞";
  return n >= 24 ? "24+" : n.toFixed(1);
}

function RunBar() {
  const { s, mutate } = useRun();
  const { toast } = useUI();
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  function run(maxDays: number, untilEvent: boolean) {
    if (running || s.status !== "active") return;
    setRunning(true);
    stopRef.current = false;
    let days = 0;
    const seen = new Set(s.events.map((e) => e.id));
    const tick = () => {
      let hit: GameEvent | undefined;
      const step = days > 20 ? 3 : 1; // speed up long quiet stretches
      mutate((st) => {
        for (let i = 0; i < step && days < maxDays && st.status === "active"; i++) {
          advanceDay(st);
          days++;
          hit = st.events.find((e) => !seen.has(e.id) && e.attention && !e.resolved);
          if (hit && untilEvent) break;
        }
        if (st.status !== "active") hit = st.events[st.events.length - 1];
      });
      if ((untilEvent && hit) || days >= maxDays || stopRef.current) {
        setRunning(false);
        if (untilEvent && !hit && days >= maxDays) toast(`${days} quiet days passed. Nothing needed you.`);
        return;
      }
      setTimeout(tick, 30);
    };
    tick();
  }

  if (s.status !== "active") return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom,0px))] z-20 px-3 pb-2">
      <div className="mx-auto flex max-w-xl gap-2">
        <button
          onClick={() => (running ? (stopRef.current = true) : run(120, true))}
          className={cx("flex-1 rounded-2xl px-4 py-4 text-left shadow-[0_6px_20px_-8px_rgba(20,33,61,0.5)] transition-colors", running ? "bg-mark text-ink" : "bg-ink text-paper")}
        >
          <span className="display block text-lg font-semibold leading-tight">{running ? "Stop" : "Run until something happens"}</span>
          <span className="block text-xs opacity-75">{running ? "Days are passing…" : "Time passes until a client, the bank or your team needs you"}</span>
        </button>
        <div className="flex flex-col gap-2">
          <button disabled={running} onClick={() => run(1, false)} className="flex-1 rounded-xl border border-rule bg-sheet px-3 text-sm disabled:opacity-40">+1 day</button>
          <button disabled={running} onClick={() => run(7, false)} className="flex-1 rounded-xl border border-rule bg-sheet px-3 text-sm disabled:opacity-40">+1 week</button>
        </div>
      </div>
    </div>
  );
}

export function EventActions({ e }: { e: GameEvent }) {
  const { s, act } = useRun();
  const { openDeal, openChat, setTab, openMore, toast } = useUI();
  const run = (name: string, args: Record<string, unknown>) => {
    const r = act(name, args);
    toast(r.message);
  };
  const dismiss = () => run("dismiss_event", { eventId: e.id });
  const dealId = e.ref?.dealId;
  const d = dealId ? s.deals.find((x) => x.id === dealId) : undefined;
  const btns: React.ReactNode[] = [];
  const B = (label: string, onClick: () => void, variant: "primary" | "ghost" = "ghost") => (
    <Button key={label} size="sm" variant={variant} onClick={onClick}>
      {label}
    </Button>
  );

  switch (e.kind) {
    case "reply_positive":
    case "warm_intro":
    case "inbound_lead":
    case "referral":
      if (d?.stage === "lead") btns.push(B("Book discovery call", () => run("schedule_call", { dealId }), "primary"), B("Pass", () => run("decline_lead", { dealId })));
      break;
    case "call_today":
      if (d?.stage === "call_scheduled") btns.push(B("Take the call live", () => openChat({ kind: "discovery", ref: d.id }), "primary"), B("Quick call", () => run("quick_call", { dealId })));
      break;
    case "proposal_response":
      if (d?.proposal?.status === "accepted" && d.stage !== "won") {
        if (canInvoice(s)) btns.push(B("Kick off project", () => run("start_project", { dealId }), "primary"));
        else btns.push(B("Register to invoice first", () => setTab("money"), "primary"));
      } else if (d?.proposal?.status === "countered") {
        btns.push(B("Negotiate live", () => openChat({ kind: "negotiation", ref: d.id }), "primary"), B("Accept their price", () => run("respond_counter", { dealId, choice: "accept" })), B("Split the difference", () => run("respond_counter", { dealId, choice: "split" })), B("Hold my price", () => run("respond_counter", { dealId, choice: "hold" })));
      }
      break;
    case "proposal_ghosted":
      if (d?.proposal?.status === "ghosted") btns.push(B("Send a follow-up", () => run("follow_up", { dealId }), "primary"), B("Mark lost", () => run("mark_lost", { dealId })));
      break;
    case "scope_change":
      if (e.ref?.projectId && s.flags[`scope_${e.ref.projectId}`] !== undefined)
        btns.push(B("Absorb it", () => run("resolve_scope_change", { projectId: e.ref!.projectId, choice: "absorb" })), B("Send change order", () => run("resolve_scope_change", { projectId: e.ref!.projectId, choice: "change_order" }), "primary"), B("Decline", () => run("resolve_scope_change", { projectId: e.ref!.projectId, choice: "decline" })));
      break;
    case "invoice_overdue": {
      const inv = s.finance.invoices.find((x) => x.id === e.ref?.invoiceId);
      if (inv?.status === "open") btns.push(B("Chase", () => run("chase_invoice", { invoiceId: inv.id }), "primary"), B("Lawyer's letter", () => run("legal_letter", { invoiceId: inv.id })), B("Write off", () => run("write_off_invoice", { invoiceId: inv.id })));
      break;
    }
    case "candidate_applied":
      btns.push(B("Review candidates", () => { dismiss(); setTab("work"); }, "primary"));
      break;
    case "vat_threshold":
      if (!s.finance.vatRegistered) btns.push(B("Register for VAT", () => run("register_vat", {}), "primary"));
      break;
    case "list_exhausted":
      btns.push(B("Change targeting", () => { dismiss(); setTab("work"); }, "primary"));
      break;
    case "month_report":
      btns.push(B("Ask my mentor", () => { dismiss(); openMore("mentor"); }));
      break;
    case "cash_warning":
    case "personal_cash_warning":
      btns.push(B("Ask my assistant", () => { dismiss(); setTab("assistant"); }));
      break;
    case "game_over":
      btns.push(B("Post-mortem", () => openMore("mentor"), "primary"));
      break;
  }
  if (dealId && d) btns.push(B("Open", () => openDeal(d.id)));
  if (e.kind !== "game_over") btns.push(B(btns.length ? "Later" : "OK", dismiss));
  return <div className="mt-3 flex flex-wrap gap-2">{btns}</div>;
}

export function TodayScreen() {
  const { s } = useRun();
  const { setTab } = useUI();
  const mt = metrics(s);
  const inbox = s.events.filter((e) => e.attention && !e.resolved).sort((a, b) => b.day - a.day);
  const recent = s.events.filter((e) => !e.attention).slice(-12).reverse();
  const first = s.day === 0 && s.finance.legalForm === "none";

  return (
    <Page>
      {s.status === "game_over" && (
        <div className="mx-4 mt-4 rounded-2xl bg-out/10 p-4">
          <p className="display text-xl font-semibold text-out">Game over</p>
          <p className="mt-1 text-sm">{s.gameOver?.reason}</p>
        </div>
      )}

      <div className="mx-4 mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule bg-rule">
        <div className="bg-sheet p-3">
          <p className="text-xs text-ink-3">You can live on savings for</p>
          <p className={cx("display num text-2xl font-semibold", mt.personalRunwayMonths < 3 && "text-out")}>{months(mt.personalRunwayMonths)} <span className="text-sm font-normal text-ink-2">months</span></p>
        </div>
        <div className="bg-sheet p-3">
          <p className="text-xs text-ink-3">Recurring revenue</p>
          <p className="display num text-2xl font-semibold">
            <Money s={s} n={mt.mrr} />
            <span className="text-sm font-normal text-ink-2">/mo</span>
          </p>
        </div>
        <div className="bg-sheet p-3">
          <p className="text-xs text-ink-3">Owed to you</p>
          <p className="num font-semibold"><Money s={s} n={mt.receivables} />{mt.overdue > 0 && <span className="ml-1 text-xs text-out">(<Money s={s} n={mt.overdue} /> late)</span>}</p>
        </div>
        <div className="bg-sheet p-3">
          <p className="text-xs text-ink-3">Proposals out</p>
          <p className="num font-semibold"><Money s={s} n={mt.pipelineValue} /></p>
        </div>
      </div>

      {first && (
        <div className="mx-4 mt-4 rounded-2xl border border-rule bg-sheet p-4 text-sm">
          <p className="display text-lg font-semibold">Day one</p>
          <p className="mt-1 text-ink-2">You have no company, no clients and no reputation yet. Your weekly plan already has you doing outreach. Check it in Work, then press run. You&apos;ll need to register the business (Money) before you can invoice anyone.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setTab("work")}>Review my week</Button>
            <Button size="sm" variant="ghost" onClick={() => setTab("assistant")}>Ask my assistant</Button>
          </div>
        </div>
      )}

      <Section title="Needs you" aside={inbox.length ? `${inbox.length}` : undefined}>
        {inbox.length === 0 ? (
          <Empty>Nothing needs you right now. Press run and the week goes on.</Empty>
        ) : (
          <List>
            {inbox.map((e) => (
              <Row key={e.id} mark>
                <p className="text-xs text-ink-3">{formatDate(s.startDate, e.day)}</p>
                <p className="font-medium leading-snug">{e.title}</p>
                <p className="mt-1 text-sm text-ink-2">{e.body}</p>
                <EventActions e={e} />
              </Row>
            ))}
          </List>
        )}
      </Section>

      {recent.length > 0 && (
        <Section title="Meanwhile">
          <List>
            {recent.map((e) => (
              <Row key={e.id}>
                <p className="text-xs text-ink-3">{formatDate(s.startDate, e.day)}</p>
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-sm text-ink-2">{e.body}</p>
              </Row>
            ))}
          </List>
        </Section>
      )}
      <RunBar />
    </Page>
  );
}
