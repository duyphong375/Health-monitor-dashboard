import type { MeasurementRecord } from "./types";
import { formatDateTimeVi } from "./health";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function exportHistoryCsv(dateKey: string, rows: MeasurementRecord[]) {
  const header = [
    "STT",
    "Thời gian bắt đầu",
    "Thời gian kết thúc",
    "Thời lượng",
    "BPM trung bình",
    "BPM cao nhất",
    "BPM thấp nhất",
    "SpO₂ trung bình",
    "SpO₂ thấp nhất",
    "Ngưỡng SpO₂",
    "Số lần cảnh báo",
    "Tình trạng",
    "Ghi chú",
  ];

  const body = rows.map((row, index) => [
    index + 1,
    formatDateTimeVi(row.startTime),
    formatDateTimeVi(row.endTime),
    `${row.duration}s`,
    row.avgBpm,
    row.maxBpm,
    row.minBpm,
    row.avgSpo2,
    row.minSpo2,
    row.spo2Threshold,
    row.warningCount,
    row.status,
    row.note,
  ]);

  const csv = [header, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `health_history_${dateKey}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}