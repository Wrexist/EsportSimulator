"""Reproduce existing SVG bytes from local generators without modifying assets."""
import hashlib
import importlib.util
import inspect
import itertools
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
modules = []
for filename in ['generate_top30_logos.py', 'extend_branding_all.py']:
    source = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(source.stem, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    modules.append((source.relative_to(ROOT).as_posix(), module))

matched, unmatched = [], []
for asset in sorted((ROOT / 'public/assets/teams').glob('*/logo.svg')):
    content = asset.read_text(encoding='utf-8').strip()
    label = re.search(r'aria-label="([^"]*) logo"', content)
    colors = list(dict.fromkeys(re.findall(r'#[0-9A-Fa-f]{6}', content)))
    texts = re.findall(r'<text\b[^>]*>([^<]*)</text>', content)
    match = None
    if label and 1 <= len(colors) <= 6:
        for source, module in modules:
            for style, fn in module.GENERATORS.items():
                if match: break
                for palette in itertools.product(colors, repeat=3):
                    values = {'c': dict(zip(['primaryColor', 'secondaryColor', 'accentColor'], palette)),
                              'name': label.group(1), 'letter': texts[0] if texts else '', 'tag': texts[0] if texts else ''}
                    kwargs = {k: v for k, v in values.items() if k in inspect.signature(fn).parameters}
                    if fn(**kwargs).strip() == content:
                        match = {'generator': source, 'function': style, 'arguments': kwargs}
                        break
            if match: break
    record = {'path': asset.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(asset.read_bytes()).hexdigest()}
    if match: matched.append({**record, **match})
    else: unmatched.append(record)

report = {'method': 'Exact SVG reproduction using project generator functions, ignoring surrounding whitespace only; original file hashes recorded.',
          'limitations': ['Creation evidence, not trademark clearance. No source images or logos modified.'],
          'generators': [{'path': p, 'sha256': hashlib.sha256((ROOT / p).read_bytes()).hexdigest()} for p, _ in modules],
          'matched': matched, 'unmatched': unmatched}
output = ROOT / 'docs/launch-readiness/evidence/L31-VECTOR-CREATION-AUDIT.json'
output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'matched': len(matched), 'unmatched': len(unmatched)}))
