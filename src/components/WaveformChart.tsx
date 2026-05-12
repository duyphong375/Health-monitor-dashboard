"use client";

import { Activity, HeartPulse } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { WavePoint } from "@/lib/types";

type WaveformChartProps = {
  data: WavePoint[];
  bpm?: number | null;
  spo2?: number | null;
  live: boolean;
};

export default function WaveformChart({
  data,
  bpm,
  spo2,
  live,
}: WaveformChartProps) {
  const hasData = data.length > 3;

  return (
    <section className="medical-card relative overflow-hidden p-5">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:28px_28px] opacity-70" />

      <div className="relative mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-500 ring-1 ring-cyan-400/25">
            <Activity className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Dạng sóng nhịp tim realtime
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-500 ring-1 ring-emerald-400/20">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            {live ? "Live Monitoring" : "No Signal"}
          </span>

          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-500">
            BPM {bpm ?? "--"}
          </span>

          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-500">
            SpO₂ {spo2 ? `${spo2}%` : "--"}
          </span>
        </div>
      </div>

      <div className="relative h-[320px] md:h-[420px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{
                left: -18,
                right: 12,
                top: 12,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id="waveFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.48} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>

                <filter id="cyanGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(34,211,238,.12)"
              />

              <XAxis dataKey="label" hide />

              <YAxis hide domain={["dataMin - 180", "dataMax + 180"]} />

              <Tooltip
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(148,163,184,.25)",
                  background: "rgba(15,23,42,.92)",
                  color: "#fff",
                }}
                formatter={(value) => [value, "waveform"]}
                labelFormatter={() => "MAX30102"}
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke="#22d3ee"
                strokeWidth={3}
                fill="url(#waveFill)"
                isAnimationActive={false}
                dot={false}
                filter="url(#cyanGlow)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-cyan-300/40 bg-white/45 text-center backdrop-blur dark:bg-slate-950/25">
            <HeartPulse className="mb-4 h-14 w-14 animate-heartbeat text-cyan-500" />

            <p className="text-lg font-black text-slate-800 dark:text-white">
              Đang chờ dữ liệu từ cảm biến...
            </p>

            <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Khi ESP32 gửi field waveform qua MQTT, đồ thị sẽ hiển thị ngay tại
              đây.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}