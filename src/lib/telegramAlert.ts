import type { NormalizedTelemetry, HealthAssessment } from "./types";

export type TelegramAlertPayload = {
  bpm?: number | null;
  spo2?: number | null;
  spo2Threshold?: number;
  fingerDetected?: boolean;
  healthStatus?: string;
  deviceId?: string;
  level?: string;
};

export async function sendTelegramAlert(
  telemetry: NormalizedTelemetry,
  assessment: HealthAssessment
) {
  const payload: TelegramAlertPayload = {
    bpm: telemetry.bpm,
    spo2: telemetry.spo2,
    spo2Threshold: telemetry.spo2Threshold,
    fingerDetected: telemetry.fingerDetected,
    healthStatus: assessment.status,
    deviceId: telemetry.deviceId,
    level: assessment.level,
  };

  const res = await fetch("/api/telegram-alert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return res.json();
}