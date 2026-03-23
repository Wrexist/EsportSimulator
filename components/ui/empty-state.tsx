import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description: string
    action?: {
        label: string
        onClick: () => void
    }
    className?: string
}

/**
 * Empty State Component
 * Shows when lists/sections have no data
 * 
 * @example
 * <EmptyState
 *   icon={Users}
 *   title="No Players"
 *   description="Your roster is empty. Scout some talent!"
 *   action={{ label: "Go to Transfers", onClick: () => router.push('/transfers') }}
 * />
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className
}: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center p-12 text-center ${className || ''}`}>
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/10">
                <Icon className="w-10 h-10 text-muted-foreground" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
                {title}
            </h3>

            <p className="text-muted-foreground max-w-md mb-6">
                {description}
            </p>

            {action && (
                <Button onClick={action.onClick} className="gap-2">
                    {action.label}
                </Button>
            )}
        </div>
    )
}
