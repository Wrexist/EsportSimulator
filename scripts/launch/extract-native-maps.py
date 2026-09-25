"""Read installed competitive maps with a previously verified Source 2 Viewer CLI.

python scripts/launch/extract-native-maps.py
npx tsx scripts/launch/import-native-maps.ts

Raw resources stay under tmp; no installed game files are modified.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--maps', type=Path, default=Path(r'C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\maps'))
parser.add_argument('--cli', type=Path, default=Path('tmp/vrf-20/Source2Viewer-CLI.exe'))
args = parser.parse_args()
cli = args.cli.resolve()
if not cli.is_file():
    raise SystemExit('Install the verified Source 2 Viewer CLI first; see docs/MIRAGE-NATIVE-EXTRACTION.md')


def run(command):
    result = subprocess.run([str(arg) for arg in command], capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


for project in ['map-nav-importer', 'map-physics-importer']:
    run(['dotnet', 'build', f'scripts/{project}', '-c', 'Release', '--nologo'])
nav_tool = 'scripts/map-nav-importer/bin/Release/net10.0/MapNavImporter.dll'
physics_tool = 'scripts/map-physics-importer/bin/Release/net10.0/MapPhysicsImporter.dll'

for file in sorted(Path('public/map-studio/spatial').glob('*.json')):
    if file.stem == 'Mirage':
        continue  # Owner's v13 workflow remains separate and untouched.
    ref = json.loads(file.read_text(encoding='utf-8'))
    name = ref['sourceMap']
    vpk = args.maps / (name + '.vpk')
    out = Path('tmp/native-maps') / file.stem
    out.mkdir(parents=True, exist_ok=True)
    log = run([cli, '-i', vpk, '-o', out, '-f', f'maps/{name}/entities/,maps/{name}/world_physics.vmdl_c,maps/{name}.nav'])
    (out / 'extract.log').write_text(log, encoding='utf-8')
    target_count = 0
    for ent in sorted((out / 'maps' / name / 'entities').glob('*.vents_c')):
        text = run([cli, '-i', ent, '-b', 'DATA'])
        (out / (ent.stem + '.txt')).write_text(text, encoding='utf-8')
        for block in re.findall(r'values\s*=\s*\{([^{}]*)\}', text):
            if 'classname = "func_bomb_target"' not in block:
                continue
            designation = re.search(r'bomb_site_designation\s*=\s*"([01])"', block)
            model = re.search(r'model\s*=\s*resource_name:"([^"]+)"', block)
            if not designation or not model or not model[1].startswith(f'maps/{name}/entities/') or '..' in model[1]:
                raise RuntimeError('Unexpected bomb target model or designation')
            site = 'A' if designation[1] == '0' else 'B'
            run(['dotnet', physics_tool, out / (model[1] + '_c'), out / (site + '.json')])
            target_count += 1
    if target_count != 2:
        raise RuntimeError(f'{file.stem}: expected two native bomb targets')
    run(['dotnet', nav_tool, out / 'maps' / (name + '.nav'), out / 'nav.json'])
    run(['dotnet', physics_tool, out / 'maps' / name / 'world_physics.vmdl_c', out / 'world.json'])
    (out / 'extraction.json').write_text(json.dumps({'vpk': vpk.name, 'vpkSha256': sha(vpk), 'tool': 'Source 2 Viewer CLI', 'toolSha256': sha(cli)}, indent=2) + '\n', encoding='utf-8')
    print(f'{file.stem}: extracted navigation, team spawns, A/B trigger models and world physics', flush=True)
