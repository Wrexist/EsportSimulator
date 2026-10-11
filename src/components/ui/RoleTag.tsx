import { cn } from "@/lib/utils"
import { formatRole } from "@/lib/utils-extended"

/** RoleTag — a neutral role label. Roles are identity, not status: no traffic-light colours. */
export function RoleTag({ role, className }: { role: string | null | undefined; className?: string }) {
    if (!role) return null
    return (
        <span className={cn("inline-flex items-center rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2", className)}>
            {formatRole(role)}
        </span>
    )
}
