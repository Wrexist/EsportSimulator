"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Search, ArrowUpRight } from "lucide-react"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { menuGroups, settingsItem } from "@/lib/navigation"

export function NavigationSearch({ collapsed, disabled }: { collapsed: boolean; disabled: boolean }) {
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (disabled || event.defaultPrevented || document.querySelector('[role="dialog"]')) return
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault()
                setOpen(true)
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [disabled])

    useEffect(() => { if (disabled) setOpen(false) }, [disabled])

    return <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
        <button
            type="button"
            aria-label="Search game navigation"
            aria-keyshortcuts="Control+k Meta+k"
            title="Search navigation (Ctrl / Command + K)"
            disabled={disabled}
            className="mx-2 mb-2 flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
            <Search size={15} className="shrink-0" />
            {!collapsed && <><span className="flex-1 text-left text-xs">Go to...</span><span className="text-[10px] text-slate-500">Ctrl K</span></>}
        </button>
        </DialogTrigger>
            <DialogContent className="liquid-panel overflow-hidden rounded-3xl p-0 sm:max-w-lg" showCloseButton={false}>
                <DialogTitle className="sr-only">Go to a game screen</DialogTitle>
                <DialogDescription className="sr-only">Search destinations. Use arrow keys to select and Enter to navigate.</DialogDescription>
                <Command className="bg-transparent">
                    <CommandInput aria-label="Search game screens" placeholder="Where would you like to go?" className="h-14 rounded-xl focus-visible:!outline-2 focus-visible:!-outline-offset-4 focus-visible:!shadow-none" />
                    <CommandList className="max-h-[min(55vh,420px)] p-2" aria-busy={isPending}>
                        <CommandEmpty>No screens found. Try squad, finances or training.</CommandEmpty>
                        {[...menuGroups, { label: "Preferences", items: [settingsItem] }].map(group =>
                            <CommandGroup key={group.label} heading={group.label}>
                                {group.items.map(item => <CommandItem
                                    key={item.href}
                                    value={`${group.label} ${item.label}`}
                                    onSelect={() => {
                                        if (disabled) return
                                        startTransition(() => router.push(item.href))
                                        setOpen(false)
                                    }}
                                    className="gap-3 rounded-xl px-3 py-3 text-slate-200 data-[selected=true]:bg-white/10"
                                ><item.icon size={17} /><span className="flex-1">{item.label}</span><ArrowUpRight size={14} className="text-slate-500" /></CommandItem>)}
                            </CommandGroup>
                        )}
                    </CommandList>
                    <div className="border-t border-white/10 px-5 py-3 text-xs text-slate-400">Type to find a screen · Enter to open · Esc to close</div>
                </Command>
            </DialogContent>
    </Dialog>
}
