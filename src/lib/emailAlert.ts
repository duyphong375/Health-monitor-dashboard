import type { HealthAssessment, NormalizedTelemetry } from "./types";

export async function sendEmailAlert(
  telemetry: NormalizedTelemetry,
  assessment: HealthAssessment
) {
  const payload = {
    bpm: telemetry.bpm,
    spo2: telemetry.spo2,
    spo2Threshold: telemetry.spo2Threshold,
    fingerDetected: telemetry.fingerDetected,
    healthStatus: assessment.status,
    deviceId: telemetry.deviceId,
    level: assessment.level,
  };

  const res = await fetch("/api/email-alert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return res.json();
}