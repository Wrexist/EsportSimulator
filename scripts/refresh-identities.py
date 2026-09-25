"""Refresh stock display names from verified original-record correspondence; never change IDs or portraits."""
from pathlib import Path
import json, re
ROOT = Path(__file__).resolve().parents[1]
def read(p): return json.loads((ROOT / p).read_text(encoding="utf-8"))
def write(p, value): (ROOT / p).write_text(json.dumps(value, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
raw_players = read("raw-data/snapshot/players.json")
players = read("public/data/snapshot/players.json")
raw_teams = read("raw-data/snapshot/teams.json")
teams = read("public/data/snapshot/teams.json")
assert len(raw_players) == len(players), "Source correspondence changed; review before renaming"
prior_path = ROOT / "data/identity-refresh.json"
prior = json.loads(prior_path.read_text(encoding="utf-8")) if prior_path.exists() else {"players":{}, "teams":{}}
player_map = {}
raw_to_current = {}
fields = ["nationality", "skill", "awp", "rifle", "pistol", "potential"]
for source, current in zip(raw_players, players):
    assert all(source.get(k) == current.get(k) for k in fields), (source["id"], "fingerprint mismatch")
    assert source["id"].split("_")[1] == current["id"].split("_")[1], "Rank/source mismatch"
    assert max(16,source["age"]) == current["age"], "Unexpected age mismatch"
    raw_to_current[source["id"]] = current["id"]

PLAYER_NAMES = {
 "donk":"dunk", "d0nk":"dunk", "s1mple":"s1mplee", "zywoo":"Zywou", "m0nesy":"m0nesi",
 "niko":"Niku", "device":"devise", "ropz":"ropx", "apex":"apexx", "flamez":"flaymez", "mezii":"mezzi",
 "sh1ro":"sh1ru", "zont1x":"zontix", "chopper":"choppa", "magixx":"magix", "twhite":"twhyt",
 "b1t":"b1tt", "im":"iMM", "w0nderful":"w0nder", "aleksib":"AleksiV", "jl":"jLx",
 "karrigan":"karrigen", "frozen":"frozin", "broky":"broki", "rain":"rayn", "twistzz":"twistz",
 "fallen":"Fallenx", "kscerato":"KSCeratu", "yuurih":"yurih", "yekindar":"Yekinder", "molodoy":"molodoi",
 "xantares":"Xanteres", "woxic":"woxik", "elige":"Eliige", "naf":"NAFF", "jks":"jKz", "siuhy":"siuhi",
 "torzsi":"torzi", "xertion":"xertian", "brollan":"Brollen", "jimpphat":"Jimphat", "senzu":"Senzuu",
 "techno":"Technu", "blitz":"blitzz", "910":"911", "nertz":"Nertzz", "sunpayus":"SunPayos", "snax":"Snaxx",
}
TEAM_NAMES = {
 "vitality":"Vitalis", "furia":"Furiax", "falcons":"Falcone", "mouz":"Mouze", "spirit":"Spiryt",
 "parivision":"Paravision", "faze":"Phaze", "natus vincere":"Natus Vincera", "g2":"G3", "the mongolz":"The Mongalz",
 "aurora":"Auroria", "astralis":"Astralys", "3dmax":"3DMaxx", "fut":"Futura", "fut esports":"Futura Esports",
 "m80":"M81", "g2 ares":"G3 Ares",
 "100 thieves":"100 Rogues", "liquid":"Liquis", "team liquid":"Team Liquis", "b8":"B9", "pain":"payN",
 "nrg":"NRGX", "heroic":"Heroiq", "ence":"ENZE", "fnatic":"Fnatix", "big":"BIGG", "nip":"NYP",
 "ninjas in pyjamas":"Ninjas in Nightwear", "virtus.pro":"Virtus Nova", "mibr":"MIBRX", "tyloo":"TYLOU",
 "gamerlegion":"Gamer Legionnaires", "betboom":"BetBloom", "betboom team":"BetBloom Team", "monte":"Montra",
 "complexity":"Complexa", "eternal fire":"Eternal Flame", "cloud9":"CloudNineX", "flyquest":"FlyCrest",
 "imperial":"Imperia", "legacy":"Legacia", "9z":"9Zed", "9ine":"9Nine", "lynn vision":"Lynne Vision",
}
def gentle(name):
    # One audible vowel change keeps the name's shape and avoids random syllable handles.
    swaps = {"a":"e","e":"i","i":"y","o":"u","u":"o"}
    for i, char in enumerate(name):
        if char.lower() in swaps:
            replacement = swaps[char.lower()]
            return name[:i] + (replacement.upper() if char.isupper() else replacement) + name[i+1:]
    return name + "x"
def team_variant(name):
    lower=name.lower()
    if lower in TEAM_NAMES: return TEAM_NAMES[lower]
    for suffix in [" academy", " young blud", " force", " esports", " gaming"]:
        if lower.endswith(suffix) and lower[:-len(suffix)] in TEAM_NAMES:
            return TEAM_NAMES[lower[:-len(suffix)]]+name[-len(suffix):]
    return gentle(name)
def unique(name, used):
    base=name;number=2
    while name.casefold() in used:
        name=f"{base}{number}";number+=1
    used.add(name.casefold());return name
used=set()
for source, current in zip(raw_players,players):
    original=source.get("nickname") or source["name"]
    new=unique(PLAYER_NAMES.get(original.lower(),gentle(original)),used)
    assert new.casefold()!=original.casefold()
    old=prior["players"].get(current["id"],{}).get("before",[current.get("name"),current.get("nickname")])
    player_map[current["id"]]={"before":list(dict.fromkeys(x for x in old if x)),"name":new}
    current["name"]=current["nickname"]=new
team_map={};used=set();tags=set()
for current in teams:
    roster=set(current["rosterIds"])
    candidates=[t for t in raw_teams if {raw_to_current.get(i) for i in t.get("rosterIds",[])}==roster]
    assert len(candidates)==1,(current["id"],"Ambiguous source roster",len(candidates))
    original=candidates[0]["name"]
    name=unique(team_variant(original),used)
    tag_name = re.sub(r"^(The|Team) ", "", name)
    clean=re.sub(r"[^A-Za-z0-9]","",tag_name).upper()
    tag=clean[:3];n=2
    while tag in tags:tag=clean[:2]+str(n);n+=1
    tags.add(tag)
    old=prior["teams"].get(current["id"],{}).get("before",[current["name"]])
    old_tag=prior["teams"].get(current["id"],{}).get("previousTag",current.get("shortName"))
    team_map[current["id"]]={"before":old,"name":name,"shortName":tag,"previousTag":old_tag}
    current["name"]=name;current["shortName"]=tag
manifest={"version":1,"players":player_map,"teams":team_map}
backup=ROOT/"tmp/identity-refresh-original"
backup.mkdir(parents=True,exist_ok=True)
for kind in ["players","teams"]:
    target=backup/(kind+".json")
    if not target.exists():target.write_bytes((ROOT/f"public/data/snapshot/{kind}.json").read_bytes())
write("public/data/snapshot/players.json",players)
write("public/data/snapshot/teams.json",teams)
write("data/identity-refresh.json",manifest)
print(f"Refreshed {len(players)} player handles and {len(teams)} club names; IDs, rosters, stats and portrait paths preserved.")
print([(t["name"],t["shortName"]) for t in teams[:10]])
print(player_map["player_5_phantom_donc"])
