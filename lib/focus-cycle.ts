/** null means native Tab order; -1 means focus the dialog summary itself. */
export function focusCycleTarget(count: number, activeIndex: number, shift: boolean): number | null {
    if (count === 0) return -1
    if (shift && activeIndex <= 0) return count - 1
    if (!shift && (activeIndex < 0 || activeIndex === count - 1)) return 0
    return null
}
