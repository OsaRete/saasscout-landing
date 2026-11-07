"""Read-only authorization for F3 through the existing B4.3 workflow."""
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


def require(ok):
    if not ok:
        raise ValueError('authorization_failed')


def context(env, f3_required=True):
    expected = env.get('F3_EXPECTED_SHA', '')
    require(isinstance(expected, str) and re.fullmatch('[a-f0-9]{40}', expected) is not None)
    require(env.get('GITHUB_REPOSITORY') == REPO)
    require(env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch')
    require(env.get('GITHUB_REF') == 'refs/heads/' + BRANCH)
    require(env.get('GITHUB_WORKFLOW_REF') == REPO + '/' + WORKFLOW + '@refs/heads/' + BRANCH)
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


def boolean_input(value):
    require(type(value) is bool or (isinstance(value, str) and value in ('true', 'false')))
    return value is True or value == 'true'


def main(dispatch_check=False):
    expected = context(os.environ, f3_required=not dispatch_check)
    local_revision(expected)
    with Path(os.environ['GITHUB_EVENT_PATH']).open() as handle:
        event = json.load(handle)
    require(boolean_input(event.get('inputs', {}).get('authorize_disposable_reset')))
    f3_input = event.get('inputs', {}).get('authorize_f3', 'false')
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
