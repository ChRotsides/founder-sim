"use client";

import { useState } from "react";
import { formatDate } from "@/engine/calendar";
import { INDUSTRIES } from "@/engine/industries";
import type { Deal, DealStage, GameState } from "@/engine/types";
import { useRun } from "@/lib/store";
import { Page, useUI } from "./Shell";
import { Empty, List, Money, Pill, Row, Section } from "./ui";

export const STAGE_LABEL: Record<DealStage, string> = {
  lead: "New lead",
  call_scheduled: "Call booked",
  discovered: "Call done",
  proposal_requested: "Wants a proposal",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  won: "Client",
  lost: "Lost",
  nurture: "Check back later",
};

function needsYou(s: GameState, d: Deal) {
  return d.stage === "lead" || d.stage === "proposal_requested" || d.stage === "negotiating" || (d.stage === "call_scheduled" && (d.callDay ?? Infinity) <= s.day) || d.proposal?.status === "ghosted" || (d.proposal?.status === "accepted" && d.stage !== "won");
}

function DealRow({ d }: { d: Deal }) {
  const { s } = useRun();
  const { openDeal } = useUI();
  const c = s.companies.find((x) => x.id === d.companyId)!;
  const urgent = needsYou(s, d);
  return (
    <Row onClick={() => openDeal(d.id)} mark={urgent}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-sm text-ink-2">
            {c.contact.name}, {INDUSTRIES[c.industry].label.toLowerCase()}, {c.employees} people
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Pill tone={d.stage === "won" ? "in" : d.stage === "lost" ? "out" : urgent ? "mark" : "neutral"}>{d.proposal?.status === "ghosted" ? "No reply" : STAGE_LABEL[d.stage]}</Pill>
          {d.proposal && d.stage !== "lost" && (
            <p className="mt-1 text-xs text-ink-3">
              <Money s={s} n={d.proposal.buildPrice + d.proposal.workshopFee} />
            </p>
          )}
          {d.stage === "call_scheduled" && d.callDay !== undefined && <p className="mt-1 text-xs text-ink-3">{formatDate(s.startDate, d.callDay, { weekday: "short", day: "numeric", month: "short" })}</p>}
        </div>
      </div>
    </Row>
  );
}

export function PipelineScreen() {
  const { s } = useRun();
  const [showClosed, setShowClosed] = useState(false);
  const open = s.deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const urgent = open.filter((d) => needsYou(s, d));
  const waiting = open.filter((d) => !needsYou(s, d) && d.stage !== "nurture");
  const nurture = open.filter((d) => d.stage === "nurture");
  const won = s.deals.filter((d) => d.stage === "won");
  const lost = s.deals.filter((d) => d.stage === "lost");
  const f = s.funnel;

  return (
    <Page>
      <div className="mx-4 mt-3 overflow-x-auto">
        <table className="num w-full text-sm">
          <tbody>
            <tr className="text-ink-3">
              <td>Emails</td>
              <td>LinkedIn</td>
              <td>Replies</td>
              <td>Calls</td>
              <td>Proposals</td>
              <td>Won</td>
            </tr>
            <tr className="font-semibold">
              <td>{f.emailsSent}</td>
              <td>{f.linkedinSent}</td>
              <td>{f.positiveReplies}</td>
              <td>{f.callsHeld}</td>
              <td>{f.proposalsSent}</td>
              <td>{f.proposalsWon}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Section title="Needs you">{urgent.length ? <List>{urgent.map((d) => <DealRow key={d.id} d={d} />)}</List> : <Empty>No leads waiting on you. Leads come from your outreach plan in Work.</Empty>}</Section>
      {waiting.length > 0 && <Section title="Waiting on them"><List>{waiting.map((d) => <DealRow key={d.id} d={d} />)}</List></Section>}
      {nurture.length > 0 && <Section title="Check back later"><List>{nurture.map((d) => <DealRow key={d.id} d={d} />)}</List></Section>}
      {won.length > 0 && <Section title="Clients"><List>{won.map((d) => <DealRow key={d.id} d={d} />)}</List></Section>}
      {lost.length > 0 && (
        <Section title="Lost" aside={<button onClick={() => setShowClosed(!showClosed)} className="text-accent">{showClosed ? "Hide" : `Show ${lost.length}`}</button>}>
          {showClosed && <List>{lost.slice().reverse().map((d) => <DealRow key={d.id} d={d} />)}</List>}
        </Section>
      )}
    </Page>
  );
}
