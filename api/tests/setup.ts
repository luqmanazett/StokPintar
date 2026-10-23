import "dotenv/config";
import { afterAll, beforeAll } from "vitest";
import { prisma } from "../src/db";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST wajib diatur untuk menjalankan test.");
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
if (parsedTestDatabaseUrl.protocol !== "postgres:" && parsedTestDatabaseUrl.protocol !== "postgresql:") {
  throw new Error("DATABASE_URL_TEST harus menggunakan PostgreSQL.");
}

const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
if (testDatabaseName !== "stokpintar_test") {
  throw new Error('Test hanya diizinkan pada database bernama "stokpintar_test".');
}

process.env.DATABASE_URL = testDatabaseUrl;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});
