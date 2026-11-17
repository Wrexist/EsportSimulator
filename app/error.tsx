"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CrashCard, crashDetails } from '@/components/ui/crash-card'
import { errorTracker } from '@/lib/error-tracking'
import { t } from '@/lib/i18n'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Route-level errors were previously only console.error'd in dev, so
        // production crashes went unreported. Funnel them into the same
        // tracker the component ErrorBoundary uses.
        errorTracker.captureException(error, {
            tags: { type: 'route-error-boundary' },
            context: { digest: error.digest },
        })
        if (process.env.NODE_ENV !== 'production') {
            console.error('[App Error]', error)
        }
    }, [error])

    return (
        <CrashCard
            title={t("rerr.title")}
            body={t("rerr.body")}
            message={error.message}
            details={() => crashDetails(error, error.digest ? `Route (digest ${error.digest})` : "Route")}
            actions={
                <>
                    <Button onClick={reset}>
                        <RefreshCw aria-hidden="true" />
                        {t("eb.retry")}
                    </Button>
                    {/* Client navigation keeps the career in memory (a full reload would drop unsaved progress). */}
                    <Button asChild variant="outline">
                        <Link href="/main-menu">
                            <Home aria-hidden="true" />
                            {t("eb.menu")}
                        </Link>
                    </Button>
                </>
            }
        />
    )
}
