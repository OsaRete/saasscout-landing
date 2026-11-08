#!/usr/bin/env python3
"""Prepared disposable F4 runner. Import/offline tests never connect or migrate.

This runner does not start/reset a project or apply migrations. A separately
authorized, freshly migrated isolated PostgreSQL 17 stack is a prerequisite.
"""
import concurrent.futures as futures
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

sys.dont_write_bytecode = True


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


f3 = load('validation-b43-f3')
a = load('validation-b43-f4-attempts')
require, execute, scalar, uid = a.require, a.execute, a.scalar, a.uid
BASELINE = 'cdfa204ac1e911a5faf02ae0fc21025e149c0e45'
MIGRATION_SHA256 = '81b46d1c1e0d0f898f0f716faf17bb0c2a2f3f633f89cbd191315cd35735e279'
HISTORICAL = tuple((iso, variant) for iso in f3.ISOLATIONS for variant in f3.VARIANTS)
# Explicit oracle after genuine fresh retry, never inferred from observed results.
# (name, first intent, second intent, ledger count, fresh disposition, trust scope)
SCENARIOS = (
    ('participant_restore', 'withdraw', 'restore', 0, 'executed', 'rpc'),
    ('consent', 'consent', 'promote', 1, 'executed', 'trusted_fenced_sql'),
    ('experiment_pause', 'pause', 'promote', 1, 'executed', 'rpc'),
    ('experiment_cancel', 'cancel_experiment', 'promote', 0, 'qualification_deferred', 'rpc'),
    ('session_relevance', 'relevance', 'promote', 0, 'qualification_deferred', 'rpc'),
    ('session_cancel', 'cancel_session', 'promote', 0, 'qualification_deferred', 'rpc'),
    ('withdraw_insert', 'withdraw', 'insert', 0, 'executed', 'rpc'),
    ('insert_withdraw', 'insert', 'withdraw', 0, 'executed', 'rpc'),
    ('promote_classify', 'promote', 'classify_ai', 1, 'executed', 'rpc'),
    ('classify_promote', 'classify_ai', 'promote', 0, 'qualification_deferred', 'rpc'),
    ('human_successor', 'classify_human', 'promote', 1, 'executed', 'rpc'),
    ('mixed_successor', 'classify_mixed', 'promote', 1, 'executed', 'rpc'),
    ('canonical', 'canonical', 'promote', 0, 'qualification_deferred', 'trusted_fenced_sql'),
    ('alias', 'alias', 'promote', 1, 'executed', 'trusted_fenced_sql'),
    ('alias_conflict', 'alias_conflict', 'promote', 0, 'qualification_deferred', 'trusted_fenced_sql'),
    ('duplicate', 'promote', 'promote', 1, 'executed', 'rpc'),
    ('nested', 'nested', 'promote', 1, 'executed', 'trusted_nested_rpc_probe'),
    ('indirect_fk', 'indirect_fk', 'canonical', 0, 'executed', 'trusted_fenced_sql'),
    ('outer_snapshot', 'withdraw', 'promote', 0, 'qualification_deferred', 'stale_argument_negative'),
)
EVENTS = []
CASE = 'setup'
STAGE = 'authorization'
SHA = ''
FAILURE_LABELS = frozenset(('f4_authorization_required', 'reviewed_revision_required', 'migration_digest',
    'migration_chain', 'catalog_function_missing', 'catalog_owner_security', 'catalog_definition',
    'catalog_retained_definition', 'catalog_guard_coverage', 'catalog_effective_mutation', 'catalog_execute_acl',
    'catalog_select_acl', 'catalog_rls', 'catalog_role_escape', 'retry_exhausted', 'preparation_failed',
    'preparation_protocol', 'unclassified_driver_failure', 'fresh_transaction_required', 'first_command_failed',
    'holder_commit_failed', 'stale_snapshot_not_rejected', 'fresh_outcome_mismatch', 'ledger_count',
    'withheld_count', 'positive_authority', 'membership_restrictions', 'classification_identity',
    'immutable_proof', 'duplicate_finality', 'capture_atomicity', 'commit_atomicity', 'savepoint_entry_conflict',
    'finality_correction_accepted', 'history_proofs_rewritten', 'typed_rpc_failed', 'typed_rpc_protocol',
    'security_negative_unexpected_state', 'denied_operation_changed_rows', 'unsupported_isolation_accepted',
    'blocking_barrier_not_observed'))


def failure_label(error):
    value = error.args[0] if isinstance(error, (a.ContractFailure, f3.DiagnosticFailure)) and len(error.args) == 1 else None
    return value if isinstance(value, str) and value in FAILURE_LABELS else 'f4_validation_failed'


def event(kind, **fields):
    # Values supplied here are fixed labels, SQLSTATEs, counts or booleans only.
    EVENTS.append({'kind': kind, 'case': CASE, **fields})


def require_runtime():
    require(os.environ.get('F4_AUTHORIZED') == 'true', 'f4_authorization_required')
    require(os.environ.get('F4_EXPECTED_SHA') == os.environ.get('F3_SOURCE_SHA')
            and re.fullmatch('[a-f0-9]{40}', os.environ.get('F4_EXPECTED_SHA', '')), 'reviewed_revision_required')
    require(os.environ.get('GITHUB_WORKFLOW_REF') ==
            'OsaRete/saasscout-landing/.github/workflows/validation-b43-f4-disposable.yml@refs/heads/codex/b43-c1-source-transition-integrity',
            'reviewed_revision_required')
    require('F3_ARTIFACT' not in os.environ, 'separate_artifact_required')
    # Includes fixed loopback DSN, no PG*/remote Docker overrides, exact tracked
    # and untracked cleanliness, cluster identity and existing dispatch context.
    expected = f3.require_runtime()
    require(expected == os.environ['F4_EXPECTED_SHA'], 'reviewed_revision_required')
    return expected


def artifact_path():
    root = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    target = Path(os.environ['F4_ARTIFACT'])
    require(target == root / 'b43-f4-diagnostic.json' and not target.is_symlink(), 'artifact_identity')
    return target


def fixture(n):
    source = Path('tests/sql/validation-b31.sql').read_text()
    boundary = 'create function public.b31_test_promote('
    require(source.count(boundary) == 1, 'fixture_boundary')
    source = source.split(boundary)[0]
    for before, after, count in [('generate_series(1,14)', f'generate_series({n},{n})', 1),
                                  ('generate_series(1,15)', f'generate_series({n},{n})', 4),
                                  ('least(i,14)', 'i', 2), ('where i <> 4;', 'where true;', 1)]:
        require(source.count(before) == count, 'fixture_contract')
        source = source.replace(before, after)
    for prefix in '2345678':
        source = source.replace(uid(prefix, 1), uid(prefix, n))
    source = source.replace("'Slow reports'", f"'F4 reports {n}'").replace("'slow reports'", f"'f4 reports {n}'")
    source = source.replace("'slow-reports'", f"'f4-reports-{n}'")
    return source


def apply_fixture(c, n):
    require(c.info.transaction_status == 0, 'fresh_transaction_required')
    execute(c, 'begin')
    try:
        execute(c, 'select saasscout_private.b43_enter()')
        execute(c, fixture(n))
        execute(c, '''insert into public.canonical_problems(id,canonical_key,canonical_title,normalized_title,status)
          values(%s::uuid,%s,%s,%s,'active')''', (uid('f', n), f'f4-alternate-{n}', f'F4 alternate {n}', f'f4 alternate {n}'))
        execute(c, 'commit')
    except Exception:
        execute(c, 'rollback')
        raise


def digest(c):
    manifest = json.loads(Path('docs/V8_B43_F4_B21_SOURCE_MANIFEST.json').read_text())
    relations = ['public.' + t for t in manifest['guarded_tables']] + ['saasscout_private.b43_coordination']
    return tuple(scalar(c, f"select md5(coalesce(string_agg(j::text,'' order by j::text),'')) from (select to_jsonb(t) j from {table} t) x")
                 for table in relations)


def catalog(c):
    effective = json.loads(Path('docs/V8_B43_F4_B22_EFFECTIVE_MANIFEST.json').read_text())
    migration = Path(effective['migration'])
    require(hashlib.sha256(migration.read_bytes()).hexdigest() == MIGRATION_SHA256 == effective['migration_sha256'], 'migration_digest')
    versions = sorted(p.name[:14] for p in Path('supabase/migrations').glob('*.sql'))
    require([r[0] for r in execute(c, 'select version::text from supabase_migrations.schema_migrations order by version')] == versions, 'migration_chain')
    for item in effective['functions']:
        metadata = execute(c, '''select r.rolname,p.prosecdef,p.provolatile,p.proconfig,p.prosrc
          from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(%s)''', (item['signature'],))
        require(len(metadata) == 1, 'catalog_function_missing')
        owner, definer, volatility, config, body = metadata[0]
        require(owner == 'postgres' and definer == (item['security'] == 'definer'), 'catalog_owner_security')
        expected_volatility = 'v' if item['source'] == effective['migration'] else item['volatility'][0]
        require(volatility == expected_volatility, 'catalog_volatility')
        if 'body_sha256' in item:
            require(config == ['search_path=pg_catalog, pg_temp']
                    and hashlib.sha256(body.encode()).hexdigest() == item['body_sha256'], 'catalog_definition')
        else:
            source = Path(item['source']).read_text()
            match = re.search(r'create\s+(?:or replace\s+)?function\s+public\.' + item['name'].split('.')[-1]
                              + r'\s*\(.*?\)\s*returns\s+.*?\bas\s+(\$\w*\$)', source, re.S | re.I)
            require(match is not None, 'catalog_source')
            require(body == source[match.end():source.index(match[1], match.end())], 'catalog_retained_definition')
        for role in ('anon', 'authenticated', 'service_role', 'authenticator'):
            expected = item.get('explicit_execute_acl', {}).get(role)
            if item['signature'] == 'public.validation_b31_lock(text,text)':
                expected = 'revoke'
            elif item['source'] == effective['migration'] and item['name'] != 'public.validation_b31_lock_registry_statement':
                expected = 'grant' if role == 'service_role' and item['security'] == 'definer' else 'revoke'
            if expected:
                require(scalar(c, 'select has_function_privilege(%s,to_regprocedure(%s),\'EXECUTE\')', (role, item['signature']))
                        == (expected == 'grant'), 'catalog_execute_acl')
        require(scalar(c, '''select not exists(select 1 from pg_proc p,
          lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
          where p.oid=to_regprocedure(%s) and x.grantee=0 and x.privilege_type='EXECUTE')''', (item['signature'],)), 'catalog_public_execute')
    require(scalar(c, "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and (p.proname like 'validation_%' or p.proname in ('apply_canonical_bootstrap_activation','knowledge_insert_problem_observations'))) or n.nspname='saasscout_private'") == 58, 'catalog_function_count')
    guards = execute(c, '''select c.relname,t.tgtype,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where t.tgname='b43_00_entry' and not t.tgisinternal order by c.relname''')
    require(guards == [(t['relation'].split('.')[-1], 62, 'O') for t in sorted(effective['new_statement_guards'], key=lambda t: t['relation'])], 'catalog_guard_coverage')
    require(scalar(c, '''select count(*) from pg_trigger t where not t.tgisinternal and t.tgrelid=any(%s::regclass[])''',
                   ([t['relation'] for t in effective['new_statement_guards']],)) == 67, 'catalog_trigger_count')
    owner_read = {'validation_subjects', 'validation_subject_links', 'validation_hypotheses', 'validation_hypothesis_versions',
                  'validation_experiments', 'validation_experiment_versions', 'validation_participants',
                  'validation_evidence_observations', 'validation_evidence_classifications', 'validation_interview_plan_versions',
                  'validation_interview_sessions', 'validation_survey_plan_versions', 'validation_survey_publications',
                  'validation_survey_submissions', 'validation_survey_answers', 'validation_intelligence_runs', 'problem_feedback_events'}
    facts = {'validation_evidence_consumption_authority', 'validation_evidence_source_restrictions'}
    for table in effective['acl_contract']['revoke_effective_mutation_and_column_update']:
        require(execute(c, 'select relrowsecurity,relforcerowsecurity from pg_class where oid=%s::regclass', ('public.' + table,))
                == [(True, table in facts)], 'catalog_rls')
        for role in ('anon', 'authenticated', 'service_role', 'authenticator'):
            require(scalar(c, '''select not has_table_privilege(%s,%s,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              and not has_any_column_privilege(%s,%s,'INSERT,UPDATE,REFERENCES')''', (role, 'public.' + table, role, 'public.' + table)), 'catalog_effective_mutation')
            expected_read = (role == 'service_role' and table not in facts) or (role == 'authenticated' and table in owner_read)
            require(scalar(c, 'select has_table_privilege(%s,%s,\'SELECT\')', (role, 'public.' + table)) == expected_read, 'catalog_select_acl')
    require(execute(c, "select relrowsecurity,relforcerowsecurity from pg_class where oid='saasscout_private.b43_coordination'::regclass") == [(True, True)], 'catalog_fence_rls')
    # Existing full security preflight supplies explicit SET/USAGE/MEMBER/ADMIN
    # owner audits and rollback-only stand-in negative controls. SET ROLE back to
    # session_user=postgres is not claimed as an escalation-denial test.
    require(scalar(c, "select not pg_has_role('service_role','postgres','SET') and not pg_has_role('service_role','postgres','USAGE') and not pg_has_role('service_role','postgres','MEMBER')"), 'catalog_role_escape')
    event('check', label='effective_catalog', functions=58, triggers=67)


def security_negatives(c, n):
    probes = [
        ('dml', a.Command("update public.validation_participants set status='withdrawn' where id=%s::uuid", (uid('9', n),))),
        ('zero_row_insert', a.Command('insert into public.validation_subjects(owner_id,creation_origin,label) select %s::uuid,\'user_entered\',\'test\' where false', (a.OWNER,))),
        ('helper', a.Command('select saasscout_private.b43_enter()')),
        ('reader', a.Command('select public.validation_b43_read_current_evidence(%s::uuid)', (uid('2', n),))),
        ('advisory_helper', a.Command("select public.validation_b31_lock('participant',%s)", (uid('9', n),))),
        ('truncate', a.Command('truncate public.validation_participants cascade')),
        ('ddl', a.Command('alter function saasscout_private.b43_enter() security definer')),
    ] + [(f'row_lock_{i}', a.Command('select id from public.validation_participants where id=%s::uuid for ' + clause, (uid('9', n),)))
         for i, clause in enumerate(('update', 'no key update', 'share', 'key share'))]
    before = digest(c)
    for role in ('service_role', 'anon', 'authenticated'):
        for name, command in probes:
            execute(c, 'begin')
            execute(c, 'set local role ' + role)
            execute(c, "select set_config('saasscout.b43_entered','true',true)")
            outcome = a.sql_outcome(c, command, 'negative')
            execute(c, 'rollback')
            event('negative', label=name, role=role, sqlstate=outcome.code)
            require(outcome.code == '42501', 'security_negative_unexpected_state')
            require(digest(c) == before, 'denied_operation_changed_rows')
    execute(c, 'begin')
    execute(c, 'select saasscout_private.b43_enter()')
    denied = a.sql_outcome(c, a.Command('truncate public.validation_participants cascade'), 'negative')
    execute(c, 'rollback')
    require(denied.code == '55000' and digest(c) == before, 'trusted_truncate_not_rejected')
    # A built-in advisory lock is still callable: record its capability as an
    # UNSUPPORTED path, never falsely expect ACL changes to block arbitrary SQL.
    execute(c, 'begin')
    execute(c, 'set local role service_role')
    require(scalar(c, 'select pg_try_advisory_xact_lock(44230023)'), 'advisory_probe_contended')
    execute(c, 'rollback')
    event('exclusion', label='preentry_builtin_advisory_sql_not_certified')
    for isolation in ('READ UNCOMMITTED', 'SERIALIZABLE'):
        execute(c, 'begin isolation level ' + isolation)
        rejected = a.sql_outcome(c, a.Command('select saasscout_private.b43_enter()'), 'isolation')
        execute(c, 'rollback')
        event('negative', label='unsupported_isolation', isolation=isolation, sqlstate=rejected.code)
        require(rejected.code == '0A000' and digest(c) == before, 'unsupported_isolation_accepted')


def assert_postconditions(c, n, scenario, outcome):
    name, _, _, ledger_count, disposition, _ = scenario
    require(outcome.disposition == disposition and (outcome.code == '00000' if disposition == 'executed' else outcome.code is None), 'fresh_outcome_mismatch')
    require(scalar(c, 'select count(*) from public.validation_evidence_promotions where observation_id=%s::uuid', (uid('b', n),)) == ledger_count, 'ledger_count')
    require(scalar(c, '''select count(*) from public.validation_evidence_consumption_authority a join public.validation_evidence_promotions p on p.id=a.promotion_id
      where p.observation_id=%s::uuid and a.authority_state='withheld' ''', (uid('b', n),)) == ledger_count, 'withheld_count')
    require(scalar(c, "select count(*) from public.validation_evidence_consumption_authority where authority_state<>'withheld'") == 0, 'positive_authority')
    if name in ('withdraw_insert', 'insert_withdraw'):
        require(scalar(c, 'select count(*) from public.validation_evidence_observations where participant_id=%s::uuid', (uid('9', n),)) == 2, 'membership_count')
        require(scalar(c, '''select count(*) from public.validation_evidence_source_restrictions where purpose_id=%s and reason_code='participant_withdrawn'
          and scope_kind='participant' and scope_id=%s::uuid and owner_id=%s::uuid and contribution_observation_id is not null''', (a.PURPOSE, uid('9', n), a.OWNER)) == 2, 'membership_restrictions')
    if name in ('participant_restore', 'consent'):
        reason = 'participant_withdrawn' if name == 'participant_restore' else 'consent_metadata_changed'
        require(scalar(c, '''select count(*) from public.validation_evidence_source_restrictions where purpose_id=%s and reason_code=%s
          and scope_kind='participant' and scope_id=%s::uuid and owner_id=%s::uuid and contribution_observation_id=%s::uuid''',
                       (a.PURPOSE, reason, uid('9', n), a.OWNER, uid('b', n))) == 1, 'permanent_source_restriction')
        if name == 'participant_restore':
            require(scalar(c, 'select status from public.validation_participants where id=%s::uuid', (uid('9', n),)) == 'active', 'restore_state')
    restricted_sources = {'experiment_cancel': ('experiment_version', 'experiment_cancelled', uid('7', n)),
                          'session_relevance': ('interview_session', 'session_relevance_lost', uid('a', n)),
                          'session_cancel': ('interview_session', 'session_cancelled', uid('a', n))}
    if name in restricted_sources:
        scope, reason, identity = restricted_sources[name]
        require(scalar(c, '''select count(*) from public.validation_evidence_source_restrictions where purpose_id=%s
          and scope_kind=%s and reason_code=%s and scope_id=%s::uuid and owner_id=%s::uuid
          and contribution_observation_id is null''', (a.PURPOSE, scope, reason, identity, a.OWNER)) == 1, 'source_restriction_identity')
    if name == 'promote_classify':
        query = a.restriction_query(uid('c', n))
        require(scalar(c, query.sql, query.params) == 1, 'classification_identity')
        wrong = a.restriction_query(uid('c', n), uid('1', n))
        require(scalar(c, wrong.sql, wrong.params) == 0, 'classification_owner_negative')
        wrong = a.restriction_query(uid('e', n))
        require(scalar(c, wrong.sql, wrong.params) == 0, 'classification_predecessor_negative')
    if name in ('human_successor', 'mixed_successor'):
        require(scalar(c, 'select polarity from public.validation_evidence_promotions where observation_id=%s::uuid', (uid('b', n),))
                == ('mixed' if name == 'mixed_successor' else 'contradicting'), 'fresh_polarity')
    if name == 'duplicate':
        require(outcome.value[0][0]['duplicate'] is True, 'duplicate_finality')
    if ledger_count:
        require(scalar(c, '''select bool_and(public.validation_b42_snapshot_verified(p))
          from public.validation_evidence_promotions p where observation_id=%s::uuid''', (uid('b', n),)), 'immutable_proof')


def schedule(o, holder, waiter, isolation, n, scenario):
    name, first_kind, second_kind, _, _, scope = scenario
    stale = a.factory(o, a.Intent('promote', n)) if name == 'outer_snapshot' else None
    execute(holder, 'begin isolation level ' + isolation)
    execute(holder, 'select saasscout_private.b43_enter()')
    first = a.factory(holder, a.Intent(first_kind, n))
    require(first is not None, 'first_preparation_deferred')
    first_result = a.sql_outcome(holder, first, 'command')
    event('outcome', label='holder_command', phase=first_result.phase, sqlstate=first_result.code)
    require(first_result.code == '00000', 'first_command_failed')

    def prime(c):
        scalar(c, 'select count(*) from public.validation_evidence_observations')

    def initial():
        if stale:
            execute(waiter, 'begin isolation level ' + isolation)
            if isolation == 'REPEATABLE READ':
                prime(waiter)
            result = a.sql_outcome(waiter, stale, 'outer_statement')
            execute(waiter, 'rollback')
            return result
        return a.fresh_attempt(waiter, isolation, a.Intent(second_kind, n),
                               prime=prime if isolation == 'REPEATABLE READ' else None)

    with futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(initial)
        try:
            f3.barrier(o, waiter, holder, holder, waiter)
            event('barrier', holder_pid=holder.info.backend_pid, waiter_pid=waiter.info.backend_pid, observed_edge=True)
            committed = a.sql_outcome(holder, a.Command('commit'), 'commit')
            event('outcome', label='holder_commit', phase=committed.phase, sqlstate=committed.code)
            require(committed.code == '00000', 'holder_commit_failed')
            result = future.result(timeout=15)
            event('outcome', label='waiter_initial', phase=result.phase, sqlstate=result.code, disposition=result.disposition)
        finally:
            for c in (holder, waiter):
                if not future.done():
                    c.cancel()
            if holder.info.transaction_status != 0:
                execute(holder, 'rollback')
    must_conflict = isolation == 'REPEATABLE READ' or stale is not None
    if must_conflict:
        require(result.code == '40001', 'stale_snapshot_not_rejected')
        event('outcome', label='initial_stale_conflict', phase=result.phase, sqlstate=result.code)
        # No old Command is passed here. Entry and the factory run in each new TX.
        result = a.retry_transaction(waiter, isolation, a.Intent(second_kind, n), record=lambda number, outcome:
            event('attempt', number=number, phase=outcome.phase, sqlstate=outcome.code, disposition=outcome.disposition))
    assert_postconditions(o, n, scenario, result)
    event('schedule', label=name, isolation=isolation, scope=scope, disposition=result.disposition, sqlstate=result.code)


def rollback_and_savepoints(o, c, other, n, isolation):
    before = digest(o)
    execute(c, 'begin isolation level ' + isolation)
    execute(c, "select set_config('saasscout.b43_entered','true',true)")
    execute(c, 'savepoint entry_probe')
    execute(c, 'select saasscout_private.b43_enter()')
    execute(c, 'rollback to savepoint entry_probe')
    # Real entry was rolled back. A different writer must be able to proceed;
    # the surviving forged GUC is not authority to skip entry on the first TX.
    result = a.retry_transaction(other, 'READ COMMITTED', a.Intent('withdraw', n))
    require(result.code == '00000', 'savepoint_other_writer_failed')
    entry = a.sql_outcome(c, a.Command('select saasscout_private.b43_enter()'), 'entry')
    require(entry.code == ('40001' if isolation == 'REPEATABLE READ' else '00000'), 'savepoint_entry_conflict')
    execute(c, 'rollback')
    # Fresh preparation must defer after withdrawal; savepoint-only recovery is
    # never used by retry_transaction.
    result = a.retry_transaction(c, isolation, a.Intent('promote', n))
    require(result.disposition == 'qualification_deferred', 'savepoint_fresh_preparation')
    require(digest(o) != before, 'savepoint_writer_not_committed')


def atomic_failure(o, c, n):
    before = digest(o)
    execute(c, 'begin')
    execute(c, 'select saasscout_private.b43_enter()')
    command = a.factory(c, a.Intent('promote', n))
    require(command is not None, 'atomic_preparation')
    execute(c, '''create function saasscout_private.b43_f4_fail() returns trigger language plpgsql as $$
      begin raise exception 'synthetic capture failure' using errcode='ZX004'; end $$''')
    execute(c, '''create trigger b43_f4_fail before insert on public.validation_evidence_consumption_authority
      for each row execute function saasscout_private.b43_f4_fail()''')
    result = a.sql_outcome(c, command, 'command')
    execute(c, 'rollback')
    event('outcome', label='capture_failure', phase=result.phase, sqlstate=result.code)
    require(result.code == 'ZX004' and digest(o) == before, 'capture_atomicity')
    require(scalar(o, "select to_regprocedure('saasscout_private.b43_f4_fail()') is null"), 'failure_trigger_persisted')
    # Actual COMMIT error control, without claiming SERIALIZABLE support.
    execute(c, 'begin')
    execute(c, 'select saasscout_private.b43_enter()')
    execute(c, 'create temp table b43_f4_commit_failure(k int unique deferrable initially deferred) on commit drop')
    execute(c, 'insert into b43_f4_commit_failure values(1),(1)')
    require(a.sql_outcome(c, a.factory(c, a.Intent('withdraw', n)), 'command').code == '00000', 'commit_control_mutation')
    result = a.sql_outcome(c, a.Command('commit'), 'commit')
    execute(c, 'rollback')
    event('outcome', label='commit_failure', phase=result.phase, sqlstate=result.code)
    require(result.code == '23505' and result.phase == 'commit' and digest(o) == before, 'commit_atomicity')
    event('check', label='capture_and_commit_atomic_rollback', passed=True)


def rpc_probes(o, n):
    f3.preflight()  # Reverify generated project/network/loopback/cluster identity.
    execute(o, 'begin')
    execute(o, 'select saasscout_private.b43_enter()')
    execute(o, 'insert into public.scan(id,user_id) values(%s::uuid,%s::uuid)', (uid('e', n), a.OWNER))
    execute(o, 'commit')
    status_result = subprocess.run(['supabase', '--workdir', os.environ['VALIDATION_B43_PROJECT_DIR'], 'status', '-o', 'json'],
                                   check=True, capture_output=True, text=True, timeout=25)
    status = json.loads(status_result.stdout)
    require(status.get('API_URL') == 'http://127.0.0.1:55431' and status.get('DB_URL') == f3.DB, 'rpc_destination')
    data = {'status': status, 'fixture': {'owner': a.OWNER, 'subject': uid('3', n), 'experiment': uid('6', n),
            'observation': uid('b', n), 'canonical': uid('2', n), 'upstream': uid('e', n), 'number': n}}
    child = subprocess.run(['node', 'scripts/validation-b43-f4-rpc.ts'], input=json.dumps(data), capture_output=True,
                           text=True, timeout=120, env={**os.environ, 'F4_RUN_RPC_PROBES': 'true'})
    decoded = json.loads(child.stdout)
    protocol = decoded.pop('protocol')
    require(isinstance(protocol, list) and len(protocol) <= 100 and all(isinstance(value, str) and (
      re.fullmatch(r'http:(?:[0-9]{1,3}|unknown);(?:sqlstate:[A-Z0-9]{5}|postgrest:PGRST[0-9]{3}|protocol_error)', value)
      or value == 'transport_exception') for value in protocol), 'typed_rpc_diagnostics')
    for value in protocol:
        event('rpc_protocol', diagnostic=value)
    require(child.returncode == 0, 'typed_rpc_failed')
    expected = {'typed_rpc_decoding': True, 'owner_boundaries': True, 'browser_denials': True,
                'reader_denials': True, 'rls_owner_reads': True, 'expected_batch_failure': '23502'}
    require(decoded == expected, 'typed_rpc_protocol')
    require(scalar(o, 'select count(*) from public.problem_observations where observation_fingerprint=%s', (f'f4-rollback-{n}',)) == 0, 'rpc_batch_not_atomic')
    event('check', label='typed_rpc_decoding_and_denials', passed=True)


def historical_integrity(c, n):
    promoted = a.retry_transaction(c, 'READ COMMITTED', a.Intent('promote', n))
    require(promoted.code == '00000', 'history_promotion_failed')
    ledger, shared = execute(c, 'select id,problem_observation_id from public.validation_evidence_promotions where observation_id=%s::uuid', (uid('b', n),))[0]
    identities = [('validation_evidence_promotions', 'id', ledger),
                  ('validation_qualified_evidence_snapshots', 'promotion_id', ledger),
                  ('validation_evidence_consumption_authority', 'id', scalar(c, 'select id from public.validation_evidence_consumption_authority where promotion_id=%s::uuid', (ledger,))),
                  ('problem_observations', 'id', shared)]
    def proofs():
        return tuple(scalar(c, f'select md5(to_jsonb(t)::text) from public.{table} t where {key}=%s::uuid', (identity,)) for table, key, identity in identities)
    before = proofs()
    all_before = digest(c)
    execute(c, 'begin')
    execute(c, 'select saasscout_private.b43_enter()')
    correction = a.factory(c, a.Intent('promote', n))
    require(correction is not None, 'finality_preparation')
    changed = list(correction.params)
    changed[6] = ('1' if changed[6][0] == '0' else '0') + changed[6][1:]
    finality = a.sql_outcome(c, a.Command(correction.sql, tuple(changed)), 'finality')
    execute(c, 'rollback')
    event('negative', label='finality_correction', phase=finality.phase, sqlstate=finality.code)
    require(finality.code == 'P0001' and digest(c) == all_before, 'finality_correction_accepted')
    for kind in ('classify_ai', 'withdraw'):
        require(a.retry_transaction(c, 'READ COMMITTED', a.Intent(kind, n)).code == '00000', 'history_restriction_failed')
    require(proofs() == before, 'history_proofs_rewritten')
    query = a.restriction_query(uid('c', n))
    require(scalar(c, query.sql, query.params) == 1, 'history_classification_identity')
    restriction = scalar(c, "select id from public.validation_evidence_source_restrictions where scope_kind='classification' and scope_id=%s::uuid and owner_id=%s::uuid", (uid('c', n), a.OWNER))
    for table, key, identity in identities + [('validation_evidence_source_restrictions', 'id', restriction)]:
        complete_before = digest(c)
        execute(c, 'begin')
        execute(c, 'select saasscout_private.b43_enter()')
        result = a.sql_outcome(c, a.Command(f'update public.{table} set {key}={key} where {key}=%s::uuid', (identity,)), 'immutable')
        execute(c, 'rollback')
        event('negative', label='trusted_immutable_' + table, phase=result.phase, sqlstate=result.code)
        require(result.code == '55000' and digest(c) == complete_before, 'trusted_immutable_write_accepted')
    require(proofs() == before, 'history_proofs_rewritten')
    require(scalar(c, 'select public.validation_b42_snapshot_verified(p) from public.validation_evidence_promotions p where id=%s::uuid', (ledger,)), 'history_snapshot_verification')
    event('check', label='historical_proofs_and_permanent_restrictions', passed=True)


def main():
    global CASE, STAGE, SHA
    SHA = ''
    SHA = require_runtime()  # Reject before subprocess, driver import or connection.
    artifact_path()
    subprocess.run([sys.executable, str(f3.AUTH_PATH)], check=True, timeout=30,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # Live Draft/ref/SHA gate.
    STAGE = 'security_preflight'
    f3.security_preflight()  # Requires freshly empty application tables.
    STAGE = 'catalog'
    observer = f3.connect('f4_observer')
    catalog(observer)
    n = 200
    STAGE = 'schedules'
    for isolation in f3.ISOLATIONS:
        for scenario in SCENARIOS:
            n += 1
            CASE = isolation + ':' + scenario[0]
            apply_fixture(observer, n)
            holder, waiter = f3.connect('f4_holder'), f3.connect('f4_waiter')
            try:
                schedule(observer, holder, waiter, isolation, n, scenario)
            finally:
                holder.close()
                waiter.close()
        n += 1
        apply_fixture(observer, n)
        holder, waiter = f3.connect('f4_savepoint'), f3.connect('f4_other')
        try:
            CASE = isolation + ':savepoint'
            rollback_and_savepoints(observer, holder, waiter, n, isolation)
        finally:
            holder.close()
            waiter.close()
    n += 1
    apply_fixture(observer, n)
    CASE = 'negative_controls'
    STAGE = 'negative_controls'
    security_negatives(observer, n)
    atomic_failure(observer, observer, n)
    historical_integrity(observer, n)
    STAGE = 'typed_rpc'
    rpc_probes(observer, n)
    STAGE = 'final_catalog'
    catalog(observer)
    return 0


if __name__ == '__main__':
    result = 1
    try:
        result = main()
    except Exception as error:
        event('failure', label=failure_label(error), stage=STAGE)  # Fixed allowlist only.
    finally:
        for connection in f3.CONNECTIONS:
            try:
                connection.close()
            except Exception:
                result = 1
        try:
            artifact_path().write_text(json.dumps({'schema': 1, 'source_sha': SHA,
                'success': result == 0, 'deadlock_freedom_proven': False, 'events': EVENTS}, indent=2))
        except Exception:
            result = 1
    sys.exit(result)
