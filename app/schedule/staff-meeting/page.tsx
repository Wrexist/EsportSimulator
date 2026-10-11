import { redirect } from "next/navigation"
import { staffMeetingHref } from "@/lib/navigation"

/**
 * Staff meetings became a booking in the week plan (Phase 4.2). Old links
 * (`/schedule/staff-meeting?week=&day=`) open the week plan with the meeting
 * booking on the same day.
 */
export default async function StaffMeetingRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const { week, day } = await searchParams
    const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null)
    redirect(staffMeetingHref(num(week), num(day)))
}
