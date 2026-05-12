"use client";

import type { LucideIcon } from "lucide-react";

export type CardTone =
  | "rose"
  | "cyan"
  | "emerald"
  | "amber"
  | "slate"
  | "blue";

type MetricCardProps = {
  title: string;
  value: string;
  unit?: string;
  subtitle?: string;
  status?: string;
  tone: CardTone;
  icon: LucideIcon;
  pulse?: boolean;
  warning?: boolean;
};

const toneMap: Record<CardTone, string> = {
  rose: "from-rose-500/20 via-rose-500/8 to-transparent text-rose-500 ring-rose-400/35",
  cyan: "from-cyan-500/20 via-cyan-500/8 to-transparent text-cyan-500 ring-cyan-400/35",
  emerald:
    "from-emerald-500/20 via-emerald-500/8 to-transparent text-emerald-500 ring-emerald-400/35",
  amber:
    "from-amber-500/20 via-amber-500/8 to-transparent text-amber-500 ring-amber-400/35",
  slate:
    "from-slate-400/18 via-slate-400/8 to-transparent text-slate-500 ring-slate-300/35 dark:text-slate-300",
  blue: "from-blue-500/20 via-blue-500/8 to-transparent text-blue-500 ring-blue-400/35",
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function MetricCard({
  title,
  value,
  unit,
  subtitle,
  status,
  tone,
  icon: Icon,
  pulse,
  warning,
}: MetricCardProps) {
  const isLongValue = value.length > 8;

  return (
    <section
      className={cx(
        "medical-card group relative overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl",
        warning &&
          "ring-2 ring-orange-400/60 shadow-[0_0_45px_rgba(251,146,60,.24)]"
      )}
    >
      <div
        className={cx(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          toneMap[tone]
        )}
      />

      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/30 blur-2xl dark:bg-cyan-300/5" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-500 dark:text-slate-400">
            {title}
          </p>

          <div className="mt-3 flex min-w-0 flex-wrap items-end gap-2">
            <p
              className={cx(
                "max-w-full break-words font-black leading-tight tracking-tight text-slate-950 dark:text-white",
                isLongValue
                  ? "text-2xl sm:text-2xl md:text-3xl"
                  : "text-4xl md:text-5xl"
              )}
            >
              {value}
            </p>

            {unit ? (
              <span className="pb-1 text-sm font-black text-slate-400">
                {unit}
              </span>
            ) : null}
          </div>

          {subtitle ? (
            <p className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>

        <div
          className={cx(
            "rounded-2xl bg-white/80 p-3 shadow-sm ring-1 backdrop-blur dark:bg-slate-950/60",
            toneMap[tone]
          )}
        >
          <Icon className={cx("h-7 w-7", pulse && "animate-heartbeat")} />
        </div>
      </div>

      {status ? (
        <div className="relative mt-5 inline-flex rounded-full bg-white/75 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950/45 dark:text-slate-200 dark:ring-white/10">
          {status}
        </div>
      ) : null}
    </section>
  );
}