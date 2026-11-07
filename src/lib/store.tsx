"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { del, get, set } from "idb-keyval";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ActionError, runAction } from "@/engine/actions";
import { metrics } from "@/engine/selectors";
import type { GameState } from "@/engine/types";

const SAVE_KEY = "founder-sim/save/v1";
const ASSIST_KEY = "founder-sim/assistant/v1";
const HISTORY_KEY = "founder-sim/history/v1";

export interface RunSummary {
  businessName: string;
  market: string;
  days: number;
  reason: string;
  revenue: number;
  clients: number;
  mrr: number;
  endedAt: string;
}

export interface ActResult {
  ok: boolean;
  message: string;
}

interface Store {
  ready: boolean;
  state: GameState | null;
  history: RunSummary[];
  assistant: Anthropic.MessageParam[];
  setAssistant: (m: Anthropic.MessageParam[]) => void;
  /** Run an engine action by name (shared with the AI assistant's tools). */
  act: (name: string, args?: Record<string, unknown>) => ActResult;
  /** Arbitrary engine mutation on a copy of the state. */
  mutate: <T>(fn: (s: GameState) => T) => T | undefined;
  startGame: (s: GameState) => void;
  endRun: () => void;
}

const Ctx = createContext<Store | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [assistant, setAssistantState] = useState<Anthropic.MessageParam[]>([]);
  const ref = useRef<GameState | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, h, a] = await Promise.all([get<GameState>(SAVE_KEY), get<RunSummary[]>(HISTORY_KEY), get<Anthropic.MessageParam[]>(ASSIST_KEY)]);
        if (s) {
          ref.current = s;
          setState(s);
        }
        if (h) setHistory(h);
        if (a) setAssistantState(a);
      } catch {
        // storage unavailable (private mode): play without saving
      }
      setReady(true);
    })();
  }, []);

  const commit = useCallback((next: GameState | null) => {
    ref.current = next;
    setState(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      (next ? set(SAVE_KEY, next) : del(SAVE_KEY)).catch(() => {});
    }, 250);
  }, []);

  const mutate = useCallback(
    <T,>(fn: (s: GameState) => T): T | undefined => {
      if (!ref.current) return;
      const next = structuredClone(ref.current);
      const out = fn(next);
      commit(next);
      return out;
    },
    [commit],
  );

  const act = useCallback(
    (name: string, args: Record<string, unknown> = {}): ActResult => {
      if (!ref.current) return { ok: false, message: "No game running." };
      const next = structuredClone(ref.current);
      try {
        const message = runAction(next, name, args);
        commit(next);
        return { ok: true, message };
      } catch (e) {
        return { ok: false, message: e instanceof ActionError || e instanceof Error ? e.message : String(e) };
      }
    },
    [commit],
  );

  const setAssistant = useCallback((m: Anthropic.MessageParam[]) => {
    setAssistantState(m);
    set(ASSIST_KEY, m).catch(() => {});
  }, []);

  const startGame = useCallback(
    (s: GameState) => {
      commit(s);
      setAssistant([]);
    },
    [commit, setAssistant],
  );

  const endRun = useCallback(() => {
    const s = ref.current;
    if (s) {
      const revenue = s.finance.ledger.filter((l) => l.category === "revenue").reduce((a, l) => a + l.amount, 0);
      const summary: RunSummary = {
        businessName: s.businessName,
        market: s.market,
        days: s.day,
        reason: s.gameOver?.reason ?? "Abandoned",
        revenue: Math.round(revenue),
        clients: new Set(s.projects.map((p) => p.companyId)).size,
        mrr: metrics(s).mrr,
        endedAt: new Date().toISOString(),
      };
      const h = [summary, ...history].slice(0, 30);
      setHistory(h);
      set(HISTORY_KEY, h).catch(() => {});
    }
    commit(null);
    setAssistant([]);
  }, [commit, history, setAssistant]);

  return <Ctx.Provider value={{ ready, state, history, assistant, setAssistant, act, mutate, startGame, endRun }}>{children}</Ctx.Provider>;
}

export function useGame(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame outside GameProvider");
  return c;
}

/** Non-null game state for screens rendered inside a running game. */
export function useRun() {
  const g = useGame();
  return { ...g, s: g.state as GameState };
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}
