"use client"

import { useEffect } from "react"

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

const SHORTCUT_GROUPS = [
  {
    label: "General",
    shortcuts: [
      { keys: ["Ctrl", "S"], description: "Save game" },
      { keys: ["Space"], description: "Advance 1 week" },
      { keys: ["Esc"], description: "Close modal" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
  {
    label: "Navigation",
    shortcuts: [
      { keys: ["1"], description: "Squad" },
      { keys: ["2"], description: "Transfers" },
      { keys: ["3"], description: "Staff" },
      { keys: ["4"], description: "Schedule" },
      { keys: ["5"], description: "Finances" },
      { keys: ["6"], description: "Training" },
      { keys: ["7"], description: "Scouting" },
      { keys: ["8"], description: "Desktop" },
      { keys: ["9"], description: "Settings" },
    ],
  },
  {
    label: "Modals",
    shortcuts: [
      { keys: ["Ctrl", "Enter"], description: "Confirm action" },
      { keys: ["Esc"], description: "Cancel / Close" },
    ],
  },
]

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
        className="w-full max-w-md mx-4 glass-panel rounded-2xl p-6 space-y-5"
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
                <div key={shortcut.description} className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
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

        <p className="text-[11px] text-white/30 text-center pt-2">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
