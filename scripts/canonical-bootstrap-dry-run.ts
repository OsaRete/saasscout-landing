import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { analyzeCanonicalBootstrap } from "../lib/knowledge/canonical-bootstrap/analyzer.ts";
import { createSupabaseObservationReader, readUnresolvedProblemObservations } from "../lib/knowledge/canonical-bootstrap/repository.ts";

const outputPath = resolve(process.cwd(), "artifacts/canonical-bootstrap-dry-run.json");
const observations = await readUnresolvedProblemObservations(createSupabaseObservationReader());
const report = analyzeCanonicalBootstrap(observations);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w" });
process.stdout.write(`Read-only canonical bootstrap analyzed ${report.summary.observationsAnalyzed} unresolved observations.\nReport: ${outputPath}\n`);
