import json

file_path = 'public/data/snapshot/players.json'

def fix_data():
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            players = json.load(f)
            
        count = 0
        apex_fixed = False
        
        for p in players:
            # 1. Fix apEX specifically
            if p['id'] == 'player_1_apex':
                p['tier'] = 'ELITE' # User said Veteran/High tier
                p['role'] = 'IGL'
                p['skill'] = 75 # Boost skill a bit if he was amateur?
                apex_fixed = True
                
            # 2. General Role Cleanup / Priority
            role = p.get('role', '')
            
            # If contains IGL, just make them IGL (primary role)
            if 'IGL' in role:
                if role != 'IGL':
                    p['role'] = 'IGL'
                    count += 1
            # Else if contains AWPer, make them AWPer
            elif 'AWPer' in role:
                if role != 'AWPer':
                    p['role'] = 'AWPer'
                    count += 1
            # Else if contains Rifler and something else (but not IGL/AWP)
            elif 'Rifler' in role and '&' in role:
                 # e.g. "Entry & Rifler" -> Keep as is? Or simplify?
                 # User complaint was specifically about IGL redundancy.
                 # Let's leave others for now unless they are "Unknown"
                 pass
                 
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(players, f, indent=2)
            
        print(f"Fixed apEX: {apex_fixed}")
        print(f"Simplified roles for {count} players.")

    except Exception as e:
        print(f"Error: {e}")

fix_data()
