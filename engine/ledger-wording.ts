/**
 * Player-facing wording for finance-ledger rows written by the engine for
 * clubs the manager does not run. Those rows become visible in Finances
 * once the manager takes over the club (job offer, pro-career move), so
 * they read like the manager's own rows: no "AI", no raw enum values.
 */

const FACILITY_LABELS: Record<string, string> = {
    TRAINING: "training",
    RECOVERY: "recovery",
    TACTICAL: "tactical",
    FANZONE: "fan zone",
}

/** "training facility", "fan zone facility", … */
export function facilityLabel(type: string): string {
    return `${FACILITY_LABELS[type] ?? type.toLowerCase().replace(/_/g, " ")} facility`
}

/** Stored description of a facility another club built: "Training facility". */
export function builtFacilityDescription(type: string): string {
    const label = facilityLabel(type)
    return label.charAt(0).toUpperCase() + label.slice(1)
}

export const ledgerText = {
    hiredStaff: (name: string, role: string) => `Hired ${name} (${role})`,
    builtFacility: (type: string) => `Built ${facilityLabel(type)}`,
    upgradedFacility: (type: string, level: number) => `Upgraded ${facilityLabel(type)} to level ${level}`,
    builtAcademy: () => "Built youth academy",
    upgradedAcademy: (level: number) => `Upgraded youth academy to level ${level}`,
}

/**
 * Rewrite a ledger description from older builds ("AI hired …", "AI built
 * TRAINING facility", "AI upgraded Youth Academy to Level 2") to the
 * current wording. Anything else is returned unchanged.
 */
export function modernizeLedgerDescription(description: string): string {
    if (!description.startsWith("AI ")) return description
    let m: RegExpMatchArray | null
    if ((m = description.match(/^AI hired (.+) \(([^()]+)\)$/))) return ledgerText.hiredStaff(m[1], m[2])
    if (description === "AI built Youth Academy") return ledgerText.builtAcademy()
    if ((m = description.match(/^AI upgraded Youth Academy to Level (\d+)$/))) return ledgerText.upgradedAcademy(Number(m[1]))
    if ((m = description.match(/^AI built (\w+) facility$/))) return ledgerText.builtFacility(m[1])
    if ((m = description.match(/^AI upgraded (\w+) facility to Level (\d+)$/))) return ledgerText.upgradedFacility(m[1], Number(m[2]))
    const rest = description.slice(3)
    return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/**
 * Facility descriptions stored by older builds: the level-4 tactical text
 * said "AI-assisted", and facilities built by other clubs stored the raw
 * enum ("TRAINING facility").
 */
export function modernizeFacilityDescription(description: string): string {
    if (description === "AI-assisted strategic simulator.") return "Data-driven strategic simulator."
    const m = description.match(/^(TRAINING|RECOVERY|TACTICAL|FANZONE) facility$/)
    return m ? builtFacilityDescription(m[1]) : description
}
