"""Offline negative controls: no Docker, GitHub writes or database connections."""
import copy
import hashlib
import importlib.util
import json
import os
import io
import re
import subprocess
import shutil
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
SHA = 'a' * 40
PROJECT = 'saasscout-b43-disposable-aabbccddeeff'
NETWORK = 'b' * 64
NODE = shutil.which('node')

# Preserve only Windows OS variables before test isolation clears os.environ.
WINDOWS_NODE_ENV = {
    key: value
    for key, value in os.environ.items()
    if key.upper() in ('SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP')
}



def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


auth = load('validation-b43-f3-authorize')
f3 = load('validation-b43-f3')
cleanup = load('validation-b43-f3-cleanup')


def env():
    return dict(F3_EXPECTED_SHA=SHA, GITHUB_REPOSITORY=auth.REPO,
        GITHUB_EVENT_NAME='workflow_dispatch', GITHUB_REF='refs/heads/' + auth.BRANCH,
        GITHUB_WORKFLOW_REF=auth.REPO+'/'+auth.WORKFLOW+'@refs/heads/'+auth.BRANCH,
        GITHUB_SHA=SHA, GITHUB_WORKFLOW_SHA=SHA, F3_AUTHORIZED='true', F3_RESET_AUTHORIZED='true')


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        f3.EVENTS.clear()
        f3.CONNECTIONS.clear()

    def test_dispatch_requires_each_authorization_and_exact_ref_sha(self):
        good = env()
        self.assertEqual(auth.context(good), SHA)
        for key, value in [('F3_EXPECTED_SHA',''), ('F3_EXPECTED_SHA','z'*40),
            ('GITHUB_EVENT_NAME','pull_request'), ('GITHUB_REPOSITORY','attacker/fork'),
            ('GITHUB_REF','refs/heads/main'), ('GITHUB_SHA','b'*40),
            ('GITHUB_WORKFLOW_SHA','b'*40), ('GITHUB_WORKFLOW_REF','other'),
            ('F3_AUTHORIZED','false'), ('F3_RESET_AUTHORIZED','false')]:
            with self.subTest(key=key):
                with self.assertRaises(ValueError): auth.context({**good,key:value})

    def test_libpq_and_remote_docker_overrides_rejected_before_children(self):
        for key in ('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD',
                    'DATABASE_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
                    'DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CERT_PATH'):
            with self.subTest(key=key):
                with self.assertRaises(ValueError): auth.context({**env(),key:'PRIVATE_SENTINEL'})

    def test_live_pr_negative_controls(self):
        good = dict(number=235,state='open',draft=True,merged_at=None,
                    head=dict(sha=SHA,ref=auth.BRANCH,repo=dict(full_name=auth.REPO)),
                    base=dict(ref='main',repo=dict(full_name=auth.REPO)))
        self.assertTrue(auth.verify(good,SHA))
        for path,value in [(('number',),234),(('draft',),False),(('state',),'closed'),
            (('merged_at',),'now'),(('head','sha'),'b'*40),(('head','ref'),'main'),
            (('head','repo','full_name'),'fork/repo'),(('base','ref'),'other')]:
            bad=copy.deepcopy(good); target=bad
            for key in path[:-1]: target=target[key]
            target[path[-1]]=value
            self.assertFalse(auth.verify(bad,SHA),path)

    def test_missing_optin_never_runs_preflight_or_connect(self):
        with patch.object(f3,'security_preflight') as preflight, patch.object(f3,'connect') as connect:
            with self.assertRaises(ValueError): f3.main()
            preflight.assert_not_called(); connect.assert_not_called()

    def test_wrong_destination_rejected_before_cli(self):
        with patch.dict(os.environ,{**env(), 'VALIDATION_B43_DISPOSABLE':'1',
            'VALIDATION_B43_DATABASE_URL':'postgresql://prod.invalid/postgres',
            'F3_SOURCE_SHA':SHA,'F3_CLUSTER_ID':'123'}), patch('subprocess.run') as run:
            run.return_value.stdout=SHA+'\n'
            with self.assertRaises(f3.DiagnosticFailure): f3.require_runtime()
            self.assertEqual(run.call_count,2)  # Read-only HEAD and tracked-tree checks only.
            self.assertEqual(run.call_args_list[0].args[0],['git','rev-parse','HEAD'])
            self.assertEqual(run.call_args_list[1].args[0],['git','diff','--quiet','HEAD','--'])

    def test_connection_identity_fails_before_begin(self):
        for row in [('service_role','postgres','postgres',5432,'123'),
                    ('postgres','postgres','wrong',5432,'123'),
                    ('postgres','postgres','postgres',5432,'wrong-cluster')]:
            c=SimpleNamespace(info=SimpleNamespace(backend_pid=101))
            client=SimpleNamespace(connect=Mock(return_value=c))
            with patch.dict(sys.modules,psycopg=client), patch.object(f3,'require_runtime'), \
                 patch.dict(os.environ,F3_CLUSTER_ID='123'), patch.object(f3,'execute',return_value=[row]) as execute:
                with self.assertRaises(f3.DiagnosticFailure): f3.connect('A','READ COMMITTED')
                self.assertEqual(execute.call_count,1)
                self.assertNotIn('begin',execute.call_args.args[1])
                self.assertEqual(client.connect.call_args.kwargs['hostaddr'],'127.0.0.1')

    def test_sanitized_sqlstate_excludes_driver_message(self):
        class Error(Exception): sqlstate='40P01'
        c=SimpleNamespace(info=SimpleNamespace(backend_pid=101))
        with patch.dict(sys.modules,psycopg=SimpleNamespace(Error=Error)), \
             patch.object(f3,'execute',side_effect=Error('PRIVATE_SENTINEL')):
            self.assertEqual(f3.attempt(c,'synthetic sql','fixed_operation'),'40P01')
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(f3.EVENTS))
        self.assertEqual(f3.EVENTS[-1]['sqlstate'],'40P01')

    def test_snapshot_sanitizes_unrecognized_wait_and_mode_strings(self):
        c=SimpleNamespace(info=SimpleNamespace(backend_pid=101))
        with patch.object(f3,'execute',side_effect=[[(101,[102],'PRIVATE_SENTINEL','PRIVATE_SENTINEL')],[(101,'advisory','PRIVATE_SENTINEL',True)]]):
            f3.snapshot(None,c,c)
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(f3.EVENTS))
        self.assertIn('other',json.dumps(f3.EVENTS))

    def test_artifacts_cannot_write_outside_runner_temp(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,RUNNER_TEMP=root,F3_ARTIFACT='/tmp/unrelated.json'):
            with self.assertRaises(f3.DiagnosticFailure): f3.artifact_path()
            os.environ['F3_ARTIFACT']=str(Path(root)/'b43-f3-diagnostic.json')
            f3.emit('check',label='fixed',passed=True)
            data=json.loads(f3.artifact_path().read_text())
            self.assertFalse(data['success']); self.assertTrue(data['incomplete'])
            self.assertFalse(data['deadlock_freedom_proven'])

    def test_cleanup_rejects_ordinary_project_without_subprocess(self):
        with patch.dict(os.environ,PROJECT_ID='saasscout-landing',PROJECT_DIR='/tmp'),patch.object(cleanup,'run') as run:
            with self.assertRaises(ValueError): cleanup.main()
            run.assert_not_called()

    def make_manifest(self,root):
        config=f'project_id = "{PROJECT}"\n'.encode()
        Path(root,'supabase').mkdir()
        Path(root,'supabase/config.toml').write_bytes(config)
        Path(root,'.b43-disposable-identity.json').write_text(json.dumps(dict(schemaVersion=2,
            projectId=PROJECT,projectDir=root,configSha256=hashlib.sha256(config).hexdigest())))

    def test_cleanup_mismatched_config_rejected_without_subprocess(self):
        with tempfile.TemporaryDirectory() as root:
            self.make_manifest(root)
            Path(root,'supabase/config.toml').write_text('project_id="production"\n')
            with patch.dict(os.environ,PROJECT_ID=PROJECT,PROJECT_DIR=root,NETWORK_ID=NETWORK),patch.object(cleanup,'run') as run:
                with self.assertRaises(ValueError): cleanup.main()
                run.assert_not_called()

    def test_cleanup_foreign_network_attachment_blocks_stop_and_remove(self):
        with tempfile.TemporaryDirectory() as root:
            self.make_manifest(root)
            network=dict(Id=NETWORK,Name='saasscout-b43-loopback-aabbccddeeff',Driver='bridge',
                Options={'com.docker.network.bridge.host_binding_ipv4':'127.0.0.1'},Containers={'foreign':{}})
            with patch.dict(os.environ,PROJECT_ID=PROJECT,PROJECT_DIR=root,NETWORK_ID=NETWORK), \
                 patch.object(cleanup,'run',side_effect=['unix:///var/run/docker.sock\n','',json.dumps([network])]) as run:
                with self.assertRaises(ValueError): cleanup.main()
                self.assertFalse(any('stop' in c.args[0] or 'rm' in c.args[0] for c in run.call_args_list))

    def test_cleanup_valid_empty_stack_is_strictly_project_scoped(self):
        with tempfile.TemporaryDirectory() as root:
            self.make_manifest(root)
            network=dict(Id=NETWORK,Name='saasscout-b43-loopback-aabbccddeeff',Driver='bridge',
                Options={'com.docker.network.bridge.host_binding_ipv4':'127.0.0.1'},Containers={})
            with patch.dict(os.environ,PROJECT_ID=PROJECT,PROJECT_DIR=root,NETWORK_ID=NETWORK), \
                 patch.object(cleanup,'run',side_effect=['unix:///var/run/docker.sock\n','',json.dumps([network]),'',NETWORK+'\n',json.dumps([network]),'']) as run:
                cleanup.main()
                self.assertIn(['supabase','--workdir',root,'stop','--no-backup'],[c.args[0] for c in run.call_args_list])
                self.assertEqual(run.call_args.args[0],['docker','network','rm',NETWORK])

    def test_cleanup_accepts_network_already_removed_by_local_stop(self):
        with tempfile.TemporaryDirectory() as root:
            self.make_manifest(root)
            network=dict(Id=NETWORK,Name='saasscout-b43-loopback-aabbccddeeff',Driver='bridge',
                Options={'com.docker.network.bridge.host_binding_ipv4':'127.0.0.1'},Containers={})
            with patch.dict(os.environ,PROJECT_ID=PROJECT,PROJECT_DIR=root,NETWORK_ID=NETWORK), \
                 patch.object(cleanup,'run',side_effect=['unix:///var/run/docker.sock\n','',json.dumps([network]),'','']) as run:
                cleanup.main()
                self.assertFalse(any('rm' in call.args[0] for call in run.call_args_list))

    def test_dispatch_check_is_strict_even_when_f3_is_not_requested(self):
        good={**env(),'F3_AUTHORIZED':'false'}
        self.assertEqual(auth.context(good,f3_required=False),SHA)
        with self.assertRaises(ValueError): auth.context(good)
        for value in ('', 'b'*39, 'g'*40, 'b'*40, None):
            with self.subTest(value=value):
                with self.assertRaises(ValueError): auth.context({**good,'F3_EXPECTED_SHA':value},f3_required=False)
        with self.assertRaises(ValueError): auth.context({**good,'F3_RESET_AUTHORIZED':'false'},f3_required=False)

    def test_cli_api_inputs_preserve_both_authorizations_and_reviewed_sha(self):
        for requested in (True,False):
            with tempfile.TemporaryDirectory() as root:
                event=Path(root)/'event.json'
                event.write_text(json.dumps({'inputs':{'authorize_disposable_reset':True,
                    'authorize_f3':requested,'expected_b43_sha':SHA}}))
                response=io.StringIO(json.dumps(dict(number=235,state='open',draft=True,merged_at=None,
                    head=dict(sha=SHA,ref=auth.BRANCH,repo=dict(full_name=auth.REPO)),
                    base=dict(ref='main',repo=dict(full_name=auth.REPO)))))
                response.status=200
                with patch.dict(os.environ,{**env(),'F3_AUTHORIZED':str(requested).lower(),
                    'GITHUB_EVENT_PATH':str(event),'GH_TOKEN':'SYNTHETIC_TEST_TOKEN'}), \
                     patch.object(auth,'local_revision') as revision, \
                     patch.object(auth.urllib.request,'urlopen',return_value=response) as request:
                    auth.main(dispatch_check=True)
                    revision.assert_called_once_with(SHA)
                    self.assertEqual(request.call_args.args[0].full_url,
                        'https://api.github.com/repos/OsaRete/saasscout-landing/pulls/235')

    def test_non_boolean_and_missing_input_values_are_not_authorizations(self):
        for value in (None,0,1,'TRUE','',[],{}):
            with self.subTest(value=value):
                with self.assertRaises(ValueError): auth.boolean_input(value)
        self.assertIs(auth.boolean_input(True),True)
        self.assertIs(auth.boolean_input('true'),True)
        self.assertIs(auth.boolean_input(False),False)

    def workflow_jobs(self):
        text=(ROOT/'.github/workflows/validation-b31-database.yml').read_text().split('\njobs:\n',1)[1]
        pieces=re.split(r'^  ([a-z0-9-]+):\n',text,flags=re.M)
        return dict(zip(pieces[1::2],pieces[2::2]))

    def test_every_manual_job_checks_pinned_revision_before_install_or_tests(self):
        jobs=self.workflow_jobs()
        self.assertEqual(set(jobs),{'b43-static','database','b43-disposable-database'})
        for name,body in jobs.items():
            with self.subTest(job=name):
                guard=body.index('scripts/validation-b43-f3-authorize.py --dispatch-check')
                self.assertIn("if: github.event_name == 'workflow_dispatch'",body[:guard])
                self.assertIn('ref: ${{ github.sha }}',body[:guard])
                self.assertIn('persist-credentials: false',body[:guard])
                self.assertIn('F3_EXPECTED_SHA: ${{ inputs.expected_b43_sha }}',body[:guard])
                for token in ('uses: actions/setup-node','run: npm ci','supabase start','db reset','run: node '):
                    if token in body:
                        self.assertLess(guard,body.index(token))
        legacy=jobs['database']
        self.assertIn('npm run test:validation-b31-db',legacy)
        self.assertIn('npm run test:validation-b42-db',legacy)
        # No job-level condition silently removes legacy coverage for F3 runs.
        self.assertNotIn('    if:',legacy.split('    steps:',1)[0])

    def test_f3_requires_successful_complete_security_step_and_never_masks_suite(self):
        job=self.workflow_jobs()['b43-disposable-database']
        steps=job.split('\n      - name: ')
        security=next(s for s in steps if s.startswith('Require complete fresh-database security preflight'))
        execution=next(s for s in steps if s.startswith('Execute all 24'))
        dependencies=next(s for s in steps if s.startswith('Install F3 diagnostic client'))
        self.assertIn("if: ${{ !cancelled() && steps.f3_reset.outcome == 'success' }}",security)
        self.assertIn('--security-preflight-only',security)
        self.assertIn('PASS B4.3 full disposable security preflight',security)
        self.assertIn("if: ${{ !cancelled() && steps.f3_security.outcome == 'success' }}",execution)
        self.assertIn('inputs.authorize_f3 == true',dependencies)
        self.assertNotIn('continue-on-error',job)
        self.assertLess(job.index('id: f3_reset'),job.index('id: f3_security'))
        self.assertLess(job.index('id: f3_security'),job.index('Execute all 24'))

    def test_incomplete_failed_or_identity_only_security_results_reject(self):
        marker = (
            'PASS B4.3 service_role, anon and authenticated RPC execution denials\n'
            'PASS B4.3 full disposable security preflight\n'
        )
        for stdout,status in [('',0),('PASS B4.3 disposable identity verified before reset\n',0),
                              (marker,1),(marker, None),(marker+'unexpected\n',0)]:
            with self.subTest(stdout=stdout,status=status),patch.object(f3,'require_runtime'), \
                 patch.object(f3.subprocess,'run',return_value=SimpleNamespace(returncode=status,stdout=stdout)):
                with self.assertRaises(f3.DiagnosticFailure): f3.security_preflight()
        with patch.object(f3,'require_runtime'),patch.object(f3.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=marker)):
            f3.security_preflight()

    def test_failed_security_gate_prevents_connections_and_fixtures(self):
        with patch.object(f3,'require_runtime',return_value=SHA),patch.object(f3,'artifact_path'), \
             patch.object(f3.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='')) as child, \
             patch.object(f3,'connect') as connect:
            with self.assertRaises(f3.DiagnosticFailure): f3.main()
            connect.assert_not_called()
            self.assertEqual(child.call_count,1)
            self.assertEqual(child.call_args.args[0],['node','scripts/validation-b43-db.ts','--security-preflight-only'])

    def security_prefix(self,flags,failing=''):
        # Execute the ACTUAL checked-in run() security prefix with instrumented
        # dependencies. No copied control flow, database or RPC is executed.
        source=(ROOT/'scripts/validation-b43-db.ts').read_text()
        start=source.index('async function run(): Promise<void> {')+len('async function run(): Promise<void> {')
        body=source[start:source.index('  phase = "fixture setup";',start)]
        gates=['assertCompleteMigrationChain','assertFreshApplicationDatabase',
               'assertDatabaseSecurityCatalog','verifyApplicationRoleEscalationDenied']
        code="const events=[], logs=[]; let phase=''; const process={argv:"+json.dumps(['node','runner',*flags])+"};\n"
        code+="const console={log:(v)=>logs.push(v)}; function check(v){if(!v)throw Error('rejected');}\n"
        code+="function gate(name){events.push(name);if(name==="+json.dumps(failing)+")throw Error('PRIVATE_SENTINEL');}\n"
        code+="function verifyDisposableIdentity(){gate('identity');return {status:{}};}\n"
        code+='\n'.join('function '+name+"(){gate('"+name+"');}" for name in gates)+'\n'
        code+="function clients(){gate('clients');return {admin:{},anonymous:{},authenticated:{}};}\n"
        code+="async function verifyPostgrestExecutionBoundary(){gate('verifyPostgrestExecutionBoundary');}\n"
        code+='async function reviewedPrefix(){'+body+'}\n'
        code+="let success=false;try{await reviewedPrefix();success=true;}catch{};globalThis.console.log(JSON.stringify({success,events,logs}));"
        self.assertIsNotNone(NODE)
        result=subprocess.run([NODE,'--input-type=module'],input=code,capture_output=True,text=True,check=True,timeout=10,env=WINDOWS_NODE_ENV.copy() if os.name == 'nt' else {})
        return json.loads(result.stdout)

    def test_complete_security_prefix_reuses_every_existing_relevant_gate(self):
        result=self.security_prefix(['--security-preflight-only'])
        self.assertTrue(result['success'])
        self.assertEqual(result['events'],['identity','assertCompleteMigrationChain','assertFreshApplicationDatabase',
            'assertDatabaseSecurityCatalog','verifyApplicationRoleEscalationDenied','clients','verifyPostgrestExecutionBoundary'])
        self.assertEqual(result['logs'],['PASS B4.3 full disposable security preflight'])

    def test_failure_of_any_security_gate_cannot_emit_complete_marker(self):
        for failing in ('identity','assertCompleteMigrationChain','assertFreshApplicationDatabase',
            'assertDatabaseSecurityCatalog','verifyApplicationRoleEscalationDenied','clients','verifyPostgrestExecutionBoundary'):
            with self.subTest(failing=failing):
                result=self.security_prefix(['--security-preflight-only'],failing)
                self.assertFalse(result['success'])
                self.assertEqual(result['logs'],[])

    def test_lightweight_or_conflicting_modes_cannot_prove_security_completion(self):
        light=self.security_prefix(['--preflight-only'])
        self.assertEqual(light['events'],['identity'])
        self.assertNotIn('PASS B4.3 full disposable security preflight',light['logs'])
        conflicting=self.security_prefix(['--preflight-only','--security-preflight-only'])
        self.assertFalse(conflicting['success'])
        self.assertEqual(conflicting['events'],[])

    def test_twenty_four_unique_cases(self):
        self.assertEqual(len({(i,v) for i in f3.ISOLATIONS for v in f3.VARIANTS}),24)
        self.assertEqual(set(f3.ISOLATIONS),{'READ COMMITTED','REPEATABLE READ'})


if __name__ == '__main__': unittest.main()
