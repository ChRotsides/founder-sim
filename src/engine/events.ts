import { Rng } from "./rng";
import type { EventKind, GameEvent, GameState } from "./types";

export function pushEvent(
  s: GameState,
  kind: EventKind,
  title: string,
  body: string,
  opts: { attention?: boolean; ref?: GameEvent["ref"] } = {},
): GameEvent {
  const rng = new Rng(s.rng);
  const e: GameEvent = { id: rng.id("ev"), day: s.day, kind, title, body, attention: opts.attention ?? false, resolved: !(opts.attention ?? false), ref: opts.ref };
  s.events.push(e);
  if (s.events.length > 400) {
    // Keep unresolved events and the most recent history.
    const keep = s.events.filter((x) => !x.resolved);
    const old = s.events.filter((x) => x.resolved).slice(-300);
    s.events = [...old, ...keep].sort((a, b) => a.day - b.day);
  }
  return e;
}

export function resolveEventsFor(s: GameState, match: (e: GameEvent) => boolean, choice?: string) {
  for (const e of s.events) {
    if (!e.resolved && match(e)) {
      e.resolved = true;
      if (choice) e.choice = choice;
    }
  }
}

export function milestone(s: GameState, key: string, title: string, body: string) {
  if (s.milestones.includes(key)) return;
  s.milestones.push(key);
  pushEvent(s, "milestone", title, body);
}

export function logDecision(s: GameState, text: string) {
  s.decisionsLog.push({ day: s.day, text });
  if (s.decisionsLog.length > 300) s.decisionsLog.splice(0, s.decisionsLog.length - 300);
}
