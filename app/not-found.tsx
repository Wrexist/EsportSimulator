"use client"

import { Home } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0e1217] text-white p-8">
            <div className="max-w-md text-center">
                <div className="text-6xl font-bold text-white/10 mb-4">404</div>
                <h1 className="text-xl font-bold mb-2">Page Not Found</h1>
                <p className="text-sm text-white/50 mb-6">
                    This page doesn&apos;t exist. You may have followed an outdated link.
                </p>
                <a
                    href="/main-menu"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium transition-colors"
                >
                    <Home size={14} />
                    Back to Main Menu
                </a>
            </div>
        </div>
    )
}
