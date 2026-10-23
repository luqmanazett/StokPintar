import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { runIntegrityChecks } from "../services/integrity";

const router = Router();

router.get("/check", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const checks = await runIntegrityChecks();
  res.json({
    checkedAt: new Date().toISOString(),
    passed: checks.every((check) => check.passed),
    checks,
  });
});

export default router;
