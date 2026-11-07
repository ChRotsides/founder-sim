"use client";

import { GameProvider, useGame } from "@/lib/store";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";

function Gate() {
  const { ready, state } = useGame();
  if (!ready) return <div className="grid min-h-dvh place-items-center text-ink-3">Loading…</div>;
  return state ? <Shell /> : <Onboarding />;
}

export function App() {
  return (
    <GameProvider>
      <Gate />
    </GameProvider>
  );
}
