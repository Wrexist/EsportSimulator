export const COLOR_VISION_MODES = ['off', 'colorblind-deuteranopia', 'colorblind-protanopia', 'colorblind-tritanopia', 'high-contrast'] as const
export type ColorVisionMode = typeof COLOR_VISION_MODES[number]
export function normalizeColorVision(value: unknown): ColorVisionMode {
    return COLOR_VISION_MODES.includes(value as ColorVisionMode) ? value as ColorVisionMode : 'off'
}
export const SUPPORTED_UI_LANGUAGE = 'en' as const
