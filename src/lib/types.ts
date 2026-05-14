export type ConnectionState = "connecting" | "online" | "offline" | "mock";

export type HealthLevel =
  | "normal"
  | "warning"
  | "danger"
  | "neutral"
  | "idle";

export type HealthTelemetry = {
  device_id?: string;
  deviceId?: string;
  timestamp?: string | number | null;

  bpm?: number | null;
  spo2?: number | null;

  fingerDetected?: boolean;
  finger_detected?: boolean;
  finger_status?: string;

  healthStatus?: string;
  health_status?: string;

  waveform?: number | number[] | null;

  spo2Threshold?: number;
  spo2_threshold?: number;

  /*
   * Trạng thái còi / buzzer
   */
  buzzer?: boolean;
  alarm_status?: boolean;
  alarmStatus?: boolean;

  alarm_muted?: boolean;
  alarmMuted?: boolean;
  muted?: boolean;

  /*
   * Trạng thái LED
   */
  led?: boolean;
  led_status?: string | boolean;
  ledStatus?: string | boolean;

  /*
   * Trạng thái OLED
   */
  oled?: boolean;
  oled_status?: string;
  oledStatus?: string;

  signal_quality?: string;
  signalQuality?: string;

  firmwareVersion?: string;
  firmware_version?: string;

  wifiRssi?: number;
  wifi_rssi?: number;

  ipAddress?: string;
  ip_address?: string;

  uptime?: number;
  uptimeSec?: number;
  uptime_sec?: number;
};

export type NormalizedTelemetry = {
  deviceId: string;
  timestamp: string;

  bpm: number | null;
  spo2: number | null;

  fingerDetected: boolean;
  fingerText: string;

  healthStatus?: string;

  waveform: number[];

  spo2Threshold: number;

  /*
   * Còi
   */
  buzzer: boolean;
  alarmMuted: boolean;

  /*
   * LED / OLED
   */
  led: boolean | null;
  oled?: boolean | null;
  oledStatus?: string;

  signalQuality: string;

  firmwareVersion?: string;

  wifiRssi?: number;
  ipAddress?: string;
  uptimeSec?: number;

  raw: HealthTelemetry;
};

export type WavePoint = {
  t: number;
  label: string;
  value: number;
};

export type HealthAssessment = {
  status: string;
  level: HealthLevel;
  description: string;
};

export type MeasurementRecord = {
  id: string;

  startTime: string;
  endTime: string;
  duration: number;

  avgBpm: number;
  minBpm: number;
  maxBpm: number;

  avgSpo2: number;
  minSpo2: number;

  spo2Threshold: number;

  status: string;
  warningCount: number;
  note: string;
  samplesCount: number;
};

export type HistoryByDay = Record<string, MeasurementRecord[]>;