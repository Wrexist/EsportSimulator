"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
    Table,
    TableHeader,
    TableBody,
    TableFooter,
    TableHead,
    TableRow,
    TableCell,
    TableCaption,
} from "@/components/ui/table"

export function GlassTable({
    className,
    children,
    ...props
}: React.ComponentProps<typeof Table>) {
    return (
        <div className="glass-panel rounded-[24px] overflow-x-auto border-white/5 bg-black/20">
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

import { motion } from "framer-motion"

export function GlassTableRow({ className, ...props }: React.ComponentProps<typeof TableRow>) {
    return (
        <motion.tr
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.005, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={cn(
                "border-b-white/5 transition-colors group cursor-default",
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
