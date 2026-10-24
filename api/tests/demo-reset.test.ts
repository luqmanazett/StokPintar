import { describe, expect, it } from "vitest";
import { assertSafeDemoResetTarget } from "../src/services/demo-reset-safety";
import {
  millisecondsUntilNextDemoReset,
  startDailyDemoResetScheduler,
} from "../src/services/demo-reset-scheduler";

describe("jadwal reset demo", () => {
  it("menghitung waktu reset berdasarkan pukul 03.00 WIB", () => {
    expect(millisecondsUntilNextDemoReset(new Date("2026-10-24T19:59:00.000Z"))).toBe(60_000);
    expect(millisecondsUntilNextDemoReset(new Date("2026-10-24T20:00:00.000Z"))).toBe(24 * 60 * 60 * 1000);
    expect(millisecondsUntilNextDemoReset(new Date("2026-10-24T20:01:00.000Z"))).toBe(
      23 * 60 * 60 * 1000 + 59 * 60 * 1000,
    );
  });

  it("hanya mengizinkan reset saat mode demo menunjuk database demo khusus", () => {
    const safeEnvironment = {
      DEMO_MODE: "true",
      DATABASE_URL: "postgresql://demo:demo@localhost:5432/stokpintar_demo",
      NODE_ENV: "production",
    };

    expect(() => assertSafeDemoResetTarget(safeEnvironment)).not.toThrow();
    expect(() =>
      assertSafeDemoResetTarget({ ...safeEnvironment, DATABASE_URL: "postgresql://localhost/stokpintar" }),
    ).toThrow('database khusus "stokpintar_demo"');
    expect(() => assertSafeDemoResetTarget({ ...safeEnvironment, DEMO_MODE: "false" })).toThrow(
      "DEMO_MODE=true",
    );
  });

  it("tidak menjalankan scheduler ketika mode demo mati", () => {
    const originalDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    try {
      expect(startDailyDemoResetScheduler()).toBe(false);
    } finally {
      if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = originalDemoMode;
    }
  });
});
