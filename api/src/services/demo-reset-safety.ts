export function assertSafeDemoResetTarget(env: NodeJS.ProcessEnv = process.env) {
  if (env.DEMO_MODE !== "true") {
    throw new Error("Reset demo hanya boleh dijalankan saat DEMO_MODE=true.");
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL wajib diatur untuk reset demo.");
  }

  let databaseName: string;
  try {
    const databaseUrl = new URL(env.DATABASE_URL);
    if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
      throw new Error("Bukan URL PostgreSQL");
    }
    databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL bukan URL PostgreSQL yang valid.");
  }
  if (databaseName !== "stokpintar_demo") {
    throw new Error('Reset demo hanya diizinkan pada database khusus "stokpintar_demo".');
  }
}
