import type Anthropic from "@anthropic-ai/sdk";
import { ACTIONS } from "@/engine/actions";
import { client, errorResponse, MODEL, refused } from "@/lib/server/ai";
import { ASSISTANT_SYSTEM } from "@/lib/prompts";

export const maxDuration = 120;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_details",
    description:
      "Read what the founder currently knows. section: overview | inbox | pipeline | deal (needs id) | projects | finance | team | policies | market | funnel. Returns JSON. Runs without approval.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", enum: ["overview", "inbox", "pipeline", "deal", "projects", "finance", "team", "policies", "market", "funnel"] },
        id: { type: "string", description: "Deal id for section=deal" },
      },
      required: ["section"],
    },
  },
  ...Object.entries(ACTIONS).map(
    ([name, def]): Anthropic.Tool => ({
      name,
      description: `${def.description} (Requires the founder's approval.)`,
      input_schema: { type: "object", properties: def.params as Record<string, unknown>, required: def.required ?? [] },
    }),
  ),
];

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: Anthropic.MessageParam[] };
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: ASSISTANT_SYSTEM,
      tools: TOOLS,
      cache_control: { type: "ephemeral" },
      output_config: { effort: "medium" },
      messages,
    });
    const r = refused(msg);
    if (r) return r;
    return Response.json({ content: msg.content, stop_reason: msg.stop_reason });
  } catch (err) {
    return errorResponse(err);
  }
}
