#!/usr/bin/env python3
"""F3 diagnostic: run only after the verified disposable preflight."""
import concurrent.futures as futures
from contextlib import contextmanager
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import threading

# The reviewed dispatch revision includes this test-only patch. The inspected
# parent was 08302eb99ed76b0682975b1442381885ba641314; never hard-code it as
# a future runnable HEAD, which would reject the very patch adding this harness.
SHA = ''
AUTH_PATH = Path(__file__).with_name('validation-b43-f3-authorize.py')
DB = 'postgresql://postgres:postgres@127.0.0.1:55432/postgres'
OWNER = '10000000-0000-0000-0000-000000000001'
CANONICAL = '20000000-0000-0000-0000-000000000001'
EXPERIMENT = '70000000-0000-0000-0000-000000000001'
EVENTS = []
CONNECTIONS = []
EVENT_LOCK = threading.Lock()
CASE = 'setup'
SETUP_STAGES = frozenset({
    'runtime_authorization', 'artifact_validation', 'security_preflight',
    'observer_connection_identity', 'migration_chain', 'fixture_database_empty',
    'fixture_generation', 'fixture_application',
})

TITLE = 'Slow reports'
NORMALIZED = 'slow reports'
ISOLATIONS = ('READ COMMITTED', 'REPEATABLE READ')
VARIANTS = ('participant', 'consent', 'session', 'session_cancel', 'experiment', 'cross_command',
            'rpc_restore', 'withdraw_insert', 'insert_withdraw', 'promote_classify', 'classify_promote', 'withdraw_promote')


class DiagnosticFailure(RuntimeError):
    pass


class SetupFailure(DiagnosticFailure):
    pass


@contextmanager
def setup_stage(stage):
    try:
        yield
    except Exception:
        # Carry only a fixed stage through the actual top-level failure handler.
        raise SetupFailure(stage) from None


def setup_failure_category(error):
    stage = error.args[0] if isinstance(error, SetupFailure) and len(error.args) == 1 else None
    return ('setup_' + stage + '_failed'
            if isinstance(stage, str) and stage in SETUP_STAGES
            else 'preflight_or_setup_failed')


def check(ok, label):
    if not ok:
        raise DiagnosticFailure(label)


def artifact_path():
    root = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    path = Path(os.environ['F3_ARTIFACT'])
    check(path == root / 'b43-f3-diagnostic.json' and not path.is_symlink(), 'artifact_path')
    return path


def emit(kind, **values):
    with EVENT_LOCK:
        EVENTS.append({'kind': kind, 'case': CASE, **values})
        if os.environ.get('F3_ARTIFACT'):
            target = artifact_path()
            partial = target.with_suffix('.tmp')
            partial.write_text(json.dumps({'schema': 1, 'source_sha': SHA, 'success': False,
                'incomplete': True, 'deadlock_freedom_proven': False, 'events': EVENTS}))
            partial.replace(target)


def uid(prefix, n):
    return f'{prefix}0000000-0000-0000-0000-{n:012d}'


def lock(domain, value):
    return f"select public.validation_b31_lock('{domain}','{value}')"


def status(n, before='active', after='withdrawn'):
    return f"select public.validation_update_participant_status('{OWNER}','{uid('9', n)}','{before}','{after}')"


def relevance(n):
    return f"select public.validation_update_interview_relevance('{OWNER}','{uid('a', n)}','target_segment_match','adjacent_segment')"


def insert(n):
    return f"""insert into public.validation_evidence_observations
    select (jsonb_populate_record(null::public.validation_evidence_observations,
    to_jsonb(o)||jsonb_build_object('id','{uid('d', n)}','ingestion_key','b43-f3-{n}'))).*
    from public.validation_evidence_observations o where o.id='{uid('b', n)}'"""


def classify(n):
    return f"""select public.validation_insert_classification('{OWNER}','{uid('b', n)}',
    'inconclusive','ai_model_suggested','suggested',null,'{uid('c', n)}')"""


def promote(n):
    payload = dict(canonicalProblemId=CANONICAL, classificationId=uid('c', n),
                   observationId=uid('b', n), polarity='supporting',
                   policyVersion='v8-b1.2', projectionVersion='v8-b3.1-projection.1',
                   resolverVersion='v8-b3.0.2-exact.1')
    fp = hashlib.sha256(json.dumps(payload, separators=(',', ':')).encode()).hexdigest()
    return f"""select public.validation_promote_customer_interview_evidence(
    '{OWNER}','{uid('b', n)}','{uid('c', n)}','{CANONICAL}','supporting',
    'participant:{uid('9', n)}|{CANONICAL}|supporting','{fp}',
    public.validation_b31_representative_state('{OWNER}','{uid('9', n)}'),
    public.validation_b31_authority_snapshot('{uid('3', 1)}','{uid('5', 1)}'),
    '{TITLE}','{NORMALIZED}','v8-b1.2','v8-b3.0.2-exact.1','v8-b3.1-projection.1')"""


def execute(c, sql):
    with c.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall() if cur.description else []


def scalar(c, sql):
    return execute(c, sql)[0][0]


def require_runtime():
    spec = importlib.util.spec_from_file_location('f3_authorization', AUTH_PATH)
    auth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(auth)
    expected = auth.context(os.environ)
    auth.local_revision(expected)
    check(os.environ.get('VALIDATION_B43_DISPOSABLE') == '1', 'opt_in')
    check(os.environ.get('VALIDATION_B43_DATABASE_URL') == DB, 'destination')
    check(os.environ.get('F3_SOURCE_SHA') == expected, 'source_sha')
    check(re.fullmatch('[0-9]+', os.environ.get('F3_CLUSTER_ID', '')), 'cluster_required')
    return expected


def preflight():
    require_runtime()
    subprocess.run(['node', 'scripts/validation-b43-db.ts', '--preflight-only'],
                   check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def security_preflight():
    require_runtime()

    result = subprocess.run(
        ['node', 'scripts/validation-b43-db.ts', '--security-preflight-only'],
        capture_output=True,
        text=True,
        timeout=240
    )

    expected_output = (
        'PASS B4.3 service_role, anon and authenticated RPC execution denials\n'
        'PASS B4.3 full disposable security preflight\n'
    )

    check(
        result.returncode == 0 and result.stdout == expected_output,
        'full_security_preflight_not_complete'
    )


def connect(label, isolation=None):
    require_runtime()
    import psycopg
    c = psycopg.connect(DB, hostaddr='127.0.0.1', sslmode='disable',
        autocommit=True, connect_timeout=3,
        application_name='b43_f3_' + label,
        options='-c statement_timeout=12000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000')
    CONNECTIONS.append(c)
    row = execute(c, "select session_user,current_user,current_database(),inet_server_port(),(select system_identifier::text from pg_control_system())")[0]
    check(row == ('postgres', 'postgres', 'postgres', 5432, os.environ['F3_CLUSTER_ID']), 'session_identity')
    check(int(scalar(c, 'show server_version_num')) // 10000 == 17, 'postgres_major')
    emit('session', label=label, pid=c.info.backend_pid)
    if isolation:
        check(isolation in ('READ COMMITTED', 'REPEATABLE READ'), 'isolation')
        execute(c, 'begin isolation level ' + isolation)
    return c


def attempt(c, sql, label):
    import psycopg
    try:
        execute(c, sql)
        code = '00000'
    except psycopg.Error as error:
        code = error.sqlstate
        check(isinstance(code, str) and re.fullmatch('[A-Z0-9]{5}', code), 'sqlstate_missing')
    emit('outcome', label=label, pid=c.info.backend_pid, sqlstate=code)
    return code


def snapshot(o, a, b):
    pids = ','.join(str(c.info.backend_pid) for c in (a, b))
    activity = execute(o, f"select pid,pg_blocking_pids(pid),wait_event_type,wait_event from pg_stat_activity where pid=any(ARRAY[{pids}]) order by pid")
    locks = execute(o, f"select pid,locktype,mode,granted from pg_locks where pid=any(ARRAY[{pids}]) and locktype in ('advisory','transactionid','tuple') order by pid,locktype,mode,granted")
    types = {None, 'Lock', 'Client', 'Timeout', 'Activity', 'IO', 'LWLock', 'IPC', 'BufferPin', 'Extension'}
    events = {None, 'advisory', 'transactionid', 'tuple', 'ClientRead', 'ClientWrite'}
    modes = {'ExclusiveLock', 'ShareLock', 'RowExclusiveLock', 'AccessShareLock', 'RowShareLock', 'AccessExclusiveLock', 'ShareRowExclusiveLock', 'ShareUpdateExclusiveLock'}
    safe = [{'pid': p, 'blocking_pids': blocks, 'wait_type': t if t in types else 'other', 'wait_event': e if e in events else 'other'} for p, blocks, t, e in activity]
    check(all(isinstance(r['pid'], int) and all(isinstance(p, int) for p in r['blocking_pids']) for r in safe), 'snapshot_pid')
    emit('snapshot', activity=safe, locks=[{'pid': p, 'type': t, 'mode': m if m in modes else 'other', 'granted': bool(g)} for p, t, m, g in locks])
    return {r['pid']: r['blocking_pids'] for r in safe}


def barrier(o, waiter, holder, a, b):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if holder.info.backend_pid in snapshot(o, a, b).get(waiter.info.backend_pid, []):
            return
        time.sleep(.03)  # Poll interval; progress depends on observed lock edge.
    raise DiagnosticFailure('blocking_barrier_not_observed')


TABLES = ('validation_participants', 'validation_interview_sessions',
          'validation_experiment_versions', 'validation_evidence_observations',
          'validation_evidence_classifications', 'validation_customer_interview_shareable_evidence',
          'validation_evidence_promotions', 'problem_observations',
          'validation_qualified_evidence_snapshots', 'validation_evidence_consumption_authority',
          'validation_evidence_source_restrictions')


def digest(o):
    # Never exported. Proves full persisted-row rollback, without reconstructing proofs.
    return [scalar(o, f"select md5(coalesce(string_agg(j::text,'' order by j::text),'')) from (select to_jsonb(t) j from public.{t} t) x") for t in TABLES]


def cycle(o, pool, a, b, n, variant):
    before = digest(o)
    iso = scalar(a, 'show transaction_isolation').upper()
    if variant in ('participant', 'consent'):
        pre = lock('participant', uid('9', n))
        mutation = "status='withdrawn'" if variant == 'participant' else "consent_purpose='F3 synthetic'"
        bsql = f"update public.validation_participants set {mutation} where id='{uid('9', n)}'"
        asql = status(n)
    elif variant == 'session_cancel':
        pre = lock('experiment', EXPERIMENT)
        bsql = f"update public.validation_interview_sessions set status='cancelled',cancelled_at=now() where id='{uid('a', n)}'"
        asql = f"select public.validation_update_interview_session('{OWNER}','{uid('a', n)}','in_progress','cancelled',null)"
    elif variant == 'session':
        pre = lock('experiment', EXPERIMENT)
        bsql = f"update public.validation_interview_sessions set participant_relevance='adjacent_segment' where id='{uid('a', n)}'"
        asql = relevance(n)
    elif variant == 'experiment':
        pre = lock('experiment', EXPERIMENT)
        bsql = f"update public.validation_experiment_versions set lifecycle='cancelled',cancelled_at=now() where id='{EXPERIMENT}'"
        asql = f"select public.validation_transition_experiment_version('{OWNER}','{EXPERIMENT}','running','paused')"
    else:
        pre = status(n)
        bsql = lock('experiment', EXPERIMENT) + ';' + status(n)
        asql = relevance(n)
    execute(a, pre)
    fb = pool.submit(attempt, b, bsql, 'B_command')
    barrier(o, b, a, a, b)
    fa = pool.submit(attempt, a, asql, 'A_command')
    deadline = time.monotonic() + 14
    both_edges = False
    while not (fa.done() or fb.done()) and time.monotonic() < deadline:
        graph = snapshot(o, a, b)
        both_edges |= b.info.backend_pid in graph.get(a.info.backend_pid, []) and a.info.backend_pid in graph.get(b.info.backend_pid, [])
        time.sleep(.02)
    check(fa.done() or fb.done(), 'cycle_completion_timeout')
    first, other, cfirst, cother = (fa, fb, a, b) if fa.done() else (fb, fa, b, a)
    code = first.result()
    execute(cfirst, 'rollback')
    other_code = other.result(timeout=14)
    execute(cother, 'rollback')
    check(digest(o) == before, 'victim_survivor_rollback_changed_rows')
    emit('check', label='rollback_complete', passed=True, both_edges_observed=both_edges)
    check('40P01' in (code, other_code), 'cycle_not_reproduced')
    check(set((code, other_code)) <= {'00000', '40P01'}, 'cycle_unexpected_sqlstate')
    # Retry entire intended A transaction, including its first command. Roll back
    # after assertions so subsequent schedules start from the same baseline.
    for _ in range(3):
        execute(a, 'begin isolation level ' + iso)
        retry_code = attempt(a, pre + ';' + asql, 'whole_A_transaction_retry')
        if retry_code == '00000':
            break
        execute(a, 'rollback')
        check(retry_code in ('40P01', '40001'), 'retry_nonretryable_state')
    check(retry_code == '00000', 'retry_exhausted')
    if variant in ('participant', 'consent', 'cross_command'):
        check(scalar(a, f"select count(*)=1 from public.validation_evidence_source_restrictions where scope_id='{uid('9', n)}' and reason_code='participant_withdrawn'"), 'retry_exactly_once')
    execute(a, 'rollback')
    check(digest(o) == before, 'retry_rollback_changed_rows')
    execute(b, 'begin isolation level ' + iso)
    check(attempt(b, bsql, 'whole_B_transaction_retry') == '00000', 'B_retry_failed')
    execute(b, 'rollback')
    check(digest(o) == before, 'B_retry_rollback_changed_rows')


def race(o, pool, a, b, iso, n, variant):
    if iso == 'REPEATABLE READ':
        execute(b, f"select count(*) from public.validation_evidence_observations where participant_id='{uid('9', n)}'")
    if variant == 'rpc_restore':
        first, second, key = status(n), status(n, 'withdrawn', 'active'), lock('participant', uid('9', n))
    elif variant == 'withdraw_insert':
        first, second, key = status(n), insert(n), lock('participant', uid('9', n))
    elif variant == 'insert_withdraw':
        first, second, key = insert(n), status(n), lock('participant', uid('9', n))
    elif variant == 'promote_classify':
        first, second, key = promote(n), classify(n), lock('experiment', EXPERIMENT)
    elif variant == 'classify_promote':
        first, second, key = classify(n), promote(n), lock('experiment', EXPERIMENT)
    else:
        first, second, key = status(n), promote(n), lock('participant', uid('9', n))
    check(attempt(a, first, 'race_first') == '00000', 'race_first_failed')
    fb = pool.submit(attempt, b, second, 'race_second')
    barrier(o, b, a, a, b)
    check(attempt(a, 'commit', 'race_first_commit') == '00000', 'race_first_commit_failed')
    code = fb.result(timeout=14)
    if code == '00000':
        code = attempt(b, 'commit', 'race_second_commit')
    if code != '00000':
        execute(b, 'rollback')
        check(code in ('40001', '23514'), 'race_unexpected_sqlstate')
        if code == '40001':
            # Whole transaction retry: begin, coordinate, recompute fresh RPC args.
            for _ in range(3):
                execute(b, 'begin isolation level ' + iso)
                code = attempt(b, second, 'race_whole_transaction_retry')
                if code == '00000':
                    code = attempt(b, 'commit', 'race_retry_commit')
                    if code == '00000':
                        break
                    execute(b, 'rollback')
                execute(b, 'rollback')
                if code == '23514':
                    break
                check(code == '40001', 'race_retry_state')
            check(code != '40001' or variant == 'classify_promote', 'race_retry_exhausted')
    if variant == 'rpc_restore':
        check(code == '00000', 'restore_failed')
        check(scalar(o, f"select status='active' from public.validation_participants where id='{uid('9', n)}'"), 'restore_state')
        check(scalar(o, f"select count(*)=1 from public.validation_evidence_source_restrictions where scope_id='{uid('9', n)}' and reason_code='participant_withdrawn'"), 'restore_permanent_fact')
    elif variant in ('withdraw_insert', 'insert_withdraw'):
        check(code == '00000', 'membership_did_not_complete')
        check(scalar(o, f"select count(*)=2 from public.validation_evidence_observations where participant_id='{uid('9', n)}'"), 'membership_count')
        check(scalar(o, f"select count(*)=2 from public.validation_evidence_source_restrictions where scope_id='{uid('9', n)}' and reason_code='participant_withdrawn'"), 'membership_restriction_incomplete')
    else:
        # RR can expose stale classification/source checks. A success after a
        # prior committed supersession/withdrawal is flagged, not normalized.
        if variant in ('classify_promote', 'withdraw_promote'):
            check(code == ('40001' if variant == 'classify_promote' else '23514'), 'promotion_accepted_stale_source')
        count = scalar(o, f"select count(*) from public.validation_evidence_promotions where observation_id='{uid('b', n)}'")
        check(count == (1 if variant == 'promote_classify' else 0), 'promotion_ledger_count')
        check(scalar(o, f"select count(*) from public.validation_evidence_consumption_authority a join public.validation_evidence_promotions p on p.id=a.promotion_id where p.observation_id='{uid('b', n)}' and a.authority_state='withheld'") == count, 'promotion_authority_count')
        if variant == 'promote_classify':
            check(scalar(o, f"select count(*)=1 from public.validation_evidence_source_restrictions where contribution_observation_id='{uid('b', n)}' and reason_code='classification_superseded'"), 'classification_capture')
        if variant == 'promote_classify':
            check(attempt(o, f"select public.validation_b43_read_current_evidence('{CANONICAL}')", 'reader_after_supersession') == 'P0001', 'reader_supersession_not_fail_closed')
        else:
            check(scalar(o, f"select public.validation_b43_read_current_evidence('{CANONICAL}')") == {'complete': True, 'observations': []}, 'current_reader_not_complete_empty')
    emit('check', label='race_postconditions', passed=True)


def main():
    global CASE, CANONICAL, TITLE, NORMALIZED, SHA
    CASE = 'setup'
    SHA = ''
    with setup_stage('runtime_authorization'):
        SHA = require_runtime()
    with setup_stage('artifact_validation'):
        artifact_path()
    with setup_stage('security_preflight'):
        security_preflight()
    with setup_stage('observer_connection_identity'):
        o = connect('observer')
    with setup_stage('migration_chain'):
        versions = sorted(p.name[:14] for p in Path('supabase/migrations').glob('*.sql'))
        check([r[0] for r in execute(o, 'select version::text from supabase_migrations.schema_migrations order by version')] == versions, 'migration_chain')
    with setup_stage('fixture_database_empty'):
        for t in TABLES + ('canonical_problems','validation_subjects','validation_hypotheses','validation_hypothesis_versions','validation_experiments','validation_interview_plan_versions'):
            check(scalar(o, f'select count(*) from public.{t}') == 0, 'nonempty_fixture_database')
        check(scalar(o, 'select count(*) from auth.users') == 0, 'nonempty_auth_database')
    with setup_stage('fixture_generation'):
        fixture = subprocess.run(['node', '--input-type=module', '-e',
            "import {readFileSync} from 'node:fs'; import {buildB43Fixture} from './scripts/validation-b43-harness.ts'; process.stdout.write(buildB43Fixture(readFileSync('tests/sql/validation-b31.sql','utf8')));"],
            check=True, capture_output=True, timeout=15).stdout.decode()
    with setup_stage('fixture_application'):
        check(attempt(o, 'begin;' + fixture + '\ncommit;', 'fixture_setup') == '00000', 'fixture_setup_failed')
    failures, n = 0, 20
    for iso in ISOLATIONS:
        for variant in VARIANTS:
            n += 1
            CASE = iso + ':' + variant
            start = len(CONNECTIONS)
            try:
                preflight()
                CANONICAL = uid('2', n)
                TITLE, NORMALIZED = f'F3 reports {n}', f'f3 reports {n}'
                execute(o, f"insert into public.canonical_problems(id,canonical_key,canonical_title,normalized_title,status) values('{CANONICAL}','f3-reports-{n}','{TITLE}','{NORMALIZED}','active')")
                check(scalar(o, f"select public.validation_b43_read_current_evidence('{CANONICAL}')") == {'complete': True, 'observations': []}, 'positive_reader_baseline')
                a, b = connect('A', iso), connect('B', iso)
                with futures.ThreadPoolExecutor(max_workers=2) as pool:
                    try:
                        if variant in ('participant', 'consent', 'session', 'session_cancel', 'experiment', 'cross_command'):
                            cycle(o, pool, a, b, n, variant)
                        else:
                            race(o, pool, a, b, iso, n, variant)
                    finally:
                        for c in (a, b):
                            if not c.closed:
                                c.cancel()
                                c.close()
            except DiagnosticFailure as error:
                failures += 1
                emit('failure', category=error.args[0])
            except Exception:
                failures += 1
                emit('failure', category='schedule_failed')
            finally:
                for c in CONNECTIONS[start:]:
                    if not c.closed:
                        c.close()
    return 1 if failures else 0


if __name__ == '__main__':
    result = 1
    try:
        result = main()
    except Exception as error:
        try:
            emit('failure', category=setup_failure_category(error)
                 if isinstance(error, SetupFailure) or CASE == 'setup' else 'schedule_failed')
        except Exception:
            pass  # Never expose the original exception through a logging failure.
    finally:
        for c in CONNECTIONS:
            try:
                if not c.closed:
                    c.close()
            except Exception:
                result = 1
        try:
            artifact_path().write_text(json.dumps({
                'schema': 1, 'source_sha': SHA, 'attempted': True, 'success': result == 0,
                'deadlock_freedom_proven': False, 'events': EVENTS}, indent=2))
        except Exception:
            result = 1
    sys.exit(result)
