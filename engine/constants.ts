/**
 * Engine-side re-exports of cross-cutting constants.
 *
 * The canonical definitions live in `lib/constants.ts`. This module exists
 * so the engine and the store don't have to reach across the layer boundary
 * directly, and so existing imports keep working.
 */

export { ARRAY_CAPS } from "@/lib/constants"
