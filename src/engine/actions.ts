import { ARCHETYPES } from "./calibration";
import { addBusinessDays, formatDate } from "./calendar";
import { resolveScopeChange, startProject } from "./delivery";
import { logDecision, resolveEventsFor } from "./events";
import { applyForLoan, book, canInvoice, fmt, LOAN_TERMS, market, registerBusiness } from "./finance";
import { INDUSTRY_IDS } from "./industries";
import { clamp, Rng } from "./rng";
import { applyCall, company, followUpProposal, quickCall, submitProposal, type ProposalDraft } from "./sales";
import { endGame, injectCapital, runUntilEvent, advanceDays } from "./sim";
import { fire, makeOffer, openJob, ROLE_LABEL } from "./team";
import type { Archetype, GameState, IndustryId, LoanKind, Role, WeeklyPlan, Policies, CallRecord } from "./types";

export class ActionError extends Error {}

type Args = Record<string, unknown>;

function deal(s: GameState, id: unknown) {
  const d = s.deals.find((x) => x.id === id);
  if (!d) throw new ActionError(`No deal with id ${String(id)}`);
  return d;
}

function num(v: unknown, name: string, min = 0, max = 10_000_000): number {
  const n = Number(v);
  if (!isFinite(n)) throw new ActionError(`${name} must be a number`);
  return clamp(n, min, max);
}

export interface ActionDef {
  description: string;
  params: Record<string, unknown>; // JSON schema properties
  required?: string[];
  mutates: boolean;
  run: (s: GameState, a: Args) => string;
}

const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as Archetype[];

export const ACTIONS: Record<string, ActionDef> = {
  set_weekly_plan: {
    description: "Change how the founder spends their working week (hours per activity), how personalised cold outreach is, and which industries to target. Empty targetIndustries means everyone.",
    params: {
      emailHours: { type: "number" },
      linkedinHours: { type: "number" },
      networkingHours: { type: "number" },
      contentHours: { type: "number" },
      deliveryHours: { type: "number" },
      personalization: { type: "string", enum: ["low", "medium", "high"] },
      targetIndustries: { type: "array", items: { type: "string", enum: INDUSTRY_IDS } },
    },
    mutates: true,
    run(s, a) {
      const p: Partial<WeeklyPlan> = {};
      for (const k of ["emailHours", "linkedinHours", "networkingHours", "contentHours", "deliveryHours"] as const) if (a[k] !== undefined) p[k] = num(a[k], k, 0, 80);
      if (a.personalization) p.personalization = a.personalization as WeeklyPlan["personalization"];
      if (Array.isArray(a.targetIndustries)) p.targetIndustries = (a.targetIndustries as string[]).filter((x) => INDUSTRY_IDS.includes(x as IndustryId)) as IndustryId[];
      Object.assign(s.plan, p);
      const total = s.plan.emailHours + s.plan.linkedinHours + s.plan.networkingHours + s.plan.contentHours + s.plan.deliveryHours;
      logDecision(s, `Weekly plan changed (${total}h/week)`);
      return `Plan updated: ${total}h/week planned.${total > 55 ? " That's a lot. Watch your energy." : ""}`;
    },
  },
  set_policies: {
    description: "Change business policies: hourly rate, workshop fee, default upfront %, payment terms (net days), scope-creep policy, whether run costs are passed through on retainers, the founder's own monthly gross salary/drawings, coworking desk.",
    params: {
      hourlyRate: { type: "number" },
      workshopFee: { type: "number" },
      defaultUpfrontPct: { type: "number" },
      netDays: { type: "number" },
      scopeCreep: { type: "string", enum: ["ask", "absorb_small", "change_order"] },
      passThroughRunCosts: { type: "boolean" },
      founderSalaryMonthly: { type: "number" },
      coworking: { type: "boolean" },
    },
    mutates: true,
    run(s, a) {
      const p: Partial<Policies> = {};
      if (a.hourlyRate !== undefined) p.hourlyRate = num(a.hourlyRate, "hourlyRate", 5, 2000);
      if (a.workshopFee !== undefined) p.workshopFee = num(a.workshopFee, "workshopFee", 0, 100_000);
      if (a.defaultUpfrontPct !== undefined) p.defaultUpfrontPct = num(a.defaultUpfrontPct, "defaultUpfrontPct", 0, 100);
      if (a.netDays !== undefined) p.netDays = num(a.netDays, "netDays", 0, 90);
      if (a.scopeCreep) p.scopeCreep = a.scopeCreep as Policies["scopeCreep"];
      if (a.passThroughRunCosts !== undefined) p.passThroughRunCosts = Boolean(a.passThroughRunCosts);
      if (a.founderSalaryMonthly !== undefined) p.founderSalaryMonthly = num(a.founderSalaryMonthly, "founderSalaryMonthly", 0, 50_000);
      if (a.coworking !== undefined) p.coworking = Boolean(a.coworking);
      Object.assign(s.policies, p);
      logDecision(s, `Policies changed: ${Object.keys(p).join(", ")}`);
      return "Policies updated.";
    },
  },
  register_business: {
    description: "Register the business so it can invoice. sole_trader: cheap, immediate, unlimited personal liability. ltd: limited company, costs more, takes weeks, needs an accountant and (in Cyprus) an annual audit.",
    params: { form: { type: "string", enum: ["sole_trader", "ltd"] } },
    required: ["form"],
    mutates: true,
    run(s, a) {
      if (s.finance.legalForm === "ltd" || s.finance.legalForm === "ltd_pending") throw new ActionError("Already a limited company.");
      const form = a.form === "ltd" ? "ltd" : "sole_trader";
      registerBusiness(s, form);
      logDecision(s, `Registered as ${form}`);
      const m = market(s);
      return form === "ltd" ? `Ltd registration started (${fmt(s, m.ltdSetupCost)} paid from savings). Ready around ${formatDate(s.startDate, s.finance.ltdReadyDay!)}.` : `Registered as a sole trader (${fmt(s, m.soleTraderSetupCost)}). You can invoice now.`;
    },
  },
  register_vat: {
    description: "Voluntarily register for VAT. Adds VAT to every invoice from now on, which you then owe to the tax office quarterly.",
    params: {},
    mutates: true,
    run(s) {
      if (s.finance.legalForm === "none") throw new ActionError("Register the business first.");
      s.finance.vatRegistered = true;
      logDecision(s, "Registered for VAT");
      return "Registered for VAT.";
    },
  },
  buy_insurance: {
    description: "Buy professional indemnity insurance for a year.",
    params: {},
    mutates: true,
    run(s) {
      if (s.finance.legalForm === "none") throw new ActionError("Register the business first.");
      book(s, -market(s).insuranceAnnual, "insurance", "Professional indemnity insurance (1 year)");
      s.finance.insurance = true;
      return `Insured for a year (${fmt(s, market(s).insuranceAnnual)}).`;
    },
  },
  transfer_to_company: {
    description: "Move money from the founder's personal savings into the company account.",
    params: { amount: { type: "number" } },
    required: ["amount"],
    mutates: true,
    run(s, a) {
      if (s.finance.legalForm === "none") throw new ActionError("Register the business first.");
      const amt = num(a.amount, "amount", 1);
      if (amt > s.situation.personalCash) throw new ActionError("Not enough personal savings.");
      injectCapital(s, amt);
      logDecision(s, `Put ${fmt(s, amt)} of savings into the company`);
      return `Moved ${fmt(s, amt)} into the company.`;
    },
  },
  schedule_call: {
    description: "Book a discovery call with a lead (deal in stage 'lead').",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      if (d.stage !== "lead") throw new ActionError(`Deal is ${d.stage}, not a fresh lead.`);
      const rng = new Rng(s.rng);
      d.stage = "call_scheduled";
      d.callDay = addBusinessDays(s.startDate, s.day, rng.int(1, 4));
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "scheduled");
      return `Call booked with ${company(s, d.companyId).contact.name} on ${formatDate(s.startDate, d.callDay)}.`;
    },
  },
  decline_lead: {
    description: "Politely pass on a lead (not a fit).",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      d.stage = "lost";
      d.lostReason = "You passed on it.";
      company(s, d.companyId).status = "lost";
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "declined");
      return "Lead closed.";
    },
  },
  quick_call: {
    description: "Run a scheduled discovery call in quick mode (simulated from the founder's consulting skill, no transcript).",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      if (d.stage !== "call_scheduled" && d.stage !== "lead") throw new ActionError("No call scheduled for this deal.");
      const call = quickCall(s, d);
      applyCall(s, d, call);
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "quick call");
      const c = company(s, d.companyId);
      const found = c.pains.filter((p) => call.discoveredPainIds.includes(p.id)).map((p) => p.title);
      return `Call done. Discovered: ${found.length ? found.join("; ") : "nothing concrete"}. Next step: ${call.nextStep.replace(/_/g, " ")}.`;
    },
  },
  send_proposal: {
    description: "Send a proposal for a deal in 'proposal_requested' (or 'discovered'/'nurture') stage. items: which discovered pains to solve and with what solution archetype. Prices in the market currency.",
    params: {
      dealId: { type: "string" },
      items: { type: "array", items: { type: "object", properties: { painId: { type: "string" }, archetype: { type: "string", enum: ARCHETYPE_IDS } }, required: ["painId", "archetype"] } },
      workshopFee: { type: "number" },
      buildPrice: { type: "number" },
      retainerMonthly: { type: "number" },
      upfrontPct: { type: "number" },
      netDays: { type: "number" },
      timelineWeeks: { type: "number" },
    },
    required: ["dealId", "items", "buildPrice"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      if (!["proposal_requested", "nurture", "discovered"].includes(d.stage)) throw new ActionError(`Can't send a proposal at stage ${d.stage}.`);
      const c = company(s, d.companyId);
      const known = new Set(d.calls.flatMap((x) => x.discoveredPainIds));
      const items = (Array.isArray(a.items) ? a.items : []) as { painId: string; archetype: Archetype }[];
      const valid = items.filter((it) => known.has(it.painId) && ARCHETYPE_IDS.includes(it.archetype));
      if (!valid.length) throw new ActionError("A proposal must address at least one pain you actually discovered.");
      const draft: ProposalDraft = {
        items: valid,
        workshopFee: num(a.workshopFee ?? 0, "workshopFee"),
        buildPrice: num(a.buildPrice, "buildPrice"),
        retainerMonthly: num(a.retainerMonthly ?? 0, "retainerMonthly"),
        upfrontPct: num(a.upfrontPct ?? s.policies.defaultUpfrontPct, "upfrontPct", 0, 100),
        netDays: num(a.netDays ?? s.policies.netDays, "netDays", 0, 90),
        timelineWeeks: num(a.timelineWeeks ?? 6, "timelineWeeks", 1, 52),
      };
      submitProposal(s, d, draft);
      logDecision(s, `Proposal to ${c.name}: build ${fmt(s, draft.buildPrice)}, workshop ${fmt(s, draft.workshopFee)}, retainer ${fmt(s, draft.retainerMonthly)}/mo`);
      return `Proposal sent to ${c.contact.name}.`;
    },
  },
  start_project: {
    description: "Kick off a won deal: confirm the accepted proposal, send the first invoices and start delivery. Requires a registered business.",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      const p = d.proposal;
      if (!p || p.status !== "accepted" || d.stage === "won") throw new ActionError("No accepted proposal to start.");
      if (!canInvoice(s)) throw new ActionError("You can't invoice yet: register as a sole trader, or wait for your Ltd registration to complete.");
      startProject(s, d, p.buildPrice);
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "kicked off");
      return `Project kicked off for ${company(s, d.companyId).name}. Invoices sent.`;
    },
  },
  send_summary: {
    description: "After a discovery call that ended in 'send me info' or 'check back later', send a short written summary of what you heard and a suggested next step. Works once per deal.",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      if (d.stage !== "nurture" || !d.calls.length) throw new ActionError("Only after a call that ended without a clear next step.");
      if (s.flags[`summary_${d.id}`] !== undefined) throw new ActionError("You've already sent them a summary.");
      const rng = new Rng(s.rng);
      s.flags[`summary_${d.id}`] = s.day + rng.int(2, 8);
      s.week.hoursBooked += 1;
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "summary sent");
      return "Summary sent. A specific, short follow-up is how most 'send me info' replies turn into proposals.";
    },
  },
  follow_up: {
    description: "Send a polite follow-up on a proposal that got no reply (ghosted).",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      if (d.proposal?.status !== "ghosted") throw new ActionError("This proposal isn't waiting on a reply.");
      const out = followUpProposal(s, d);
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "followed up");
      return out;
    },
  },
  respond_counter: {
    description: "Respond to a client's counter-offer: accept their price, hold your price, or split the difference.",
    params: { dealId: { type: "string" }, choice: { type: "string", enum: ["accept", "hold", "split"] } },
    required: ["dealId", "choice"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      const p = d.proposal;
      if (!p || p.status !== "countered") throw new ActionError("No counter-offer on this deal.");
      const rng = new Rng(s.rng);
      const c = company(s, d.companyId);
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, String(a.choice));
      if (a.choice === "accept") {
        p.buildPrice = p.counterPrice!;
        p.status = "accepted";
        logDecision(s, `Accepted ${c.name}'s counter at ${fmt(s, p.buildPrice)}`);
        return `Agreed at ${fmt(s, p.buildPrice)}. Use start_project to kick off.`;
      }
      const ask = a.choice === "split" ? Math.round((p.buildPrice + p.counterPrice!) / 2) : p.buildPrice;
      const pYes = ask <= p.reservationPrice ? 0.8 : a.choice === "split" ? 0.45 : 0.2;
      if (rng.chance(pYes)) {
        p.buildPrice = ask;
        p.status = "accepted";
        logDecision(s, `Negotiated ${c.name} to ${fmt(s, ask)}`);
        return `${c.contact.name} agreed to ${fmt(s, ask)}. Use start_project to kick off.`;
      }
      p.status = "rejected";
      d.stage = "lost";
      c.status = "lost";
      d.lostReason = `Couldn't agree on price (${fmt(s, ask)} vs their ${fmt(s, p.counterPrice!)}).`;
      d.trueLostReason = `Their real ceiling was about ${fmt(s, p.reservationPrice)}.`;
      s.funnel.proposalsLost++;
      return `${c.contact.name} walked away. ${d.lostReason}`;
    },
  },
  mark_lost: {
    description: "Close a deal as lost.",
    params: { dealId: { type: "string" } },
    required: ["dealId"],
    mutates: true,
    run(s, a) {
      const d = deal(s, a.dealId);
      d.stage = "lost";
      d.lostReason = d.lostReason ?? "Closed by you.";
      company(s, d.companyId).status = "lost";
      resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "closed");
      return "Deal closed.";
    },
  },
  resolve_scope_change: {
    description: "Answer a client's scope-change request on a project: absorb it free, send a change order at your hourly rate, or decline.",
    params: { projectId: { type: "string" }, choice: { type: "string", enum: ["absorb", "change_order", "decline"] } },
    required: ["projectId", "choice"],
    mutates: true,
    run(s, a) {
      const p = s.projects.find((x) => x.id === a.projectId);
      if (!p) throw new ActionError("No such project.");
      resolveEventsFor(s, (e) => e.ref?.projectId === p.id && e.kind === "scope_change", String(a.choice));
      return resolveScopeChange(s, p, a.choice as "absorb" | "change_order" | "decline");
    },
  },
  chase_invoice: {
    description: "Chase an overdue invoice by phone/email (costs ~1h).",
    params: { invoiceId: { type: "string" } },
    required: ["invoiceId"],
    mutates: true,
    run(s, a) {
      const inv = s.finance.invoices.find((x) => x.id === a.invoiceId);
      if (!inv || inv.status !== "open") throw new ActionError("No open invoice with that id.");
      const rng = new Rng(s.rng);
      inv.chased++;
      s.week.hoursBooked += 1;
      resolveEventsFor(s, (e) => e.ref?.invoiceId === inv.id);
      if (rng.chance(0.7 / inv.chased)) {
        inv.payDay = s.day + rng.int(2, 12);
        inv.needsChasing = false;
        return "They apologised and promised to pay within the next couple of weeks.";
      }
      return "'The accountant is on holiday.' No firm date.";
    },
  },
  legal_letter: {
    description: "Send a formal demand letter through a lawyer for a seriously overdue invoice (costs money, damages the relationship).",
    params: { invoiceId: { type: "string" } },
    required: ["invoiceId"],
    mutates: true,
    run(s, a) {
      const inv = s.finance.invoices.find((x) => x.id === a.invoiceId);
      if (!inv || inv.status !== "open") throw new ActionError("No open invoice with that id.");
      const rng = new Rng(s.rng);
      book(s, -150, "professional_fees", "Lawyer's demand letter");
      resolveEventsFor(s, (e) => e.ref?.invoiceId === inv.id);
      const r = s.retainers.find((x) => x.companyId === inv.companyId && x.status === "active");
      if (r) r.satisfaction = clamp(r.satisfaction - 0.3);
      if (rng.chance(0.75)) {
        inv.payDay = s.day + rng.int(5, 20);
        inv.needsChasing = false;
        return "The letter worked. Payment is coming, but the relationship is damaged.";
      }
      return "No response yet. Next step would be court, which is slow and expensive.";
    },
  },
  write_off_invoice: {
    description: "Give up on collecting an invoice.",
    params: { invoiceId: { type: "string" } },
    required: ["invoiceId"],
    mutates: true,
    run(s, a) {
      const inv = s.finance.invoices.find((x) => x.id === a.invoiceId);
      if (!inv || inv.status !== "open") throw new ActionError("No open invoice with that id.");
      inv.status = "written_off";
      s.finance.vatOwed = Math.max(0, s.finance.vatOwed - inv.vat);
      resolveEventsFor(s, (e) => e.ref?.invoiceId === inv.id);
      logDecision(s, `Wrote off ${fmt(s, inv.net)}`);
      return `Wrote off ${fmt(s, inv.net + inv.vat)}.`;
    },
  },
  open_job: {
    description: "Post a job ad to start receiving candidates (ai_engineer, junior_dev, sales, project_manager).",
    params: { role: { type: "string", enum: ["ai_engineer", "junior_dev", "sales", "project_manager"] } },
    required: ["role"],
    mutates: true,
    run(s, a) {
      if (s.finance.legalForm === "none") throw new ActionError("Register the business first.");
      openJob(s, a.role as Role);
      return `Job ad posted for ${ROLE_LABEL[a.role as Role]}. Candidates arrive over the next few weeks.`;
    },
  },
  make_offer: {
    description: "Make a job offer to a candidate at an annual gross salary.",
    params: { candidateId: { type: "string" }, salary: { type: "number" } },
    required: ["candidateId", "salary"],
    mutates: true,
    run(s, a) {
      const c = s.candidates.find((x) => x.id === a.candidateId);
      if (!c || c.status !== "applied") throw new ActionError("That candidate isn't available.");
      makeOffer(s, c.id, num(a.salary, "salary", 1000));
      resolveEventsFor(s, (e) => e.ref?.candidateId === c.id);
      logDecision(s, `Offered ${c.name} ${fmt(s, Number(a.salary))}/yr`);
      return `Offer sent to ${c.name}. They'll answer in a few days.`;
    },
  },
  reject_candidate: {
    description: "Reject a candidate.",
    params: { candidateId: { type: "string" } },
    required: ["candidateId"],
    mutates: true,
    run(s, a) {
      const c = s.candidates.find((x) => x.id === a.candidateId);
      if (!c) throw new ActionError("No such candidate.");
      c.status = "withdrawn";
      resolveEventsFor(s, (e) => e.ref?.candidateId === c.id);
      return `Rejected ${c.name}.`;
    },
  },
  let_go: {
    description: "Let an employee go (one month's notice pay).",
    params: { employeeId: { type: "string" } },
    required: ["employeeId"],
    mutates: true,
    run(s, a) {
      const e = s.employees.find((x) => x.id === a.employeeId && x.status === "active");
      if (!e) throw new ActionError("No such active employee.");
      fire(s, e.id);
      logDecision(s, `Let ${e.name} go`);
      return `${e.name} has left. The rest of the team is shaken.`;
    },
  },
  apply_loan: {
    description: "Apply for financing: bank_sme, credit_card, friends_family, startup_grant.",
    params: { kind: { type: "string", enum: ["bank_sme", "credit_card", "friends_family", "startup_grant"] }, amount: { type: "number" } },
    required: ["kind", "amount"],
    mutates: true,
    run(s, a) {
      const kind = a.kind as LoanKind;
      if (!LOAN_TERMS[kind]) throw new ActionError("Unknown loan type.");
      if (s.finance.loans.some((l) => l.kind === kind && l.status === "pending")) throw new ActionError("You already have a pending application of this type.");
      const loan = applyForLoan(s, kind, num(a.amount, "amount", 500));
      logDecision(s, `Applied for ${LOAN_TERMS[kind].label} of ${fmt(s, loan.principal)}`);
      return `Applied for ${LOAN_TERMS[kind].label} (${fmt(s, loan.principal)}). Decision expected around ${formatDate(s.startDate, loan.decisionDay)}.`;
    },
  },
  quit_job: {
    description: "Quit the founder's day job to go full-time on the business (more hours, no salary).",
    params: {},
    mutates: true,
    run(s) {
      if (!s.situation.keepsJob) throw new ActionError("You're already full-time.");
      s.situation.keepsJob = false;
      s.situation.hoursPerWeek = 50;
      s.plan.deliveryHours += 15;
      s.plan.emailHours += 6;
      s.plan.networkingHours += 4;
      s.plan.linkedinHours += 3;
      logDecision(s, "Quit the day job");
      return "You handed in your notice. You're full-time now, and your safety net is gone.";
    },
  },
  dismiss_event: {
    description: "Mark an inbox item as handled without taking an action.",
    params: { eventId: { type: "string" } },
    required: ["eventId"],
    mutates: true,
    run(s, a) {
      resolveEventsFor(s, (e) => e.id === a.eventId, "dismissed");
      return "Dismissed.";
    },
  },
  advance_time: {
    description: "Advance the simulation: 'day', 'week', or 'until_event' (run until something needs the founder's attention).",
    params: { mode: { type: "string", enum: ["day", "week", "until_event"] } },
    required: ["mode"],
    mutates: true,
    run(s, a) {
      if (a.mode === "day") advanceDays(s, 1);
      else if (a.mode === "week") advanceDays(s, 7);
      else {
        const r = runUntilEvent(s);
        return `Advanced ${r.days} days.${r.stoppedBy ? ` Stopped: ${r.stoppedBy}` : ""}`;
      }
      return `It's now ${formatDate(s.startDate, s.day)}.`;
    },
  },
  close_business: {
    description: "Shut the business down voluntarily (ends the game).",
    params: {},
    mutates: true,
    run(s) {
      endGame(s, "You decided to close the business.");
      return "Business closed.";
    },
  },
};

export function runAction(s: GameState, name: string, args: Args): string {
  const def = ACTIONS[name];
  if (!def) throw new ActionError(`Unknown action ${name}`);
  if (s.status !== "active" && name !== "dismiss_event") throw new ActionError("The game is over.");
  return def.run(s, args);
}

/** Apply a live (LLM-played) discovery call's assessed outcome. */
export function applyLiveCall(s: GameState, dealId: string, call: CallRecord) {
  const d = deal(s, dealId);
  applyCall(s, d, call);
  resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "live call");
}

/** Apply the outcome of a live negotiation chat. */
export function applyNegotiation(s: GameState, dealId: string, agreedPrice: number | null) {
  const d = deal(s, dealId);
  const p = d.proposal!;
  const c = company(s, d.companyId);
  resolveEventsFor(s, (e) => e.ref?.dealId === d.id, "negotiated");
  if (agreedPrice !== null && agreedPrice > 0 && agreedPrice <= p.reservationPrice * 1.05) {
    p.buildPrice = Math.round(agreedPrice);
    p.status = "accepted";
    logDecision(s, `Negotiated ${c.name} to ${fmt(s, p.buildPrice)}`);
    return `Deal agreed at ${fmt(s, p.buildPrice)}.`;
  }
  if (agreedPrice !== null && agreedPrice > p.reservationPrice * 1.05) {
    // The agent said yes, but the numbers don't work for the business: it gets walked back after the call.
    p.status = "countered";
    p.counterPrice = Math.round(p.reservationPrice / 100) * 100;
    return `${c.contact.name} emailed after the call: "I spoke to my partner; we can only do ${fmt(s, p.counterPrice)}."`;
  }
  return "No agreement yet. The counter-offer still stands.";
}
