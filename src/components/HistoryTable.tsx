"use client";

import { Download, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { exportHistoryCsv } from "@/lib/csv";
import { average, formatDateTimeVi } from "@/lib/health";
import type { HistoryByDay, MeasurementRecord } from "@/lib/types";

type Props = {
  history: HistoryByDay;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onDeleteDay: (day: string) => void;
  onDeleteAll: () => void;
  onNoteChange: (day: string, id: string, note: string) => void;
  onToast: (message: string) => void;
};

function dayStats(rows: MeasurementRecord[]) {
  return {
    count: rows.length,
    avgBpm: average(rows.map((row) => row.avgBpm)),
    avgSpo2: average(rows.map((row) => row.avgSpo2)),
    warnings: rows.reduce((sum, row) => sum + row.warningCount, 0),
  };
}

export default function HistoryTable({
  history,
  selectedDay,
  onSelectDay,
  onDeleteDay,
  onDeleteAll,
  onNoteChange,
  onToast,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const days = useMemo(() => Object.keys(history).sort().reverse(), [history]);
  const rows = history[selectedDay] || [];

  const filteredRows = rows.filter((row) => {
    const text = `${row.status} ${row.note} ${formatDateTimeVi(
      row.startTime
    )}`.toLowerCase();

    const matchesSearch = text.includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "normal" && row.warningCount === 0) ||
      (filter === "warning" &&
        row.warningCount > 0 &&
        row.status !== "Cảnh báo nguy hiểm") ||
      (filter === "danger" && row.status === "Cảnh báo nguy hiểm");

    return matchesSearch && matchesFilter;
  });

  function exportDay(day: string) {
    exportHistoryCsv(day, history[day] || []);
    onToast("Đã xuất CSV thành công");
  }

  return (
    <section className="medical-card p-5">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Lịch sử đo theo ngày
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="glass-button">
            <Search className="h-4 w-4" />

            <input
              className="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Tìm lịch sử"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <select
            className="glass-button bg-white/70 outline-none dark:bg-slate-950/50"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Tất cả</option>
            <option value="normal">Bình thường</option>
            <option value="warning">Cảnh báo</option>
            <option value="danger">Nguy hiểm</option>
          </select>

          <button
            className="glass-button text-rose-600 dark:text-rose-300"
            onClick={onDeleteAll}
          >
            <Trash2 className="h-4 w-4" />
            Xóa toàn bộ
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          {days.length === 0 ? (
            <div className="rounded-3xl bg-slate-100/80 p-5 text-center text-sm text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
              Chưa có lịch sử đo
            </div>
          ) : (
            days.map((day) => {
              const stats = dayStats(history[day]);
              const active = day === selectedDay;

              return (
                <button
                  key={day}
                  onClick={() => onSelectDay(day)}
                  className={`w-full rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 ${
                    active
                      ? "border-cyan-300 bg-cyan-500/10 shadow-[0_0_35px_rgba(34,211,238,.18)]"
                      : "border-slate-200/70 bg-white/65 dark:border-white/10 dark:bg-slate-950/35"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-900 dark:text-white">
                      {day}
                    </p>

                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-black text-cyan-600 dark:bg-slate-900">
                      {stats.count} lần
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      BPM TB
                      <b className="block text-slate-900 dark:text-white">
                        {stats.avgBpm || "--"}
                      </b>
                    </span>

                    <span>
                      SpO₂ TB
                      <b className="block text-slate-900 dark:text-white">
                        {stats.avgSpo2 ? `${stats.avgSpo2}%` : "--"}
                      </b>
                    </span>

                    <span>
                      Cảnh báo
                      <b className="block text-orange-500">
                        {stats.warnings}
                      </b>
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        exportDay(day);
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-600"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </span>

                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteDay(day);
                      }}
                      className="inline-flex items-center justify-center rounded-2xl bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">STT</th>
                <th className="px-3 py-2">Bắt đầu</th>
                <th className="px-3 py-2">Kết thúc</th>
                <th className="px-3 py-2">Thời lượng</th>
                <th className="px-3 py-2">BPM TB</th>
                <th className="px-3 py-2">SpO₂ TB</th>
                <th className="px-3 py-2">SpO₂ min</th>
                <th className="px-3 py-2">Tình trạng</th>
                <th className="px-3 py-2">Ghi chú</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    className="rounded-2xl bg-slate-100/80 px-3 py-5 text-center text-slate-500 dark:bg-slate-950/40"
                    colSpan={9}
                  >
                    Không có dữ liệu phù hợp
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="bg-white/80 shadow-sm dark:bg-slate-950/40"
                  >
                    <td className="rounded-l-2xl px-3 py-3 font-bold">
                      {index + 1}
                    </td>

                    <td className="px-3 py-3">
                      {formatDateTimeVi(row.startTime)}
                    </td>

                    <td className="px-3 py-3">
                      {formatDateTimeVi(row.endTime)}
                    </td>

                    <td className="px-3 py-3">{row.duration}s</td>

                    <td className="px-3 py-3 font-black text-rose-500">
                      {row.avgBpm}
                    </td>

                    <td className="px-3 py-3 font-black text-cyan-500">
                      {row.avgSpo2}%
                    </td>

                    <td className="px-3 py-3">{row.minSpo2}%</td>

                    <td
                      className={
                        row.warningCount
                          ? "px-3 py-3 font-black text-orange-500"
                          : "px-3 py-3 font-black text-emerald-500"
                      }
                    >
                      {row.status}
                    </td>

                    <td className="rounded-r-2xl px-3 py-3">
                      <input
                        className="w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-slate-900"
                        value={row.note}
                        placeholder="Ghi chú..."
                        onChange={(event) =>
                          onNoteChange(selectedDay, row.id, event.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}