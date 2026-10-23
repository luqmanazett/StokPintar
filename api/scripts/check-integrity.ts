import "dotenv/config";
import { prisma } from "../src/db";
import { runIntegrityChecks } from "../src/services/integrity";

async function main() {
  const checks = await runIntegrityChecks();
  for (const check of checks) {
    const status = check.passed ? "LULUS" : "PERLU DIPERIKSA";
    console.log(`${status} — ${check.label} (${check.checkedCount} data diperiksa)`);
    for (const issue of check.issues) console.log(`  - ${issue}`);
    if (check.issueCount > check.issues.length) {
      console.log(`  - dan ${check.issueCount - check.issues.length} masalah lainnya`);
    }
  }
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("Pemeriksaan integritas gagal dijalankan:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
