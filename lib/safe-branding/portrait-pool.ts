// Retained plain-kit portraits; originals remain outside the shipping selection.
import { fnv1aHash } from "./portrait-features"
import aliases from "@/data/portrait-asset-aliases.json"

export const PORTRAIT_POOL: string[] = Object.values(aliases)

export function pickPooledPortrait(seed: string): string {
  return PORTRAIT_POOL[fnv1aHash(seed) % PORTRAIT_POOL.length]
}
