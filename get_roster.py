import json

target_team_id = "team_1_vitality"

try:
    with open('public/data/snapshot/teams.json', 'r', encoding='utf-8') as f:
        teams = json.load(f)
        for t in teams:
            if t['id'] == target_team_id:
                print(f"Roster for {t['name']}:")
                for pid in t['rosterIds']:
                    print(pid)
except Exception as e:
    print(e)
