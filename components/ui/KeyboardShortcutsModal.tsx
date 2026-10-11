"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent className="space-y-3">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Navigate your club and control the game from the keyboard.</DialogDescription>
        </DialogHeader>

        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-ink-2 font-medium">
              {group.label}
            </h3>
            <div className="space-y-1.5">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.description + shortcut.keys.join("+")} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-ink-2">{shortcut.description}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {shortcut.keys.map((key, i) => (
                      <span key={i}>
                        <kbd className="px-2 py-0.5 rounded bg-hover border border-line text-xs font-mono text-ink-1">
                          {key}
                        </kbd>
                        {i < shortcut.keys.length - 1 && (
                          <span className="text-ink-3 mx-0.5">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-[11px] text-ink-2 text-center pt-2">
          macOS users: use <kbd className="px-1.5 py-0.5 rounded bg-hover border border-line text-[11px] font-mono">⌘</kbd> in place of <kbd className="px-1.5 py-0.5 rounded bg-hover border border-line text-[11px] font-mono">Ctrl</kbd>
          <br />
          Press <kbd className="px-1.5 py-0.5 rounded bg-hover border border-line text-[11px] font-mono">Esc</kbd> to close
        </p>
      </DialogContent>
    </Dialog>
  )
}
