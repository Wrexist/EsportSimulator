"use client"

import { useEffect } from "react"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-keyboard-shortcuts"
        className="w-full max-w-lg mx-4 glass-panel rounded-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title-keyboard-shortcuts" className="text-lg font-bold text-white">
          Keyboard Shortcuts
        </h2>

        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <h3 className="text-xs uppercase tracking-widest text-white/40 font-medium">
              {group.label}
            </h3>
            <div className="space-y-1.5">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.description + shortcut.keys.join("+")} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white/70">{shortcut.description}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {shortcut.keys.map((key, i) => (
                      <span key={i}>
                        <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-xs font-mono text-white/80">
                          {key}
                        </kbd>
                        {i < shortcut.keys.length - 1 && (
                          <span className="text-white/30 mx-0.5">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-[11px] text-white/50 text-center pt-2">
          macOS users: use <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">⌘</kbd> in place of <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">Ctrl</kbd>
          <br />
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
