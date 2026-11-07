"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { MARKETS } from "@/engine/markets";
import type { GameState } from "@/engine/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function money(s: GameState | { market: GameState["market"] }, n: number, opts: { sign?: boolean } = {}) {
  const m = MARKETS[s.market];
  const v = Math.round(n);
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${m.symbol}${Math.abs(v).toLocaleString("en-US")}`;
}

export function Money({ s, n, sign, className }: { s: GameState; n: number; sign?: boolean; className?: string }) {
  return <span className={cx("num", sign && n > 0 && "text-in", sign && n < 0 && "text-out", className)}>{money(s, n, { sign })}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet" | "danger"; size?: "sm" | "md" };

export function Button({ variant = "primary", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "rounded-xl font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-[15px]",
        variant === "primary" && "bg-ink text-paper",
        variant === "ghost" && "border border-rule bg-sheet text-ink",
        variant === "quiet" && "text-accent",
        variant === "danger" && "border border-out/40 text-out",
        className,
      )}
    />
  );
}

export function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-6", className)}>
      {(title || aside) && (
        <div className="mb-2 flex items-baseline justify-between px-4">
          {title && <h2 className="display text-lg font-semibold">{title}</h2>}
          {aside && <div className="text-sm text-ink-3">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A list grouped on a single sheet, rows separated by rules. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-4 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-sheet", className)}>{children}</div>;
}

export function Row({ children, onClick, mark, className }: { children: ReactNode; onClick?: () => void; mark?: boolean; className?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cx("relative block w-full px-4 py-3 text-left", onClick && "active:bg-paper", className)}>
      {mark && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r bg-mark" />}
      {children}
    </Tag>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="mx-4 rounded-2xl border border-dashed border-rule px-4 py-6 text-center text-sm text-ink-2">{children}</p>;
}

export function Sheet({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; full?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal>
      <button aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className={cx("sheet-in relative mx-auto flex w-full max-w-xl flex-col rounded-t-3xl bg-paper safe-bottom", full ? "h-[94dvh]" : "max-h-[90dvh]")}>
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <h2 className="display min-w-0 truncate text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-ink-2 active:bg-rule">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-rule bg-sheet px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 num";

export function NumberInput({ value, onChange, prefix, suffix, step = 1, min = 0 }: { value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: number; min?: number }) {
  return (
    <div className="flex items-center rounded-xl border border-rule bg-sheet">
      {prefix && <span className="pl-3 text-ink-3">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        className="num w-full bg-transparent px-3 py-2.5 text-[15px] outline-none"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span className="pr-3 text-sm text-ink-3">{suffix}</span>}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 80, suffix }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      <button className="h-9 w-9 rounded-full border border-rule bg-sheet text-lg leading-none" onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
        −
      </button>
      <span className="num w-14 text-center font-medium">
        {value}
        {suffix}
      </span>
      <button className="h-9 w-9 rounded-full border border-rule bg-sheet text-lg leading-none" onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "in" | "out" | "mark" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-rule text-ink-2",
        tone === "in" && "bg-in/15 text-in",
        tone === "out" && "bg-out/15 text-out",
        tone === "mark" && "bg-mark-soft text-ink",
        tone === "accent" && "bg-accent/15 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl border border-rule bg-sheet p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx("flex-1 rounded-lg px-2 py-1.5 text-sm", value === o.value ? "bg-ink text-paper" : "text-ink-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
      <div className="sheet-in max-w-md rounded-2xl bg-ink px-4 py-3 text-sm text-paper shadow-lg">{message}</div>
    </div>
  );
}
