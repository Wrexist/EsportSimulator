import { notFound } from "next/navigation"
import { isDevToolsEnabled } from "@/lib/runtime-flags"

export default function AnimationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isDevToolsEnabled()) {
    notFound()
  }

  return children
}
