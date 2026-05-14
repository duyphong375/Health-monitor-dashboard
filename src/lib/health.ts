import type { HealthAssessment, HealthTelemetry, NormalizedTelemetry } from "./types";

const DEFAULT_DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID || "esp32c3_health_001";

export function isValidTimestamp(value: unknown): boolean {
  if (value === null || value === undefined || value === 0 || value === "0" || value === "") return false;
  const time = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(time) && time > 946684800000;
}

export function safeDate(value?: string | number | null): Date {
  if (!isValidTimestamp(value)) return new Date();
  return new Date(value as string | number);
}

export function formatDateTimeVi(value?: string | number | null): string {
  return safeDate(value).toLocaleString("vi-VN", {
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getDateKey(value?: string | number | null): string {
  const d = safeDate(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (["on", "true", "1", "bật", "bat", "active", "online", "đang đo", "dang do"].includes(v)) return true;
    if (["off", "false", "0", "tắt", "tat", "inactive", "offline", "không đo", "khong do"].includes(v)) return false;
  }
  return null;
}

export function normalizeTelemetry(input: HealthTelemetry): NormalizedTelemetry {
  const threshold = clamp(Number(input.spo2Threshold ?? input.spo2_threshold ?? 95), 80, 100);
  const fingerDetected =
    input.fingerDetected ??
    input.finger_detected ??
    String(input.finger_status || "").toLowerCase().includes("đã đặt") ??
    false;

  const rawWaveform = input.waveform;
  const waveform = Array.isArray(rawWaveform)
    ? rawWaveform.map(Number).filter(Number.isFinite)
    : Number.isFinite(Number(rawWaveform))
    ? [Number(rawWaveform)]
    : [];

  return {
    deviceId: input.deviceId || input.device_id || DEFAULT_DEVICE_ID,
    timestamp: safeDate(input.timestamp).toISOString(),
    bpm: toNumber(input.bpm),
    spo2: toNumber(input.spo2),
    fingerDetected: Boolean(fingerDetected),
    fingerText: Boolean(fingerDetected) ? "Đã đặt ngón tay" : "Chưa phát hiện ngón tay",
    healthStatus: input.healthStatus || input.health_status,
    waveform,
    spo2Threshold: threshold,
    buzzer: Boolean(toBool(input.buzzer ?? input.alarm_status ?? input.alarmStatus)),
    alarmMuted: Boolean(toBool(input.alarm_muted ?? input.alarmMuted ?? input.muted)),
    led: toBool(input.led ?? input.led_status),
    signalQuality: input.signal_quality || (Boolean(fingerDetected) ? "Đang đo" : "Chưa có dữ liệu"),
    firmwareVersion: input.firmwareVersion || input.firmware_version,
    wifiRssi: input.wifiRssi ?? input.wifi_rssi,
    ipAddress: input.ipAddress || input.ip_address,
    uptimeSec: input.uptimeSec ?? input.uptime,
    raw: input,
  };
}

export function assessHealth(data?: NormalizedTelemetry | null): HealthAssessment {
  if (!data) return { status: "Đang chờ dữ liệu", level: "idle", description: "Đang chờ tín hiệu từ thiết bị ESP32-C3" };
  if (!data.fingerDetected) return { status: "Chưa đặt ngón tay", level: "neutral", description: "Vui lòng đặt ngón tay đúng vị trí trên MAX30102" };
  if (!data.bpm || !data.spo2) return { status: "Đang chờ dữ liệu", level: "idle", description: "Cảm biến đang lấy mẫu, hãy giữ yên tay" };
  if (data.spo2 < 90) return { status: "Cảnh báo nguy hiểm", level: "danger", description: "SpO₂ rất thấp, cần kiểm tra lại ngay" };
  if (data.spo2 < data.spo2Threshold) return { status: "SpO₂ thấp", level: "warning", description: "SpO₂ thấp hơn ngưỡng cảnh báo đã cài đặt" };
  if (data.bpm > 120) return { status: "Nhịp tim cao", level: "warning", description: "BPM cao hơn vùng an toàn thông thường" };
  if (data.bpm < 50) return { status: "Nhịp tim thấp", level: "warning", description: "BPM thấp hơn vùng an toàn thông thường" };
  if (data.bpm >= 60 && data.bpm <= 100 && data.spo2 >= 95) return { status: "Bình thường", level: "normal", description: "Các chỉ số đang trong vùng an toàn" };
  return { status: data.healthStatus || "Cần theo dõi", level: "neutral", description: "Chỉ số chưa nguy hiểm nhưng nên tiếp tục quan sát" };
}

export function average(values: number[]) {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!clean.length) return 0;
  return Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}
