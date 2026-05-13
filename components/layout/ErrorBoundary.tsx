"use client"

// Consolidated: single ErrorBoundary implementation lives in components/ui/error-boundary.tsx
// This re-export keeps existing import paths (e.g. GameShell.tsx) working.
export { ErrorBoundary } from '@/components/ui/error-boundary'
