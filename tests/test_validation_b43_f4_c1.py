"""Offline F4 workflow binding checks. Never execute workflow bodies or SQL."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('c1_auth', ROOT / 'scripts/validation-b43-f3-authorize.py')
auth = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(auth)
SHA = 'a' * 40
WORKFLOW = ROOT / '.github/workflows/validation-b43-f4-disposable.yml'


def environment():
    return dict(F3_EXPECTED_SHA=SHA, F4_EXPECTED_SHA=SHA, F4_AUTHORIZED='true',
                F3_AUTHORIZED='true', F3_RESET_AUTHORIZED='true',
                GITHUB_REPOSITORY=auth.REPO, GITHUB_EVENT_NAME='workflow_dispatch',
                GITHUB_REF='refs/heads/' + auth.BRANCH, GITHUB_SHA=SHA, GITHUB_WORKFLOW_SHA=SHA,
                GITHUB_WORKFLOW_REF=auth.REPO + '/' + auth.F4_WORKFLOW + '@refs/heads/' + auth.BRANCH)


def workflow_checks(source):
    assert re.search(r'^on:\n  workflow_dispatch:', source, re.M)
    assert not re.search(r'^  (pull_request|push|workflow_call|schedule|pull_request_target):', source, re.M)
    assert 'inputs.authorize_disposable_reset == true && inputs.authorize_f4 == true' in source
    assert 'ref: ${{ github.sha }}' in source and 'persist-credentials: false' in source
    assert 'permissions: {}' in source and 'contents: read\n      pull-requests: read' in source
    assert not re.search(r'secrets\.|write-all|: write|continue-on-error|secrets: inherit', source)
    assert 'environment: b43-disposable-database-validation' in source
    assert source.index('scripts/validation-b43-f3-authorize.py') < source.index('npm ci')
    assert source.index('test_validation_b43_f*.py') < source.index('supabase/setup-cli')
    assert 'F4_EXPECTED_SHA: ${{ inputs.expected_b43_sha }}' in source
    assert 'F3_EXPECTED_SHA: ${{ inputs.expected_b43_sha }}' in source
    assert 'F3_SOURCE_SHA: ${{ github.sha }}' in source
    assert source.count('GH_TOKEN: ${{ github.token }}') == 4
    assert 'F3_ARTIFACT' not in source and 'inputs.authorize_f3' not in source
    assert not re.search(r'(scripts/validation-b43-f3.py|npm run test:validation|node scripts/validation-b4[23]-db.ts\s*$)', source, re.M)
    assert source.count('db reset --local --no-seed') == 1
    assert 'supabase --workdir "$PROJECT_DIR" --network-id "$NETWORK_ID" db reset' in source
    assert source.index('scripts/prepare-validation-b43-disposable.ts') < source.index('Create and verify') < source.index('start --network-id')
    assert source.index('--preflight-only') < source.index('db reset') < source.index('scripts/validation-b43-f4.py')
    assert 'timeout --signal=TERM --kill-after=10s 1380s "$RUNNER_TEMP/b43-f4-python/bin/python" scripts/validation-b43-f4.py' in source
    assert 'F3_CLUSTER_ID="$(docker exec "supabase_db_$VALIDATION_B43_PROJECT_ID"' in source
    assert 'set -euo pipefail' in source
    assert 'if: always()' in source[source.index('Clean up only'):]
    assert 'scripts/validation-b43-f3-cleanup.py' in source
    assert 'path: ${{ runner.temp }}/b43-f4-diagnostic.json' in source
    assert 'retention-days: 3' in source and 'include-hidden-files: false' in source
    assert 'b43-private-cli.log' in source and 'path: ${{ runner.temp }}/*' not in source


class WorkflowTests(unittest.TestCase):
    def test_workflow_wiring_and_negative_mutations(self):
        source = WORKFLOW.read_text()
        workflow_checks(source)
        for old, new in [('workflow_dispatch:', 'pull_request:'),
                         ('inputs.authorize_f4 == true', 'true'),
                         ('ref: ${{ github.sha }}', 'ref: main'),
                         ('persist-credentials: false', 'persist-credentials: true'),
                         ('contents: read', 'contents: write'),
                         ('scripts/validation-b43-f4.py', 'scripts/validation-b43-f3.py'),
                         ('--network-id "$NETWORK_ID" db reset', 'db reset'),
                         ('GH_TOKEN: ${{ github.token }}', 'GH_TOKEN: ${{ secrets.PROD_TOKEN }}'),
                         ('path: ${{ runner.temp }}/b43-f4-diagnostic.json', 'path: ${{ runner.temp }}/*')]:
            with self.subTest(old=old), self.assertRaises(AssertionError):
                workflow_checks(source.replace(old, new))

    def test_shell_blocks_parse_without_running_them(self):
        source = WORKFLOW.read_text()
        blocks = re.findall(r'^        run: \|\n((?:          .*\n|\n)+)', source, re.M)
        self.assertGreaterEqual(len(blocks), 5)
        for block in blocks:
            shell = '\n'.join(line[10:] for line in block.splitlines())
            result = subprocess.run(['bash', '-n'], input=shell, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_f4_binding_rejects_wrong_event_revision_context_and_credentials(self):
        good = environment()
        self.assertEqual(auth.context(good), SHA)
        for key, value in [('F4_EXPECTED_SHA', 'b' * 40), ('F4_AUTHORIZED', 'false'),
                           ('F3_AUTHORIZED', 'false'), ('F3_RESET_AUTHORIZED', 'false'),
                           ('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_SHA', 'b' * 40),
                           ('GITHUB_WORKFLOW_SHA', 'b' * 40),
                           ('GITHUB_WORKFLOW_REF', good['GITHUB_WORKFLOW_REF'].replace(auth.F4_WORKFLOW, auth.WORKFLOW)),
                           ('SUPABASE_ACCESS_TOKEN', 'PRIVATE'), ('PGHOSTADDR', 'PRIVATE'), ('DOCKER_HOST', 'PRIVATE')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                auth.context({**good, key: value})

    def test_runner_and_shared_connection_guard_accept_only_f4_binding(self):
        spec = importlib.util.spec_from_file_location('c1_f4', ROOT / 'scripts/validation-b43-f4.py')
        runner = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = runner
        spec.loader.exec_module(runner)
        runtime = {**environment(), 'VALIDATION_B43_DISPOSABLE': '1',
                   'VALIDATION_B43_DATABASE_URL': runner.f3.DB, 'F3_SOURCE_SHA': SHA, 'F3_CLUSTER_ID': '123'}
        with patch.dict(os.environ, runtime, clear=True), patch.object(subprocess, 'run', side_effect=[
                SimpleNamespace(stdout=SHA + '\n'), SimpleNamespace(stdout=''), SimpleNamespace(stdout='')]) as child:
            self.assertEqual(runner.require_runtime(), SHA)
            self.assertEqual(child.call_count, 3)  # Git only; no driver or CLI.
        with patch.dict(os.environ, runtime, clear=True), patch.object(runner.f3, 'require_runtime') as shared:
            os.environ['GITHUB_WORKFLOW_REF'] = os.environ['GITHUB_WORKFLOW_REF'].replace(auth.F4_WORKFLOW, auth.WORKFLOW)
            with self.assertRaises(runner.a.ContractFailure): runner.require_runtime()
            shared.assert_not_called()
        with patch.dict(os.environ, runtime, clear=True), patch.object(runner.f3, 'require_runtime') as shared:
            with self.assertRaises(runner.f3.SetupFailure): runner.f3.main()
            shared.assert_not_called()  # F3 cannot borrow F4 authorization.

    def test_f4_event_must_authorize_f4_not_f3(self):
        for inputs, success in [({'authorize_f4': True}, True), ({'authorize_f4': False}, False),
                                ({'authorize_f3': True}, False), ({'authorize_f4': True, 'authorize_f3': True}, False)]:
            with tempfile.TemporaryDirectory() as root:
                event = Path(root) / 'event.json'
                event.write_text(json.dumps({'inputs': {**inputs, 'authorize_disposable_reset': True, 'expected_b43_sha': SHA}}))
                pr = dict(number=235, state='open', draft=True, merged_at=None,
                          head=dict(sha=SHA, ref=auth.BRANCH, repo=dict(full_name=auth.REPO)),
                          base=dict(ref='main', repo=dict(full_name=auth.REPO)))
                response = io.StringIO(json.dumps(pr)); response.status = 200
                with patch.dict(os.environ, {**environment(), 'GH_TOKEN': 'SYNTHETIC', 'GITHUB_EVENT_PATH': str(event)}, clear=True), \
                     patch.object(auth, 'local_revision'), patch.object(auth, 'verify_f4_inventory'), \
                     patch.object(auth.urllib.request, 'urlopen', return_value=response) as request:
                    if success:
                        auth.main(); request.assert_called_once()
                    else:
                        with self.assertRaises(ValueError): auth.main()
                        request.assert_not_called()

    def inventory_outputs(self):
        inventory = json.loads((ROOT / 'docs/V8_B43_F4_C1_EXECUTION_INVENTORY.json').read_text())
        paths = sorted(set(inventory['required_files'] + inventory['migration_files']))
        lines = []
        for name in paths:
            data = (ROOT / name).read_bytes()
            oid = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            lines.append(f'100644 {oid} 0\t{name}')
        return '\n'.join(lines) + '\n'

    def test_inventory_requires_reviewed_regular_blobs_and_no_ignored_executables(self):
        tracked = self.inventory_outputs()
        cases = [(tracked, '', True), (tracked.split('\n', 1)[1], '', False),
                 (tracked.replace('100644', '120000', 1), '', False),
                 (tracked.replace('100644 ', '100644 ' + '0' * 40 + '#', 1), '', False),
                 (tracked, 'scripts/ignored.py\n', False)]
        for listing, ignored, success in cases:
            with patch.object(auth.subprocess, 'run', side_effect=[SimpleNamespace(stdout=listing), SimpleNamespace(stdout=ignored)]):
                if success: auth.verify_f4_inventory()
                else:
                    with self.assertRaises(ValueError): auth.verify_f4_inventory()

    def test_inventory_is_complete_for_known_entrypoints_and_chain(self):
        inventory = json.loads((ROOT / 'docs/V8_B43_F4_C1_EXECUTION_INVENTORY.json').read_text())
        self.assertEqual(inventory['migration_files'], sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'supabase/migrations').glob('*.sql')))
        self.assertEqual(inventory['terminal_migration'], 'supabase/migrations/20261107000000_b43_executable_concurrency_contract.sql')
        versions = [Path(name).name[:14] for name in inventory['migration_files']]
        self.assertEqual(len(versions), len(set(versions)))
        self.assertTrue(all(re.fullmatch(r'\d{14}', version) for version in versions))
        preparer = (ROOT / 'scripts/prepare-validation-b43-disposable.ts').read_text()
        self.assertIn('cpSync(join(sourceSupabase, "migrations"), join(supabaseDir, "migrations")', preparer)
        self.assertIn('readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()', preparer)
        self.assertIn('isolated project contains the exact checked-out migration chain', preparer)
        required = set(inventory['required_files'])
        for name in ['scripts/validation-b43-f4.py', 'scripts/validation-b43-f4-attempts.py',
                     'scripts/validation-b43-f4-preparation.ts', 'scripts/validation-b43-f4-rpc.ts',
                     'scripts/validation-b43-f3-authorize.py', 'scripts/validation-b43-f3-cleanup.py',
                     'scripts/prepare-validation-b43-disposable.ts', 'scripts/validation-b43-db.ts',
                     'tests/sql/validation-b31.sql', '.github/workflows/validation-b43-f4-disposable.yml']:
            self.assertIn(name, required)
        # Local static TS dependency closure (including types); npm imports are lockfile-bound.
        for name in required:
            if Path(name).suffix not in ('.ts', '.mjs'): continue
            source = (ROOT / name).read_text()
            for relative in re.findall(r'(?:from\s*|import\s*\(?)[\'\"](\.[^\'\"]+)[\'\"]', source):
                target = ((ROOT / name).parent / relative).resolve()
                if target.is_file(): self.assertIn(str(target.relative_to(ROOT)), required, (name, relative))

    def test_authority_negative_fixture_enters_before_constraint_probe(self):
        source = (ROOT / 'scripts/validation-b43-db.ts').read_text()
        start = source.index('const authorityProbeEntry')
        end = source.index('// Distinct, fully reviewed', start)
        probe = source[start:end]
        self.assertIn("to_regprocedure('saasscout_private.b43_enter()') is not null", probe)
        self.assertIn('begin; select saasscout_private.b43_enter();', probe)
        self.assertIn('expectSqlState(`${authorityProbeEntry}', probe)
        self.assertIn('"23514", "positive authority forgery"', probe)
        self.assertIn("'active'); rollback;", probe)
        self.assertNotIn('disable trigger', probe)

    def test_legacy_capability_and_incompatible_assumptions_are_not_rewritten(self):
        original = subprocess.check_output(['git', 'show', 'cdfa204ac1e911a5faf02ae0fc21025e149c0e45:.github/workflows/validation-b31-database.yml'], cwd=ROOT)
        historical = (ROOT / '.github/workflows/validation-b31-database.yml').read_text()
        # The only historical binding edits are two explicit pre-infrastructure
        # refusals. The 24-case invocation, prerequisites and artifacts survive.
        guard = re.compile(r'      - name: Refuse fenced schema in historical database entrypoint\n.*?(?=      - uses: actions/setup-node@v4)', re.S)
        self.assertEqual(len(guard.findall(historical)), 2)
        self.assertEqual(guard.sub('', historical).encode(), original)
        for job in ('database', 'b43-disposable-database'):
            body = historical.split('  ' + job + ':\n', 1)[1]
            self.assertLess(body.index('Refuse fenced schema'), body.index('supabase/setup-cli'))
            self.assertIn('exit 1', body[:body.index('supabase/setup-cli')])
        b42 = (ROOT / 'scripts/validation-b42-db.ts').read_text()
        self.assertIn('sql(oldRpc, phase)', b42)
        self.assertIn('finally { sql(newRpc, phase); }', b42)
        self.assertIn('=== "0A000"', b42)  # Legacy TRUNCATE expectation, not the F4 oracle.
        f4 = (ROOT / 'scripts/validation-b43-f4.py').read_text()
        self.assertIn("source.split(boundary)[0]", f4)
        self.assertLess(f4.index("execute(c, 'select saasscout_private.b43_enter()')"), f4.index('execute(c, fixture(n))'))
        self.assertIn('f3.security_preflight()', f4)
        self.assertIn('not any', (ROOT / 'scripts/validation-b43-f3-authorize.py').read_text())


if __name__ == '__main__':
    unittest.main()
