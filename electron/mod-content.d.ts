export const MAX_MOD_BYTES: number;
export const LIMITS: Record<string, number>;
export const STATS: string[];
export function safeAssetPath(value: unknown): boolean;
export type ContentResult = { ok: true; value: Record<string, any> } | { ok: false; error: string };
export function validateModContent(value: unknown): ContentResult;
export function parseModContent(text: string): ContentResult;
export function validateModReferences(players: { id: string }[], teams: { id: string; rosterIds: string[] }[], tournaments: { id: string; invitedTeamIds?: string[]; qualifierFor?: string }[]): string | null;
