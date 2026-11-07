"use client";

import { useState } from "react";
import { LIMITATIONS, SOURCES } from "@/engine/calibration";
import { MARKETS } from "@/engine/markets";
import type { Policies } from "@/engine/types";
import { mentorDigest } from "@/lib/digest";
import { postJSON, useRun } from "@/lib/store";
import { SkillBars } from "./Onboarding";
import { useUI } from "./Shell";
import { Button, Field, List, NumberInput, Row, Segmented, Sheet } from "./ui";

function PoliciesEditor() {
  const { s, act } = useRun();
  const { toast } = useUI();
  const m = MARKETS[s.market];
  const [p, setP] = useState<Policies>(s.policies);
  const dirty = JSON.stringify(p) !== JSON.stringify(s.policies);
  return (
    <div className="space-y-4 px-4">
      <Field label="Your hourly rate" hint={`Market reference for a mid-level AI consultant here: ~${m.symbol}${m.aiRateRef}/h. Used for estimates and change orders.`}>
        <NumberInput value={p.hourlyRate} onChange={(n) => setP({ ...p, hourlyRate: n })} prefix={m.symbol} step={5} />
      </Field>
      <Field label="Standard paid workshop / AI audit fee" hint="Charging for discovery filters out tyre-kickers, but fewer people say yes.">
        <NumberInput value={p.workshopFee} onChange={(n) => setP({ ...p, workshopFee: n })} prefix={m.symbol} step={100} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default upfront">
          <NumberInput value={p.defaultUpfrontPct} onChange={(n) => setP({ ...p, defaultUpfrontPct: n })} suffix="%" step={10} />
        </Field>
        <Field label="Payment terms">
          <NumberInput value={p.netDays} onChange={(n) => setP({ ...p, netDays: n })} suffix="days" step={15} />
        </Field>
      </div>
      <Field label="When clients ask for extra scope">
        <Segmented value={p.scopeCreep} onChange={(v) => setP({ ...p, scopeCreep: v })} options={[{ value: "ask", label: "Ask me" }, { value: "absorb_small", label: "Absorb small" }, { value: "change_order", label: "Always bill" }]} />
      </Field>
      <Field label="LLM & hosting run costs on maintenance clients">
        <Segmented value={p.passThroughRunCosts ? "yes" : "no"} onChange={(v) => setP({ ...p, passThroughRunCosts: v === "yes" })} options={[{ value: "yes", label: "Bill to client" }, { value: "no", label: "I absorb them" }]} />
      </Field>
      <Field label="Coworking desk" hint={`${m.symbol}${m.coworkingMonthly}/month. Helps nothing in the model except your sanity. Real founders often pay it anyway.`}>
        <Segmented value={p.coworking ? "yes" : "no"} onChange={(v) => setP({ ...p, coworking: v === "yes" })} options={[{ value: "no", label: "Work from home" }, { value: "yes", label: "Coworking" }]} />
      </Field>
      <Button className="w-full" disabled={!dirty} onClick={() => toast(act("set_policies", p as unknown as Record<string, unknown>).message)}>Save policies</Button>
    </div>
  );
}

function Mentor() {
  const { s } = useRun();
  const [text, setText] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const over = s.status === "game_over";
  async function ask(mode: string, question?: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await postJSON<{ text: string }>("/api/mentor", { digest: mentorDigest(s, over), mode, question });
      setText(r.text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 px-4">
      <p className="text-sm text-ink-2">An experienced founder who reads your numbers and tells you what they see. {over ? "The post-mortem also reveals why you really lost deals." : ""}</p>
      <div className="flex flex-wrap gap-2">
        {over ? <Button onClick={() => ask("post_mortem")} disabled={busy}>Run the post-mortem</Button> : <Button onClick={() => ask("month_review")} disabled={busy}>How am I doing?</Button>}
        <Button variant="ghost" onClick={() => ask("reality_check")} disabled={busy}>What should I verify in real life?</Button>
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your mentor anything" className="min-w-0 flex-1 rounded-xl border border-rule bg-sheet px-3 py-2.5 text-[15px]" onKeyDown={(e) => e.key === "Enter" && q.trim() && ask("ask", q)} />
        <Button variant="ghost" onClick={() => ask("ask", q)} disabled={busy || !q.trim()}>Ask</Button>
      </div>
      {busy && <p className="text-sm text-ink-3">Reading your numbers…</p>}
      {err && <p className="text-sm text-out">{err}</p>}
      {text && <div className="whitespace-pre-wrap rounded-2xl border border-rule bg-sheet p-4 text-[15px] leading-relaxed">{text.replace(/\*\*(.+?)\*\*/g, "$1")}</div>}
    </div>
  );
}

function Reality() {
  return (
    <div className="space-y-5 px-4">
      <div>
        <p className="font-medium">What a run here can and can&apos;t tell you</p>
        <ul className="mt-2 space-y-2 text-sm text-ink-2">{LIMITATIONS.map((l) => <li key={l} className="border-l-2 border-rule pl-3">{l}</li>)}</ul>
      </div>
      <div>
        <p className="font-medium">The base rates this world runs on</p>
        <List className="mx-0 mt-2">
          {SOURCES.map((x) => (
            <Row key={x.topic}>
              <p className="text-sm font-medium">{x.topic}{x.estimate && <span className="font-normal text-ink-3"> (estimate)</span>}</p>
              <p className="text-sm text-ink-2">{x.value}</p>
              {x.source.startsWith("http") ? <a className="break-all text-xs text-accent" href={x.source} target="_blank" rel="noreferrer">{x.source}</a> : <p className="text-xs text-ink-3">{x.source}</p>}
            </Row>
          ))}
        </List>
      </div>
    </div>
  );
}

function Profile() {
  const { s } = useRun();
  const f = s.founder;
  return (
    <div className="space-y-4 px-4">
      <div>
        <p className="display text-xl font-semibold">{f.name}</p>
        <p className="text-sm text-ink-2">{f.headline}, {f.location}</p>
      </div>
      <p className="text-sm"><span className="text-ink-3">How prospects see you: </span>{f.publicSummary}</p>
      <SkillBars profile={f} />
      <p className="text-sm text-ink-2">Warm network: {f.warmNetwork} contacts ({s.warmContactsUsed} reached so far).</p>
      <div className="text-sm">
        <p className="font-medium">Built from</p>
        <ul className="mt-1 list-disc pl-4 text-ink-2">{f.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
      </div>
    </div>
  );
}

function NewGame({ onClose }: { onClose: () => void }) {
  const { endRun, s } = useRun();
  const [sure, setSure] = useState(false);
  return (
    <div className="space-y-4 px-4">
      <p className="text-sm text-ink-2">{s.status === "game_over" ? "This run is over. Start again with what you've learned." : "Abandoning a business is a real decision too. This run will be saved to your history."}</p>
      {sure ? (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSure(false)}>Keep playing</Button>
          <Button variant="danger" className="flex-1" onClick={() => { endRun(); onClose(); }}>End this run and start over</Button>
        </div>
      ) : (
        <Button variant="danger" className="w-full" onClick={() => setSure(true)}>Start a new business</Button>
      )}
    </div>
  );
}

const MENU = [
  { id: "policies", label: "Pricing & policies", hint: "Rates, payment terms, scope rules" },
  { id: "mentor", label: "Mentor", hint: "Frank feedback on your numbers" },
  { id: "profile", label: "Your founder profile", hint: "Skills and how prospects see you" },
  { id: "reality", label: "Reality check", hint: "Sources and limits of this simulation" },
  { id: "newgame", label: "New game", hint: "End this run" },
];

export function MoreSheet({ section, onClose, setSection }: { section: string | null; onClose: () => void; setSection: (s: string) => void }) {
  if (!section) return null;
  const item = MENU.find((m) => m.id === section);
  return (
    <Sheet open onClose={onClose} title={item?.label ?? "More"} full={section !== "menu"}>
      {section !== "menu" && (
        <button className="mb-3 px-4 text-sm text-accent" onClick={() => setSection("menu")}>Back</button>
      )}
      {section === "menu" && (
        <List>
          {MENU.map((m) => (
            <Row key={m.id} onClick={() => setSection(m.id)}>
              <p className="font-medium">{m.label}</p>
              <p className="text-sm text-ink-2">{m.hint}</p>
            </Row>
          ))}
        </List>
      )}
      {section === "policies" && <PoliciesEditor />}
      {section === "mentor" && <Mentor />}
      {section === "reality" && <Reality />}
      {section === "profile" && <Profile />}
      {section === "newgame" && <NewGame onClose={onClose} />}
    </Sheet>
  );
}
