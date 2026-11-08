"""Read-only, separately bound F3/F4 disposable workflow authorization."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

REPO = 'OsaRete/saasscout-landing'
BRANCH = 'codex/b43-c1-source-transition-integrity'
WORKFLOW = '.github/workflows/validation-b31-database.yml'
F4_WORKFLOW = '.github/workflows/validation-b43-f4-disposable.yml'


def require(ok):
    if not ok:
        raise ValueError('authorization_failed')


def context(env, f3_required=True):
    expected = env.get('F3_EXPECTED_SHA', '')
    require(isinstance(expected, str) and re.fullmatch('[a-f0-9]{40}', expected) is not None)
    require(env.get('GITHUB_REPOSITORY') == REPO)
    require(env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch')
    require(env.get('GITHUB_REF') == 'refs/heads/' + BRANCH)
    f4 = env.get('F4_AUTHORIZED') == 'true'
    workflow = F4_WORKFLOW if f4 else WORKFLOW
    require(env.get('GITHUB_WORKFLOW_REF') == REPO + '/' + workflow + '@refs/heads/' + BRANCH)
    if f4:
        require(env.get('F4_EXPECTED_SHA') == expected and env.get('F3_AUTHORIZED') == 'true')
    else:
        require('F4_AUTHORIZED' not in env and 'F4_EXPECTED_SHA' not in env)
    require(expected == env.get('GITHUB_SHA') == env.get('GITHUB_WORKFLOW_SHA'))
    require(env.get('F3_RESET_AUTHORIZED') == 'true')
    require(env.get('F3_AUTHORIZED') in ('true', 'false'))
    if f3_required:
        require(env.get('F3_AUTHORIZED') == 'true')
    # A fixed DSN alone does not override libpq PGHOSTADDR/PGSERVICE or a remote
    # Docker selector. Refuse these before any child CLI/client is started.
    forbidden = r'PG[A-Z0-9_]*|DATABASE_URL|SUPABASE_(ACCESS_TOKEN|DB_URL|URL|SERVICE_ROLE_KEY|SERVICE_KEY|ANON_KEY)|DOCKER_(HOST|CONTEXT|TLS_VERIFY|CERT_PATH)'
    require(not any(re.fullmatch(forbidden, k) for k in env))
    return expected


def verify(pr, expected):
    return (pr.get('number') == 235 and pr.get('state') == 'open' and pr.get('draft') is True
        and pr.get('merged_at') is None and pr.get('head', {}).get('sha') == expected
        and pr.get('head', {}).get('ref') == BRANCH
        and pr.get('head', {}).get('repo', {}).get('full_name') == REPO
        and pr.get('base', {}).get('ref') == 'main'
        and pr.get('base', {}).get('repo', {}).get('full_name') == REPO)


def local_revision(expected):
    result = subprocess.run(['git', 'rev-parse', 'HEAD'], check=True, capture_output=True, text=True, timeout=10)
    require(result.stdout.strip() == expected)
    subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], check=True, capture_output=True, text=True, timeout=10)
    # Tracked-tree cleanliness alone would accept an unreviewed migration or
    # imported harness module placed in an untracked file.
    status = subprocess.run(['git', 'status', '--porcelain', '--untracked-files=all'],
                            check=True, capture_output=True, text=True, timeout=10)
    require(status.stdout == '')


def verify_f4_inventory():
    """Inventory is part of the exact clean Git revision, never caller-selected."""
    inventory = json.loads(Path('docs/V8_B43_F4_C1_EXECUTION_INVENTORY.json').read_text())
    paths = inventory['required_files']
    require(paths == sorted(set(paths)))
    require(all(re.fullmatch(r'[A-Za-z0-9_./-]+', p) and '..' not in p.split('/') for p in paths))
    migrations = sorted(str(p) for p in Path('supabase/migrations').glob('*.sql'))
    require(migrations and migrations[-1] == inventory['terminal_migration'])
    require(inventory['migration_files'] == migrations)
    paths = sorted(set(paths + migrations))
    tracked = subprocess.run(['git', 'ls-files', '--stage', '--', *paths], check=True,
                             capture_output=True, text=True, timeout=10).stdout.splitlines()
    entries = {}
    for line in tracked:
        metadata, name = line.split('\t')
        mode, oid, stage = metadata.split()
        require(mode in ('100644', '100755') and stage == '0')
        entries[name] = oid
    require(sorted(entries) == paths)
    import hashlib
    for name in paths:
        path = Path(name)
        require(not path.is_symlink() and path.is_file())
        data = path.read_bytes()
        # SHA-1 Git blobs, not a plain file digest; no subprocess interprets paths.
        require(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == entries[name])
    # A clean status can hide ignored executable input. Fresh npm dependencies
    # are outside these source roots and are pinned separately by package-lock.
    ignored = subprocess.run(['git', 'ls-files', '--others', '--ignored', '--exclude-standard', '--',
                              'scripts', 'lib', 'tests', 'supabase', '.github', 'docs'], check=True,
                             capture_output=True, text=True, timeout=10).stdout.splitlines()
    require(not any(Path(p).suffix in ('.py', '.ts', '.mjs', '.js', '.sql', '.json', '.toml', '.yml', '.yaml') for p in ignored))


def boolean_input(value):
    require(type(value) is bool or (isinstance(value, str) and value in ('true', 'false')))
    return value is True or value == 'true'


def main(dispatch_check=False):
    expected = context(os.environ, f3_required=not dispatch_check)
    local_revision(expected)
    with Path(os.environ['GITHUB_EVENT_PATH']).open() as handle:
        event = json.load(handle)
    require(boolean_input(event.get('inputs', {}).get('authorize_disposable_reset')))
    f4 = os.environ.get('F4_AUTHORIZED') == 'true'
    if f4:
        require('authorize_f3' not in event.get('inputs', {}))
        verify_f4_inventory()
    f3_input = event.get('inputs', {}).get('authorize_f4' if f4 else 'authorize_f3', 'false')
    f3_requested = boolean_input(f3_input)
    require(('true' if f3_requested else 'false') == os.environ['F3_AUTHORIZED'])
    if not dispatch_check:
        require(f3_requested)
    require(event.get('inputs', {}).get('expected_b43_sha') == expected)
    # No caller-supplied URL, pagination, body or error text reaches diagnostics.
    request = urllib.request.Request('https://api.github.com/repos/' + REPO + '/pulls/235', headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=15) as response:
        require(response.status == 200)
        require(verify(json.load(response), expected))


if __name__ == '__main__':
    try:
        require(sys.argv[1:] in ([], ['--dispatch-check']))
        main(dispatch_check=sys.argv[1:] == ['--dispatch-check'])
    except Exception:
        print('F3 exact authorized Draft PR identity check failed', file=sys.stderr)
        sys.exit(1)
