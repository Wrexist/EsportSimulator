import type { Metadata, Viewport } from 'next'
import { Archivo_Black } from 'next/font/google'
import { ConsoleToTerminal } from '@/components/console-to-terminal'
import './globals.css'

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-archivo',
  weight: '400'
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0e1217',
}

export const metadata: Metadata = {
  title: 'Esports Manager: FPS',
  description: 'Manage your professional esports team to glory.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
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
      <body className={`${archivoBlack.className} ${archivoBlack.variable} font-sans antialiased bg-[#0e1217] text-foreground`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-modal px-4 py-2 bg-primary text-primary-foreground rounded-md ring-2 ring-cyan-400">
          Skip to main content
        </a>
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

