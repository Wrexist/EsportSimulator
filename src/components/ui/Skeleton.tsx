"use client"

import { cn } from "@/lib/utils"

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

/**
 * Skeleton — the base shimmer block. Use the variant helpers below for
 * common shapes (card, row, stat tile).
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-white/5", className)}
      {...props}
    />
  )
}

/** Full-width card placeholder — portrait + title + 3-stat row. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Skeleton className="h-8 flex-1 rounded-lg" />
      </div>
    </div>
  )
}

/** Player card placeholder — compact portrait + name/role + OVR. */
export function PlayerCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 p-3 rounded-xl bg-white/5", className)}>
      <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="text-right space-y-1">
        <Skeleton className="h-6 w-10 ml-auto" />
        <Skeleton className="h-2 w-8 ml-auto" />
      </div>
    </div>
  )
}

/** StatTile placeholder. */
export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/5 bg-white/[0.02] p-3 space-y-2", className)}>
      <Skeleton className="h-2 w-16" />
      <Skeleton className="h-7 w-12" />
    </div>
  )
}

/** HTML table row placeholder — N <td> skeletons. */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}
