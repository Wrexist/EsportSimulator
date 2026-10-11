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
        <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-panel">
            <Table className={cn("border-collapse", className)} {...props}>
                {children}
            </Table>
        </div>
    )
}

export function GlassTableHeader({ className, ...props }: React.ComponentProps<typeof TableHeader>) {
    return (
        <TableHeader
            className={cn("bg-raised [&_tr]:border-b-line", className)}
            {...props}
        />
    )
}

export function GlassTableHead({ className, ...props }: React.ComponentProps<typeof TableHead>) {
    return (
        <TableHead
            className={cn(
                "h-10 px-3 text-xs font-medium text-muted-foreground tracking-wide align-middle",
                className
            )}
            {...props}
        />
    )
}

export function GlassTableRow({ className, ...props }: React.ComponentProps<typeof TableRow>) {
    return (
        <tr
            data-slot="table-row"
            className={cn(
                "border-b-line group transition-colors duration-75 ease-out hover:bg-raised",
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
                "p-3 text-sm font-medium text-ink-1 align-middle",
                isHeader && "text-[11px] font-normal text-muted-foreground uppercase tracking-[0.2em]",
                className
            )}
            {...props}
        />
    )
}

export function GlassStatCell({
    value,
    max: _max = 100,
    className
}: {
    value: number,
    max?: number,
    className?: string
}) {
    let colorClass = "text-negative"
    if (value >= 85) colorClass = "text-positive"
    else if (value >= 75) colorClass = "text-ink-2"
    else if (value >= 60) colorClass = "text-caution"

    return (
        <GlassTableCell className={cn("font-normal font-mono text-center", colorClass, className)}>
            {value}
        </GlassTableCell>
    )
}
