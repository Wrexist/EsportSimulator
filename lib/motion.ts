"use client"

import { useReducedMotion } from "framer-motion"
import type { Variants, Transition } from "framer-motion"
import { tokens } from "@/src/design/tokens"

export const liquidSpring: Transition = { ...tokens.motion.spring.liquid }
export const softSpring: Transition = { ...tokens.motion.spring.soft }
export const snappySpring: Transition = { ...tokens.motion.spring.snappy }

export const quickEase: Transition = {
  duration: tokens.motion.durationMs.base / 1000,
  ease: [...tokens.motion.easeOutExpo],
}

export const shortEase: Transition = {
  duration: tokens.motion.durationMs.fast / 1000,
  ease: [...tokens.motion.easeOutExpo],
}

/** Continuous loading/processing spinner (pair with animate={{ rotate: 360 }}) */
export const spinTransition: Transition = {
  repeat: Infinity,
  duration: 1,
  ease: "linear",
}

/** Modals, sheets, desktop windows opening */
export const modalTransition: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: softSpring },
  exit: { opacity: 0, y: 10, scale: 0.99, transition: quickEase },
}

/** Full-page or section cross-fades */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: tokens.motion.durationMs.page / 1000, ease: tokens.motion.easeOutExpo },
  },
  exit: { opacity: 0, y: -6, filter: "blur(4px)", transition: quickEase },
}

export const panelTransition: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: softSpring },
  exit: { opacity: 0, y: 8, scale: 0.985, transition: quickEase },
}

export const listItemTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...quickEase, delay: Math.min(index * 0.035, 0.24) },
  }),
  exit: { opacity: 0, y: -4, transition: quickEase },
}

export const scorePulse: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.94 },
  animate: { opacity: 1, y: 0, scale: 1, transition: liquidSpring },
  exit: { opacity: 0, y: 8, scale: 0.96, transition: quickEase },
}

export const pressableMotion = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.985 },
  transition: quickEase,
}

/**
 * Collapses springy / blurred motion when reduced motion is preferred
 * (system or `html.reduce-motion`).
 */
export function useLiquidTransition(t: Transition): Transition {
  const reduced = useReducedMotion()
  if (reduced) {
    return { duration: tokens.motion.durationMs.instant / 1000 }
  }
  return t
}

