"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
    Table,
    TableHeader,
    TableHead,
    TableRow,
    TableCell
} from "@/components/ui/table"

export function GlassTable({
    className,
    children,
    ...props
}: React.ComponentProps<typeof Table>) {
    return (
        <div className="glass-panel rounded-lg overflow-x-auto border-white/5 bg-black/20">
            <Table className={cn("border-collapse", className)} {...props}>
                {children}
            </Table>
        </div>
    )
}

export function GlassTableHeader({ className, ...props }: React.ComponentProps<typeof TableHeader>) {
    return (
        <TableHeader
            className={cn("bg-white/[0.03] [&_tr]:border-b-white/10", className)}
            {...props}
        />
    )
}

export function GlassTableHead({ className, ...props }: React.ComponentProps<typeof TableHead>) {
    return (
        <TableHead
            className={cn(
                "h-12 px-4 text-[10px] font-normal text-muted-foreground uppercase tracking-[0.2em] align-middle",
                className
            )}
            {...props}
        />
    )
}

export function GlassTableRow({ className, ...props }: React.ComponentProps<typeof TableRow>) {
    return (
        <tr
            className={cn(
                "border-b-white/5 group transition-colors duration-75 ease-out hover:bg-white/[0.045]",
                (props as any).onClick ? "cursor-pointer" : "cursor-default",
                className
            )}
            {...(props as any)}
        />
    )
}

export function GlassTableCell({ className, isHeader, ...props }: React.ComponentProps<typeof TableCell> & { isHeader?: boolean }) {
    const Component = isHeader ? "th" : TableCell
    return (
        <Component
            className={cn(
                "p-4 text-sm font-medium text-white/90 align-middle",
                isHeader && "text-[10px] font-normal text-muted-foreground uppercase tracking-[0.2em]",
                className
            )}
            {...props}
        />
    )
}

export function GlassStatCell({
    value,
    max = 100,
    className
}: {
    value: number,
    max?: number,
    className?: string
}) {
    let colorClass = "text-red-400"
    if (value >= 85) colorClass = "text-emerald-400"
    else if (value >= 75) colorClass = "text-blue-400"
    else if (value >= 60) colorClass = "text-amber-400"

    return (
        <GlassTableCell className={cn("font-normal font-mono text-center", colorClass, className)}>
            {value}
        </GlassTableCell>
    )
}
