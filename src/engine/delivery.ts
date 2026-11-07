import { ARCHETYPES, DELIVERY } from "./calibration";
import { addBusinessDays } from "./calendar";
import { milestone, pushEvent } from "./events";
import { fmt, issueInvoice } from "./finance";
import { clamp, Rng } from "./rng";
import { company } from "./sales";
import type { Deal, GameState, Project } from "./types";

export function startProject(s: GameState, d: Deal, price: number) {
  const rng = new Rng(s.rng);
  const p = d.proposal!;
  const c = company(s, d.companyId);
  let effort = 0;
  for (const it of p.items) {
    const pain = c.pains.find((x) => x.id === it.painId)!;
    effort += it.archetype === pain.archetype ? pain.effortHours : (ARCHETYPES[it.archetype].effort[0] + ARCHETYPES[it.archetype].effort[1]) / 2 * 1.3;
  }
  const overrunMedian = DELIVERY.overrunMedian - 0.15 * (s.founder.skills.delivery - 0.5);
  const project: Project = {
    id: rng.id("prj"),
    dealId: d.id,
    companyId: c.id,
    name: p.items.map((it) => ARCHETYPES[it.archetype].label).join(" + "),
    painIds: p.items.map((it) => it.painId),
    price,
    effortTrue: Math.round(effort * rng.lognormal(overrunMedian, DELIVERY.overrunSigma)),
    effortDone: 0,
    estimateHours: p.estimateHours,
    startDay: s.day,
    dueDay: s.day + p.timelineWeeks * 7,
    hoursLogged: 0,
    quality: 0,
    satisfaction: 0.7,
    status: "active",
    overrunEvents: 0,
    changeRequests: 0,
    retainerOffered: p.retainerMonthly,
    finalInvoiced: false,
  };
  s.projects.push(project);
  d.stage = "won";
  c.status = "client";
  s.funnel.proposalsWon++;
  s.monthAcc.wins++;
  if (p.workshopFee > 0) issueInvoice(s, c.id, p.workshopFee, "Discovery workshop", p.netDays);
  const upfront = Math.round((price * p.upfrontPct) / 100);
  if (upfront > 0) issueInvoice(s, c.id, upfront, `${project.name}: ${p.upfrontPct}% upfront`, Math.min(p.netDays, 14));
  milestone(s, "first_client", "First paying client!", `${c.name} signed. Now deliver something they'll brag about. Your next five clients depend on it.`);
}

/** Capacity in productive hours for today, before allocating to projects. */
export function deliveryCapacity(s: GameState, founderHours: number): number {
  const founderProd = (0.6 + 0.7 * s.founder.skills.technical) * (0.5 + 0.5 * s.situation.energy);
  let cap = founderHours * founderProd;
  const pm = s.employees.some((e) => e.status === "active" && e.role === "project_manager" && s.day >= e.startDay);
  for (const e of s.employees) {
    if (e.status !== "active" || s.day < e.startDay) continue;
    if (e.role === "ai_engineer" || e.role === "junior_dev") cap += 6.4 * (0.4 + 0.8 * e.skill) * (0.6 + 0.4 * e.morale);
  }
  return cap * (pm ? 1.1 : 1);
}

export function dailyDelivery(s: GameState, capacity: number): number {
  const rng = new Rng(s.rng);
  // Retainer support eats capacity first
  const retainers = s.retainers.filter((r) => r.status === "active").length;
  let cap = Math.max(0, capacity - (retainers * DELIVERY.incidentHoursPerRetainer) / 21);
  const active = s.projects.filter((p) => p.status === "active").sort((a, b) => a.dueDay - b.dueDay);
  let used = capacity - cap;
  for (const p of active) {
    if (cap <= 0) break;
    const need = p.effortTrue - p.effortDone;
    const h = Math.min(need, cap);
    p.effortDone += h;
    p.hoursLogged += h;
    cap -= h;
    used += h;
    const progress = p.effortDone / p.effortTrue;
    const c = company(s, p.companyId);
    if (p.overrunEvents === 0 && progress > 0.3) {
      p.overrunEvents++;
      if (rng.chance(c.dataMess * 0.6)) {
        const extra = Math.round(p.effortTrue * rng.range(0.15, 0.4));
        p.effortTrue += extra;
        pushEvent(s, "project_overrun", `${c.name}: their data is messier than expected`, `Integrating with their systems is harder than planned: about +${extra}h of work. This is the most common way consulting projects lose money.`, { ref: { projectId: p.id } });
      }
    }
    if (p.effortDone >= p.effortTrue) completeProject(s, p);
  }
  for (const p of active) {
    if (p.status !== "active") continue;
    if (s.day > p.dueDay) {
      p.satisfaction = clamp(p.satisfaction - 0.006);
      if (s.day === p.dueDay + 1) {
        const c = company(s, p.companyId);
        pushEvent(s, "project_late", `${c.name} project is late`, `${p.name} was due today and is ${Math.round((p.effortDone / p.effortTrue) * 100)}% done. Every week late costs you client satisfaction and referrals. Consider moving hours to delivery or hiring help.`, { attention: true, ref: { projectId: p.id } });
      }
    }
  }
  return used;
}

export function weeklyScopeChanges(s: GameState) {
  const rng = new Rng(s.rng);
  for (const p of s.projects) {
    if (p.status !== "active" || !rng.chance(DELIVERY.scopeChangeWeekly)) continue;
    const c = company(s, p.companyId);
    const extra = Math.round(p.effortTrue * rng.range(0.08, 0.25));
    p.changeRequests++;
    if (s.policies.scopeCreep === "absorb_small" && extra <= 12) {
      p.effortTrue += extra;
      p.satisfaction = clamp(p.satisfaction + 0.03);
      pushEvent(s, "scope_change", `Absorbed a small change for ${c.name}`, `${extra}h added for free, per your policy.`, { ref: { projectId: p.id } });
      continue;
    }
    if (s.policies.scopeCreep === "change_order") {
      pushEvent(s, "scope_change", `Change order sent to ${c.name}`, `${c.contact.name} asked for extra features (~${extra}h). Per your policy you quoted it at ${fmt(s, extra * s.policies.hourlyRate)}.`, { ref: { projectId: p.id } });
      if (rng.chance(0.6)) {
        p.effortTrue += extra;
        p.price += extra * s.policies.hourlyRate;
      } else p.satisfaction = clamp(p.satisfaction - 0.02);
      continue;
    }
    s.flags[`scope_${p.id}`] = extra;
    pushEvent(s, "scope_change", `${c.contact.name} wants "just one more thing"`, `${c.name} asked for an extra feature that's about ${extra}h of work. Absorb it (happier client, less margin), send a change order (${fmt(s, extra * s.policies.hourlyRate)} at your rate), or decline.`, { attention: true, ref: { projectId: p.id } });
  }
}

export function resolveScopeChange(s: GameState, p: Project, choice: "absorb" | "change_order" | "decline") {
  const rng = new Rng(s.rng);
  const extra = s.flags[`scope_${p.id}`] ?? 0;
  delete s.flags[`scope_${p.id}`];
  if (choice === "absorb") {
    p.effortTrue += extra;
    p.satisfaction = clamp(p.satisfaction + 0.04);
    return `Absorbed ${extra}h.`;
  }
  if (choice === "change_order") {
    if (rng.chance(0.6)) {
      p.effortTrue += extra;
      p.price += extra * s.policies.hourlyRate;
      return `Approved: +${fmt(s, extra * s.policies.hourlyRate)} on the final invoice.`;
    }
    p.satisfaction = clamp(p.satisfaction - 0.02);
    return "They decided they don't need it after all.";
  }
  p.satisfaction = clamp(p.satisfaction - 0.05);
  return "Declined. They're a little disappointed but it protected your margin.";
}

function completeProject(s: GameState, p: Project) {
  const rng = new Rng(s.rng);
  const c = company(s, p.companyId);
  const d = s.deals.find((x) => x.id === p.dealId)!;
  const team = s.employees.filter((e) => e.status === "active" && (e.role === "ai_engineer" || e.role === "junior_dev"));
  const teamSkill = team.length ? (s.founder.skills.technical + team.reduce((a, e) => a + e.skill, 0)) / (team.length + 1) : s.founder.skills.technical;
  p.quality = clamp(0.4 + 0.45 * teamSkill + rng.normal(0, 0.08) - (s.situation.energy < 0.5 ? 0.1 : 0));
  const fit = d.proposal!.items.reduce((a, it) => {
    const pain = c.pains.find((x) => x.id === it.painId)!;
    return a + (it.archetype === pain.archetype ? pain.aiFit : pain.archetype === "not_ai" ? 0.05 : pain.aiFit * 0.4);
  }, 0) / d.proposal!.items.length;
  const lateDays = Math.max(0, s.day - p.dueDay);
  p.satisfaction = clamp(p.satisfaction * 0.4 + 0.25 * p.quality + 0.35 * Math.min(1, fit / 0.6) - lateDays * 0.004);
  p.status = "delivered";
  p.deliveredDay = s.day;
  const upfront = Math.round((p.price * d.proposal!.upfrontPct) / 100);
  issueInvoice(s, c.id, p.price - upfront, `${p.name}: final payment`, d.proposal!.netDays);
  p.finalInvoiced = true;
  const r = s.reputation;
  r.completedProjects++;
  r.satisfactionSum += p.satisfaction;
  const margin = (p.price / Math.max(1, p.hoursLogged)).toFixed(0);
  let extra = "";
  if (p.satisfaction > 0.7 && rng.chance(0.6)) {
    r.testimonials++;
    extra += " They gave you a testimonial.";
  }
  if (p.satisfaction > 0.7 && rng.chance(0.5)) {
    r.caseStudies++;
    r.brand = clamp(r.brand + 0.03);
    extra += " They agreed to a public case study.";
  }
  if (p.satisfaction > 0.6 && rng.chance(0.35 * p.satisfaction * 1.5)) {
    const pool = s.companies.filter((x) => x.status === "untouched" || x.status === "contacted");
    const same = pool.filter((x) => x.industry === c.industry);
    const target = rng.pick(same.length ? same : pool);
    if (target) s.pendingReplies.push({ companyId: target.id, day: s.day + rng.int(15, 90), kind: "positive", source: "referral" });
  }
  if (p.satisfaction < 0.45) {
    r.brand = clamp(r.brand - 0.03);
    extra += " They're unhappy and will tell people.";
  }
  if (p.retainerOffered > 0 && rng.chance(0.35 + 0.6 * p.satisfaction)) {
    const runCost = c.pains.filter((x) => p.painIds.includes(x.id)).reduce((a, x) => a + x.monthlyRunCost, 0);
    s.retainers.push({ id: rng.id("ret"), companyId: c.id, projectId: p.id, monthly: p.retainerOffered, runCost, startDay: s.day, satisfaction: p.satisfaction, status: "active" });
    extra += ` They signed the ${fmt(s, p.retainerOffered)}/month maintenance retainer.`;
  } else if (p.retainerOffered > 0) extra += " They declined the maintenance retainer.";
  pushEvent(s, "project_delivered", `Delivered: ${p.name} for ${c.name}`, `Satisfaction ${Math.round(p.satisfaction * 100)}/100. ${p.hoursLogged.toFixed(0)}h logged vs ${p.estimateHours}h estimated (${fmt(s, Number(margin))}/h effective).${extra}`, { attention: true, ref: { projectId: p.id } });
}

/** Monthly: retainer invoices, satisfaction drift, churn. */
export function monthlyRetainers(s: GameState) {
  const rng = new Rng(s.rng);
  const capacityOk = s.projects.filter((p) => p.status === "active" && s.day > p.dueDay).length === 0;
  for (const r of s.retainers) {
    if (r.status !== "active") continue;
    const c = company(s, r.companyId);
    r.satisfaction = clamp(r.satisfaction + (capacityOk ? 0.01 : -0.04) + rng.normal(0, 0.03));
    const churn = DELIVERY.retainerChurnMonthly * (1.6 - r.satisfaction) * (0.7 + c.inHouseThreat) * (s.day - r.startDay > 240 ? 1.4 : 1);
    if (s.day - r.startDay > 25 && rng.chance(churn)) {
      r.status = "churned";
      r.churnReason = r.satisfaction < 0.5 ? "unhappy with responsiveness" : c.inHouseThreat > 0.3 ? "decided to manage it in-house" : "cutting costs; 'it works fine now, what are we paying for?'";
      pushEvent(s, "retainer_churn", `${c.name} cancelled their retainer`, `Reason given: ${r.churnReason}. That's ${fmt(s, r.monthly)}/month of recurring revenue gone.`, { attention: true, ref: { retainerId: r.id } });
      continue;
    }
    const total = r.monthly + (s.policies.passThroughRunCosts ? r.runCost : 0);
    issueInvoice(s, c.id, total, `Monthly maintenance${s.policies.passThroughRunCosts ? " + run costs" : ""}`);
  }
}

export function kickoffDay(s: GameState) {
  return addBusinessDays(s.startDate, s.day, 1);
}
