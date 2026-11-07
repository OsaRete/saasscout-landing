"""Local-only cleanup of the existing generated B4.3 project; no global prune."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def require(ok):
    if not ok:
        raise ValueError('cleanup_identity_failed')


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=25).stdout


def validate_inputs():
    project, directory, network = (os.environ.get(k, '') for k in ('PROJECT_ID', 'PROJECT_DIR', 'NETWORK_ID'))
    if not project and not directory and not network:
        return None
    require(re.fullmatch('saasscout-b43-disposable-[a-f0-9]{12}', project) is not None)
    require(not any(k in os.environ for k in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','SUPABASE_ACCESS_TOKEN')))
    path = Path(directory)
    require(path.is_absolute() and not path.is_symlink())
    root = path.resolve(strict=True)
    require(root != Path(tempfile.gettempdir()) and Path(tempfile.gettempdir()) in root.parents)
    manifest = json.loads((root / '.b43-disposable-identity.json').read_text())
    require(manifest.get('schemaVersion') == 2 and manifest.get('projectId') == project and manifest.get('projectDir') == str(root))
    config = (root / 'supabase/config.toml').read_bytes()
    require(hashlib.sha256(config).hexdigest() == manifest.get('configSha256'))
    require(re.search(r'^project_id\s*=\s*"' + re.escape(project) + r'"\s*$', config.decode(), re.M) is not None)
    require(not (root / 'supabase/.temp/project-ref').exists())
    if network:
        require(re.fullmatch('[a-f0-9]{64}', network) is not None)
    return project, root, network


def main():
    inputs = validate_inputs()
    if inputs is None:
        return
    project, root, network = inputs
    require(run(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}']).strip() == 'unix:///var/run/docker.sock')
    expected_name = 'saasscout-b43-loopback-' + project.removeprefix('saasscout-b43-disposable-')
    ids = run(['docker','ps','-aq','--no-trunc']).split()
    owned = set()
    # Inspect the union of both label families, rather than silently overlooking
    # a malformed container carrying only one of the project labels.
    for cid in ids:
        c = json.loads(run(['docker','inspect',cid]))[0]
        labels = c['Config'].get('Labels') or {}
        cli, compose = labels.get('com.supabase.cli.project'), labels.get('com.docker.compose.project')
        if project not in (cli, compose) and not c['Name'].endswith('_' + project):
            continue
        require(cli == compose == project)
        require(network and all(v['NetworkID'] == network for v in c['NetworkSettings']['Networks'].values()))
        owned.add(c['Id'])
    if network:
        data = json.loads(run(['docker','network','inspect',network]))[0]
        require(data['Id'] == network and data['Name'] == expected_name and data['Driver'] == 'bridge')
        require(data['Options'].get('com.docker.network.bridge.host_binding_ipv4') == '127.0.0.1')
        require(set((data.get('Containers') or {}).keys()) <= owned)
    # A failed startup may leave zero containers. Path/config/manifest identity
    # still binds stop to the sole generated local project.
    run(['supabase','--workdir',str(root),'stop','--no-backup'])
    if network:
        remaining = run(['docker','network','ls','--no-trunc','--filter','id='+network,'--format','{{.ID}}']).split()
        if not remaining:
            return  # Local stop may already have removed this verified network.
        require(remaining == [network])
        data = json.loads(run(['docker','network','inspect',network]))[0]
        require(data['Id'] == network and data['Name'] == expected_name and not data.get('Containers'))
        run(['docker','network','rm',network])


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('B4.3 identity-scoped cleanup failed; ephemeral runner teardown required', file=sys.stderr)
        sys.exit(1)
