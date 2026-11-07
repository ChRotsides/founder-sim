"use client";

import { useEffect, useRef, useState } from "react";
import { applyLiveCall, applyNegotiation } from "@/engine/actions";
import type { CallRecord, ChatSession } from "@/engine/types";
import { discoveryContext, interviewContext, negotiationContext } from "@/lib/npc-context";
import type { NpcContext } from "@/lib/prompts";
import { postJSON, useRun } from "@/lib/store";
import { useUI } from "./Shell";
import { Button, cx, Sheet } from "./ui";

export interface ChatTarget {
  kind: ChatSession["kind"];
  ref: string;
}

interface DiscoveryAssessment {
  discoveredPainIds: string[];
  quantifiedPainIds: string[];
  nextStep: CallRecord["nextStep"];
  trustDelta: number;
  coaching: string[];
  summary: string;
}

interface NegotiationAssessment {
  agreed: boolean;
  agreedBuildPrice: number | null;
  coaching: string[];
  summary: string;
}

const OPENERS: Record<ChatSession["kind"], string> = {
  discovery: "You're on the call. Start the conversation. Good discovery is mostly asking about their business and listening.",
  negotiation: "They're on the line to talk about price. Decide what you'll trade before you concede anything.",
  interview: "The candidate is on the call. Find out what they can actually do.",
};

export function ChatSheet({ target, onClose }: { target: ChatTarget | null; onClose: () => void }) {
  const { s, mutate } = useRun();
  const { toast } = useUI();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; coaching: string[]; outcome: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const session = target ? s.chats.find((c) => c.kind === target.kind && c.ref === target.ref && c.open) : undefined;

  useEffect(() => {
    if (!target || session || result) return;
    mutate((st) => {
      st.chats.push({ id: `chat_${st.day}_${target.ref}`, kind: target.kind, ref: target.ref, messages: [], open: true });
    });
  }, [target, session, mutate, result]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [session?.messages.length, busy]);

  if (!target) return null;

  function context(): NpcContext | null {
    if (!target) return null;
    if (target.kind === "interview") {
      const cand = s.candidates.find((c) => c.id === target.ref);
      return cand ? interviewContext(s, cand) : null;
    }
    const d = s.deals.find((x) => x.id === target.ref);
    if (!d) return null;
    return target.kind === "discovery" ? discoveryContext(s, d) : negotiationContext(s, d);
  }

  const who = (() => {
    if (target.kind === "interview") return s.candidates.find((c) => c.id === target.ref)?.name ?? "Candidate";
    const d = s.deals.find((x) => x.id === target.ref);
    const c = d && s.companies.find((x) => x.id === d.companyId);
    return c ? `${c.contact.name}, ${c.name}` : "Client";
  })();

  async function send() {
    const text = input.trim();
    const ctx = context();
    if (!text || !session || !ctx || busy) return;
    setInput("");
    setError(null);
    const msgs = [...session.messages, { role: "founder" as const, text }];
    mutate((st) => {
      st.chats.find((c) => c.id === session.id)!.messages = msgs;
    });
    setBusy(true);
    try {
      const r = await postJSON<{ text: string }>("/api/npc", { context: ctx, messages: msgs });
      mutate((st) => {
        st.chats.find((c) => c.id === session.id)!.messages.push({ role: "npc", text: r.text });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    const ctx = context();
    if (!session || !ctx) return;
    if (target!.kind === "interview" || session.messages.length < 2) {
      mutate((st) => {
        st.chats.find((c) => c.id === session.id)!.open = false;
      });
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (ctx.kind === "discovery") {
        const a = await postJSON<DiscoveryAssessment>("/api/assess", { context: ctx, messages: session.messages });
        const call: CallRecord = { day: s.day, mode: "live", transcript: session.messages, discoveredPainIds: a.discoveredPainIds, quantifiedPainIds: a.quantifiedPainIds, trustDelta: a.trustDelta, nextStep: a.nextStep, coaching: a.coaching };
        mutate((st) => {
          applyLiveCall(st, target!.ref, call);
          st.chats.find((c) => c.id === session.id)!.open = false;
        });
        setResult({ summary: a.summary, coaching: a.coaching, outcome: `Next step: ${a.nextStep.replace(/_/g, " ")}. You uncovered ${a.discoveredPainIds.length} real problem${a.discoveredPainIds.length === 1 ? "" : "s"}${a.quantifiedPainIds.length ? `, ${a.quantifiedPainIds.length} with numbers` : ""}.` });
      } else if (ctx.kind === "negotiation") {
        const a = await postJSON<NegotiationAssessment>("/api/assess", { context: ctx, messages: session.messages });
        let outcome = "";
        mutate((st) => {
          outcome = applyNegotiation(st, target!.ref, a.agreed ? a.agreedBuildPrice : null);
          st.chats.find((c) => c.id === session.id)!.open = false;
        });
        setResult({ summary: a.summary, coaching: a.coaching, outcome });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Sheet open onClose={close} title={who} full>
      {result ? (
        <div className="space-y-4 px-4">
          <p className="display text-lg font-semibold">{result.outcome}</p>
          <p className="text-sm text-ink-2">{result.summary}</p>
          <div>
            <p className="font-medium">Coaching</p>
            <ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{result.coaching.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <Button className="w-full" onClick={() => { toast("Saved to the deal."); close(); }}>Done</Button>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-4">
            <p className="rounded-xl bg-mark-soft p-3 text-sm">{OPENERS[target.kind]}</p>
            {session?.messages.map((m, i) => (
              <div key={i} className={cx("max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug", m.role === "founder" ? "ml-auto bg-ink text-paper" : "border border-rule bg-sheet")}>
                {m.text}
              </div>
            ))}
            {busy && <p className="text-sm text-ink-3">{session && session.messages.length && session.messages[session.messages.length - 1].role === "founder" ? `${who.split(",")[0]} is typing…` : "Reviewing the conversation…"}</p>}
            {error && <p className="text-sm text-out">{error}</p>}
            <div ref={endRef} />
          </div>
          <div className="border-t border-rule px-3 pt-2">
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Say something…"
                className="min-w-0 flex-1 resize-none rounded-xl border border-rule bg-sheet px-3 py-2 text-[15px]"
              />
              <Button onClick={send} disabled={busy || !input.trim()}>Send</Button>
            </div>
            <Button variant="ghost" className="mt-2 w-full" onClick={end} disabled={busy}>
              {target.kind === "discovery" ? "End call" : target.kind === "negotiation" ? "End negotiation" : "End interview"}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
