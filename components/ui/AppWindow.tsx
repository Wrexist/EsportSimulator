"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Minus, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { liquidSpring } from "@/lib/motion"

interface AppWindowProps {
    id: string
    title: string
    icon: React.ReactNode
    isOpen: boolean
    isMinimized: boolean
    isFocused: boolean
    zIndex: number
    initialPosition?: { x: number; y: number }
    initialSize?: { width: number; height: number }
    onClose: () => void
    onMinimize: () => void
    onFocus: () => void
    children: React.ReactNode
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export function AppWindow({
    id,
    title,
    icon,
    isOpen,
    isMinimized,
    isFocused,
    zIndex,
    initialPosition = { x: 50, y: 30 },
    initialSize = { width: 500, height: 400 },
    onClose,
    onMinimize,
    onFocus,
    children
}: AppWindowProps) {
    const [position, setPosition] = useState(initialPosition)
    const [size, setSize] = useState(initialSize)
    const [isMaximized, setIsMaximized] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)

    // Using refs for mutable state during drag to avoid closure staleness issues
    const dragRef = useRef<{
        startX: number;
        startY: number;
        startPosX: number;
        startPosY: number;
        startWidth: number;
        startHeight: number;
        direction?: ResizeDirection;
        parentRect?: DOMRect;
    } | null>(null)

    const windowRef = useRef<HTMLDivElement>(null)

    // --- DRAG (MOVE) LOGIC ---
    const handleMove = useCallback((e: MouseEvent) => {
        if (!dragRef.current || isMaximized) return

        const { startX, startY, startPosX, startPosY, startWidth, startHeight, direction } = dragRef.current
        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY

        // If direction is set, we are RESIZING
        if (direction) {
            let newW = startWidth
            let newH = startHeight
            let newX = startPosX
            let newY = startPosY

            // Minimum dimensions
            const minW = 400
            const minH = 300

            // Horizontal logic
            if (direction.includes('e')) {
                newW = Math.max(minW, startWidth + deltaX)
            } else if (direction.includes('w')) {
                // When resizing left, we must adjust X and Width
                // If we hit min width, we stop moving X
                const proposedWidth = startWidth - deltaX
                if (proposedWidth >= minW) {
                    newW = proposedWidth
                    newX = startPosX + deltaX
                } else {
                    newW = minW
                    newX = startPosX + (startWidth - minW)
                }
            }

            // Vertical logic
            if (direction.includes('s')) {
                newH = Math.max(minH, startHeight + deltaY)
            } else if (direction.includes('n')) {
                // When resizing top, adjust Y and Height
                const proposedHeight = startHeight - deltaY
                if (proposedHeight >= minH) {
                    newH = proposedHeight
                    newY = startPosY + deltaY
                } else {
                    newH = minH
                    newY = startPosY + (startHeight - minH)
                }
            }

            setSize({ width: newW, height: newH })
            setPosition({ x: newX, y: newY })
        }
        // If no direction, we are DRAGGING (Moving)
        else {
            // Clamping logic
            let newX = startPosX + deltaX
            let newY = startPosY + deltaY

            if (windowRef.current && windowRef.current.parentElement) {
                const parentRect = dragRef.current.parentRect ?? windowRef.current.parentElement.getBoundingClientRect()
                const taskbarHeight = 56
                const minVisible = 100
                newX = Math.max(-startWidth + minVisible, Math.min(newX, parentRect.width - minVisible))
                newY = Math.max(0, Math.min(newY, parentRect.height - taskbarHeight - 40))
            }
            setPosition({ x: newX, y: newY })
        }
    }, [isMaximized])

    const handleUp = useCallback(() => {
        setIsDragging(false)
        setIsResizing(false)
        dragRef.current = null
        document.body.style.cursor = 'default'
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
    }, [handleMove])

    const startResize = (e: React.MouseEvent, dir: ResizeDirection) => {
        e.preventDefault()
        e.stopPropagation()
        if (isMaximized) return

        setIsResizing(true)
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startPosX: position.x,
            startPosY: position.y,
            startWidth: size.width,
            startHeight: size.height,
            direction: dir,
            parentRect: windowRef.current?.parentElement?.getBoundingClientRect(),
        }

        // Lock cursor style during drag
        let cursor = 'default'
        if (dir === 'n' || dir === 's') cursor = 'ns-resize'
        else if (dir === 'e' || dir === 'w') cursor = 'ew-resize'
        else if (dir === 'nw' || dir === 'se') cursor = 'nwse-resize'
        else if (dir === 'ne' || dir === 'sw') cursor = 'nesw-resize'

        document.body.style.cursor = cursor
        document.addEventListener('mousemove', handleMove)
        document.addEventListener('mouseup', handleUp)
    }

    const startDrag = (e: React.MouseEvent) => {
        if (isMaximized) return
        if ((e.target as HTMLElement).closest('button')) return // Don't drag if clicking buttons

        e.preventDefault()
        setIsDragging(true)
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startPosX: position.x,
            startPosY: position.y,
            startWidth: size.width,
            startHeight: size.height,
            parentRect: windowRef.current?.parentElement?.getBoundingClientRect(),
            // no direction = move
        }
        document.addEventListener('mousemove', handleMove)
        document.addEventListener('mouseup', handleUp)
    }

    // Handle toggle maximize
    const toggleMaximize = () => {
        setIsMaximized(!isMaximized)
    }

    // Effect to clean up listeners
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMove)
            document.removeEventListener('mouseup', handleUp)
            document.body.style.cursor = 'default'
        }
    }, [handleMove, handleUp])

    if (!isOpen) return null

    // Resize Handle Element Helper
    const ResizeHandle = ({ dir, className }: { dir: ResizeDirection, className: string }) => (
        <div
            onMouseDown={(e) => startResize(e, dir)}
            className={cn(
                "absolute z-50 hover:bg-white/10 transition-colors",
                className
            )}
        />
    )

    return (
        <AnimatePresence>
            {!isMinimized && (
                <motion.div
                    ref={windowRef}
                    key={id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        width: isMaximized ? "100%" : size.width,
                        height: isMaximized ? "calc(100% - 56px)" : size.height,
                        x: isMaximized ? 0 : position.x,
                        y: isMaximized ? 0 : position.y
                    }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    // Instant transition during interaction usually feels best, spring for maximize/snap
                    transition={isDragging || isResizing ? { duration: 0 } : { ...liquidSpring, layout: { duration: 0.2 } }}
                    style={{
                        zIndex,
                        position: "absolute",
                    }}
                    onClick={onFocus}
                    className={cn(
                        "liquid-panel flex flex-col rounded-xl overflow-hidden",
                        isFocused && "ring-1 ring-white/20 shadow-glass-float",
                        // Ensure handles are clickable
                        !isMaximized && "border-transparent"
                    )}
                >
                    {/* RESIZE HANDLES (only when not maximized) */}
                    {!isMaximized && (
                        <>
                            {/* Edges */}
                            <ResizeHandle dir="n" className="top-0 left-0 w-full h-1 cursor-ns-resize" />
                            <ResizeHandle dir="s" className="bottom-0 left-0 w-full h-1 cursor-ns-resize" />
                            <ResizeHandle dir="w" className="top-0 left-0 w-1 h-full cursor-ew-resize" />
                            <ResizeHandle dir="e" className="top-0 right-0 w-1 h-full cursor-ew-resize" />

                            {/* Corners (Larger hit targets) */}
                            <ResizeHandle dir="nw" className="top-0 left-0 w-4 h-4 cursor-nwse-resize z-[51]" />
                            <ResizeHandle dir="ne" className="top-0 right-0 w-4 h-4 cursor-nesw-resize z-[51]" />
                            <ResizeHandle dir="sw" className="bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-[51]" />
                            <ResizeHandle dir="se" className="bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[51]" />
                        </>
                    )}

                    {/* Title Bar */}
                    <div
                        onMouseDown={startDrag}
                        className={cn(
                            "h-10 flex items-center justify-between px-3 relative",
                            !isMaximized && "cursor-grab",
                            isDragging && "cursor-grabbing",
                            "bg-white/[0.045] border-b border-white/10",
                            "select-none shrink-0"
                        )}
                    >
                        {/* Traffic Lights */}
                        <div className="flex items-center gap-2 z-10">
                            <button
                                onClick={(e) => { e.stopPropagation(); onClose(); }}
                                className="w-3 h-3 rounded-full bg-rose-400/80 hover:bg-rose-400 active:bg-rose-500 transition-colors duration-75 ease-out flex items-center justify-center group active:scale-90"
                            >
                                <X size={8} className="opacity-0 group-hover:opacity-100 text-rose-900" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onMinimize(); }}
                                className="w-3 h-3 rounded-full bg-amber-300/80 hover:bg-amber-300 active:bg-amber-400 transition-colors duration-75 ease-out flex items-center justify-center group active:scale-90"
                            >
                                <Minus size={8} className="opacity-0 group-hover:opacity-100 text-amber-900" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleMaximize(); }}
                                className="w-3 h-3 rounded-full bg-emerald-300/80 hover:bg-emerald-300 active:bg-emerald-400 transition-colors duration-75 ease-out flex items-center justify-center group active:scale-90"
                            >
                                <Square size={6} className="opacity-0 group-hover:opacity-100 text-emerald-900" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2 pointer-events-none">
                            <div className="w-4 h-4 flex items-center justify-center text-white/60">
                                {icon}
                            </div>
                            <span className="text-xs font-semibold text-white/70">{title}</span>
                        </div>
                        <div className="w-14" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden relative">
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
