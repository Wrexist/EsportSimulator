/**
 * Procedural SVG portrait generator for fictional players.
 *
 * Deterministic and pure: same seed always produces the same SVG. Runs in Node
 * at sanitize time and writes .svg files that drop into the same
 * <img src={portraitPath}> sites the game already uses.
 *
 * Stylized geometric features only — no real-person resemblance. The feature
 * picker lives in `./portrait-features` so the live 3D portrait component can
 * reuse the exact same hash → person mapping.
 */

import {
    derivePortraitFeatures,
    type FacialHair,
    type Hairstyle,
    type HeadShape,
    type EyeStyle,
    type BrowStyle,
    type MouthStyle,
    type Accessory,
} from "./portrait-features"

const HEAD_PROPS: Record<HeadShape, { rx: number; ry: number }> = {
    round: { rx: 52, ry: 54 },
    oval: { rx: 50, ry: 60 },
    tall: { rx: 46, ry: 62 },
    wide: { rx: 58, ry: 52 },
    square: { rx: 54, ry: 56 },
}

function renderHead(shape: HeadShape, skin: string): string {
    const { rx, ry } = HEAD_PROPS[shape]
    if (shape === "square") {
        return `<rect x="${128 - rx}" y="${128 - ry}" width="${rx * 2}" height="${ry * 2}" rx="22" fill="${skin}"/>`
    }
    return `<ellipse cx="128" cy="128" rx="${rx}" ry="${ry}" fill="${skin}"/>`
}

function renderEar(skin: string): string {
    return `<ellipse cx="74" cy="132" rx="6" ry="9" fill="${skin}"/>
            <ellipse cx="182" cy="132" rx="6" ry="9" fill="${skin}"/>`
}

function renderHair(style: Hairstyle, color: string): string {
    switch (style) {
        case "bald":
            return ""
        case "buzz":
            return `<path d="M76 110 Q76 78 128 78 Q180 78 180 110 L180 120 Q156 102 128 102 Q100 102 76 120 Z" fill="${color}" opacity="0.85"/>`
        case "short":
            return `<path d="M68 108 Q68 60 128 60 Q188 60 188 108 L188 124 Q176 100 128 100 Q80 100 68 124 Z" fill="${color}"/>`
        case "side":
            return `<path d="M70 110 Q70 60 132 60 Q190 60 190 110 L190 122 Q170 98 132 96 L116 84 Q88 92 70 122 Z" fill="${color}"/>`
        case "curly":
            return `<path d="M64 116 Q64 56 128 56 Q192 56 192 116 Q192 128 184 128 Q186 110 172 100 Q160 122 144 110 Q140 124 124 110 Q116 124 100 110 Q88 122 76 100 Q70 110 72 128 Q64 128 64 116 Z" fill="${color}"/>`
        case "long":
            return `<path d="M58 108 Q58 50 128 50 Q198 50 198 108 L198 168 Q190 138 178 138 L178 188 L78 188 L78 138 Q66 138 58 168 Z" fill="${color}"/>`
        case "ponytail":
            return `<path d="M68 108 Q68 58 128 58 Q188 58 188 108 L188 124 Q172 100 128 100 Q84 100 68 124 Z" fill="${color}"/>
                    <path d="M188 116 Q210 132 206 168 Q200 188 184 184 Q184 156 184 132 Z" fill="${color}" opacity="0.95"/>`
        case "manbun":
            return `<path d="M70 110 Q70 60 128 60 Q186 60 186 110 L186 122 Q172 100 128 100 Q84 100 70 122 Z" fill="${color}"/>
                    <circle cx="128" cy="48" r="14" fill="${color}"/>
                    <circle cx="128" cy="48" r="10" fill="${color}" opacity="0.7"/>`
        case "mohawk":
            return `<path d="M118 100 Q118 56 128 36 Q138 56 138 100 Z" fill="${color}"/>
                    <path d="M76 116 Q98 110 118 110 L118 124 Q100 120 76 124 Z" fill="${color}" opacity="0.55"/>
                    <path d="M180 116 Q158 110 138 110 L138 124 Q156 120 180 124 Z" fill="${color}" opacity="0.55"/>`
        case "spike":
            return `<path d="M76 112 Q76 78 128 78 Q180 78 180 112 L180 120 Q172 110 128 110 Q84 110 76 120 Z" fill="${color}" opacity="0.85"/>
                    <path d="M86 84 L96 110 L82 110 Z" fill="${color}"/>
                    <path d="M108 70 L118 110 L100 110 Z" fill="${color}"/>
                    <path d="M128 64 L138 110 L120 110 Z" fill="${color}"/>
                    <path d="M148 70 L158 110 L140 110 Z" fill="${color}"/>
                    <path d="M170 84 L176 110 L160 110 Z" fill="${color}"/>`
        case "undercut":
            return `<path d="M70 112 Q70 60 128 60 Q186 60 186 112 L186 116 L160 116 Q160 102 128 102 Q96 102 96 116 L70 116 Z" fill="${color}"/>`
        case "dreads":
            return `<path d="M68 110 Q68 56 128 56 Q188 56 188 110 L188 122 Q176 102 128 102 Q80 102 68 122 Z" fill="${color}"/>
                    <rect x="64" y="118" width="8" height="38" rx="4" fill="${color}"/>
                    <rect x="80" y="120" width="8" height="44" rx="4" fill="${color}"/>
                    <rect x="96" y="118" width="8" height="38" rx="4" fill="${color}" opacity="0.9"/>
                    <rect x="152" y="118" width="8" height="38" rx="4" fill="${color}" opacity="0.9"/>
                    <rect x="168" y="120" width="8" height="44" rx="4" fill="${color}"/>
                    <rect x="184" y="118" width="8" height="38" rx="4" fill="${color}"/>`
        case "cap":
            return `<path d="M68 108 Q68 76 128 76 Q188 76 188 108 L188 116 L68 116 Z" fill="${color}"/>
                    <rect x="60" y="112" width="158" height="10" rx="3" fill="${color}" opacity="0.9"/>
                    <rect x="118" y="86" width="20" height="8" rx="2" fill="#FFFFFF" opacity="0.18"/>`
        case "beanie":
            return `<path d="M64 110 Q64 64 128 64 Q192 64 192 110 L192 122 L64 122 Z" fill="${color}"/>
                    <rect x="60" y="118" width="136" height="12" rx="3" fill="${color}" opacity="0.78"/>
                    <circle cx="128" cy="58" r="9" fill="${color}" opacity="0.85"/>`
        case "hoodie":
            return `<path d="M40 152 Q40 76 128 76 Q216 76 216 152 L216 180 L40 180 Z" fill="${color}"/>`
    }
}

function renderEyebrows(style: BrowStyle, color: string): string {
    switch (style) {
        case "flat":
            return `<rect x="98" y="116" width="20" height="3" rx="1.5" fill="${color}"/>
                    <rect x="138" y="116" width="20" height="3" rx="1.5" fill="${color}"/>`
        case "raised":
            return `<path d="M98 116 Q108 110 118 116" stroke="${color}" stroke-width="3" stroke-linecap="round" fill="none"/>
                    <path d="M138 116 Q148 110 158 116" stroke="${color}" stroke-width="3" stroke-linecap="round" fill="none"/>`
        case "stern":
            return `<path d="M98 119 L120 114" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
                    <path d="M158 119 L136 114" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`
        case "thin":
            return `<rect x="100" y="117" width="18" height="1.6" rx="0.8" fill="${color}" opacity="0.8"/>
                    <rect x="138" y="117" width="18" height="1.6" rx="0.8" fill="${color}" opacity="0.8"/>`
    }
}

function renderEyes(style: EyeStyle, eyeColor: string): string {
    const EYE_WHITE = "#F1F5F9"
    switch (style) {
        case "dot":
            return `<circle cx="108" cy="132" r="3" fill="${eyeColor}"/>
                    <circle cx="148" cy="132" r="3" fill="${eyeColor}"/>`
        case "almond":
            return `<ellipse cx="108" cy="132" rx="7" ry="4" fill="${EYE_WHITE}"/>
                    <ellipse cx="148" cy="132" rx="7" ry="4" fill="${EYE_WHITE}"/>
                    <circle cx="108" cy="132" r="2.6" fill="${eyeColor}"/>
                    <circle cx="148" cy="132" r="2.6" fill="${eyeColor}"/>`
        case "narrow":
            return `<ellipse cx="108" cy="132" rx="7" ry="2" fill="${EYE_WHITE}"/>
                    <ellipse cx="148" cy="132" rx="7" ry="2" fill="${EYE_WHITE}"/>
                    <circle cx="108" cy="132" r="1.8" fill="${eyeColor}"/>
                    <circle cx="148" cy="132" r="1.8" fill="${eyeColor}"/>`
        case "wide":
            return `<ellipse cx="108" cy="132" rx="6" ry="5" fill="${EYE_WHITE}"/>
                    <ellipse cx="148" cy="132" rx="6" ry="5" fill="${EYE_WHITE}"/>
                    <circle cx="108" cy="132" r="2.8" fill="${eyeColor}"/>
                    <circle cx="148" cy="132" r="2.8" fill="${eyeColor}"/>
                    <circle cx="109" cy="131" r="0.9" fill="#FFFFFF"/>
                    <circle cx="149" cy="131" r="0.9" fill="#FFFFFF"/>`
        case "closed":
            return `<path d="M101 132 Q108 135 115 132" stroke="${eyeColor}" stroke-width="2" stroke-linecap="round" fill="none"/>
                    <path d="M141 132 Q148 135 155 132" stroke="${eyeColor}" stroke-width="2" stroke-linecap="round" fill="none"/>`
    }
}

function renderNose(): string {
    return `<path d="M126 152 Q128 156 130 152" stroke="#000" stroke-width="1" stroke-linecap="round" opacity="0.18" fill="none"/>`
}

function renderMouth(style: MouthStyle): string {
    switch (style) {
        case "line":
            return `<rect x="118" y="166" width="20" height="2" rx="1" fill="#3A1F1A" opacity="0.85"/>`
        case "smirk":
            return `<path d="M118 166 Q128 170 142 164" stroke="#3A1F1A" stroke-width="2" stroke-linecap="round" fill="none"/>`
        case "smile":
            return `<path d="M116 164 Q128 174 140 164" stroke="#3A1F1A" stroke-width="2.2" stroke-linecap="round" fill="none"/>`
        case "neutral":
            return `<ellipse cx="128" cy="167" rx="9" ry="3" fill="#2A140F" opacity="0.85"/>
                    <rect x="119" y="167" width="18" height="1" fill="#FFFFFF" opacity="0.12"/>`
        case "grimace":
            return `<rect x="118" y="164" width="20" height="5" rx="1.5" fill="#2A140F"/>
                    <rect x="120" y="165" width="3" height="3" fill="#FFFFFF" opacity="0.8"/>
                    <rect x="125" y="165" width="3" height="3" fill="#FFFFFF" opacity="0.8"/>
                    <rect x="130" y="165" width="3" height="3" fill="#FFFFFF" opacity="0.8"/>
                    <rect x="135" y="165" width="3" height="3" fill="#FFFFFF" opacity="0.8"/>`
    }
}

function renderFacialHair(style: FacialHair, color: string): string {
    switch (style) {
        case "clean":
            return ""
        case "stubble":
            return `<ellipse cx="128" cy="170" rx="36" ry="12" fill="${color}" opacity="0.18"/>`
        case "goatee":
            return `<path d="M118 172 Q128 192 138 172 L136 178 Q128 188 120 178 Z" fill="${color}"/>`
        case "mustache":
            return `<path d="M110 162 Q128 154 146 162 L142 166 Q128 160 114 166 Z" fill="${color}"/>`
        case "beard":
            return `<path d="M82 152 Q82 196 128 196 Q174 196 174 152 Q170 184 128 188 Q86 184 82 152 Z" fill="${color}"/>
                    <path d="M110 162 Q128 156 146 162 L142 166 Q128 160 114 166 Z" fill="${color}"/>`
    }
}

function renderAccessory(acc: Accessory, accentColor: string): string {
    const EYE_WHITE = "#F1F5F9"
    switch (acc) {
        case "none":
            return ""
        case "headset":
            return `<path d="M62 124 Q62 76 128 76 Q194 76 194 124" stroke="#0F1116" stroke-width="6" fill="none" stroke-linecap="round"/>
                    <rect x="56" y="120" width="14" height="22" rx="5" fill="#0F1116"/>
                    <rect x="186" y="120" width="14" height="22" rx="5" fill="#0F1116"/>
                    <rect x="58" y="124" width="10" height="14" rx="3" fill="${accentColor}" opacity="0.95"/>
                    <rect x="188" y="124" width="10" height="14" rx="3" fill="${accentColor}" opacity="0.95"/>
                    <path d="M194 138 Q210 162 196 188" stroke="#0F1116" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <circle cx="196" cy="190" r="4" fill="#0F1116"/>`
        case "glasses":
            return `<rect x="92" y="124" width="32" height="18" rx="5" stroke="#0F1116" stroke-width="2.5" fill="${EYE_WHITE}" fill-opacity="0.06"/>
                    <rect x="132" y="124" width="32" height="18" rx="5" stroke="#0F1116" stroke-width="2.5" fill="${EYE_WHITE}" fill-opacity="0.06"/>
                    <line x1="124" y1="132" x2="132" y2="132" stroke="#0F1116" stroke-width="2.5"/>`
        case "sunglasses":
            return `<rect x="90" y="124" width="34" height="18" rx="6" fill="#0F1116"/>
                    <rect x="132" y="124" width="34" height="18" rx="6" fill="#0F1116"/>
                    <line x1="124" y1="132" x2="132" y2="132" stroke="#0F1116" stroke-width="3"/>
                    <rect x="94" y="126" width="6" height="3" rx="1" fill="${accentColor}" opacity="0.6"/>
                    <rect x="136" y="126" width="6" height="3" rx="1" fill="${accentColor}" opacity="0.6"/>`
        case "headband":
            return `<rect x="60" y="106" width="136" height="12" rx="3" fill="${accentColor}"/>
                    <rect x="60" y="110" width="136" height="3" rx="1" fill="#FFFFFF" opacity="0.18"/>`
        case "earbud":
            return `<circle cx="74" cy="138" r="5" fill="#0F1116"/>
                    <circle cx="182" cy="138" r="5" fill="#0F1116"/>
                    <rect x="72" y="142" width="4" height="6" rx="1.5" fill="#0F1116"/>
                    <rect x="180" y="142" width="4" height="6" rx="1.5" fill="#0F1116"/>`
        case "eyepatch":
            return `<rect x="100" y="124" width="24" height="18" rx="3" fill="#0F1116"/>
                    <line x1="100" y1="126" x2="80" y2="118" stroke="#0F1116" stroke-width="2"/>
                    <line x1="124" y1="126" x2="180" y2="118" stroke="#0F1116" stroke-width="2"/>`
    }
}

export function renderPortraitSVG(seed: string, nickname: string): string {
    const f = derivePortraitFeatures(seed)
    const gradId = `bg${f.seed.toString(36)}`

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${escapeAttr(nickname)} portrait">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${f.bg[0]}"/>
      <stop offset="1" stop-color="${f.bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#${gradId})"/>
  <!-- Shoulders / shirt -->
  <path d="M16 256 Q16 178 128 170 Q240 178 240 256 Z" fill="${f.shirt}"/>
  <path d="M16 256 Q16 178 128 170 Q240 178 240 256 Z" fill="#FFFFFF" opacity="0.04"/>
  <!-- Neck -->
  <rect x="114" y="150" width="28" height="28" fill="${f.skin}"/>
  <rect x="114" y="174" width="28" height="6" fill="#000" opacity="0.18"/>
  <!-- Head + ears -->
  ${renderEar(f.skin)}
  ${renderHead(f.headShape, f.skin)}
  <!-- Face features -->
  ${renderEyebrows(f.browStyle, f.browColor)}
  ${renderEyes(f.eyeStyle, f.eyeColor)}
  ${renderNose()}
  ${renderMouth(f.mouthStyle)}
  ${renderFacialHair(f.facialHair, f.facialHairColor)}
  <!-- Hair / headwear -->
  ${renderHair(f.hairstyle, f.hairColor)}
  <!-- Accessory layer -->
  ${renderAccessory(f.accessory, f.accent)}
  <!-- Subtle chin shadow -->
  <ellipse cx="128" cy="184" rx="30" ry="6" fill="#000" opacity="0.16"/>
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
