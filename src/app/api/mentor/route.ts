import { client, errorResponse, MODEL, refused, textOf } from "@/lib/server/ai";
import { MENTOR_SYSTEM } from "@/lib/prompts";

export const maxDuration = 90;

const MODES: Record<string, string> = {
  month_review: "Review how the business is doing based on this data and tell me what to focus on next month.",
  post_mortem: "The game is over. Run an honest post-mortem: what actually killed (or saved) this business, which decisions mattered most, and what I should do differently, both in the next run and in real life.",
  reality_check: "Based on how I played, what would I need to verify in the real world before betting real money on this plan? Be specific to my niche, prices and channels.",
  ask: "",
};

export async function POST(req: Request) {
  try {
    const { digest, mode, question } = (await req.json()) as { digest: string; mode: string; question?: string };
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: MENTOR_SYSTEM,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: `${digest}\n\n${MODES[mode] ?? ""}${question ? `\nMy question: ${question}` : ""}` }],
    });
    const r = refused(msg);
    if (r) return r;
    return Response.json({ text: textOf(msg) });
  } catch (err) {
    return errorResponse(err);
  }
}
