import { redirect } from "next/navigation"
import { desktopRedirectHref } from "@/lib/navigation"

/**
 * The desktop OS was retired in Phase 4.3. Old links and saved deep links
 * (`/desktop?app=mail`, `?app=finance`, …) land on the screen that replaced
 * each app; mail/news/social open the inbox drawer over Home.
 */
export default async function DesktopRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { app } = await searchParams
    redirect(desktopRedirectHref(typeof app === "string" ? app : null))
}
