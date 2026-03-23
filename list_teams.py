import json

try:
    with open('public/data/snapshot/teams.json', 'r', encoding='utf-8') as f:
        teams = json.load(f)
        for t in teams:
            print(f"{t['name']} ({t['id']})")
except Exception as e:
    print(e)
