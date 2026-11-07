import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const client = new Anthropic();
export const MODEL = process.env.AGENT_MODEL || "claude-haiku-5-5";

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function errorResponse(err: unknown): Response {
  if (err instanceof Anthropic.RateLimitError) return Response.json({ error: "The AI is rate limited. Try again in a moment." }, { status: 429 });
  if (err instanceof Anthropic.AuthenticationError) return Response.json({ error: "ANTHROPIC_API_KEY is missing or invalid (check .env.local)." }, { status: 500 });
  if (err instanceof Anthropic.BadRequestError) return Response.json({ error: `Bad request to the AI: ${err.message}` }, { status: 400 });
  if (err instanceof Anthropic.APIError) return Response.json({ error: `AI error ${err.status}: ${err.message}` }, { status: 502 });
  if (err instanceof Anthropic.APIConnectionError) return Response.json({ error: "Couldn't reach the AI service." }, { status: 502 });
  return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
}

export function refused(msg: Anthropic.Message): Response | undefined {
  if (msg.stop_reason === "refusal") return Response.json({ error: "The AI declined to answer this one. Try rephrasing." }, { status: 422 });
}
