import { NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const CHAT_IDS =
  process.env.TELEGRAM_CHAT_IDS
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) || [];

type TelegramAlertBody = {
  bpm?: number | null;
  spo2?: number | null;
  spo2Threshold?: number;
  fingerDetected?: boolean;
  healthStatus?: string;
  deviceId?: string;
  level?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TelegramAlertBody;

    if (!BOT_TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" },
        { status: 500 }
      );
    }

    if (CHAT_IDS.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing TELEGRAM_CHAT_IDS" },
        { status: 500 }
      );
    }

    const {
      bpm,
      spo2,
      spo2Threshold,
      fingerDetected,
      healthStatus,
      deviceId,
      level,
    } = body;

    const now = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false,
    });

    const title =
      level === "danger"
        ? "🚨 CẢNH BÁO NGUY HIỂM"
        : "⚠️ CẢNH BÁO SỨC KHỎE";

    const message =
`${title}

Thiết bị: ${deviceId || "ESP32-C3 Health Monitor"}
Thời gian: ${now}

❤️ Nhịp tim: ${bpm ?? "--"} BPM
🩸 SpO₂: ${spo2 ?? "--"} %
⚙️ Ngưỡng SpO₂: ${spo2Threshold ?? "--"} %

👆 Trạng thái tay: ${fingerDetected ? "Đã đặt ngón tay" : "Chưa phát hiện ngón tay"}
📊 Tình trạng: ${healthStatus || "Cảnh báo"}

Vui lòng kiểm tra người dùng ngay.`;

    const results = await Promise.all(
      CHAT_IDS.map(async (chatId) => {
        const res = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
            }),
          }
        );

        const result = await res.json();

        return {
          chatId,
          ok: res.ok,
          result,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      sentTo: CHAT_IDS.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to send Telegram alert" },
      { status: 500 }
    );
  }
}