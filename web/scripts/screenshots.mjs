import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const screenshotDirectory = resolve(webDirectory, "../docs/screenshots");
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:5173";
const email = process.env.SCREENSHOT_EMAIL ?? "admin@stokpintar.test";
const password = process.env.SCREENSHOT_PASSWORD ?? "admin123";
const pages = [
  { name: "dashboard", path: "/" },
  { name: "produk", path: "/products" },
  { name: "kasir", path: "/cashier" },
  { name: "transaksi", path: "/transactions" },
  { name: "kategori", path: "/categories" },
  { name: "akun", path: "/cashier-accounts" },
  { name: "log-audit", path: "/audit-logs" },
  { name: "pemasok", path: "/suppliers" },
  { name: "pembelian", path: "/purchases" },
  { name: "stok-opname", path: "/stock-opnames" },
  { name: "keuangan", path: "/finance" },
  { name: "analitik", path: "/analytics" },
  { name: "integritas", path: "/integrity" },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "375px", width: 375, height: 812 },
];

let webServer;
let browser;

async function isWebAvailable() {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function startWebServer() {
  if (process.env.SCREENSHOT_BASE_URL || await isWebAvailable()) return;

  webServer = spawn(
    process.execPath,
    [resolve(webDirectory, "node_modules/vite/bin/vite.js"), "--host", "localhost", "--port", "5173", "--strictPort"],
    { cwd: webDirectory, stdio: "ignore", windowsHide: true },
  );

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (webServer.exitCode !== null) throw new Error("Server Vite berhenti sebelum siap.");
    if (await isWebAvailable()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Server web tidak siap pada ${baseUrl}.`);
}

async function capturePage(page, name, path) {
  await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "networkidle" });
  await page.locator("main").waitFor({ state: "visible" });
  await page.waitForTimeout(500);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${name}-${viewport.name}.png`),
      fullPage: true,
    });
  }
}

try {
  await mkdir(screenshotDirectory, { recursive: true });
  await startWebServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("stokpintar-theme", "light");
    localStorage.setItem("stokpintar-tour-completed", "true");
  });
  await page.reload({ waitUntil: "networkidle" });

  await capturePage(page, "beranda", "/");
  await capturePage(page, "login", "/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15000 });

  for (const entry of pages) {
    await capturePage(page, entry.name, entry.path);
  }
  console.log(`Tangkapan layar tersimpan di ${screenshotDirectory}`);
} finally {
  if (browser) await browser.close();
  if (webServer && webServer.exitCode === null) webServer.kill();
}
