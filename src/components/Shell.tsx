"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { formatDate } from "@/engine/calendar";
import { useRun } from "@/lib/store";
import { AssistantScreen } from "./AssistantScreen";
import { ChatSheet, type ChatTarget } from "./ChatSheet";
import { DealSheet } from "./DealSheet";
import { MoneyScreen } from "./MoneyScreen";
import { MoreSheet } from "./MoreSheet";
import { PipelineScreen } from "./PipelineScreen";
import { TodayScreen } from "./TodayScreen";
import { cx, Money, Toast } from "./ui";
import { WorkScreen } from "./WorkScreen";

export type Tab = "today" | "pipeline" | "work" | "money" | "assistant";

interface UI {
  tab: Tab;
  setTab: (t: Tab) => void;
  openDeal: (id: string) => void;
  openChat: (t: ChatTarget) => void;
  openMore: (section?: string) => void;
  toast: (m: string) => void;
}

const UICtx = createContext<UI | null>(null);
export const useUI = () => useContext(UICtx)!;

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "pipeline", label: "Clients" },
  { id: "work", label: "Work" },
  { id: "money", label: "Money" },
  { id: "assistant", label: "Assistant" },
];

export function Shell() {
  const { s } = useRun();
  const [tab, setTab] = useState<Tab>("today");
  const [deal, setDeal] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTarget | null>(null);
  const [more, setMore] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const ui: UI = { tab, setTab, openDeal: setDeal, openChat: setChat, openMore: (x) => setMore(x ?? "menu"), toast: setToast };
  const unresolved = s.events.filter((e) => e.attention && !e.resolved).length;

  return (
    <UICtx.Provider value={ui}>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <header className="sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur safe-top">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p key={s.day} className="flip display truncate text-lg font-semibold leading-tight">
                {formatDate(s.startDate, s.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
              <p className="truncate text-xs text-ink-3">{s.businessName}, month {Math.floor(s.day / 30) + 1}</p>
            </div>
            <button onClick={() => setTab("money")} className="text-right leading-tight">
              <span className="block text-[11px] text-ink-3">Company</span>
              <Money s={s} n={s.finance.cash} className={cx("text-sm font-semibold", s.finance.cash < 0 && "text-out")} />
            </button>
            <button onClick={() => setTab("money")} className="text-right leading-tight">
              <span className="block text-[11px] text-ink-3">Savings</span>
              <Money s={s} n={s.situation.personalCash} className={cx("text-sm font-semibold", s.situation.personalCash < s.situation.monthlyLiving * 2 && "text-out")} />
            </button>
            <button onClick={() => setMore("menu")} className="rounded-full border border-rule px-3 py-1 text-sm">
              More
            </button>
          </div>
        </header>

        <main className="flex-1 pb-44">
          {tab === "today" && <TodayScreen />}
          {tab === "pipeline" && <PipelineScreen />}
          {tab === "work" && <WorkScreen />}
          {tab === "money" && <MoneyScreen />}
          {tab === "assistant" && <AssistantScreen />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet/95 backdrop-blur safe-bottom" aria-label="Sections">
          <div className="mx-auto flex max-w-xl">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cx("relative flex-1 py-3 text-[13px]", tab === t.id ? "font-semibold text-ink" : "text-ink-3")} aria-current={tab === t.id}>
                {t.label}
                {t.id === "today" && unresolved > 0 && <span className="num absolute right-[18%] top-1.5 min-w-4 rounded-full bg-mark px-1 text-[10px] font-semibold text-ink">{unresolved}</span>}
                {tab === t.id && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-ink" />}
              </button>
            ))}
          </div>
        </nav>
      </div>
      <DealSheet id={deal} onClose={() => setDeal(null)} />
      <ChatSheet target={chat} onClose={() => setChat(null)} />
      <MoreSheet section={more} onClose={() => setMore(null)} setSection={setMore} />
      <Toast message={toastMsg} onDone={clearToast} />
    </UICtx.Provider>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="pt-2">{children}</div>;
}
