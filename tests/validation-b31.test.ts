import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveValidationCanonicalProblem } from "../lib/validation/promotion/canonical-resolution.ts";

const migration = readFileSync(
  "supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql",
  "utf8",
);
const fixture = readFileSync("tests/sql/validation-b31.sql", "utf8");

test("B3.1 exact resolver remains TypeScript authority and fails conflicts closed", () => {
  const registry = [
    {
      id: "a",
      canonicalTitle: "Slow reports",
      normalizedTitle: "slow reports",
      status: "active",
      aliases: [],
    },
    {
      id: "b",
      canonicalTitle: "Export failures",
      normalizedTitle: "export failures",
      status: "active",
      aliases: [],
    },
  ];
  assert.equal(
    resolveValidationCanonicalProblem(
      {
        subjectLabel: "Slow reports",
        hypothesisProblemClaim: "Export failures",
      },
      registry,
    ).status,
    "ambiguous",
  );
  assert.equal(
    resolveValidationCanonicalProblem(
      { subjectLabel: "Slow reports", respondentProse: "Export failures" },
      registry,
    ).canonicalProblemId,
    "a",
  );
});

test("B3.1 migration encodes atomic finality, privacy and service-only boundaries", () => {
  assert.match(migration, /validation_promotions_final_source_uidx/);
  assert.match(migration, /validation_promotions_final_group_uidx/);
  assert.match(
    migration,
    /source_evidence,evidence_polarity,observed_at,metadata/,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.(problem_intelligence|problem_evolution_snapshots|opportunities|recommendations)/i,
  );
  assert.match(
    migration,
    /revoke all on function[\s\S]+validation_promote_customer_interview_evidence[\s\S]+from public,anon,authenticated/,
  );
  assert.match(migration, /grant execute[\s\S]+to service_role/);
});

test("B3.1 fixture marker and mandatory different-peer race are explicit", () => {
  const marker =
    "-- B31_FIXTURE_SETUP_END (machine-readable boundary consumed by the DB concurrency runner)";
  assert.equal(fixture.split(marker).length - 1, 1);
  const runner = readFileSync("scripts/validation-b31-db.ts", "utf8");
  assert.match(runner, /different-peer race expected one winner/);
  assert.match(runner, /fixture observation missing/);
  assert.match(runner, /fixture participant missing/);
  assert.match(runner, /fixture session missing/);
});
