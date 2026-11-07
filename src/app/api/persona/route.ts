import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { INDUSTRY_IDS } from "@/engine/industries";
import { client, errorResponse, MODEL, refused } from "@/lib/server/ai";

export const maxDuration = 120;

const Profile = z.object({
  name: z.string(),
  headline: z.string().describe("One-line professional headline"),
  location: z.string(),
  publicSummary: z.string().describe("2-3 sentences: how a busy SMB owner would perceive this person after a 2-minute look at their LinkedIn/website"),
  strengths: z.array(z.string()).describe("3-5 honest strengths relevant to running an AI consultancy"),
  gaps: z.array(z.string()).describe("3-5 honest gaps or risks relevant to running an AI consultancy"),
  skills: z.object({
    technical: z.number(),
    sales: z.number(),
    consulting: z.number(),
    delivery: z.number(),
    credibility: z.number(),
  }),
  industriesKnown: z.array(z.enum(INDUSTRY_IDS as [string, ...string[]])).describe("Industries where they have real domain experience or contacts, at most 3"),
  warmNetwork: z.number().describe("Estimated number of business decision-makers who would take a call from them"),
  yearsExperience: z.number(),
  evidence: z.array(z.string()).describe("Short notes on which concrete facts from the sources drove the ratings"),
});

const SYSTEM = `You assess a real person's background to create their founder profile in a realistic business simulation, where they will start an AI consulting & automation agency selling to SMBs.

The simulation is only useful if the profile is honest. Flattering ratings make the simulation lie to them. Rate from evidence, not potential; when evidence is thin, rate conservatively and say so in "evidence".

Skill scale (0 to 1):
- technical: 0.3 = can use no-code tools; 0.5 = professional developer who has shipped at least one LLM feature; 0.7 = has built several production AI systems; 0.9 = senior ML/AI engineer with deep production experience.
- sales: 0.1 = never sold anything; 0.3 = some freelance clients or pre-sales exposure; 0.5 = has run B2B sales cycles; 0.8 = proven closer with quota history.
- consulting: ability to run discovery and frame business problems. 0.2 = no client-facing work; 0.5 = regular client/stakeholder work, requirements gathering; 0.8 = management consultant or long-term solutions architect.
- delivery: project management and estimation discipline. 0.3 = individual contributor only; 0.6 = led projects/teams; 0.8 = ran a delivery org.
- credibility: how a stranger perceives them from public signals (titles, known employers, portfolio, recommendations, GitHub activity, content). 0.2 = thin/empty profile; 0.5 = solid professional profile; 0.8 = recognised expert.

warmNetwork: count only people who could plausibly buy or introduce buyers (SMB owners, managers, ex-colleagues now in business roles). Engineers' networks are mostly other engineers; typical values are 10-60. Students or people new to a country: 0-15.`;

async function githubSummary(username: string): Promise<string> {
  const u = encodeURIComponent(username.trim().replace(/^@/, ""));
  if (!u) return "";
  const headers = { "User-Agent": "founder-sim", Accept: "application/vnd.github+json" };
  const [userRes, reposRes] = await Promise.all([
    fetch(`https://api.github.com/users/${u}`, { headers }),
    fetch(`https://api.github.com/users/${u}/repos?per_page=100&sort=updated`, { headers }),
  ]);
  if (!userRes.ok) return `GitHub user "${username}" could not be fetched (HTTP ${userRes.status}).`;
  const user = await userRes.json();
  const repos: { name: string; description: string | null; language: string | null; stargazers_count: number; fork: boolean; pushed_at: string; topics?: string[] }[] = reposRes.ok ? await reposRes.json() : [];
  const own = repos.filter((r) => !r.fork);
  const top = [...own].sort((a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at)).slice(0, 25);
  const langs: Record<string, number> = {};
  for (const r of own) if (r.language) langs[r.language] = (langs[r.language] ?? 0) + 1;
  return [
    `GitHub: ${user.login} (${user.name ?? "no name"}), bio: ${user.bio ?? "none"}, company: ${user.company ?? "none"}, location: ${user.location ?? "none"}, followers: ${user.followers}, public repos: ${user.public_repos}, account since ${String(user.created_at).slice(0, 10)}.`,
    `Languages: ${Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(", ")}`,
    `Repos (own, by stars then recency):`,
    ...top.map((r) => `- ${r.name} [${r.language ?? "?"}, ★${r.stargazers_count}, last push ${r.pushed_at.slice(0, 10)}]: ${r.description ?? ""}${r.topics?.length ? ` topics: ${r.topics.join(", ")}` : ""}`),
  ].join("\n");
}

async function pdfBlock(file: File | null, title: string): Promise<Anthropic.DocumentBlockParam | undefined> {
  if (!file || file.size === 0) return;
  if (file.type !== "application/pdf") return;
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const github = String(form.get("githubUsername") ?? "");
    const linkedinText = String(form.get("linkedinText") ?? "");
    const notes = String(form.get("notes") ?? "");
    const market = String(form.get("market") ?? "CY");
    const cv = await pdfBlock(form.get("cv") as File | null, "CV");
    const li = await pdfBlock(form.get("linkedinPdf") as File | null, "LinkedIn profile export");
    const cvText = form.get("cv") instanceof File && (form.get("cv") as File).type !== "application/pdf" ? await (form.get("cv") as File).text() : "";

    const gh = github ? await githubSummary(github) : "";
    if (!cv && !li && !linkedinText && !gh && !notes && !cvText) return Response.json({ error: "Give at least one source: CV, LinkedIn, GitHub, or a description." }, { status: 400 });

    const content: Anthropic.ContentBlockParam[] = [];
    if (cv) content.push(cv);
    if (li) content.push(li);
    content.push({
      type: "text",
      text: [
        `Market the business will operate in: ${market}.`,
        cvText && `CV (text):\n${cvText}`,
        linkedinText && `LinkedIn profile (pasted):\n${linkedinText}`,
        gh,
        notes && `The person's own notes about themselves:\n${notes}`,
        "Build their founder profile.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(Profile) },
      messages: [{ role: "user", content }],
    });
    const r = refused(msg);
    if (r) return r;
    const p = msg.parsed_output;
    if (!p) return Response.json({ error: "Couldn't parse the profile. Try again." }, { status: 502 });
    const c = (x: number) => Math.max(0.05, Math.min(0.95, x));
    return Response.json({
      profile: {
        ...p,
        skills: { technical: c(p.skills.technical), sales: c(p.skills.sales), consulting: c(p.skills.consulting), delivery: c(p.skills.delivery), credibility: c(p.skills.credibility) },
        industriesKnown: p.industriesKnown.slice(0, 3),
        warmNetwork: Math.max(0, Math.min(300, Math.round(p.warmNetwork))),
        evidence: [...p.evidence, ...(gh ? ["GitHub profile"] : []), ...(cv ? ["CV"] : []), ...(li || linkedinText ? ["LinkedIn"] : [])],
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
