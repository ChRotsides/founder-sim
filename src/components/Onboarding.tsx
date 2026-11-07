"use client";

import { useState } from "react";
import { LIMITATIONS } from "@/engine/calibration";
import { INDUSTRIES } from "@/engine/industries";
import { MARKETS } from "@/engine/markets";
import type { FounderProfile, MarketId } from "@/engine/types";
import { newGame } from "@/engine/world";
import { useGame } from "@/lib/store";
import { Button, cx, Field, inputCls, NumberInput, Segmented } from "./ui";

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + ((8 - day) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

const SKILL_LABEL: Record<keyof FounderProfile["skills"], string> = {
  technical: "Building AI solutions",
  sales: "Selling",
  consulting: "Discovery & consulting",
  delivery: "Delivery & estimation",
  credibility: "First-impression credibility",
};

export function SkillBars({ profile }: { profile: FounderProfile }) {
  return (
    <div className="space-y-2">
      {(Object.keys(SKILL_LABEL) as (keyof FounderProfile["skills"])[]).map((k) => (
        <div key={k}>
          <div className="flex justify-between text-sm">
            <span>{SKILL_LABEL[k]}</span>
            <span className="num text-ink-2">{Math.round(profile.skills[k] * 100)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-rule">
            <div className="h-1.5 rounded-full bg-ink" style={{ width: `${profile.skills[k] * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Onboarding() {
  const { startGame, history } = useGame();
  const [step, setStep] = useState(0);
  const [market, setMarket] = useState<MarketId>("CY");
  const [businessName, setBusinessName] = useState("");
  const [github, setGithub] = useState("");
  const [name, setName] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [notes, setNotes] = useState("");
  const [cv, setCv] = useState<File | null>(null);
  const [liPdf, setLiPdf] = useState<File | null>(null);
  const [profile, setProfile] = useState<FounderProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = MARKETS[market];
  const [savings, setSavings] = useState(20_000);
  const [living, setLiving] = useState(m.defaultLiving);
  const [keepsJob, setKeepsJob] = useState(false);
  const [jobNet, setJobNet] = useState(2_200);
  const [collateral, setCollateral] = useState(false);

  async function buildProfile() {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("market", market);
      fd.set("githubUsername", github);
      fd.set("linkedinText", linkedinText);
      fd.set("notes", [name && `My name: ${name}`, notes].filter(Boolean).join("\n"));
      if (cv) fd.set("cv", cv);
      if (liPdf) fd.set("linkedinPdf", liPdf);
      const res = await fetch("/api/persona", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProfile({ ...data.profile, name: name.trim() || data.profile.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function start() {
    if (!profile) return;
    const s = newGame({
      seed: Math.floor(Math.random() * 2 ** 31),
      market,
      businessName: businessName.trim() || `${profile.name.split(" ")[0]} AI`,
      founder: profile,
      situation: { personalCash: savings, monthlyLiving: living, hoursPerWeek: keepsJob ? 15 : 50, keepsJob, jobNetMonthly: keepsJob ? jobNet : 0, hasCollateral: collateral },
      startDate: nextMonday(),
    });
    startGame(s);
  }

  const steps = ["Market", "You", "Money & time", "Start"];

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-16 safe-top">
      <header className="pt-10">
        <h1 className="display text-4xl font-bold leading-none">Founder</h1>
        <p className="mt-3 max-w-sm text-ink-2">Start an AI consultancy from zero in a market where clients, competitors and banks behave like the real ones.</p>
        <ol className="mt-6 flex gap-2 text-sm" aria-label="Setup steps">
          {steps.map((t, i) => (
            <li key={t} className={cx("flex-1 border-t-2 pt-1", i <= step ? "border-ink text-ink" : "border-rule text-ink-3")}>
              {t}
            </li>
          ))}
        </ol>
      </header>

      {step === 0 && (
        <div className="mt-8 space-y-5">
          <Field label="Where will you start?">
            <Segmented value={market} onChange={(v) => { setMarket(v); setLiving(MARKETS[v].defaultLiving); }} options={(Object.keys(MARKETS) as MarketId[]).map((k) => ({ value: k, label: MARKETS[k].label }))} />
          </Field>
          <ul className="space-y-2 text-sm text-ink-2">
            {m.notes.map((n) => (
              <li key={n} className="border-l-2 border-rule pl-3">{n}</li>
            ))}
          </ul>
          <Field label="Business name" hint="You can change your mind later, like in real life. Mostly.">
            <input className={inputCls} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Kypros AI Studio" />
          </Field>
          <div className="rounded-2xl border border-rule bg-sheet p-4 text-sm">
            <p className="font-medium">Your business: AI consultancy & automation agency</p>
            <p className="mt-1 text-ink-2">Talk to clients, find their real pain points, advise them, and if they want, build the solution and maintain it. You set the prices.</p>
          </div>
          {history.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Your previous runs</p>
              <ul className="mt-2 space-y-1 text-ink-2">
                {history.slice(0, 5).map((h) => (
                  <li key={h.endedAt}>
                    {h.businessName} ({h.market}): {Math.round(h.days / 30)} months, {h.clients} clients. {h.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button className="w-full" onClick={() => setStep(1)}>Continue</Button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-8 space-y-5">
          <p className="text-sm text-ink-2">Your founder is you. Clients judge you by what they find about you, and your skills decide how calls, builds and estimates go. The more real material you give, the more honest the simulation.</p>
          <Field label="Your name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="CV (PDF)">
            <input type="file" accept="application/pdf" className="block w-full text-sm" onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="LinkedIn" hint="On LinkedIn: your profile → More → Save to PDF. Or paste your About + Experience below.">
            <input type="file" accept="application/pdf" className="mb-2 block w-full text-sm" onChange={(e) => setLiPdf(e.target.files?.[0] ?? null)} />
            <textarea className={cx(inputCls, "h-24")} value={linkedinText} onChange={(e) => setLinkedinText(e.target.value)} placeholder="…or paste your LinkedIn profile text" />
          </Field>
          <Field label="GitHub username">
            <input className={inputCls} value={github} onChange={(e) => setGithub(e.target.value)} placeholder="username" autoCapitalize="off" autoCorrect="off" />
          </Field>
          <Field label="Anything else that matters" hint="Who you know, industries you've worked in, clients you've had. Be honest; inflating it only makes the simulation lie to you.">
            <textarea className={cx(inputCls, "h-20")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-out">{error}</p>}
          <Button className="w-full" onClick={buildProfile} disabled={loading}>{loading ? "Reading your background…" : profile ? "Rebuild my profile" : "Build my founder profile"}</Button>

          {profile && (
            <div className="space-y-4 rounded-2xl border border-rule bg-sheet p-4">
              <div>
                <p className="display text-xl font-semibold">{profile.name}</p>
                <p className="text-sm text-ink-2">{profile.headline}</p>
              </div>
              <p className="text-sm">
                <span className="text-ink-3">How prospects see you: </span>
                {profile.publicSummary}
              </p>
              <SkillBars profile={profile} />
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-medium">Strengths</p>
                  <ul className="mt-1 list-disc pl-4 text-ink-2">{profile.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div>
                  <p className="font-medium">Gaps</p>
                  <ul className="mt-1 list-disc pl-4 text-ink-2">{profile.gaps.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              </div>
              <Field label="Warm network: decision-makers who'd take your call" hint="Estimated from your background. Correct it if you know better, but count only people who could buy or introduce you to buyers.">
                <NumberInput value={profile.warmNetwork} onChange={(n) => setProfile({ ...profile, warmNetwork: Math.max(0, Math.round(n)) })} />
              </Field>
              <p className="text-sm text-ink-2">Industries you know: {profile.industriesKnown.length ? profile.industriesKnown.map((i) => INDUSTRIES[i].label).join(", ") : "none in particular"}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button className="flex-1" disabled={!profile} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8 space-y-5">
          <p className="text-sm text-ink-2">Most first businesses don&apos;t die from bad ideas. They die when the founder runs out of personal money. Use your real numbers.</p>
          <Field label="Savings you'd put at risk">
            <NumberInput value={savings} onChange={setSavings} prefix={m.symbol} step={1000} />
          </Field>
          <Field label="Your monthly living costs" hint={`Rent, food, transport, insurance. A typical single founder in ${m.cities[0]}: ${m.symbol}${m.defaultLiving.toLocaleString()}.`}>
            <NumberInput value={living} onChange={setLiving} prefix={m.symbol} step={100} />
          </Field>
          <Field label="Keep your day job at first?">
            <Segmented value={keepsJob ? "yes" : "no"} onChange={(v) => setKeepsJob(v === "yes")} options={[{ value: "no", label: "Go full-time (~50h/week)" }, { value: "yes", label: "Side project (~15h/week)" }]} />
          </Field>
          {keepsJob && (
            <Field label="Net monthly income from your job">
              <NumberInput value={jobNet} onChange={setJobNet} prefix={m.symbol} step={100} />
            </Field>
          )}
          <Field label="Do you own property you could put up as collateral?" hint="Banks rarely lend to new businesses without it.">
            <Segmented value={collateral ? "yes" : "no"} onChange={(v) => setCollateral(v === "yes")} options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />
          </Field>
          <p className="num rounded-2xl bg-mark-soft p-3 text-sm">
            Personal runway with no income: {keepsJob && jobNet >= living ? "covered by your job" : `${(savings / Math.max(1, living - (keepsJob ? jobNet : 0))).toFixed(1)} months`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && profile && (
        <div className="mt-8 space-y-5">
          <div className="rounded-2xl border border-rule bg-sheet p-4">
            <p className="display text-2xl font-semibold">{businessName.trim() || `${profile.name.split(" ")[0]} AI`}</p>
            <p className="mt-1 text-sm text-ink-2">
              AI consultancy in {m.label}. You start with no company, no clients and no reputation. Nobody is waiting for you.
            </p>
          </div>
          <div>
            <p className="font-medium">Before you start, what this can and can&apos;t tell you</p>
            <ul className="mt-2 space-y-2 text-sm text-ink-2">
              {LIMITATIONS.map((l) => (
                <li key={l} className="border-l-2 border-rule pl-3">{l}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <Button className="flex-1" onClick={start}>Start on Monday</Button>
          </div>
        </div>
      )}
    </main>
  );
}
