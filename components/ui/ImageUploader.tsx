"use client"

import { useState, useRef, useCallback, useEffect, ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Upload, X, ZoomIn, Move } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ImageUploaderProps {
    value?: string  // Current data URL
    onChange: (dataUrl: string | undefined) => void
    maxSize?: number  // Max dimension in pixels (default 256)
    className?: string
}

export function ImageUploader({ value, onChange, maxSize = 256, className }: ImageUploaderProps) {
    const [originalImage, setOriginalImage] = useState<string | null>(null)
    const [scale, setScale] = useState(1)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Supported image formats
    const SUPPORTED_FORMATS = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'image/bmp',
        'image/tiff',
        'image/ico',
        'image/x-icon'
    ]

    // Handle file selection
    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        const isImage = file.type.startsWith('image/') || SUPPORTED_FORMATS.includes(file.type.toLowerCase())
        if (!isImage) {
            toast.error('Please select an image file', {
                description: 'Supported formats: PNG, JPG, GIF, WebP, SVG, BMP, TIFF, ICO'
            })
            return
        }

        // Validate file size (max 20MB)
        if (file.size > 20 * 1024 * 1024) {
            toast.error('Image must be under 20MB')
            return
        }

        // Load image
        const reader = new FileReader()
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string
            setOriginalImage(dataUrl)
            setScale(1)
            setPosition({ x: 0, y: 0 })

            // Load image to get dimensions
            const img = new Image()
            img.onload = () => {
                imageRef.current = img
                renderCanvas()
            }
            img.src = dataUrl
        }
        reader.readAsDataURL(file)
    }

    // Render image to canvas with current scale and position
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current
        const img = imageRef.current
        if (!canvas || !img) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Clear canvas
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, maxSize, maxSize)

        // Calculate scaled dimensions
        const aspectRatio = img.width / img.height
        let drawWidth, drawHeight

        if (aspectRatio > 1) {
            // Landscape
            drawWidth = maxSize * scale
            drawHeight = (maxSize / aspectRatio) * scale
        } else {
            // Portrait or square
            drawHeight = maxSize * scale
            drawWidth = (maxSize * aspectRatio) * scale
        }

        // Center position with offset
        const x = (maxSize - drawWidth) / 2 + position.x
        const y = (maxSize - drawHeight) / 2 + position.y

        // Draw image
        ctx.drawImage(img, x, y, drawWidth, drawHeight)
    }, [scale, position, maxSize])

    // Update canvas when scale or position changes
    useEffect(() => {
        if (originalImage && imageRef.current) {
            renderCanvas()
        }
    }, [scale, position, originalImage, renderCanvas])

    // Handle mouse drag for positioning
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        })
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        })
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    // Save the cropped image
    const handleSave = () => {
        const canvas = canvasRef.current
        if (!canvas) return

        // Export as compressed JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        onChange(dataUrl)
        setOriginalImage(null)
        toast.success('Logo saved!')
    }

    // Clear image
    const handleClear = () => {
        setOriginalImage(null)
        setScale(1)
        setPosition({ x: 0, y: 0 })
        onChange(undefined)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Show saved logo or upload button */}
            {!originalImage && !value && (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-8 border-2 border-dashed border-white/20 rounded-xl hover:border-white/40 hover:bg-white/5 transition-all flex flex-col items-center gap-3 group"
                >
                    <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                        <Upload className="text-muted-foreground group-hover:text-white transition-colors" size={28} />
                    </div>
                    <div className="text-center">
                        <p className="text-white font-medium">Upload Custom Logo</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG or JPG, max 2MB</p>
                    </div>
                </button>
            )}

            {/* Show saved logo */}
            {!originalImage && value && (
                <div className="relative">
                    <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden border-2 border-white/20 bg-black/50">
                        <img
                            src={value}
                            alt="Team logo"
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <div className="flex justify-center gap-2 mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="gap-2"
                        >
                            <Upload size={14} />
                            Change
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClear}
                            className="gap-2 text-red-400 hover:text-red-300"
                        >
                            <X size={14} />
                            Remove
                        </Button>
                    </div>
                </div>
            )}

            {/* Image editor */}
            {originalImage && (
                <div className="space-y-4">
                    {/* Canvas preview */}
                    <div
                        ref={containerRef}
                        className="relative mx-auto rounded-xl overflow-hidden border-2 border-white/20 cursor-move select-none"
                        style={{ width: maxSize, height: maxSize }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        <canvas
                            ref={canvasRef}
                            width={maxSize}
                            height={maxSize}
                            className="block"
                        />
                        {/* Drag hint */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 bg-black/70 rounded-full text-[10px] text-white/70">
                            <Move size={10} />
                            Drag to reposition
                        </div>
                    </div>

                    {/* Scale slider */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground flex items-center gap-2">
                                <ZoomIn size={14} />
                                Zoom
                            </span>
                            <span className="text-white font-mono">{Math.round(scale * 100)}%</span>
                        </div>
                        <Slider
                            value={[scale]}
                            onValueChange={([v]) => setScale(v)}
                            min={0.5}
                            max={3}
                            step={0.1}
                            className="w-full"
                        />
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            onClick={handleSave}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                        >
                            Use This Logo
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleClear}
                            className="text-muted-foreground hover:text-white"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
