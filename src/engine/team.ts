import { pushEvent, milestone } from "./events";
import { book, fmt, market } from "./finance";
import { clamp, Rng, sigmoid } from "./rng";
import type { GameState, Role } from "./types";
import { makeCandidate } from "./world";

export const ROLE_LABEL: Record<Role, string> = {
  ai_engineer: "AI engineer",
  junior_dev: "Junior developer",
  sales: "Sales / business developer",
  project_manager: "Project manager",
};

export function openJob(s: GameState, role: Role) {
  s.jobOpen = { role, openedDay: s.day };
  book(s, -150, "marketing", `Job ad: ${ROLE_LABEL[role]}`);
}

export function dailyHiring(s: GameState) {
  const rng = new Rng(s.rng);
  const job = s.jobOpen;
  if (job) {
    const age = s.day - job.openedDay;
    if (age > 35) {
      s.jobOpen = undefined;
    } else {
      const rate = (market(s).id === "CY" ? 0.15 : 0.3) * (1 + s.reputation.brand);
      for (let i = 0; i < rng.poisson(rate); i++) {
        const cand = makeCandidate(rng, market(s), job.role, s.day);
        s.candidates.push(cand);
        pushEvent(s, "candidate_applied", `${cand.name} applied for ${ROLE_LABEL[job.role]}`, `${cand.background}. Asking ${fmt(s, cand.salaryAsk)}/year.`, { attention: s.candidates.filter((c) => c.status === "applied").length === 1, ref: { candidateId: cand.id } });
      }
    }
  }
  // Offers made a few days ago get an answer
  for (const c of s.candidates) {
    if (c.status !== "offered" || (s.flags[`offer_${c.id}`] ?? Infinity) > s.day) continue;
    const salary = s.flags[`offersal_${c.id}`] ?? c.salaryAsk;
    delete s.flags[`offer_${c.id}`];
    const p = sigmoid(6 * (salary / c.salaryAsk - 1) + 1.2 * s.reputation.brand + 0.3 - (s.reputation.completedProjects < 2 ? 0.6 : 0));
    if (rng.chance(p)) {
      c.status = "hired";
      const start = s.day + 30;
      s.employees.push({ ...c, salary, startDay: start, morale: 0.8, status: "active" });
      s.jobOpen = undefined;
      pushEvent(s, "offer_response", `${c.name} accepted your offer`, `Starts after a one-month notice period. Cost: ${fmt(s, salary)}/year gross plus ${Math.round(market(s).employerContrib * 100)}% employer contributions.`, { attention: true, ref: { candidateId: c.id } });
      milestone(s, "first_hire", "Your first hire", "You're now responsible for someone else's income. Payroll comes before your own salary.");
    } else {
      c.status = "declined";
      pushEvent(s, "offer_response", `${c.name} declined your offer`, salary < c.salaryAsk ? "They took a better-paid offer. Startups competing on salary with established firms usually lose." : "They decided a young company was too risky.", { attention: true, ref: { candidateId: c.id } });
    }
  }
}

export function makeOffer(s: GameState, candidateId: string, salary: number) {
  const c = s.candidates.find((x) => x.id === candidateId)!;
  c.status = "offered";
  s.flags[`offer_${c.id}`] = s.day + 3;
  s.flags[`offersal_${c.id}`] = salary;
}

/** Monthly: morale and attrition. Ambitious people eventually leave to start their own thing. */
export function monthlyTeam(s: GameState) {
  const rng = new Rng(s.rng);
  for (const e of s.employees) {
    if (e.status !== "active" || s.day < e.startDay) continue;
    const overdue = s.projects.filter((p) => p.status === "active" && s.day > p.dueDay).length;
    e.morale = clamp(e.morale + (overdue ? -0.05 : 0.01) + (e.salary < e.salaryAsk ? -0.02 : 0) + rng.normal(0, 0.03));
    const tenureYears = (s.day - e.startDay) / 365;
    const pQuit = 0.008 + 0.04 * (1 - e.morale) + e.ambition * 0.012 * tenureYears;
    if (rng.chance(pQuit)) {
      e.status = "notice_incoming";
      e.leaveDay = s.day + 30;
      const ownBusiness = e.ambition > 0.55 && (e.role === "ai_engineer" || e.role === "sales");
      pushEvent(s, "employee_resigned", `${e.name} handed in their notice`, ownBusiness ? `They're starting their own AI consultancy. Expect to compete with them, possibly for your own clients.` : e.morale < 0.5 ? "They're burnt out / unhappy with workload." : "They got a better offer elsewhere.", { attention: true, ref: { employeeId: e.id } });
      if (ownBusiness) s.competitors.push({ id: rng.id("cmp"), name: `${e.name.split(" ")[0]}'s new AI studio`, kind: "freelancer", priceLevel: 0.75, quality: e.skill, reputation: 0.3 });
    }
  }
  for (const e of s.employees) if (e.status === "notice_incoming" && (e.leaveDay ?? 0) <= s.day) e.status = "left";
}

export function fire(s: GameState, employeeId: string) {
  const e = s.employees.find((x) => x.id === employeeId)!;
  const m = market(s);
  const notice = e.salary / 12;
  book(s, -notice * (1 + m.employerContrib), "salaries", `Notice pay: ${e.name}`);
  e.status = "left";
  for (const o of s.employees) if (o.status === "active") o.morale = clamp(o.morale - 0.1);
}

export function salesStaffHours(s: GameState): number {
  return s.employees.filter((e) => e.status === "active" && e.role === "sales" && s.day >= e.startDay).reduce((a, e) => a + 6 * (0.5 + e.skill), 0);
}
