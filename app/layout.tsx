import { SkipToContent } from '@/lib/accessibility'
import type { Metadata, Viewport } from 'next'
import { ConsoleToTerminal } from '@/components/console-to-terminal'
import './fonts.css'
import './globals.css'
import './premium-ui.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07090c',
}

export const metadata: Metadata = {
  title: 'Esports Manager: FPS',
  description: 'Manage your professional esports team to glory.',
  icons: {
    icon: '/logo.png?v=trophy-20260920',
    apple: '/logo.png?v=trophy-20260920',
  },
}

import { GameShell } from '@/components/layout/GameShell'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { ColorblindFilters } from '@/components/ui/ColorblindFilters'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <SkipToContent />
        <ColorblindFilters />
        <ErrorBoundary>
          <ConsoleToTerminal />
          <GameShell>
            {children}
          </GameShell>
        </ErrorBoundary>
      </body>
    </html>
  )
}

