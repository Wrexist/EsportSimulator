/**
 * Procedural SVG portrait generator for fictional players.
 *
 * Produces a stylized silhouette seeded by player id. Deterministic and pure —
 * runs in Node at sanitize time and writes .svg files that drop into the same
 * <img src={portraitPath}> sites the game already uses.
 *
 * Design: geometric silhouette (head + shoulders) with palette variation.
 * No face detail, no resemblance to any real person.
 */

function fnv1aHash(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

const BG_PALETTES: Array<[string, string]> = [
    ["#0F172A", "#1E293B"],
    ["#1E1B4B", "#312E81"],
    ["#052E16", "#14532D"],
    ["#450A0A", "#7F1D1D"],
    ["#422006", "#78350F"],
    ["#2E1065", "#5B21B6"],
    ["#042F2E", "#134E4A"],
    ["#1F2937", "#374151"],
]

const SKIN_TONES = ["#3A2A1F", "#6B4423", "#8D5524", "#B07A4D", "#C68B5F", "#D4A373", "#E5B888", "#F1C9A5"]
const HAIR_COLORS = ["#0B0B0B", "#2B2420", "#3D2B1F", "#5C3A1E", "#7A4B1F", "#A66A3A", "#C89B5B", "#E1C07E", "#B04A3C", "#5B3E86"]

type Hairstyle = "short" | "buzz" | "long" | "cap" | "mohawk" | "hoodie"
const HAIRSTYLES: Hairstyle[] = ["short", "buzz", "long", "cap", "mohawk", "hoodie"]

function renderHair(style: Hairstyle, color: string): string {
    switch (style) {
        case "short":
            return `<path d="M64 100 Q64 56 128 56 Q192 56 192 100 L192 124 Q180 100 128 100 Q76 100 64 124 Z" fill="${color}"/>`
        case "buzz":
            return `<path d="M72 104 Q72 68 128 68 Q184 68 184 104 L184 116 Q184 100 128 100 Q72 100 72 116 Z" fill="${color}" opacity="0.85"/>`
        case "long":
            return `<path d="M60 104 Q60 52 128 52 Q196 52 196 104 L196 164 Q188 132 176 132 L176 176 L80 176 L80 132 Q68 132 60 164 Z" fill="${color}"/>`
        case "cap":
            return `<rect x="60" y="76" width="136" height="36" rx="8" fill="${color}"/>
                    <rect x="56" y="104" width="150" height="12" rx="4" fill="${color}" opacity="0.85"/>`
        case "mohawk":
            return `<path d="M96 104 Q96 60 128 40 Q160 60 160 104 Z" fill="${color}"/>
                    <path d="M72 108 Q88 104 96 104 L96 120 Q84 120 72 124 Z" fill="${color}" opacity="0.75"/>
                    <path d="M184 108 Q168 104 160 104 L160 120 Q172 120 184 124 Z" fill="${color}" opacity="0.75"/>`
        case "hoodie":
            return `<path d="M40 152 Q40 76 128 76 Q216 76 216 152 L216 180 L40 180 Z" fill="${color}"/>`
    }
}

export function renderPortraitSVG(seed: string, nickname: string): string {
    const h = fnv1aHash(seed)
    const bg = BG_PALETTES[h % BG_PALETTES.length]
    const skin = SKIN_TONES[(h >> 3) % SKIN_TONES.length]
    const hairColor = HAIR_COLORS[(h >> 7) % HAIR_COLORS.length]
    const hairstyle = HAIRSTYLES[(h >> 11) % HAIRSTYLES.length]
    const shirt = BG_PALETTES[(h >> 17) % BG_PALETTES.length][1]

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${escapeAttr(nickname)} portrait">
  <defs>
    <linearGradient id="bg${h.toString(36)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/>
      <stop offset="1" stop-color="${bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg${h.toString(36)})"/>
  <!-- Shoulders / shirt -->
  <path d="M20 256 Q20 180 128 172 Q236 180 236 256 Z" fill="${shirt}"/>
  <!-- Neck -->
  <rect x="112" y="148" width="32" height="32" fill="${skin}"/>
  <!-- Head -->
  <ellipse cx="128" cy="128" rx="52" ry="58" fill="${skin}"/>
  <!-- Hair -->
  ${renderHair(hairstyle, hairColor)}
  <!-- Subtle shadow under chin -->
  <ellipse cx="128" cy="180" rx="28" ry="6" fill="#000" opacity="0.18"/>
</svg>
`
}

function escapeAttr(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}
