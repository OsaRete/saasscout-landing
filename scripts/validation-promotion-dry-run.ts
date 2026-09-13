import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { readValidationPromotionRows } from "../lib/validation/promotion/read-repository.ts";
import { buildValidationPromotionDryRunReport } from "../lib/validation/promotion/report.ts";

const outputPath = resolve(process.cwd(), "artifacts/validation-promotion-dry-run.json");
const report = buildValidationPromotionDryRunReport(await readValidationPromotionRows());
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
process.stdout.write(`Read-only validation promotion preparation evaluated ${report.summary.observationsEvaluated} observations.\n`);
process.stdout.write(`Report: ${outputPath}\nSnapshot hash: ${report.promotionPreparationSnapshotHash}\n`);
