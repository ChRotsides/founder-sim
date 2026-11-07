import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { client, errorResponse, MODEL, refused } from "@/lib/server/ai";
import { DISCOVERY_ASSESS_SYSTEM, NEGOTIATION_ASSESS_SYSTEM, type ChatTurn, type DiscoveryContext, type NegotiationContext } from "@/lib/prompts";

export const maxDuration = 90;

function transcript(ctx: { founder: { name: string }; contact: { name: string } }, messages: ChatTurn[]) {
  return messages.map((m) => `${m.role === "founder" ? `FOUNDER (${ctx.founder.name})` : `PROSPECT (${ctx.contact.name})`}: ${m.text}`).join("\n");
}

export async function POST(req: Request) {
  try {
    const { context, messages } = (await req.json()) as { context: DiscoveryContext | NegotiationContext; messages: ChatTurn[] };
    if (context.kind === "discovery") {
      const ids = context.pains.map((p) => p.id) as [string, ...string[]];
      const Schema = z.object({
        discoveredPainIds: z.array(z.enum(ids)),
        quantifiedPainIds: z.array(z.enum(ids)),
        nextStep: z.enum(["proposal_requested", "follow_up_later", "not_interested", "send_info"]),
        trustDelta: z.number(),
        coaching: z.array(z.string()),
        summary: z.string().describe("Two sentences: what was learned about the prospect"),
      });
      const msg = await client.messages.parse({
        model: MODEL,
        max_tokens: 6000,
        system: DISCOVERY_ASSESS_SYSTEM,
        output_config: { effort: "medium", format: zodOutputFormat(Schema) },
        messages: [
          {
            role: "user",
            content: `The prospect's real situation (hidden from the founder):\n${context.pains.map((p) => `- id=${p.id} | ${p.title}: ${p.detail}`).join("\n")}\nProspect openness going in: ${context.openness.toFixed(2)}\n\nTranscript:\n${transcript(context, messages)}`,
          },
        ],
      });
      const r = refused(msg);
      if (r) return r;
      const out = msg.parsed_output;
      if (!out) return Response.json({ error: "Couldn't assess the call." }, { status: 502 });
      const disc = [...new Set(out.discoveredPainIds)];
      return Response.json({
        ...out,
        discoveredPainIds: disc,
        quantifiedPainIds: [...new Set(out.quantifiedPainIds)].filter((id) => disc.includes(id)),
        trustDelta: Math.max(-0.2, Math.min(0.2, out.trustDelta)),
      });
    }
    const Schema = z.object({ agreed: z.boolean(), agreedBuildPrice: z.number().nullable(), coaching: z.array(z.string()), summary: z.string() });
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: NEGOTIATION_ASSESS_SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(Schema) },
      messages: [{ role: "user", content: `Original build price ${context.proposal.buildPrice}, client's counter ${context.counterPrice}.\n\nTranscript:\n${transcript(context, messages)}` }],
    });
    const r = refused(msg);
    if (r) return r;
    if (!msg.parsed_output) return Response.json({ error: "Couldn't assess the negotiation." }, { status: 502 });
    return Response.json(msg.parsed_output);
  } catch (err) {
    return errorResponse(err);
  }
}
