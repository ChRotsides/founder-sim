import type Anthropic from "@anthropic-ai/sdk";
import { client, errorResponse, MODEL, refused, textOf } from "@/lib/server/ai";
import { npcSystemPrompt, type ChatTurn, type NpcContext } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { context, messages } = (await req.json()) as { context: NpcContext; messages: ChatTurn[] };
    const history: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role === "founder" ? "user" : "assistant", content: m.text }));
    if (!history.length || history[0].role !== "user") history.unshift({ role: "user", content: "(The call connects.)" });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: npcSystemPrompt(context),
      cache_control: { type: "ephemeral" },
      output_config: { effort: "low" },
      messages: history,
    });
    const r = refused(msg);
    if (r) return r;
    return Response.json({ text: textOf(msg) || "…" });
  } catch (err) {
    return errorResponse(err);
  }
}
