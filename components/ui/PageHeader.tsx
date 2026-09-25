import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({ eyebrow, title, description, actions, className }: {
    eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; className?: string
}) {
    return <header className={cn('premium-page-header', className)}>
        <div className="min-w-0">
            {eyebrow && <p className="premium-eyebrow">{eyebrow}</p>}
            <h1 className="page-title">{title}</h1>
            {description && <div className="premium-page-description">{description}</div>}
        </div>
        {actions && <div className="premium-header-actions">{actions}</div>}
    </header>
}
