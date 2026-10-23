import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { AppError } from "../middlewares/error";
import {
  isTelegramConfigured,
  sendTelegramMessage,
  TelegramNotificationError,
} from "../services/telegram";

const router = Router();

router.post("/telegram/test", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  if (!isTelegramConfigured()) {
    throw new AppError(503, "Telegram belum dikonfigurasi di server");
  }

  try {
    await sendTelegramMessage("Tes notifikasi StokPintar berhasil.");
  } catch (error) {
    if (error instanceof TelegramNotificationError) {
      throw new AppError(502, error.message);
    }
    throw error;
  }

  res.json({ message: "Pesan tes berhasil dikirim" });
});

export default router;
