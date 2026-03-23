import pandas as pd
import requests
from bs4 import BeautifulSoup
import time
import os
import random

# ==============================
# CONFIG
# ==============================

# Paths relative to where the script is run (assuming root of project)
# Or use absolute paths based on __file__
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_EXCEL = os.path.join(SCRIPT_DIR, "Thunderbit_901eab_20260102_041423.xlsx")
OUTPUT_FILE = os.path.join(process.cwd(), "public", "players_rating3_output.csv") if 'process' in globals() else "public/players_rating3_output.csv" 
# Fixed output path to be safe
OUTPUT_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), "public", "players_rating3_output.csv")

PROFILE_COLUMNS = [
    "player 1 Profile link",
    "player 2 profile link",
    "player 3 profile link",
    "player 4 profile link",
    "player 5 profile link",
]

# Real browser headers to avoid blocking
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.hltv.org/",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache"
}


# ==============================
# SCRAPER FUNCTION
# ==============================

def extract_player_stats(profile_url):
    retries = 3
    for attempt in range(retries):
        try:
            r = requests.get(profile_url, headers=HEADERS, timeout=15)
            
            if r.status_code == 429 or r.status_code == 503:
                wait = (attempt + 1) * 60
                print(f"   [!] Rate Limited ({r.status_code}). Waiting {wait}s...")
                time.sleep(wait)
                continue
                
            if r.status_code != 200:
                print(f"   [!] Status {r.status_code}")
                return None
                
            break
        except Exception as e:
            print(f"   [!] Error: {e}")
            time.sleep(5)
            if attempt == retries - 1:
                return None

    soup = BeautifulSoup(r.text, "lxml")

    data = {
        "player_name": None,
        "age": None,
        "rating_3": None,
        "firepower": None,
        "entrying": None,
        "trading": None,
        "opening": None,
        "clutching": None,
        "sniping": None,
        "utility": None,
    }

    # --- Player name ---
    name_tag = soup.select_one("h1.playerNickname")
    if name_tag:
        data["player_name"] = name_tag.text.strip()

    # --- Age ---
    # Usually: <span class="listRight"><span class="listRight">29 years</span></span> OR similar
    # Text search might be safer
    age_span = soup.find("span", string="Age")
    if age_span:
        # The age number is usually in the next sibling or parent's other text
        # Try finding the sibling with class listRight
        age_val_span = age_span.find_next("span", class_="listRight")
        if age_val_span:
             data["age"] = age_val_span.text.strip().split()[0] # "24 years" -> "24"
    
    if not data["age"]:
         # Fallback regex
         import re
         age_match = re.search(r'(\d+) years', soup.text)
         if age_match:
             data["age"] = age_match.group(1)

    # --- Stats (Spider Graph) ---
    # These are usually in: div.playerpage-container-attributes -> div.player-stat
    stat_blocks = soup.select("div.playerpage-container-attributes div.player-stat")

    for block in stat_blocks:
        label_tag = block.find("b")
        value_tag = block.select_one("span.statsVal p")

        if not label_tag or not value_tag:
            continue

        label = label_tag.text.strip()
        value = value_tag.text.strip().replace("/100", "")

        key_map = {
            "Rating 3.0": "rating_3",
            "Firepower": "firepower",
            "Entrying": "entrying",
            "Trading": "trading",
            "Opening": "opening",
            "Clutching": "clutching",
            "Sniping": "sniping",
            "Utility": "utility"
        }
        
        if label in key_map:
            data[key_map[label]] = value

    return data


# ==============================
# MAIN
# ==============================

def main():
    print(f"Reading input: {INPUT_EXCEL}")
    if not os.path.exists(INPUT_EXCEL):
        print(f"Error: Input file not found at {INPUT_EXCEL}")
        return

    df = pd.read_excel(INPUT_EXCEL)
    results = []

    total_rows = len(df)
    processed = 0

    print("Starting scraping... Press Ctrl+C to stop.")

    try:
        for idx, row in df.iterrows():
            # Check all profile columns
            for col in PROFILE_COLUMNS:
                url = row.get(col)

                if not isinstance(url, str) or "hltv.org/player" not in url:
                    continue

                processed += 1
                print(f"[{processed}/{total_rows*5}] Scraping: {url.split('/')[-1]} ... ", end="", flush=True)

                stats = extract_player_stats(url)

                if stats:
                    print(f"✓ (R: {stats['rating_3']}, F: {stats['firepower']})")
                    row_data = {
                        "profile_url": url,
                        **stats
                    }
                    results.append(row_data)
                else:
                    print("✗ (Failed/No Data)")

                # Save periodically
                if len(results) % 5 == 0:
                    pd.DataFrame(results).to_csv(OUTPUT_FILE, index=False)

                # Random delay 2-5s to avoid detection
                time.sleep(random.uniform(2.0, 5.0))
                
    except KeyboardInterrupt:
        print("\nStopping...")
    except Exception as e:
        print(f"\nError: {e}")
    finally:
        if results:
            out_df = pd.DataFrame(results)
            out_df.to_csv(OUTPUT_FILE, index=False)
            print(f"\n✅ DONE — Saved {len(results)} rows to: {OUTPUT_FILE}")
        else:
            print("\nNo data collected.")


# ==============================
# RUN
# ==============================

if __name__ == "__main__":
    main()
