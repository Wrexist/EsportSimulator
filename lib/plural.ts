/** "1 week", "3 weeks": a count with its noun in English. Pass the plural when it is not noun + "s". */
export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`
}
