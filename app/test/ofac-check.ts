// Quick check of the free OFAC sanctions list (no Chainalysis key).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.BURSAR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bursar-ofac-"));
delete process.env.CHAINALYSIS_API_KEY;
(async () => {
  const { sanctionsCheck } = await import("../src/lib/screening");
  const listed = await sanctionsCheck("0x0330070FD38Ec3bB94F58FA55D40368271E9e54A", { fresh: true });
  const clean = await sanctionsCheck("0x000000000000000000000000000000000000dEaD", { fresh: true });
  console.log("listed:", listed.status, listed.reasons.map((r) => r.detail).join(" "));
  console.log("clean:", clean.status);
  if (listed.status !== "blocked" || clean.status !== "clear") process.exit(1);
  console.log("OFAC check passed.");
  process.exit(0);
})();
