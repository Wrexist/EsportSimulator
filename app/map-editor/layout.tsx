import { notFound } from "next/navigation"
import { isDevToolsEnabled } from "@/lib/runtime-flags"

// Map Studio and its simulation lab are authoring tools, not part of the
// player build: same gate as app/dev/layout.tsx.
export default function MapEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isDevToolsEnabled()) {
    notFound()
  }

  return children
}
