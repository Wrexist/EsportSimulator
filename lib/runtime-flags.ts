export const DEV_TOOLS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true" ||
  (process.env.NODE_ENV !== "production" &&
   process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== "false");

export const PRODUCTION_BUILD = process.env.NODE_ENV === "production";

export function isDevToolsEnabled(): boolean {
  return DEV_TOOLS_ENABLED;
}

export function isProductionBuild(): boolean {
  return PRODUCTION_BUILD;
}
