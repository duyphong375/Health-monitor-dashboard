import type { HistoryByDay, MeasurementRecord } from "./types";
import { getDateKey } from "./health";

export const HISTORY_KEY = "health-history-by-day-v2";
const MAX_RECORDS_PER_DAY = 100;

export function loadHistory(): HistoryByDay {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const saved = localStorage.getItem(HISTORY_KEY);

    if (!saved) {
      return {};
    }

    return JSON.parse(saved) as HistoryByDay;
  } catch {
    return {};
  }
}

export function saveHistory(history: HistoryByDay) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage có thể đầy hoặc bị trình duyệt chặn.
    // Không throw lỗi để tránh làm crash dashboard.
  }
}

export function addRecord(
  history: HistoryByDay,
  record: MeasurementRecord
): HistoryByDay {
  const key = getDateKey(record.startTime);
  const currentRows = history[key] || [];

  return {
    ...history,
    [key]: [record, ...currentRows].slice(0, MAX_RECORDS_PER_DAY),
  };
}