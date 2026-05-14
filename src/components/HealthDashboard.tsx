"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MqttClient } from "mqtt";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Fingerprint,
  Gauge,
  HeartPulse,
  History,
  Moon,
  RotateCcw,
  ShieldAlert,
  Siren,
  Sun,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import HistoryTable from "./HistoryTable";
import MetricCard from "./MetricCard";
import WaveformChart from "./WaveformChart";

import {
  ENABLE_MOCK,
  createMqttClient,
  publishAlarmMute,
  publishResetMeasurement,
  publishSpo2Threshold,
  publishOledState,
} from "@/lib/mqttClient";

import { addRecord, loadHistory, saveHistory } from "@/lib/history";
import {
  assessHealth,
  average,
  clamp,
  formatDateTimeVi,
  getDateKey,
  normalizeTelemetry,
} from "@/lib/health";
import type {
  ConnectionState,
  HealthTelemetry,
  HistoryByDay,
  MeasurementRecord,
  NormalizedTelemetry,
  WavePoint,
} from "@/lib/types";
import { sendEmailAlert } from "@/lib/emailAlert";
import { sendTelegramAlert } from "@/lib/telegramAlert";

const MAX_WAVE_POINTS = 150;
const SIGNAL_TIMEOUT_MS = 10_000;
const TOAST_COOLDOWN_MS = 7000;
const REMOTE_ALERT_COOLDOWN_MS = Math.max(
  30_000,
  Number(process.env.NEXT_PUBLIC_ALERT_COOLDOWN_MS || 60_000)
);
const ENABLE_EMAIL_ALERT = process.env.NEXT_PUBLIC_ENABLE_EMAIL_ALERT === "true";
const ENABLE_TELEGRAM_ALERT = process.env.NEXT_PUBLIC_ENABLE_TELEGRAM_ALERT === "true";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function hasValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function bpmTone(bpm?: number | null) {
  if (!hasValue(bpm)) return "slate" as const;
  if (bpm! < 50 || bpm! > 120) return "rose" as const;
  if (bpm! < 60 || bpm! > 100) return "amber" as const;
  return "emerald" as const;
}

function spo2Tone(spo2?: number | null, threshold = 95) {
  if (!hasValue(spo2)) return "slate" as const;
  if (spo2! < 92 || spo2! < threshold) return "rose" as const;
  if (spo2! < 95) return "amber" as const;
  return "cyan" as const;
}

function createMockTelemetry(threshold: number): HealthTelemetry {
  const now = Date.now();

  const bpm = Math.round(75 + Math.sin(now / 3500) * 13 + Math.random() * 4);
  const spo2 = Math.round(96 + Math.sin(now / 5000) * 2);
  const waveform = Math.round(
    1800 +
      Math.sin(now / 120) * 420 +
      Math.sin(now / 45) * 120 +
      Math.random() * 60
  );

  return {
    device_id: process.env.NEXT_PUBLIC_DEVICE_ID || "esp32c3_health_001",
    timestamp: new Date().toISOString(),
    bpm,
    spo2,
    waveform,
    fingerDetected: true,
    finger_status: "Đã đặt ngón tay",
    health_status: "Bình thường",
    spo2_threshold: threshold,
    alarm_status: spo2 < threshold,
    led_status: true,
    signal_quality: "Tốt",
    firmware_version: "mock-ui-1.0.0",
    wifi_rssi: -48,
    ip_address: "192.168.1.50",
    uptime: Math.round(performance.now() / 1000),
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/55 p-4 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-slate-900/60">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-500 ring-1 ring-cyan-400/20">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p className="mt-1 break-words text-lg font-black leading-tight text-slate-950 dark:text-white">
            {value}
          </p>

          {sub ? (
            <p className="break-words text-xs text-slate-500 dark:text-slate-400">
              {sub}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function HealthDashboard() {
  const [dark, setDark] = useState(true);
  const [themeOpen, setThemeOpen] = useState(false);

  const [status, setStatus] = useState<ConnectionState>(
    ENABLE_MOCK ? "mock" : "connecting"
  );

  const [now, setNow] = useState(new Date());
  const [telemetry, setTelemetry] = useState<NormalizedTelemetry | null>(null);
  const [wave, setWave] = useState<WavePoint[]>([]);
  const [threshold, setThreshold] = useState(95);
  const [history, setHistory] = useState<HistoryByDay>({});
  const [selectedDay, setSelectedDay] = useState(getDateKey());
  const [toast, setToast] = useState("");
  const [lastPacketAt, setLastPacketAt] = useState<number | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);

  /*
    alarmMuted = false => Còi: Bật
    alarmMuted = true  => Còi: Tắt
  */
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [oledOn, setOledOn] = useState(true);

  const mqttClientRef = useRef<MqttClient | null>(null);
  const lastToastRef = useRef(0);
  const lastRemoteAlertRef = useRef(0);
  const remoteAlertBusyRef = useRef(false);
  const publishTimerRef = useRef<number | null>(null);

  const session = useRef<{
    startTime: string;
    bpm: number[];
    spo2: number[];
    threshold: number;
    warningCount: number;
    samplesCount: number;
    status: string;
  } | null>(null);

  const assessment = useMemo(() => assessHealth(telemetry), [telemetry]);

  const signalLost =
    !ENABLE_MOCK &&
    lastPacketAt !== null &&
    Date.now() - lastPacketAt > SIGNAL_TIMEOUT_MS;

  const connected = ENABLE_MOCK || (status === "online" && !signalLost);

  /*
    WiFi Connected được suy ra từ telemetry:
    - Có telemetry và chưa mất tín hiệu quá 10 giây => WiFi Connected
    - Chưa có telemetry hoặc mất tín hiệu => WiFi Disconnected
  */
  const wifiConnected = ENABLE_MOCK || Boolean(telemetry && !signalLost);

  /*
    Logic còi:
    - buzzerEnabled = true  => Còi: Bật, được phép kêu khi vượt ngưỡng.
    - buzzerEnabled = false => Còi: Tắt, không kêu dù vượt ngưỡng.
  */
  const buzzerEnabled = !alarmMuted;
  const buzzerRinging = telemetry?.buzzer === true && buzzerEnabled;

  /*
    Logic LED:
    - Có đặt ngón tay / đang đo => LED ON
    - Không đặt tay / chưa đo => LED OFF
  */
  const isMeasuring = telemetry?.fingerDetected === true;

  const days = Object.keys(history).sort().reverse();

  useEffect(() => {
    const savedDark = localStorage.getItem("health-dashboard-dark");
    if (savedDark !== null) setDark(savedDark === "true");
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("health-dashboard-dark", String(dark));
  }, [dark]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (ENABLE_MOCK) return;

    const client = createMqttClient({
      onStatus: setStatus,
      onTelemetry: (data) => {
        const normalized = normalizeTelemetry(data);
        setTelemetry(normalized);
        setThreshold(normalized.spo2Threshold);
        setAlarmMuted(normalized.alarmMuted);

        if (typeof data.oled === "boolean") {
          setOledOn(data.oled);
        } else if (typeof data.oled_status === "string") {
          setOledOn(data.oled_status.toUpperCase() === "ON");
        } else if (typeof data.oledStatus === "string") {
          setOledOn(data.oledStatus.toUpperCase() === "ON");
        }

        setLastPacketAt(Date.now());
        setStatus("online");
      },
      onError: showToast,
    });

    mqttClientRef.current = client;

    return () => {
      client.end(true);
      mqttClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ENABLE_MOCK) return;

    setStatus("mock");

    const timer = window.setInterval(() => {
      const normalized = normalizeTelemetry(createMockTelemetry(threshold));
      setTelemetry(normalized);
      setLastPacketAt(Date.now());
    }, 700);

    return () => window.clearInterval(timer);
  }, [threshold]);

  useEffect(() => {
    if (!telemetry) return;

    if (telemetry.waveform.length) {
      const points = telemetry.waveform.map((value, index) => ({
        t: Date.now() + index,
        label: new Date().toLocaleTimeString("vi-VN"),
        value,
      }));

      setWave((current) => [...current, ...points].slice(-MAX_WAVE_POINTS));
    }

    if (telemetry.fingerDetected) {
      if (!session.current) {
        session.current = {
          startTime: telemetry.timestamp,
          bpm: [],
          spo2: [],
          threshold: telemetry.spo2Threshold,
          warningCount: 0,
          samplesCount: 0,
          status: assessment.status,
        };
      }

      if (hasValue(telemetry.bpm)) session.current.bpm.push(telemetry.bpm!);
      if (hasValue(telemetry.spo2)) session.current.spo2.push(telemetry.spo2!);

      session.current.samplesCount += 1;
      session.current.status = assessment.status;

      if (["warning", "danger"].includes(assessment.level)) {
        session.current.warningCount += 1;
      }
    } else if (session.current && session.current.samplesCount >= 3) {
      const done = session.current;

      const record: MeasurementRecord = {
        id: crypto.randomUUID?.() || String(Date.now()),
        startTime: done.startTime,
        endTime: telemetry.timestamp,
        duration: Math.max(
          1,
          Math.round(
            (new Date(telemetry.timestamp).getTime() -
              new Date(done.startTime).getTime()) /
              1000
          )
        ),
        avgBpm: average(done.bpm),
        minBpm: done.bpm.length ? Math.min(...done.bpm) : 0,
        maxBpm: done.bpm.length ? Math.max(...done.bpm) : 0,
        avgSpo2: average(done.spo2),
        minSpo2: done.spo2.length ? Math.min(...done.spo2) : 0,
        spo2Threshold: done.threshold,
        status: done.warningCount ? done.status : "Bình thường",
        warningCount: done.warningCount,
        note: "",
        samplesCount: done.samplesCount,
      };

      setHistory((old) => addRecord(old, record));
      setSelectedDay(getDateKey(record.startTime));
      session.current = null;
    }
  }, [telemetry, assessment.status, assessment.level]);

  useEffect(() => {
    if (!telemetry) return;

    const shouldAlert =
      telemetry.fingerDetected === true &&
      ["warning", "danger"].includes(assessment.level) &&
      (hasValue(telemetry.bpm) || hasValue(telemetry.spo2));

    if (!shouldAlert) return;

    const msg =
      assessment.level === "danger"
        ? "Cảnh báo nguy hiểm: kiểm tra SpO₂/BPM ngay"
        : `Cảnh báo: ${assessment.status}`;

    showToast(msg, true);

    const nowMs = Date.now();
    const enableRemoteAlert = ENABLE_EMAIL_ALERT || ENABLE_TELEGRAM_ALERT;

    if (!enableRemoteAlert) return;
    if (remoteAlertBusyRef.current) return;
    if (nowMs - lastRemoteAlertRef.current < REMOTE_ALERT_COOLDOWN_MS) return;

    lastRemoteAlertRef.current = nowMs;
    remoteAlertBusyRef.current = true;

    Promise.allSettled([
      ENABLE_EMAIL_ALERT
        ? sendEmailAlert(telemetry, assessment)
        : Promise.resolve({ ok: true, skipped: "email" }),
      ENABLE_TELEGRAM_ALERT
        ? sendTelegramAlert(telemetry, assessment)
        : Promise.resolve({ ok: true, skipped: "telegram" }),
    ])
      .then((results) => {
        const failed = results.some(
          (result) =>
            result.status === "rejected" ||
            (result.status === "fulfilled" && result.value?.ok === false)
        );

        showToast(
          failed
            ? "Có lỗi khi gửi cảnh báo Email/Telegram. Kiểm tra .env.local và terminal web"
            : "Đã gửi cảnh báo qua Email/Telegram",
          true
        );
      })
      .catch(() => {
        showToast("Không gửi được cảnh báo Email/Telegram", true);
      })
      .finally(() => {
        remoteAlertBusyRef.current = false;
      });
  }, [assessment, telemetry]);

  function showToast(message: string, cooldown = false) {
    const nowMs = Date.now();

    if (cooldown && nowMs - lastToastRef.current < TOAST_COOLDOWN_MS) return;

    lastToastRef.current = nowMs;
    setToast(message);

    window.setTimeout(() => setToast(""), 3600);
  }

  function updateThreshold(value: number) {
    const safeValue = clamp(Math.round(value), 80, 100);
    setThreshold(safeValue);

    if (publishTimerRef.current) {
      window.clearTimeout(publishTimerRef.current);
    }

    publishTimerRef.current = window.setTimeout(() => {
      const ok = publishSpo2Threshold(mqttClientRef.current, safeValue);

      showToast(
        ENABLE_MOCK
          ? "Mock mode: không publish MQTT thật"
          : ok
            ? `Đã gửi ngưỡng SpO₂ ${safeValue}%`
            : "MQTT chưa kết nối, chưa gửi được ngưỡng"
      );
    }, 450);
  }

  function toggleOled() {
    const next = !oledOn;
    const ok = publishOledState(mqttClientRef.current, next);

    if (ENABLE_MOCK || ok) {
      setOledOn(next);
    }

    showToast(
      ENABLE_MOCK
        ? next
          ? "Mock mode: OLED đã bật"
          : "Mock mode: OLED đã tắt"
        : ok
          ? next
            ? "Đã gửi lệnh bật OLED"
            : "Đã gửi lệnh tắt OLED"
          : "MQTT chưa kết nối, chưa gửi được lệnh OLED"
    );
  }

  function sendCommand(type: "reset" | "alarm") {
    setCommandBusy(true);

    if (type === "reset") {
      const okReset = publishResetMeasurement(mqttClientRef.current);

      /*
        Reset đo thì bật lại quyền còi.
        Gửi thêm alarm_mute = false để ESP32 cho phép còi báo lại.
      */
      const okUnmute = publishAlarmMute(mqttClientRef.current, false);

      setWave([]);

      if (ENABLE_MOCK || okReset || okUnmute) {
        setAlarmMuted(false);
      }

      showToast(
        ENABLE_MOCK
          ? "Mock mode: đã reset phép đo"
          : okReset
            ? "Đã reset phép đo và bật lại còi"
            : "MQTT chưa kết nối, chưa gửi được lệnh reset"
      );

      window.setTimeout(() => setCommandBusy(false), 500);
      return;
    }

    /*
      Bấm nút còi:
      - Còi: Bật => bấm để tắt còi, gửi alarm_mute = true.
      - Còi: Tắt => bấm để bật còi, gửi alarm_mute = false.
    */
    const nextMuted = !alarmMuted;
    const ok = publishAlarmMute(mqttClientRef.current, nextMuted);

    /*
      Chỉ đổi trạng thái giao diện khi đang ở mock mode
      hoặc publish MQTT thành công.
    */
    if (ENABLE_MOCK || ok) {
      setAlarmMuted(nextMuted);
    }

    showToast(
      ENABLE_MOCK
        ? nextMuted
          ? "Mock mode: Còi đã tắt"
          : "Mock mode: Còi đã bật"
        : ok
          ? nextMuted
            ? "Đã tắt còi. Còi sẽ không kêu dù vượt ngưỡng"
            : "Đã bật còi. Còi sẽ kêu khi vượt ngưỡng"
          : "MQTT chưa kết nối, chưa gửi được lệnh còi"
    );

    window.setTimeout(() => setCommandBusy(false), 500);
  }

  const todayKey = getDateKey();
  const todayRows = history[todayKey] || [];

  const todayStats = {
    count: todayRows.length,
    avgBpm: average(todayRows.map((row) => row.avgBpm)),
    avgSpo2: average(todayRows.map((row) => row.avgSpo2)),
    warnings: todayRows.reduce((sum, row) => sum + row.warningCount, 0),
    last: todayRows[0]?.endTime,
  };

  const deviceRows: Array<[string, string]> = [
    ["ESP32-C3", connected ? "Online" : "Offline"],
    ["WiFi", wifiConnected ? "Connected" : "Disconnected"],
    [
      "MQTT",
      ENABLE_MOCK
        ? "Mock Mode"
        : status === "online"
          ? "Connected"
          : status === "connecting"
            ? "Connecting"
            : "Disconnected",
    ],
    ["RainMaker", telemetry ? "Đang đồng bộ" : "Chưa có dữ liệu"],
    [
      "MAX30102",
      telemetry ? (isMeasuring ? "Đang đo" : "Chờ ngón tay") : "No data",
    ],
    ["OLED", oledOn ? "ON" : "OFF"],
    ["LED", isMeasuring ? "ON" : "OFF"],
    ["Quyền còi", buzzerEnabled ? "Bật" : "Tắt"],
    ["Còi thực tế", buzzerRinging ? "Đang kêu" : "Không kêu"],
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#f4f8fb,#eef5f9)] px-4 py-5 text-slate-950 transition duration-500 dark:bg-[linear-gradient(135deg,#0B1220,#0f172a_48%,#111827)] dark:text-white md:px-8">
      <header className="sticky top-4 z-20 mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/60 p-5 shadow-sm backdrop-blur-xl dark:border-cyan-300/10 dark:bg-slate-950/60 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-500 ring-1 ring-cyan-400/30">
            <HeartPulse className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-xl font-black tracking-tight sm:text-2xl md:text-3xl">
              Health Monitor Dashboard
            </h1>

            <p className="text-lg font-medium text-slate-500 dark:text-slate-400">
              Hệ thống theo dõi sức khỏe thông minh
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cx(
              "glass-button",
              connected
                ? "text-emerald-600 dark:text-emerald-300"
                : "text-rose-600 dark:text-rose-300"
            )}
          >
            {connected ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}

            <span
              className={cx(
                "h-2 w-2 rounded-full",
                connected ? "animate-pulse bg-emerald-400" : "bg-rose-500"
              )}
            />

            MQTT {ENABLE_MOCK ? "Mock" : connected ? "Connected" : "Disconnected"}
          </span>

          <span
            className={cx(
              "glass-button",
              wifiConnected
                ? "text-emerald-600 dark:text-emerald-300"
                : "text-rose-600 dark:text-rose-300"
            )}
          >
            {wifiConnected ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}

            <span
              className={cx(
                "h-2 w-2 rounded-full",
                wifiConnected ? "animate-pulse bg-emerald-400" : "bg-rose-500"
              )}
            />

            WiFi {wifiConnected ? "Connected" : "Disconnected"}
          </span>

          <span
            className={cx(
              "glass-button",
              connected
                ? "text-cyan-600 dark:text-cyan-300"
                : "text-orange-600 dark:text-orange-300"
            )}
          >
            ESP32-C3 {connected ? "Online" : "Offline"}
          </span>

          <span className="glass-button">
            <Clock className="h-4 w-4 text-cyan-500" />
            {now.toLocaleString("vi-VN", { hour12: false })}
          </span>

          <div className="relative">
            <button
              className="glass-button"
              onClick={() => setThemeOpen((value) => !value)}
            >
              {dark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              Mode
            </button>

            {themeOpen ? (
              <div className="absolute right-0 z-40 mt-2 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900">
                <button
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-100 dark:hover:bg-white/10"
                  onClick={() => {
                    setDark(false);
                    setThemeOpen(false);
                  }}
                >
                  <Sun className="h-4 w-4 text-amber-500" />
                  Light
                </button>

                <button
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-700 transition hover:bg-cyan-50 dark:text-slate-100 dark:hover:bg-white/10"
                  onClick={() => {
                    setDark(true);
                    setThemeOpen(false);
                  }}
                >
                  <Moon className="h-4 w-4 text-cyan-500" />
                  Dark
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {toast ? (
        <div
          className="fixed right-5 top-24 z-30 max-w-sm cursor-pointer rounded-2xl border border-cyan-300/40 bg-white/95 px-4 py-3 text-sm font-bold text-slate-800 shadow-medical backdrop-blur dark:bg-slate-950/95 dark:text-white"
          onClick={() => setToast("")}
        >
          {toast}
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard
          icon={History}
          label="Số lần đo hôm nay"
          value={todayStats.count ? String(todayStats.count) : "Chưa có dữ liệu"}
        />

        <StatCard
          icon={HeartPulse}
          label="BPM TB hôm nay"
          value={todayStats.avgBpm ? String(todayStats.avgBpm) : "Chưa có dữ liệu"}
        />

        <StatCard
          icon={Activity}
          label="SpO₂ TB hôm nay"
          value={todayStats.avgSpo2 ? `${todayStats.avgSpo2}%` : "Chưa có dữ liệu"}
        />

        <StatCard
          icon={ShieldAlert}
          label="Cảnh báo hôm nay"
          value={String(todayStats.warnings)}
        />

        <StatCard
          icon={Clock}
          label="Lần đo gần nhất"
          value={todayStats.last ? formatDateTimeVi(todayStats.last) : "Chưa có dữ liệu"}
        />

        <StatCard
          icon={Cpu}
          label="Trạng thái thiết bị"
          value={connected ? "Đang hoạt động" : signalLost ? "Mất tín hiệu" : "Chưa kết nối"}
        />
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Nhịp tim"
          value={hasValue(telemetry?.bpm) ? String(telemetry!.bpm) : "--"}
          unit="BPM"
          status={
            !hasValue(telemetry?.bpm)
              ? "Đang chờ dữ liệu"
              : telemetry!.bpm! < 50
                ? "Cảnh báo thấp"
                : telemetry!.bpm! <= 100
                  ? "Bình thường"
                  : telemetry!.bpm! <= 120
                    ? "Hơi cao"
                    : "Nguy hiểm"
          }
          subtitle="Đồng bộ realtime từ ESP32-C3"
          tone={bpmTone(telemetry?.bpm)}
          icon={HeartPulse}
          pulse={isMeasuring}
          warning={hasValue(telemetry?.bpm) && (telemetry!.bpm! < 50 || telemetry!.bpm! > 120)}
        />

        <MetricCard
          title="Nồng độ oxy SpO₂"
          value={hasValue(telemetry?.spo2) ? String(telemetry!.spo2) : "--"}
          unit="%"
          status={`Ngưỡng cảnh báo ${threshold}%`}
          subtitle={
            hasValue(telemetry?.spo2)
              ? telemetry!.spo2! < threshold
                ? "SpO₂ thấp hơn ngưỡng cảnh báo"
                : "Đang trong vùng theo dõi"
              : "Đang chờ dữ liệu"
          }
          tone={spo2Tone(telemetry?.spo2, threshold)}
          icon={Zap}
          warning={hasValue(telemetry?.spo2) && telemetry!.spo2! < threshold}
        />

        <MetricCard
          title="Trạng thái ngón tay"
          value={telemetry?.fingerText || "Chưa có dữ liệu"}
          status={`Tín hiệu: ${telemetry?.signalQuality || "Không có dữ liệu"}`}
          subtitle={
            isMeasuring
              ? "Cảm biến đang quét ổn định"
              : "Đặt ngón tay lên cảm biến MAX30102"
          }
          tone={isMeasuring ? "emerald" : telemetry ? "amber" : "slate"}
          icon={Fingerprint}
          pulse={isMeasuring}
        />

        <MetricCard
          title="Tình trạng sức khỏe"
          value={assessment.status}
          status={buzzerRinging ? "Còi: Đang kêu" : buzzerEnabled ? "Còi: Sẵn sàng" : "Còi: Đã tắt"}
          subtitle={
            buzzerRinging
              ? "SpO₂ dưới ngưỡng, còi đang cảnh báo"
              : buzzerEnabled
                ? "Còi sẽ kêu khi SpO₂ thấp hơn ngưỡng"
                : "Còi đang tắt, vượt ngưỡng cũng không kêu"
          }
          tone={
            assessment.level === "danger"
              ? "rose"
              : assessment.level === "warning"
                ? "amber"
                : assessment.level === "normal"
                  ? "emerald"
                  : "slate"
          }
          icon={
            assessment.level === "danger" || assessment.level === "warning"
              ? AlertTriangle
              : telemetry
                ? CheckCircle2
                : Gauge
          }
          warning={assessment.level === "danger" || assessment.level === "warning"}
        />
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
        <WaveformChart
          data={wave}
          bpm={telemetry?.bpm}
          spo2={telemetry?.spo2}
          live={connected && Boolean(telemetry)}
        />

        <aside className="space-y-4">
          <section className="medical-card p-5">
            <h2 className="text-lg font-black">Điều khiển & trạng thái</h2>

            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-bold">
                  <span>Ngưỡng cảnh báo SpO₂</span>
                  <span className="text-cyan-500">{threshold}%</span>
                </div>

                <input
                  className="h-2 w-full accent-cyan-500"
                  type="range"
                  min={80}
                  max={100}
                  step={1}
                  value={threshold}
                  onChange={(event) => updateThreshold(Number(event.target.value))}
                />

                <input
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-slate-950"
                  type="number"
                  min={80}
                  max={100}
                  value={threshold}
                  onChange={(event) => updateThreshold(Number(event.target.value))}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  disabled={commandBusy}
                  className="glass-button"
                  onClick={() => sendCommand("reset")}
                >
                  <RotateCcw className="h-4 w-4 text-cyan-500" />
                  Reset đo
                </button>

                <button
                  disabled={commandBusy}
                  className="glass-button"
                  onClick={() => sendCommand("alarm")}
                >
                  <Siren className="h-4 w-4 text-orange-500" />
                  {buzzerEnabled ? "Tắt còi" : "Bật còi"}
                </button>

                <button
                  disabled={commandBusy}
                  className="glass-button"
                  onClick={toggleOled}
                >
                  <Cpu className="h-4 w-4 text-violet-500" />
                  {oledOn ? "Tắt OLED" : "Bật OLED"}
                </button>
              </div>
            </div>
          </section>

          <section className="medical-card p-5">
            <h2 className="text-lg font-black">Trạng thái thiết bị</h2>

            <div className="mt-4 grid gap-3 text-sm">
              {deviceRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 rounded-2xl bg-slate-100/70 px-4 py-3 dark:bg-slate-950/40"
                >
                  <span className="text-slate-500 dark:text-slate-400">
                    {label}
                  </span>

                  <b className="text-right text-slate-900 dark:text-white">
                    {value}
                  </b>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <HistoryTable
        history={history}
        selectedDay={selectedDay || days[0] || getDateKey()}
        onSelectDay={setSelectedDay}
        onToast={showToast}
        onDeleteDay={(day) => {
          if (!confirm(`Xóa lịch sử ngày ${day}?`)) return;

          setHistory((old) => {
            const next = { ...old };
            delete next[day];
            return next;
          });
        }}
        onDeleteAll={() => {
          if (!confirm("Xóa toàn bộ lịch sử đo?")) return;
          setHistory({});
        }}
        onNoteChange={(day, id, note) => {
          setHistory((old) => ({
            ...old,
            [day]: (old[day] || []).map((row) =>
              row.id === id ? { ...row, note } : row
            ),
          }));
        }}
      />

      {(assessment.level === "danger" || signalLost) && (
        <button
          className="fixed bottom-5 right-5 z-30 rounded-full bg-rose-500 px-5 py-4 text-sm font-black text-white shadow-[0_0_40px_rgba(244,63,94,.45)] md:hidden"
          onClick={() =>
            showToast(
              signalLost
                ? "Thiết bị mất tín hiệu quá 10 giây"
                : assessment.description
            )
          }
        >
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          Cảnh báo
        </button>
      )}
    </main>
  );
}