import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { assertSafeDemoResetTarget } from "./demo-reset-safety";

const timeZone = "Asia/Jakarta";
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function millisecondsUntilNextDemoReset(now = new Date()) {
  const parts = new Map(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));
  const hour = Number(parts.get("hour"));
  const jakartaOffsetMs = 7 * 60 * 60 * 1000;
  let nextRun = Date.UTC(year, month - 1, day, 3) - jakartaOffsetMs;

  if (hour >= 3 || nextRun <= now.getTime()) nextRun += millisecondsPerDay;
  return nextRun - now.getTime();
}

export function startDailyDemoResetScheduler() {
  if (process.env.DEMO_MODE !== "true") return false;
  assertSafeDemoResetTarget(process.env);

  console.info("Reset demo terjadwal aktif setiap hari pukul 03.00 WIB.");
  scheduleNextReset();
  return true;
}

function scheduleNextReset() {
  const delay = millisecondsUntilNextDemoReset();
  const timer = setTimeout(runDemoReset, delay);
  timer.unref();
}

function runDemoReset() {
  console.info("Memulai reset data demo terjadwal.");
  const projectDirectory = process.cwd();
  const npmCli = process.env.npm_execpath;
  const command = process.execPath;
  const args = npmCli
    ? [npmCli, "run", "seed:demo"]
    : [
        resolve(projectDirectory, "node_modules", "tsx", "dist", "cli.mjs"),
        resolve(projectDirectory, "prisma", "seed-demo.ts"),
      ];
  const child = spawn(command, args, {
    cwd: projectDirectory,
    env: { ...process.env, SEED_DEMO_CONFIRM: "YES" },
    stdio: "inherit",
  });
  let spawnFailed = false;

  child.once("error", (error) => {
    spawnFailed = true;
    console.error("Gagal menjalankan reset demo:", error);
    scheduleNextReset();
  });
  child.once("exit", (code) => {
    if (spawnFailed) return;
    if (code === 0) {
      console.info("Reset data demo selesai.");
    } else {
      console.error(`Reset data demo gagal dengan kode keluar ${code ?? "tidak diketahui"}.`);
    }
    scheduleNextReset();
  });
}
