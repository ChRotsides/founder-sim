"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/engine/calendar";
import { metrics } from "@/engine/selectors";
import type { GameState } from "@/engine/types";
import { details } from "@/lib/digest";
import { postJSON, useRun } from "@/lib/store";
import { Page, useUI } from "./Shell";
import { Button, cx, money } from "./ui";

type Msg = Anthropic.MessageParam;
type ToolUse = Anthropic.ToolUseBlock;

const STATUS_PREFIX = "[status] ";

const ACTION_LABEL: Record<string, string> = {
  set_weekly_plan: "Change your weekly plan",
  set_policies: "Change policies",
  register_business: "Register the business",
  register_vat: "Register for VAT",
  buy_insurance: "Buy insurance",
  transfer_to_company: "Move savings into the company",
  schedule_call: "Book a discovery call",
  decline_lead: "Pass on a lead",
  quick_call: "Run a quick call",
  send_proposal: "Send a proposal",
  start_project: "Kick off a project",
  follow_up: "Send a follow-up",
  send_summary: "Send a follow-up summary",
  respond_counter: "Respond to a counter-offer",
  mark_lost: "Close a deal as lost",
  resolve_scope_change: "Answer a scope change",
  chase_invoice: "Chase an invoice",
  legal_letter: "Send a lawyer's letter",
  write_off_invoice: "Write off an invoice",
  open_job: "Post a job ad",
  make_offer: "Make a job offer",
  reject_candidate: "Reject a candidate",
  let_go: "Let someone go",
  apply_loan: "Apply for financing",
  quit_job: "Quit your day job",
  dismiss_event: "Dismiss an inbox item",
  advance_time: "Let time pass",
  close_business: "Close the business",
};

function statusLine(s: GameState) {
  const mt = metrics(s);
  return `${STATUS_PREFIX}Today is ${formatDate(s.startDate, s.day)}. Company cash ${money(s, s.finance.cash)}, savings ${money(s, s.situation.personalCash)}, MRR ${money(s, mt.mrr)}, ${mt.unresolved} inbox items need attention.`;
}

function describe(s: GameState, t: ToolUse): string {
  const a = t.input as Record<string, unknown>;
  const deal = typeof a.dealId === "string" ? s.deals.find((d) => d.id === a.dealId) : undefined;
  const co = deal ? s.companies.find((c) => c.id === deal.companyId)?.name : undefined;
  const parts: string[] = [];
  if (co) parts.push(co);
  for (const [k, v] of Object.entries(a)) {
    if (k === "dealId" || k === "items" || v === undefined) continue;
    if (typeof v === "number" && /price|fee|amount|salary|rate|monthly/i.test(k)) parts.push(`${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${money(s, v)}`);
    else if (Array.isArray(v)) parts.push(`${k}: ${v.join(", ") || "none"}`);
    else if (typeof v !== "object") parts.push(`${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${String(v).replace(/_/g, " ")}`);
  }
  if (Array.isArray(a.items)) parts.push(`${a.items.length} solution${a.items.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function pendingTools(msgs: Msg[]): ToolUse[] {
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant" || typeof last.content === "string") return [];
  return (last.content as Anthropic.ContentBlockParam[]).filter((b): b is ToolUse => b.type === "tool_use") as ToolUse[];
}

export function AssistantScreen() {
  const { s, act, assistant, setAssistant } = useRun();
  const { toast } = useUI();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>(assistant);
  const sRef = useRef(s);
  useEffect(() => {
    msgsRef.current = assistant;
    sRef.current = s;
  }, [assistant, s]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [assistant.length, busy]);

  const pending = pendingTools(assistant);
  const needsApproval = pending.filter((t) => t.name !== "get_details");

  async function step(msgs: Msg[]) {
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < 8; i++) {
        const r = await postJSON<{ content: Anthropic.ContentBlock[]; stop_reason: string }>("/api/assistant", { messages: msgs });
        msgs = [...msgs, { role: "assistant", content: r.content as unknown as Anthropic.ContentBlockParam[] }];
        setAssistant(msgs);
        if (r.stop_reason !== "tool_use") break;
        const uses = r.content.filter((b): b is ToolUse => b.type === "tool_use");
        if (uses.some((u) => u.name !== "get_details")) break; // wait for the founder's approval
        msgs = [...msgs, { role: "user", content: uses.map((u) => readResult(u)) }];
        setAssistant(msgs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function readResult(u: ToolUse): Anthropic.ToolResultBlockParam {
    const a = u.input as { section?: string; id?: string };
    return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(details(sRef.current, a.section ?? "overview", a.id)) };
  }

  function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    const msgs: Msg[] = [...assistant, { role: "user", content: [{ type: "text", text: statusLine(s) }, { type: "text", text: text.trim() }] }];
    setAssistant(msgs);
    step(msgs);
  }

  function decide(id: string, ok: boolean) {
    const next = { ...decisions, [id]: ok };
    setDecisions(next);
    if (!needsApproval.every((t) => t.id in next)) return;
    const results: Anthropic.ToolResultBlockParam[] = pending.map((u) => {
      if (u.name === "get_details") return readResult(u);
      if (!next[u.id]) return { type: "tool_result", tool_use_id: u.id, content: "The founder declined this action." };
      const r = act(u.name, u.input as Record<string, unknown>);
      toast(r.message);
      return { type: "tool_result", tool_use_id: u.id, content: r.message, is_error: !r.ok };
    });
    setDecisions({});
    const msgs: Msg[] = [...msgsRef.current, { role: "user", content: results }];
    setAssistant(msgs);
    step(msgs);
  }

  return (
    <Page>
      <div className="flex items-center justify-between px-4 pt-2">
        <div>
          <h1 className="display text-2xl font-semibold">Your assistant</h1>
          <p className="text-sm text-ink-2">Ask for advice, or ask it to do things. You approve every change.</p>
        </div>
        {assistant.length > 0 && <button className="text-sm text-accent" onClick={() => setAssistant([])}>New chat</button>}
      </div>

      <div className="mt-4 space-y-3 px-4">
        {assistant.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {["What should I focus on this week?", "Is my pricing right for this market?", "Go through my inbox with me", "How long until I run out of money?"].map((q) => (
              <button key={q} onClick={() => send(q)} className="rounded-full border border-rule bg-sheet px-3 py-1.5 text-sm">{q}</button>
            ))}
          </div>
        )}
        {assistant.map((m, i) => {
          const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content } as Anthropic.TextBlockParam] : (m.content as Anthropic.ContentBlockParam[]);
          return blocks.map((b, j) => {
            const key = `${i}-${j}`;
            if (b.type === "text") {
              if (b.text.startsWith(STATUS_PREFIX) || !b.text.trim()) return null;
              return (
                <div key={key} className={cx("max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[15px] leading-relaxed", m.role === "user" ? "ml-auto bg-ink text-paper" : "border border-rule bg-sheet")}>
                  {b.text.replace(/\*\*(.+?)\*\*/g, "$1")}
                </div>
              );
            }
            if (b.type === "tool_use") {
              if (b.name === "get_details") return <p key={key} className="text-xs text-ink-3">Looked at your {String((b.input as { section?: string }).section ?? "overview")}</p>;
              const isPending = i === assistant.length - 1 && !busy;
              return (
                <div key={key} className={cx("rounded-2xl border p-3", isPending ? "border-mark bg-mark-soft" : "border-rule bg-sheet")}>
                  <p className="font-medium">{ACTION_LABEL[b.name] ?? b.name}</p>
                  <p className="text-sm text-ink-2">{describe(s, b as ToolUse)}</p>
                  {isPending && (
                    <div className="mt-2 flex gap-2">
                      {b.id in decisions ? (
                        <span className="text-sm text-ink-3">{decisions[b.id] ? "Approved" : "Declined"}</span>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => decide(b.id, true)}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide(b.id, false)}>Decline</Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          });
        })}
        {busy && <p className="text-sm text-ink-3">Thinking…</p>}
        {error && <p className="text-sm text-out">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom,0px))] z-20 border-t border-rule bg-paper px-3 py-2">
        <div className="mx-auto flex max-w-xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={needsApproval.length ? "Approve or decline above first" : "Ask or tell your assistant…"}
            disabled={needsApproval.length > 0 && !busy}
            className="min-w-0 flex-1 rounded-xl border border-rule bg-sheet px-3 py-2.5 text-[15px]"
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()}>Send</Button>
        </div>
      </div>
    </Page>
  );
}
