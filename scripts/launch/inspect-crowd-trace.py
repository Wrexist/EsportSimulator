import json
import sys
from pathlib import Path

for name in sys.argv[1:]:
    result = json.loads(Path(name).read_text())['result']
    blocked = [a for a in result['frames'][-1]['actors'] if a['intent'] == 'blocked']
    print(name)
    for actor in blocked:
        print({k: actor[k] for k in ['id', 'position', 'goal']})
        relevant = [e for e in result['events'] if e.get('actor') == actor['id'] and e['type'] in ['spacing-wait', 'route-blocked', 'spacing-yield']]
        print(json.dumps(relevant[-4:]))
