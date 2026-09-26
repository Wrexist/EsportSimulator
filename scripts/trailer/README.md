# Steam trailer pipeline

Records real gameplay from a fresh career and cuts it to a beat-synced trailer.
No dev tools, no injected values: the recorder plays the game through its UI.

## 1. Record

```bash
PORT=3001 npm run dev
node scripts/trailer/record-trailer.cjs
```

- Output: `tmp/trailer/clips/*.mp4` (1080p, real frame timing) and `tmp/trailer/stills/*.png`.
- `TRAILER_ONLY=18,19,2` re-records only some scenes (prefix match). The career
  start always runs.
- The match is steered to **Sandstone** by the manual veto. If the AI bans it,
  the recorder plays that match out fast and vetoes again on the next match day. Other
  pool maps carry Valve map names and radars.
- After round 1 the recorder calls one buy, then turns on AUTO TACTICS so the
  match plays out to the result screen.

## 2. Cut

```bash
node scripts/trailer/cut-trailer.cjs                      # placeholder beat
MUSIC=path/to/licensed.wav MUSIC_OFFSET=0 node scripts/trailer/cut-trailer.cjs
```

- Edit list: `edl.json`. Lengths are in **beats** at `bpm`, so every cut lands
  on the music. Pick a licensed track at the same BPM (or change `bpm`).
- Per segment: a source (`clip` + `in`, `card` + optional blurred `bg`, or
  `grid` of four clips), `zoom` [start, end] + `focus` [x, y] 0..1, `punch`
  (quick zoom that lands on the cut), `overlays` (3D alpha sequences from
  `tmp/trailer/3d/<seq>/frames`), `logo`, `flash`, `fadeOut`, `text`.
- 3D assets: scenes in `design/trailer-3d/*.scene.js`, rendered with the
  3d-asset-studio skill (`render.mjs <scene> --gpu --out tmp/trailer/3d/<name>`).
- Output: `tmp/trailer/esports-manager-trailer-steam.mp4` — H.264 High, 1080p60,
  24 Mbps, AAC 320k, faststart. Upload that file to Steamworks.

## Keep out of frame

- Veto screen and any map other than Sandstone (Valve map names/art).
- World rankings list: several org names are close to real teams.
- AI key art — Steam trailers should be gameplay; the logo end card is fine.
