#!/bin/bash
f="$1"; id=$(basename "$f" .json.xz); sub=$(echo "$f" | cut -d/ -f2)
out=/home/claude/esta-work/compact/$id.json.gz
[ -s "$out" ] && exit 0
dir=$(mktemp -d /home/claude/esta-dl/d.XXXX)
for i in 1 2 3; do curl -sS -f -m 120 -o "$dir/x.json.xz" "https://raw.githubusercontent.com/pnxenopoulos/esta/main/$f" && break; sleep $((i*2)); done
python3 -I /home/claude/esta-work/scripts/extract.py "$dir/x.json.xz" "$sub" "$out.tmp" && mv "$out.tmp" "$out" || echo "FAIL $f" >> /home/claude/esta-work/fail.log
rm -rf "$dir"
