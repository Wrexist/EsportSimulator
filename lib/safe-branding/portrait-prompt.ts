/**
 * Build the Replicate prompt for a Pixar-style portrait.
 *
 * The prompt is derived purely from `PortraitFeatures` so the same player id
 * always produces the same prompt. Combined with a deterministic seed in the
 * bake script, that means re-running `bake:portraits` regenerates byte-similar
 * output (modulo upstream model nondeterminism).
 *
 * Used by scripts/bake-portraits.ts in img2img mode — the source webp photo
 * carries likeness, so this prompt only steers *style*, not identity.
 */

import type { PortraitFeatures } from "./portrait-features"

// "Pure plain white background, isolated subject" gives the downstream
// background-removal step a much cleaner mask than a textured studio bg.
const STYLE_HEAD =
    "Pixar 3D animated character render, esports professional gamer, " +
    "stylized friendly face, big expressive eyes, soft skin highlights, " +
    "detailed hair strands, soft even studio lighting, " +
    "pure plain white background, isolated subject, no scenery, " +
    "high quality 3D render, headshot framing centered"

function describeAccessory(acc: PortraitFeatures["accessory"]): string {
    switch (acc) {
        case "headset": return "wearing oversized gaming headphones around neck"
        case "glasses": return "wearing thin-rimmed prescription glasses"
        case "sunglasses": return "wearing modern sunglasses"
        case "headband": return "wearing a colorful athletic headband"
        case "earbud": return "wearing wireless earbuds"
        case "eyepatch": return "wearing a stylish eye patch"
        case "none":
        default: return ""
    }
}

function describeFacialHair(f: PortraitFeatures["facialHair"]): string {
    switch (f) {
        case "stubble": return "light stubble"
        case "goatee": return "a small goatee"
        case "mustache": return "a neat mustache"
        case "beard": return "a full short beard"
        case "clean":
        default: return "clean shaven"
    }
}

function describeMouth(m: PortraitFeatures["mouthStyle"]): string {
    switch (m) {
        case "smirk": return "confident smirk"
        case "smile": return "warm friendly smile"
        case "neutral": return "calm focused expression"
        case "grimace": return "intense competitive grin showing teeth"
        case "line":
        default: return "neutral relaxed mouth"
    }
}

/**
 * Tone-and-feature steering text. Used as the `prompt` for Flux Kontext img2img
 * — the photo provides the likeness, this guides style + minor accents.
 */
export function buildPortraitPrompt(features: PortraitFeatures): string {
    const fragments = [
        STYLE_HEAD,
        describeMouth(features.mouthStyle),
        describeFacialHair(features.facialHair),
        describeAccessory(features.accessory),
        "wearing a dark esports jersey or hoodie",
        "no logos, no text, no watermark",
    ].filter(Boolean)

    return fragments.join(", ")
}

/**
 * The instruction we give Flux Kontext alongside the source photo. The
 * "transform into" framing is what gets Kontext to keep the subject's identity
 * while changing the rendering style.
 */
export function buildKontextPrompt(features: PortraitFeatures): string {
    return (
        "Transform this photo into a " +
        buildPortraitPrompt(features) +
        ". Keep the same person's face shape, hair color, skin tone, and gender, " +
        "but render in 3D animated Pixar style."
    )
}
