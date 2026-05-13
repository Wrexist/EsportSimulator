"use client"

import Image from "next/image"
import { User } from "lucide-react"
import type { CSSProperties } from "react"
import { memo, useMemo, useState } from "react"

import { cn } from "@/lib/utils"

export type PlayerPortraitVariant = "avatar" | "card" | "hero"

interface PlayerPortraitFrameProps {
  src?: string | null
  alt: string
  size?: number
  variant?: PlayerPortraitVariant
  teamColor?: string
  className?: string
  imageClassName?: string
  priority?: boolean
  unoptimized?: boolean
  /**
   * Opt in to spring hover/tap animation. Off by default — when this component
   * is mounted hundreds of times in a list (team grid, squad, scouting),
   * spring transitions on every instance kill scroll smoothness.
   */
  interactive?: boolean
  /** Bubble image-load errors so callers can implement fallback chains. */
  onImageError?: () => void
}

const variantClass: Record<PlayerPortraitVariant, string> = {
  avatar: "rounded-lg",
  card: "rounded-lg portrait-realist-card",
  hero: "rounded-xl portrait-realist-hero",
}

const imageObjectPosition: Record<PlayerPortraitVariant, string> = {
  avatar: "object-[50%_34%]",
  card: "object-[50%_32%]",
  hero: "object-[50%_28%]",
}

function clampAccent(color?: string) {
  if (!color || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return "rgba(45, 212, 191, 0.26)"
  }
  return color
}

function PlayerPortraitFrameImpl({
  src,
  alt,
  size = 48,
  variant = "avatar",
  teamColor,
  className,
  imageClassName,
  priority = false,
  unoptimized = true,
  interactive = false,
  onImageError,
}: PlayerPortraitFrameProps) {
  const [imgError, setImgError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const showImage = Boolean(src) && !imgError
  const accent = useMemo(() => clampAccent(teamColor), [teamColor])
  // CSS handles reduced-motion via the global `prefers-reduced-motion` rule
  // in globals.css, so we no longer need a JS check here.
  const useMotion = interactive

  const style = {
    width: size,
    height: size,
    "--portrait-accent": accent,
  } as CSSProperties

  const baseClass = cn(
    "portrait-realist-frame relative isolate overflow-hidden bg-[#101821] text-white",
    variantClass[variant],
    !useMotion && interactive && "transition-transform duration-150 ease-out hover:-translate-y-px",
    className,
  )

  const inner = (
    <>
      <div className="portrait-realist-backdrop" />

      {showImage ? (
        <Image
          src={src!}
          alt={alt}
          width={size}
          height={size}
          priority={priority}
          unoptimized={unoptimized}
          onError={() => {
            setImgError(true)
            onImageError?.()
          }}
          onLoad={() => setLoaded(true)}
          className={cn(
            "portrait-realist-image relative z-10 h-full w-full object-cover transition-[opacity] duration-200",
            imageObjectPosition[variant],
            loaded ? "opacity-100" : "opacity-0",
            imageClassName,
          )}
        />
      ) : (
        <div className="portrait-realist-fallback relative z-10 flex h-full w-full items-end justify-center">
          <div className="absolute top-[18%] h-[34%] w-[34%] rounded-full bg-[linear-gradient(145deg,#d8b083,#9a6841)] shadow-[inset_0_1px_8px_rgba(255,255,255,0.24)]" />
          <div className="absolute bottom-[-8%] h-[52%] w-[70%] rounded-t-[42%] bg-[linear-gradient(145deg,rgba(23,120,116,0.95),rgba(13,31,47,0.98))] shadow-[inset_0_1px_10px_rgba(255,255,255,0.14)]" />
          <User className="relative mb-[18%] h-[28%] w-[28%] text-white/24" aria-hidden="true" />
        </div>
      )}

      {!loaded && showImage && <div className="portrait-realist-loading" />}
      <div className="portrait-realist-glass" />
      <div className="portrait-realist-shine" />
    </>
  )

  if (useMotion) {
    return (
      <div
        className={cn(
          baseClass,
          "transition-transform duration-75 ease-out will-change-transform hover:-translate-y-px hover:scale-[1.015] active:scale-[0.99] active:duration-0"
        )}
        style={style}
      >
        {inner}
      </div>
    )
  }

  return (
    <div className={baseClass} style={style}>
      {inner}
    </div>
  )
}

export const PlayerPortraitFrame = memo(PlayerPortraitFrameImpl)
