import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const EMAIL_TO =
  process.env.EMAIL_TO?.split(",")
    .map((email) => email.trim())
    .filter(Boolean) || [];

type EmailAlertBody = {
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
    const body = (await req.json()) as EmailAlertBody;

    if (!EMAIL_USER || !EMAIL_APP_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: "Missing EMAIL_USER or EMAIL_APP_PASSWORD" },
        { status: 500 }
      );
    }

    if (EMAIL_TO.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing EMAIL_TO" },
        { status: 500 }
      );
    }

    const now = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false,
    });

    const isDanger = body.level === "danger";
    const alertId = `ALERT-${Date.now()}`;

    const subject = isDanger
      ? `[Health Monitor] 🚨 NGUY HIỂM - SpO₂ ${body.spo2 ?? "--"}%`
      : `[Health Monitor] ⚠️ CẢNH BÁO - SpO₂ ${body.spo2 ?? "--"}%`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e5e7eb;border-radius:16px;padding:24px;background:#ffffff;">
        <h2 style="margin-top:0;color:${isDanger ? "#dc2626" : "#d97706"};">
          ${isDanger ? "🚨 CẢNH BÁO NGUY HIỂM" : "⚠️ CẢNH BÁO SỨC KHỎE"}
        </h2>

        <p><b>Mã cảnh báo:</b> ${alertId}</p>
        <p><b>Thiết bị:</b> ${body.deviceId || "ESP32-C3 Health Monitor"}</p>
        <p><b>Thời gian:</b> ${now}</p>

        <hr />

        <p><b>❤️ Nhịp tim:</b> ${body.bpm ?? "--"} BPM</p>
        <p><b>🩸 SpO₂:</b> ${body.spo2 ?? "--"} %</p>
        <p><b>⚙️ Ngưỡng SpO₂:</b> ${body.spo2Threshold ?? "--"} %</p>

        <hr />

        <p><b>👆 Trạng thái tay:</b> ${
          body.fingerDetected ? "Đã đặt ngón tay" : "Chưa phát hiện ngón tay"
        }</p>

        <p><b>📊 Tình trạng:</b> ${body.healthStatus || "Cảnh báo"}</p>

        <p style="margin-top:24px;color:#dc2626;font-weight:bold;">
          Vui lòng kiểm tra người dùng ngay.
        </p>
      </div>
    `;

    const text = `
CẢNH BÁO SỨC KHỎE

Mã cảnh báo: ${alertId}
Thiết bị: ${body.deviceId || "ESP32-C3 Health Monitor"}
Thời gian: ${now}

Nhịp tim: ${body.bpm ?? "--"} BPM
SpO₂: ${body.spo2 ?? "--"} %
Ngưỡng SpO₂: ${body.spo2Threshold ?? "--"} %

Trạng thái tay: ${body.fingerDetected ? "Đã đặt ngón tay" : "Chưa phát hiện ngón tay"}
Tình trạng: ${body.healthStatus || "Cảnh báo"}

Vui lòng kiểm tra người dùng ngay.
`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_APP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: `"Health Monitor Alert" <${EMAIL_USER}>`,
      to: EMAIL_TO.join(","),
      subject,
      text,
      html,
    });

    return NextResponse.json({
      ok: true,
      sentTo: EMAIL_TO,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("Email alert error:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to send email alert" },
      { status: 500 }
    );
  }
}