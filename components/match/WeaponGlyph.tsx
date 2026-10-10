import { cn } from "@/lib/utils"

type WeaponClass = "rifle" | "sniper" | "pistol" | "smg" | "shotgun" | "knife" | "utility"

const CLASS_BY_ID: Record<string, WeaponClass> = {
    ak47: "rifle", m4a1s: "rifle", m4a4: "rifle", m4a1: "rifle", famas: "rifle", galilar: "rifle", galil: "rifle", aug: "rifle", sg553: "rifle", sg556: "rifle",
    awp: "sniper", ssg08: "sniper", scout: "sniper", scar20: "sniper", g3sg1: "sniper",
    usp: "pistol", usps: "pistol", glock: "pistol", glock18: "pistol", p250: "pistol", deagle: "pistol", fiveseven: "pistol", dualies: "pistol", elite: "pistol", tec9: "pistol", cz75: "pistol", r8: "pistol", p2000: "pistol",
    mac10: "smg", mp9: "smg", mp7: "smg", mp5: "smg", mp5sd: "smg", p90: "smg", ump45: "smg", ump: "smg", bizon: "smg",
    xm1014: "shotgun", mag7: "shotgun", nova: "shotgun", sawedoff: "shotgun",
    knife: "knife",
    he: "utility", hegrenade: "utility", molotov: "utility", incgrenade: "utility", incendiary: "utility", grenade: "utility", flash: "utility", smoke: "utility",
}

const DISPLAY_NAME: Record<string, string> = {
    ak47: "AK-47", m4a1s: "M4A1-S", m4a1: "M4A1-S", m4a4: "M4A4", famas: "FAMAS", galilar: "Galil AR", galil: "Galil AR", aug: "AUG", sg553: "SG 553", sg556: "SG 553",
    awp: "AWP", ssg08: "SSG 08", scout: "SSG 08",
    usp: "USP-S", usps: "USP-S", glock: "Glock-18", glock18: "Glock-18", p250: "P250", deagle: "Desert Eagle", fiveseven: "Five-SeveN", dualies: "Dual Berettas", tec9: "Tec-9", cz75: "CZ75",
    mac10: "MAC-10", mp9: "MP9", mp7: "MP7", p90: "P90", ump45: "UMP-45",
    xm1014: "XM1014", mag7: "MAG-7", nova: "Nova",
    knife: "Knife", he: "HE grenade", hegrenade: "HE grenade", molotov: "Molotov", incgrenade: "Incendiary",
}

const normalize = (weapon: string | undefined) => (weapon || "").toLowerCase().replace(/[^a-z0-9]/g, "")

export function weaponDisplayName(weapon: string | undefined, fallback = ""): string {
    const id = normalize(weapon)
    if (!id) return fallback
    return DISPLAY_NAME[id] ?? weapon!.toUpperCase()
}

// Flat silhouettes on a 32×12 grid: readable at 12–16px tall, one colour.
const PATHS: Record<WeaponClass, string> = {
    rifle: "M1 4h21v-1h2v1h7v1.6h-6v1.4h-4l-1.4 4.2h-2.4l.9-4.2h-3.3l-.8 2.6h-2.1l.5-2.6h-4.4L4.5 9.5H1z",
    sniper: "M1 4.4h11V3h-1V1.6h7V3h-1v1.4h14.5v1.2H18v1.6h-3.2l-1 3.6h-2.2l.8-3.6H6L3.8 9.5H1z",
    pistol: "M8 2.5h16v3.2h-9.2l-1.4 5.8H9.6l1.3-5.8H8z",
    smg: "M3 3.5h20v-1h2v1h3v1.8h-5v2h-4.6l-.8 3.7h-2.2l.7-3.7H9.5l-.9 2.2H6.4l.8-2.2H3z",
    shotgun: "M1 4h29.5v1.4H15v1.3h-5.2l-.4 1.8H7.6L5 9.5H1z M16 5.4h7v1.6h-7z",
    knife: "M3 6.2c5-2.6 12-3.6 18-3.2l-1.5 3.2zM20.5 5.2h8.5v1.8h-8.5z",
    utility: "M12 3.5h6v1h1.5v1.5H18v4.5h-6zM13.5 1.5h3v2h-3z",
}

/** WeaponGlyph — a one-colour weapon-class silhouette (inherits currentColor). */
export function WeaponGlyph({ weapon, className, title }: { weapon: string | undefined; className?: string; title?: string }) {
    const id = normalize(weapon)
    const cls: WeaponClass = CLASS_BY_ID[id] ?? (id.includes("grenade") ? "utility" : "rifle")
    const name = title ?? weaponDisplayName(weapon, "Weapon")
    return (
        <svg viewBox="0 0 32 12" className={cn("h-3 w-8 shrink-0", className)} role="img" aria-label={name}>
            <title>{name}</title>
            <path d={PATHS[cls]} fill="currentColor" />
        </svg>
    )
}

/** Headshot marker: a small crosshair. */
export function HeadshotMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 12 12" className={cn("h-3 w-3 shrink-0", className)} role="img" aria-label="Headshot">
            <title>Headshot</title>
            <circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 .5v3M6 8.5v3M.5 6h3M8.5 6h3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    )
}
