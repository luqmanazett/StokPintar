const telegramApiUrl = "https://api.telegram.org";
const requestTimeoutMs = 5_000;

export class TelegramNotificationError extends Error {}

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new TelegramNotificationError("Telegram belum dikonfigurasi");
  }

  let response: Response;
  try {
    response = await fetch(`${telegramApiUrl}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    throw new TelegramNotificationError("Tidak dapat menghubungi Telegram");
  }

  if (!response.ok) {
    throw new TelegramNotificationError("Telegram menolak pengiriman pesan");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new TelegramNotificationError("Respons Telegram tidak valid");
  }

  if (
    typeof result !== "object" ||
    result === null ||
    !("ok" in result) ||
    result.ok !== true
  ) {
    throw new TelegramNotificationError("Telegram gagal mengirim pesan");
  }
}

export async function notifyTelegramAfterCommit(text: string, event: string) {
  if (!isTelegramConfigured()) return;

  try {
    await sendTelegramMessage(text);
  } catch (error) {
    if (!(error instanceof TelegramNotificationError)) throw error;
    console.error(`[Telegram] Notifikasi ${event} gagal: ${error.message}`);
  }
}
