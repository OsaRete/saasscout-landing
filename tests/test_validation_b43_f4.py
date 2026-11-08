"""Offline factories, protocol controls and static review; no SQL execution."""
import ast
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
NODE_PATH = os.environ.get('PATH', '')


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


f4 = load('validation-b43-f4')
a = f4.a
auth = load('validation-b43-f3-authorize')


class DriverFailure(Exception):
    def __init__(self, code):
        self.sqlstate = code
        super().__init__('PRIVATE_SENTINEL')


class FakeConnection:
    def __init__(self, failures=()):
        self.info = SimpleNamespace(transaction_status=0)
        self.commands = []
        self.failures = list(failures)
        self.epoch = 0

    def execute(self, c, sql, params=()):
        self.commands.append((sql, params))
        if sql.startswith('begin'):
            assert self.info.transaction_status == 0
            self.info.transaction_status = 2
        if self.failures and self.failures[0][0] == sql:
            _, code = self.failures.pop(0)
            self.info.transaction_status = 3
            self.epoch += 1
            raise DriverFailure(code)
        if sql in ('rollback', 'commit'):
            self.info.transaction_status = 0
        return [({'duplicate': False},)]


class F4OfflineTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        f4.EVENTS.clear()

    def test_missing_authorization_cannot_reach_subprocess_or_connection(self):
        with patch.object(f4.subprocess, 'run') as child, patch.object(f4.f3, 'connect') as connect:
            with self.assertRaises(a.ContractFailure):
                f4.main()
            child.assert_not_called()
            connect.assert_not_called()

    def test_parameterless_batches_and_bound_commands_use_distinct_driver_calls(self):
        cursor = Mock(description=None)
        context = Mock()
        context.__enter__ = Mock(return_value=cursor)
        context.__exit__ = Mock(return_value=False)
        connection = Mock()
        connection.cursor.return_value = context
        self.assertEqual(a.execute(connection, 'select 1; select 2;'), [])
        cursor.execute.assert_called_once_with('select 1; select 2;')
        cursor.execute.reset_mock()
        self.assertEqual(a.execute(connection, 'select %s::text', ('bound-value',)), [])
        cursor.execute.assert_called_once_with('select %s::text', ('bound-value',))

    def test_failure_labels_never_export_raw_exception_messages(self):
        self.assertEqual(f4.failure_label(a.ContractFailure('ledger_count')), 'ledger_count')
        for error in (a.ContractFailure('PRIVATE_SENTINEL'), RuntimeError('PRIVATE_SENTINEL'), a.ContractFailure(['PRIVATE_SENTINEL'])):
            self.assertEqual(f4.failure_label(error), 'f4_validation_failed')

    def test_untracked_source_is_an_authorization_failure(self):
        outputs = [SimpleNamespace(stdout='a' * 40 + '\n'), SimpleNamespace(stdout=''),
                   SimpleNamespace(stdout='?? supabase/migrations/unreviewed.sql\n')]
        with patch.object(auth.subprocess, 'run', side_effect=outputs) as run:
            with self.assertRaises(ValueError):
                auth.local_revision('a' * 40)
            self.assertEqual(run.call_args.args[0], ['git', 'status', '--porcelain', '--untracked-files=all'])

    def test_original_24_schedule_identities_are_retained_from_reviewed_sha(self):
        # Read-only local git object: no fetch, workflow or network.
        original = subprocess.run(['git', 'show', f'{f4.BASELINE}:scripts/validation-b43-f3.py'],
                                  check=True, capture_output=True, text=True, cwd=ROOT).stdout
        constants = {}
        for node in ast.parse(original).body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('ISOLATIONS', 'VARIANTS') for t in node.targets):
                constants[node.targets[0].id] = ast.literal_eval(node.value)
        expected = tuple((i, v) for i in constants['ISOLATIONS'] for v in constants['VARIANTS'])
        self.assertEqual(f4.HISTORICAL, expected)
        self.assertEqual(len(f4.HISTORICAL), 24)
        self.assertEqual(len(f4.SCENARIOS) * 2, 38)
        with patch.object(f4.f3, 'scalar', return_value=False):
            with self.assertRaises(f4.f3.DiagnosticFailure):
                f4.f3.require_legacy_schema(None)

    def test_classification_identity_negative_controls(self):
        predecessor = a.uid('c', 201)
        good = dict(purpose_id=a.PURPOSE, reason_code='classification_superseded', scope_kind='classification',
                    scope_id=predecessor, owner_id=a.OWNER, contribution_observation_id=None)
        self.assertTrue(a.restriction_matches(good, predecessor))
        for key, value in [('purpose_id', 'other'), ('reason_code', 'participant_withdrawn'), ('scope_kind', 'observation'),
                           ('scope_id', a.uid('b', 201)), ('owner_id', a.uid('1', 201)), ('contribution_observation_id', a.uid('b', 201))]:
            with self.subTest(key=key):
                self.assertFalse(a.restriction_matches({**good, key: value}, predecessor))
        incomplete = good.copy(); incomplete.pop('contribution_observation_id')
        self.assertFalse(a.restriction_matches(incomplete, predecessor))
        query = a.restriction_query(predecessor)
        self.assertIn('contribution_observation_id is null', query.sql)
        self.assertEqual(query.params, (a.PURPOSE, 'classification_superseded', 'classification', predecessor, a.OWNER))
        current = (ROOT / 'scripts/validation-b43-f3.py').read_text()
        self.assertIn("scope_id='{uid('c', n)}' and owner_id='{OWNER}' and contribution_observation_id is null", current)

    def test_retry_restarts_transaction_entry_and_factory_after_write_conflict(self):
        c = FakeConnection([('select fixture_rpc(%s)', '40001')])
        calls = []
        def factory(connection, intent):
            calls.append(connection.epoch)
            return a.Command('select fixture_rpc(%s)', (connection.epoch,))
        with patch.object(a, 'execute', side_effect=c.execute), patch.object(a, 'factory', side_effect=factory):
            result = a.retry_transaction(c, 'REPEATABLE READ', a.Intent('promote', 201))
        self.assertEqual(result.code, '00000')
        self.assertEqual(calls, [0, 1])
        self.assertEqual([s for s, _ in c.commands], ['begin isolation level REPEATABLE READ', 'select saasscout_private.b43_enter()',
            'select fixture_rpc(%s)', 'rollback', 'begin isolation level REPEATABLE READ', 'select saasscout_private.b43_enter()', 'select fixture_rpc(%s)', 'commit'])
        self.assertEqual([p for s, p in c.commands if s == 'select fixture_rpc(%s)'], [(0,), (1,)])

    def test_commit_failure_is_not_mislabeled_as_success_or_replayed_in_savepoint(self):
        c = FakeConnection([('commit', '40001')]); records = []
        with patch.object(a, 'execute', side_effect=c.execute), patch.object(a, 'factory', side_effect=lambda c, i: a.Command('select fixture_rpc(%s)', (c.epoch,))) as factory:
            result = a.retry_transaction(c, 'READ COMMITTED', a.Intent('promote', 201), record=lambda n, o: records.append((n, o.phase, o.code)))
        self.assertEqual(result.code, '00000')
        self.assertEqual(records[0], (1, 'commit', '40001'))
        self.assertEqual(factory.call_count, 2)
        self.assertFalse(any('savepoint' in s for s, _ in c.commands))

    def test_nonretryable_and_exhausted_failures_remain_failures(self):
        for code in ('23514', '42501'):
            c = FakeConnection([('select fixture_rpc(%s)', code)])
            with patch.object(a, 'execute', side_effect=c.execute), patch.object(a, 'factory', return_value=a.Command('select fixture_rpc(%s)')) as factory:
                self.assertEqual(a.retry_transaction(c, 'READ COMMITTED', a.Intent('promote', 201)).code, code)
                self.assertEqual(factory.call_count, 1)
        c = FakeConnection([('select saasscout_private.b43_enter()', '40001')] * 3)
        with patch.object(a, 'execute', side_effect=c.execute), patch.object(a, 'factory') as factory:
            with self.assertRaisesRegex(a.ContractFailure, 'retry_exhausted'):
                a.retry_transaction(c, 'REPEATABLE READ', a.Intent('promote', 201))
            factory.assert_not_called()  # Failed entry never reads source authority.

    def test_existing_transaction_prepared_sql_and_unsupported_isolation_are_refused(self):
        c = FakeConnection(); c.info.transaction_status = 2
        with patch.object(a, 'execute') as execute:
            with self.assertRaisesRegex(a.ContractFailure, 'fresh_transaction_required'):
                a.fresh_attempt(c, 'READ COMMITTED', a.Intent('promote', 201))
            c.info.transaction_status = 0
            for bad in [a.Command('select frozen_sql'), 'select frozen_sql']:
                with self.assertRaisesRegex(a.ContractFailure, 'intent_required'):
                    a.fresh_attempt(c, 'READ COMMITTED', bad)
            with self.assertRaises(a.ContractFailure):
                a.fresh_attempt(c, 'SERIALIZABLE', a.Intent('promote', 201))
            with self.assertRaisesRegex(a.ContractFailure, 'unsupported_composition'):
                a.Intent('raw_sql', 201)
            execute.assert_not_called()

    def test_deferred_fresh_qualification_does_not_execute_a_cached_command(self):
        c = FakeConnection()
        with patch.object(a, 'execute', side_effect=c.execute), patch.object(a, 'factory', return_value=None):
            result = a.retry_transaction(c, 'READ COMMITTED', a.Intent('promote', 201))
        self.assertEqual((result.code, result.phase, result.disposition), (None, 'preparation', 'qualification_deferred'))
        self.assertEqual([s for s, _ in c.commands], ['begin isolation level READ COMMITTED', 'select saasscout_private.b43_enter()', 'rollback'])

    def test_actual_factory_reloads_rows_and_runs_production_preparation(self):
        rows = json.loads((ROOT / 'tests/fixtures/b43-f4-preparation.json').read_text())
        by_table = {value: key for key, value in a.TABLES.items()}
        def read(c, sql, params=()):
            if 'jsonb_agg' in sql:
                return copy.deepcopy(rows[by_table[re.search(r'from public\.(\w+)', sql)[1]]])
            return {'fresh': len(rows['classifications'])}
        with patch.object(a, 'scalar', side_effect=read), patch.dict(os.environ, PATH=NODE_PATH):
            first = a.factory(None, a.Intent('promote', 201))
            rows['classifications'].append({**rows['classifications'][0], 'id': a.uid('e', 201),
                'supersedes_classification_id': a.uid('c', 201), 'polarity': 'contradicting'})
            second = a.factory(None, a.Intent('promote', 201))
        self.assertEqual(first.params[2], a.uid('c', 201))
        self.assertEqual(second.params[2], a.uid('e', 201))
        self.assertEqual(second.params[4], 'contradicting')
        self.assertNotEqual(first.params[6], second.params[6])
        self.assertNotEqual(first.params[7], second.params[7])

    def test_fixture_is_per_case_and_does_not_rewrite_existing_immutable_rows(self):
        one, two = f4.fixture(201), f4.fixture(202)
        self.assertIn(a.uid('7', 201), one)
        self.assertIn(a.uid('7', 202), two)
        self.assertNotIn('generate_series(1,15)', one)
        self.assertIn('generate_series(201,201)', one)
        self.assertNotIn('create function public.b31_test_promote', one)
        self.assertNotRegex(one.lower(), r'\b(update|delete|truncate)\s+(?:from\s+)?public\.')

    def test_migration_is_preserved_and_all_required_scenario_scopes_are_explicit(self):
        migration = ROOT / 'supabase/migrations/20261107000000_b43_executable_concurrency_contract.sql'
        self.assertEqual(len(migration.read_text().splitlines()), 2052)
        self.assertEqual(hashlib.sha256(migration.read_bytes()).hexdigest(), f4.MIGRATION_SHA256)
        labels = {row[0] for row in f4.SCENARIOS}
        self.assertTrue({'consent', 'human_successor', 'canonical', 'alias', 'duplicate', 'nested', 'indirect_fk', 'outer_snapshot'} <= labels)
        self.assertEqual(next(row[-1] for row in f4.SCENARIOS if row[0] == 'consent'), 'trusted_fenced_sql')
        source = (ROOT / 'scripts/validation-b43-f4.py').read_text()
        for token in ('f3.barrier(', 'holder_commit', 'capture_atomicity', 'commit_atomicity', 'savepoint_entry_conflict',
                      'preentry_builtin_advisory_sql_not_certified', "'update', 'no key update', 'share', 'key share'",
                      "('validation_qualified_evidence_snapshots', 'promotion_id'", 'finality_correction_accepted'):
            self.assertIn(token, source)

    def test_unauthorized_cli_writes_only_sanitized_failure_artifact(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'b43-f4-diagnostic.json'
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/validation-b43-f4.py')],
                                    env={'RUNNER_TEMP': root, 'F4_ARTIFACT': str(path), 'F4_EXPECTED_SHA': 'PRIVATE_SENTINEL'},
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 1)
            value = json.loads(path.read_text())
            self.assertFalse(value['success'])
            self.assertFalse(value['deadlock_freedom_proven'])
            self.assertNotIn('PRIVATE_SENTINEL', path.read_text() + result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
