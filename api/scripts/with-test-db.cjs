require("dotenv").config();

const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST wajib diatur untuk perintah test dan migrasi test.");
}

let databaseName;
try {
  const url = new URL(testDatabaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Protokol harus PostgreSQL.");
  }
  databaseName = decodeURIComponent(url.pathname.slice(1));
} catch (error) {
  throw new Error("DATABASE_URL_TEST bukan URL PostgreSQL yang valid.", { cause: error });
}

if (databaseName !== "stokpintar_test") {
  throw new Error('Perintah test hanya diizinkan pada database bernama "stokpintar_test".');
}

const [command, ...args] = process.argv.slice(2);
const packagePaths = {
  prisma: ["prisma/package.json", "build/index.js"],
  vitest: ["vitest/package.json", "vitest.mjs"],
};
const packagePath = packagePaths[command];
if (!packagePath) {
  throw new Error("Perintah yang diizinkan: prisma atau vitest.");
}

const packageDirectory = dirname(require.resolve(packagePath[0]));
const result = spawnSync(process.execPath, [join(packageDirectory, packagePath[1]), ...args], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
