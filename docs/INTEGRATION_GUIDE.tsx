/**
 * Quick Integration Guide
 * How to apply new utilities to existing pages
 */

// ============================================
// STAFF PAGE INTEGRATION EXAMPLE
// ============================================

import { useState } from 'react'
import { SearchFilter } from '@/components/ui/search-filter'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState, CardSkeleton } from '@/components/ui/loading'
import { EmptyState } from '@/components/ui/empty-state'
import { StatTooltip, RarityTooltip } from '@/components/ui/stat-tooltip'
import { Button } from '@/components/ui/button'
import { Users, Trash2 } from 'lucide-react'

export default function StaffPageExample() {
    const { staff, marketStaff, fireStaff, isLoading } = useGameStore()
    const [filteredStaff, setFilteredStaff] = useState(marketStaff)

    // LOADING STATE
    if (isLoading) {
        return (
            <div className="space-y-4">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* SEARCH & FILTER */}
            <SearchFilter
                data={marketStaff}
                searchFields={['name', 'role', 'nationality']}
                filterOptions={[
                    {
                        field: 'role',
                        label: 'Role',
                        options: [
                            { value: 'coach', label: 'Coach' },
                            { value: 'analyst', label: 'Analyst' },
                            { value: 'psychologist', label: 'Psychologist' },
                        ]
                    }
                ]}
                onFilter={setFilteredStaff}
                placeholder="Search staff by name, role..."
            />

            {/* EMPTY STATE */}
            {filteredStaff.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No Staff Found"
                    description="No staff members match your search criteria."
                    action={undefined}
                />
            ) : (
                // STAFF LIST WITH TOOLTIPS
                <div className="space-y-3">
                    {filteredStaff.map(staff => (
                        <div key={staff.id} className="glass-panel p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold">{staff.name}</h3>

                                    {/* RARITY TOOLTIP */}
                                    <RarityTooltip rarity={staff.rarity || 'Common'} />

                                    {/* STAT TOOLTIPS */}
                                    <div className="flex gap-2 mt-2">
                                        <StatTooltip
                                            title="Development"
                                            description="Improves player training effectiveness"
                                            formula="XP Gain = Base × (Development / 100)"
                                        >
                                            <span>Dev: {staff.stats?.development || 50}</span>
                                        </StatTooltip>
                                    </div>
                                </div>

                                {/* CONFIRMATION DIALOG */}
                                <ConfirmDialog
                                    title="Fire Staff Member?"
                                    description={`This will permanently remove ${staff.name} from your staff. They will return to the market.`}
                                    onConfirm={() => fireStaff(staff.id)}
                                    destructive
                                    icon="danger"
                                    confirmText="Fire"
                                >
                                    <Button variant="destructive" size="sm">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </ConfirmDialog>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ============================================
// TRANSFERS PAGE INTEGRATION EXAMPLE
// ============================================

export function TransfersPageExample() {
    const { marketPlayers } = useGameStore()
    const [filtered, setFiltered] = useState(marketPlayers)

    return (
        <div className="space-y-6">
            <SearchFilter
                data={marketPlayers}
                searchFields={['name', 'role', 'nationality', 'teamName']}
                filterOptions={[
                    {
                        field: 'primaryRole',
                        label: 'Role',
                        options: [
                            { value: 'awper', label: 'AWPer' },
                            { value: 'entry', label: 'Entry Fragger' },
                            { value: 'support', label: 'Support' },
                            { value: 'igl', label: 'IGL' },
                            { value: 'lurker', label: 'Lurker' },
                        ]
                    },
                    {
                        field: 'rarity',
                        label: 'Rarity',
                        options: [
                            { value: 'legendary', label: 'Legendary' },
                            { value: 'epic', label: 'Epic' },
                            { value: 'rare', label: 'Rare' },
                            { value: 'common', label: 'Common' },
                        ]
                    }
                ]}
                onFilter={setFiltered}
                placeholder="Search players..."
            />

            {filtered.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No Players Found"
                    description="Try adjusting your search filters."
                />
            ) : (
                <PlayerList players={filtered} />
            )}
        </div>
    )
}

// ============================================
// MAIN APP INTEGRATION
// ============================================

import { useAutoSave } from '@/hooks/useAutoSave'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function MainAppWrapper({ children }) {
    // AUTO-SAVE (will save every minute if changes detected)
    useAutoSave({
        interval: 60000, // 1 minute
        enabled: true,
        showToasts: true
    })

    // KEYBOARD SHORTCUTS
    useKeyboardShortcuts()

    return <>{children}</>
}

// ============================================
// VALIDATION EXAMPLE
// ============================================

import { validateContract } from '@/lib/validation'
import { toast } from '@/lib/toast'

function handleContractSubmit(data: unknown) {
    const validation = validateContract(data)

    if (!validation.success) {
        // Show first error
        toast.error('Invalid contract', {
            description: validation.errors?.[0]
        })
        return
    }

    // Use validated data
    const contract = validation.data
    hireStaff(staffId, contract)
    toast.success('Contract submitted!')
}

// ============================================
// LOGGING EXAMPLE
// ============================================

import logger from '@/lib/logger'

function performExpensiveOperation() {
    logger.time('operation')

    logger.log('Starting operation...')

    const result = doSomething()

    if (result.error) {
        logger.error('Operation failed', result.error)
    } else {
        logger.log('Operation succeeded')
    }

    logger.timeEnd('operation') // Logs duration

    return result
}

// ============================================
// CUSTOM KEYBOARD SHORTCUTS
// ============================================

function MyComponent() {
    useKeyboardShortcuts({
        'ctrl+d': {
            action: () => toggleDebugMode(),
            description: 'Toggle debug mode',
            global: true // Works even in inputs
        },
        'ctrl+t': {
            action: () => router.push('/tactics'),
            description: 'Go to tactics'
        }
    })

    return <div>...</div>
}

// ============================================
// MODAL WITH SHORTCUTS
// ============================================

import { useModalShortcuts } from '@/hooks/useKeyboardShortcuts'

function MyModal({ isOpen, onClose, onConfirm }) {
    // Esc closes, Ctrl+Enter confirms
    useModalShortcuts(onClose, onConfirm)

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogTitle>Confirm Action?</DialogTitle>
                <DialogFooter>
                    <Button onClick={onClose}>Cancel (Esc)</Button>
                    <Button onClick={onConfirm}>Confirm (Ctrl+Enter)</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
