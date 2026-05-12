"use client";

import mqtt, { MqttClient } from "mqtt";

import type { HealthTelemetry } from "./types";

export const DEVICE_ID =
  process.env.NEXT_PUBLIC_DEVICE_ID || "esp32c3_health_001";

export const MQTT_URL =
  process.env.NEXT_PUBLIC_MQTT_WS_URL || "wss://broker.emqx.io:8084/mqtt";

export const ENABLE_MOCK = process.env.NEXT_PUBLIC_ENABLE_MOCK === "true";

export const telemetryTopic = `device/${DEVICE_ID}/telemetry`;

export const thresholdTopic = `device/${DEVICE_ID}/control/spo2_threshold`;

export const resetTopic = `device/${DEVICE_ID}/control/reset_measurement`;

export const alarmMuteTopic = `device/${DEVICE_ID}/control/alarm_mute`;

export type MqttConnectionStatus = "connecting" | "online" | "offline";

export type MqttHandlers = {
  onTelemetry: (data: HealthTelemetry) => void;
  onStatus: (status: MqttConnectionStatus) => void;
  onError?: (message: string) => void;
};

export function createMqttClient(handlers: MqttHandlers): MqttClient {
  handlers.onStatus("connecting");

  const client = mqtt.connect(MQTT_URL, {
    clientId: `health_web_${Math.random().toString(16).slice(2)}`,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  });

  client.on("connect", () => {
    handlers.onStatus("online");

    client.subscribe(telemetryTopic, (error) => {
      if (error) {
        handlers.onError?.(
          `Không subscribe được telemetry: ${error.message}`
        );
      }
    });
  });

  client.on("message", (topic, payload) => {
    if (topic !== telemetryTopic) {
      return;
    }

    try {
      const data = JSON.parse(payload.toString()) as HealthTelemetry;
      handlers.onTelemetry(data);
    } catch {
      handlers.onError?.("Payload MQTT không phải JSON hợp lệ");
    }
  });

  client.on("reconnect", () => {
    handlers.onStatus("connecting");
  });

  client.on("offline", () => {
    handlers.onStatus("offline");
  });

  client.on("close", () => {
    handlers.onStatus("offline");
  });

  client.on("error", (error) => {
    handlers.onStatus("offline");
    handlers.onError?.(error.message);
  });

  return client;
}

function publishJson(
  client: MqttClient | null,
  topic: string,
  payload: object
) {
  if (ENABLE_MOCK) {
    return false;
  }

  if (!client || !client.connected) {
    return false;
  }

  try {
    client.publish(topic, JSON.stringify(payload), {
      qos: 0,
      retain: false,
    });

    return true;
  } catch {
    return false;
  }
}

export function publishSpo2Threshold(
  client: MqttClient | null,
  value: number
) {
  return publishJson(client, thresholdTopic, {
    spo2_threshold: value,
    spo2Threshold: value,
  });
}

export function publishResetMeasurement(client: MqttClient | null) {
  return publishJson(client, resetTopic, {
    reset: true,
  });
}

export function publishAlarmMute(
  client: MqttClient | null,
  muted = true
) {
  return publishJson(client, alarmMuteTopic, {
    alarm_mute: muted,
    alarmMute: muted,
    muted,
  });
}