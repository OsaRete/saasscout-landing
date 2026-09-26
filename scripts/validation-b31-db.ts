import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const required =
  process.env.VALIDATION_B31_DB_REQUIRED === "1";

const url =
  process.env.VALIDATION_B31_DATABASE_URL;

if (!url) {
  if (required) {
    throw new Error(
      "VALIDATION_B31_DATABASE_URL is required; dedicated DB verification must not skip",
    );
  }

  console.log(
    "SKIP validation-b31-db: disposable database URL is unavailable",
  );

  process.exit(0);
}

const databaseUrl = url;

const marker =
  "-- B31_FIXTURE_SETUP_END (machine-readable boundary consumed by the DB concurrency runner)";

const fixture = await readFile(
  new URL(
    "../tests/sql/validation-b31.sql",
    import.meta.url,
  ),
  "utf8",
);

const occurrences =
  fixture.split(marker).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `B3.1 fixture must contain exactly one marker; found ${occurrences}`,
  );
}

const [setup, assertions] =
  fixture.split(marker);

type PsqlResult = {
  code: number;
  output: string;
};

function psql(
  sql: string,
  label: string,
  allowFailure = false,
  tuplesOnly = false,
) {
  return new Promise<PsqlResult>(
    (resolve, reject) => {
      const args = [
        databaseUrl,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
      ];

      if (tuplesOnly) {
        args.push("-A", "-t");
      }

      args.push(
        "-c",
        `set statement_timeout='8s';set deadlock_timeout='100ms';${sql}`,
      );

      const child = spawn(
        "psql",
        args,
        {
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        },
      );

      let output = "";

      child.stdout.on(
        "data",
        (value) => {
          output += value;
        },
      );

      child.stderr.on(
        "data",
        (value) => {
          output += value;
        },
      );

      const timer = setTimeout(() => {
        child.kill("SIGKILL");

        reject(
          new Error(
            `${label}: child-process timeout`,
          ),
        );
      }, 12_000);

      child.on(
        "error",
        reject,
      );

      child.on(
        "close",
        (code) => {
          clearTimeout(timer);

          const result = {
            code: code ?? -1,
            output,
          };

          if (
            !allowFailure &&
            result.code !== 0
          ) {
            reject(
              new Error(
                `${label}: psql failed (${result.code})\n${output}`,
              ),
            );

            return;
          }

          resolve(result);
        },
      );
    },
  );
}

async function scalar(
  sql: string,
  label: string,
) {
  const result = await psql(
    sql,
    label,
    false,
    true,
  );

  const lines = result.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        line !== "SET",
    );

  if (lines.length !== 1) {
    throw new Error(
      `${label}: expected exactly one scalar row; received ${lines.length}\n${result.output}`,
    );
  }

  return lines[0];
}

function sqlLiteral(
  value: string,
) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function race(
  label: string,
  mutation: string,
  promotion: string,
) {
  const mutator = psql(
    `begin;${mutation};select pg_sleep(.35);rollback;`,
    `${label}:mutation`,
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 60),
  );

  const promote = psql(
    promotion,
    `${label}:promotion`,
  );

  await Promise.all([
    mutator,
    promote,
  ]);

  console.log(
    `PASS concurrency ${label}`,
  );
}

const promote = (
  i: number,
  polarity = "supporting",
  digit = String(i % 10),
) =>
  `select public.b31_test_promote(${i},'${polarity}',repeat('${digit}',64));`;


/*
 * Fixture setup.
 *
 * IMPORTANT:
 * The newline before COMMIT is intentional.
 *
 * The machine-readable fixture marker is a SQL line comment. Appending
 * COMMIT directly to that marker previously caused COMMIT to be swallowed
 * by the comment, which rolled the fixture back when psql exited.
 */
await psql(
  `begin;${setup}\ncommit;`,
  "fixture setup",
);


/*
 * Fail early if fixture setup was not actually committed.
 */
await psql(
  `
  do $$
  begin
    if not exists(
      select 1
      from public.validation_evidence_observations
      where id =
        'b0000000-0000-0000-0000-000000000007'
    ) then
      raise exception 'fixture observation missing';
    end if;

    if not exists(
      select 1
      from public.validation_participants
      where id =
        '90000000-0000-0000-0000-000000000007'
    ) then
      raise exception 'fixture participant missing';
    end if;

    if not exists(
      select 1
      from public.validation_interview_sessions
      where id =
        'a0000000-0000-0000-0000-000000000007'
    ) then
      raise exception 'fixture session missing';
    end if;
  end
  $$;
  `,
  "fixture prerequisites",
);


/*
 * Run static PostgreSQL integration assertions before concurrency work.
 */
await psql(
  assertions,
  "static database assertions",
);


/*
 * 1. Session-status mutation vs promotion.
 */
await race(
  "session-status",
  `
  select public.validation_b31_lock(
    'experiment',
    '70000000-0000-0000-0000-000000000001'
  );

  select public.validation_b31_lock(
    'participant',
    '90000000-0000-0000-0000-000000000007'
  );

  update public.validation_interview_sessions
  set
    status='cancelled',
    started_at=null,
    cancelled_at=now()
  where id =
    'a0000000-0000-0000-0000-000000000007'
  `,
  promote(7),
);


/*
 * 2. Session-relevance mutation vs promotion.
 */
await race(
  "session-relevance",
  `
  select public.validation_b31_lock(
    'experiment',
    '70000000-0000-0000-0000-000000000001'
  );

  select public.validation_b31_lock(
    'participant',
    '90000000-0000-0000-0000-000000000008'
  );

  update public.validation_interview_sessions
  set participant_relevance='adjacent_segment'
  where id =
    'a0000000-0000-0000-0000-000000000008'
  `,
  promote(8),
);


/*
 * 3. Participant-status mutation vs promotion.
 */
await race(
  "participant-status",
  `
  select public.validation_b31_lock(
    'participant',
    '90000000-0000-0000-0000-000000000009'
  );

  update public.validation_participants
  set status='withdrawn'
  where id =
    '90000000-0000-0000-0000-000000000009'
  `,
  promote(9),
);


/*
 * 4. Experiment-lifecycle mutation vs promotion.
 */
await race(
  "experiment-lifecycle",
  `
  select public.validation_b31_lock(
    'experiment',
    '70000000-0000-0000-0000-000000000001'
  );

  update public.validation_experiment_versions
  set lifecycle='paused'
  where id =
    '70000000-0000-0000-0000-000000000001'
  `,
  promote(10),
);


/*
 * 5. Classification supersession vs promotion.
 */
await race(
  "classification-supersession",
  `
  select public.validation_insert_classification(
    '10000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000011',
    'supporting',
    'user_supplied',
    'authoritative',
    null,
    'c0000000-0000-0000-0000-000000000011'
  )
  `,
  promote(11),
);


/*
 * 6. Exact retry.
 *
 * Two independent connections attempt the exact same promotion.
 * Both calls must serialize successfully while only one final ledger
 * and one shared observation are created.
 */
const retries =
  await Promise.all([
    psql(
      promote(12),
      "exact-retry-a",
    ),
    psql(
      promote(12),
      "exact-retry-b",
    ),
  ]);

if (
  retries.some(
    (result) =>
      result.code !== 0,
  )
) {
  throw new Error(
    "exact retries did not serialize",
  );
}

await psql(
  `
  do $$
  begin
    if (
      select count(*)
      from public.validation_evidence_promotions
      where
        observation_id =
          'b0000000-0000-0000-0000-000000000012'
        and problem_observation_id is not null
    ) <> 1
    then
      raise exception
        'exact retry duplicated ledger';
    end if;
  end
  $$;
  `,
  "exact retry assertion",
);

console.log(
  "PASS concurrency exact-retry",
);


/*
 * 7. Different peer, same representative group.
 *
 * Observations 14 and 15 belong to the same participant and therefore
 * compete for the same canonical/polarity/policy final group.
 *
 * Exactly one final promotion may win.
 */
const peer =
  await Promise.all([
    psql(
      promote(14),
      "same-group-peer-a",
      true,
    ),

    psql(
      promote(15),
      "same-group-peer-b",
      true,
    ),
  ]);

if (
  peer.filter(
    (result) =>
      result.code === 0,
  ).length !== 1
) {
  throw new Error(
    `different-peer race expected one winner; results ${peer.map((result) => result.code)}`,
  );
}

if (
  peer.some((result) =>
    /deadlock detected|statement timeout/i.test(
      result.output,
    ),
  )
) {
  throw new Error(
    "different-peer race deadlocked or timed out",
  );
}

await psql(
  `
  do $$
  begin
    if (
      select count(*)
      from public.validation_evidence_promotions
      where
        participant_id =
          '90000000-0000-0000-0000-000000000014'
        and canonical_problem_id =
          '20000000-0000-0000-0000-000000000001'
        and polarity='supporting'
        and policy_version='v8-b1.2'
        and problem_observation_id is not null
    ) <> 1
    then
      raise exception
        'same-group finality failed';
    end if;

    if (
      select count(*)
      from public.problem_observations po
      join public.validation_evidence_promotions promotion
        on promotion.problem_observation_id = po.id
      where
        promotion.participant_id =
          '90000000-0000-0000-0000-000000000014'
        and promotion.policy_version='v8-b1.2'
    ) <> 1
    then
      raise exception
        'same-group shared count failed';
    end if;
  end
  $$;
  `,
  "different-peer same-group assertion",
);

console.log(
  "PASS concurrency different-peer-same-group",
);


/*
 * -------------------------------------------------------------------
 * 8. Stale representative -> better candidate
 * -------------------------------------------------------------------
 *
 * This is the regression for the P1 review finding.
 *
 * Phase A:
 * Create participant 16 with one eligible supporting observation A.
 * A is initially the only candidate, so a TypeScript preparation at
 * this point may legitimately select A.
 *
 * Capture the exact persisted representative state S1.
 *
 * Phase B:
 * From a separate PostgreSQL connection, commit a second eligible
 * observation B for the SAME participant/canonical/polarity group.
 *
 * B is deliberately stronger under the existing TypeScript B2 ranking:
 * - A uses statementKind=summary
 * - B uses statementKind=direct_quote
 * - B has longer content
 * - B has a later observed_at
 *
 * PostgreSQL itself does not rank A vs B. Those properties simply make
 * the fixture represent the real stale-selection case.
 *
 * Phase C:
 * Attempt to promote A while explicitly supplying stale S1.
 *
 * The RPC must:
 * - acquire coordination locks
 * - reconstruct current persisted participant state S2
 * - observe S2 != S1
 * - fail closed
 *
 * No shared observation or final promotion ledger may be committed.
 */

const staleParticipant =
  "90000000-0000-0000-0000-000000000016";

const staleSessionA =
  "a0000000-0000-0000-0000-000000000016";

const staleSessionB =
  "a0000000-0000-0000-0000-000000000017";

const staleObservationA =
  "b0000000-0000-0000-0000-000000000016";

const staleObservationB =
  "b0000000-0000-0000-0000-000000000017";

const staleClassificationA =
  "c0000000-0000-0000-0000-000000000016";

const staleClassificationB =
  "c0000000-0000-0000-0000-000000000017";

const staleFingerprint =
  "8".repeat(64);


/*
 * Establish A and commit it before capturing S1.
 */
await psql(
  `
  begin;

  insert into public.validation_participants(
    id,
    owner_id,
    experiment_id,
    identity_mode,
    status
  )
  values(
    '${staleParticipant}',
    '10000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'experiment_pseudonymous',
    'active'
  );

  insert into public.validation_interview_sessions(
    id,
    owner_id,
    subject_id,
    experiment_id,
    experiment_version_id,
    hypothesis_id,
    hypothesis_version_id,
    participant_id,
    interview_plan_version_id,
    status,
    participant_relevance,
    started_at
  )
  values(
    '${staleSessionA}',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '${staleParticipant}',
    '80000000-0000-0000-0000-000000000001',
    'in_progress',
    'target_segment_match',
    now()
  );

  insert into public.validation_evidence_observations(
    id,
    owner_id,
    subject_id,
    hypothesis_id,
    hypothesis_version_id,
    experiment_id,
    experiment_version_id,
    participant_id,
    interview_session_id,
    origin,
    modality,
    observed_at,
    source_type,
    collected_by,
    observation_content,
    independence_relationship
  )
  values(
    '${staleObservationA}',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '${staleParticipant}',
    '${staleSessionA}',
    'human_interview',
    'interview_observation',
    now() - interval '2 minutes',
    'customer_interview',
    'manual',
    jsonb_build_object(
      'content',
      'Initial summary',
      'statementKind',
      'summary'
    ),
    'independent'
  );

  insert into public.validation_evidence_classifications(
    id,
    owner_id,
    observation_id,
    polarity,
    classification_source,
    authority_status
  )
  values(
    '${staleClassificationA}',
    '10000000-0000-0000-0000-000000000001',
    '${staleObservationA}',
    'supporting',
    'user_supplied',
    'authoritative'
  );

  insert into public.validation_customer_interview_shareable_evidence(
    owner_id,
    source_observation_id,
    statement,
    statement_sha256,
    contract_version,
    review_confirmation
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    '${staleObservationA}',
    'Approved stale candidate A',
    encode(
      extensions.digest(
        convert_to(
          'Approved stale candidate A',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    'customer_interview_shareable_evidence_v1',
    'human_reviewed_for_shared_evidence_use'
  );

  commit;
  `,
  "stale representative fixture A",
);


/*
 * Capture S1 exactly as PostgreSQL exposes it.
 *
 * This represents the persisted state against which TypeScript prepared
 * the original representative decision.
 */
const staleRepresentativeState =
  await scalar(
    `
    select public.validation_b31_representative_state(
      '10000000-0000-0000-0000-000000000001',
      '${staleParticipant}'
    )::text;
    `,
    "stale representative snapshot",
  );


/*
 * Commit the better peer B from an independent psql connection.
 *
 * Observation and classification INSERT coordination acquire the same
 * experiment -> participant locks used by promotion.
 */
await psql(
  `
  begin;

  insert into public.validation_interview_sessions(
    id,
    owner_id,
    subject_id,
    experiment_id,
    experiment_version_id,
    hypothesis_id,
    hypothesis_version_id,
    participant_id,
    interview_plan_version_id,
    status,
    participant_relevance,
    started_at
  )
  values(
    '${staleSessionB}',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '${staleParticipant}',
    '80000000-0000-0000-0000-000000000001',
    'in_progress',
    'target_segment_match',
    now()
  );

  insert into public.validation_evidence_observations(
    id,
    owner_id,
    subject_id,
    hypothesis_id,
    hypothesis_version_id,
    experiment_id,
    experiment_version_id,
    participant_id,
    interview_session_id,
    origin,
    modality,
    observed_at,
    source_type,
    collected_by,
    observation_content,
    independence_relationship
  )
  values(
    '${staleObservationB}',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '${staleParticipant}',
    '${staleSessionB}',
    'human_interview',
    'interview_observation',
    now(),
    'customer_interview',
    'manual',
    jsonb_build_object(
      'content',
      'A much more specific direct quote describing the repeated reporting delay and the concrete operational impact.',
      'statementKind',
      'direct_quote'
    ),
    'independent'
  );

  insert into public.validation_evidence_classifications(
    id,
    owner_id,
    observation_id,
    polarity,
    classification_source,
    authority_status
  )
  values(
    '${staleClassificationB}',
    '10000000-0000-0000-0000-000000000001',
    '${staleObservationB}',
    'supporting',
    'user_supplied',
    'authoritative'
  );

  insert into public.validation_customer_interview_shareable_evidence(
    owner_id,
    source_observation_id,
    statement,
    statement_sha256,
    contract_version,
    review_confirmation
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    '${staleObservationB}',
    'Approved stronger candidate B',
    encode(
      extensions.digest(
        convert_to(
          'Approved stronger candidate B',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    'customer_interview_shareable_evidence_v1',
    'human_reviewed_for_shared_evidence_use'
  );

  commit;
  `,
  "stale representative better peer",
);


/*
 * Sanity check: the persisted state really changed before attempting
 * stale promotion.
 */
const currentRepresentativeState =
  await scalar(
    `
    select public.validation_b31_representative_state(
      '10000000-0000-0000-0000-000000000001',
      '${staleParticipant}'
    )::text;
    `,
    "current representative snapshot",
  );

if (
  currentRepresentativeState ===
  staleRepresentativeState
) {
  throw new Error(
    "stale representative scenario did not change persisted candidate state",
  );
}


/*
 * Attempt A with stale S1.
 *
 * p_representative_state is supplied explicitly rather than using
 * b31_test_promote(), because the helper intentionally captures fresh
 * state and therefore cannot model a stale preparation.
 */
const stalePromotion =
  await psql(
    `
    select public.validation_promote_customer_interview_evidence(
      '10000000-0000-0000-0000-000000000001',
      '${staleObservationA}',
      '${staleClassificationA}',
      '20000000-0000-0000-0000-000000000001',
      'supporting',
      'participant:stale-representative',
      repeat('8',64),
      ${sqlLiteral(staleRepresentativeState)}::jsonb,
      public.validation_b31_authority_snapshot(
        '30000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001'
      ),
      'Slow reports',
      'slow reports',
      'v8-b1.2',
      'v8-b3.0.2-exact.1',
      'v8-b3.1-projection.1'
    );
    `,
    "stale representative promotion",
    true,
  );


if (stalePromotion.code === 0) {
  throw new Error(
    "stale representative promotion unexpectedly succeeded",
  );
}

if (
  /deadlock detected|statement timeout/i.test(
    stalePromotion.output,
  )
) {
  throw new Error(
    `stale representative scenario deadlocked or timed out\n${stalePromotion.output}`,
  );
}

if (
  !/representative authority state changed/i.test(
    stalePromotion.output,
  )
) {
  throw new Error(
    `stale representative failed for an unexpected reason\n${stalePromotion.output}`,
  );
}


/*
 * Verify atomic failure:
 * - A has no final ledger
 * - B has no final ledger
 * - participant 16 has no shared projection
 * - neither fingerprint leaked into problem_observations
 */
await psql(
  `
  do $$
  begin
    if exists(
      select 1
      from public.validation_evidence_promotions
      where
        participant_id =
          '${staleParticipant}'
        and problem_observation_id is not null
    ) then
      raise exception
        'stale representative created final ledger';
    end if;

    if exists(
      select 1
      from public.problem_observations po
      join public.validation_evidence_promotions promotion
        on promotion.problem_observation_id = po.id
      where
        promotion.participant_id =
          '${staleParticipant}'
    ) then
      raise exception
        'stale representative created shared projection';
    end if;

    if exists(
      select 1
      from public.problem_observations
      where
        observation_fingerprint =
          'validation-promotion:${staleFingerprint}'
    ) then
      raise exception
        'stale representative leaked problem observation';
    end if;
  end
  $$;
  `,
  "stale representative atomicity assertion",
);

console.log(
  "PASS concurrency stale-representative-better-candidate",
);


console.log(
  "PASS validation-b31-db: 8 independent-connection concurrency scenarios and static assertions",
);