import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Role } from "@/types"
import { PlayerSaveData } from "@/engine/save-types"
import { formatRole, formatCurrency } from "@/lib/utils-extended"
import { RoleTag } from "@/src/components/ui/RoleTag"

interface RoleTrainingModalProps {
    player: PlayerSaveData
    isOpen: boolean
    onClose: () => void
    onStartTraining: (targetRole: Role) => void
    currentBudget: number
    trainingSlotsUsed?: number
    maxTrainingSlots?: number
}

const ROLES: { id: Role, label: string }[] = [
    { id: "igl", label: "In-game leader" },
    { id: "entry", label: "Entry fragger" },
    { id: "support", label: "Support" },
    { id: "awper", label: "AWPer" },
    { id: "rifler", label: "Rifler" },
]

/** Completion boosts from TrainingManager.applyRoleBonuses (scaled up by the coach's development). */
const ROLE_BONUSES: Record<string, { stat: string, amount: number }[]> = {
    igl: [{ stat: "Tactics", amount: 5 }, { stat: "Leadership", amount: 3 }],
    entry: [{ stat: "Reaction", amount: 4 }, { stat: "Rifle", amount: 4 }],
    support: [{ stat: "Utility", amount: 5 }, { stat: "Teamwork", amount: 3 }],
    awper: [{ stat: "AWP", amount: 6 }],
    rifler: [{ stat: "Rifle", amount: 4 }, { stat: "Aim", amount: 4 }],
}

const WEEKLY_COST = 5000
const DURATION = 8

function Line({ label, value, tone = "text-ink-1" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <dt className="text-ink-3">{label}</dt>
            <dd className={`font-semibold tabular-nums ${tone}`}>{value}</dd>
        </div>
    )
}

export function RoleTrainingModal({ player, isOpen, onClose, onStartTraining, currentBudget, trainingSlotsUsed = 0, maxTrainingSlots = 10 }: RoleTrainingModalProps) {
    const [selectedRole, setSelectedRole] = useState<Role | "">("")

    const canAfford = currentBudget >= WEEKLY_COST
    const hasSecondaryRole = !!player.secondaryRole
    const slotsAvailable = trainingSlotsUsed < maxTrainingSlots
    const tooTired = (player.energy ?? 100) < 20

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{hasSecondaryRole ? "Two roles already" : "Retrain role"}</DialogTitle>
                    <DialogDescription className="text-ink-3">
                        {hasSecondaryRole
                            ? `${player.nickname} already plays two roles, so no further retraining is possible.`
                            : `${DURATION} weeks for ${player.nickname}. When it finishes the new role becomes primary and ${formatRole(player.role)} becomes his secondary role.`}
                    </DialogDescription>
                </DialogHeader>

                {!hasSecondaryRole ? (
                    <div className="space-y-4">
                        <label className="block space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">New primary role</span>
                            <Select onValueChange={val => setSelectedRole(val as Role)}>
                                <SelectTrigger className="h-10 w-full">
                                    <SelectValue placeholder="Choose a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.filter(r => formatRole(r.id) !== formatRole(player.role)).map(role => (
                                        <SelectItem key={role.id} value={role.id}>{role.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        {selectedRole && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <RoleTag role={player.role} />
                                    <ArrowRight size={14} className="text-ink-3" />
                                    <RoleTag role={selectedRole} className="border-gold text-ink-1" />
                                    <span className="text-xs text-ink-3">new primary</span>
                                </div>
                                <dl className="divide-y divide-line rounded-lg border border-line">
                                    <Line label="Duration" value={`${DURATION} weeks`} />
                                    <Line label="Cost" value={`${formatCurrency(WEEKLY_COST, "$", false)} / wk · ${formatCurrency(WEEKLY_COST * DURATION, "$", false)} total`} />
                                    <Line label="Energy" value="−10 per week" />
                                    <Line label="Drill slots" value={`Holds 1 of ${maxTrainingSlots} each week`} tone={slotsAvailable ? "text-ink-1" : "text-negative"} />
                                    <Line label="On completion" value={`${(ROLE_BONUSES[selectedRole] || []).map(b => `+${b.amount} ${b.stat}`).join(", ")}, +10 morale`} />
                                </dl>
                                <p className="text-xs leading-relaxed text-ink-3">
                                    Paid weekly; it pauses if the budget runs short or he is injured. He skips team drills and weekly training meanwhile. Stopping early refunds half of what was paid. A coach with high development raises the completion boosts.
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 py-2">
                        <RoleTag role={player.role} />
                        <span className="text-ink-3">+</span>
                        <RoleTag role={player.secondaryRole} />
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    {!hasSecondaryRole && (
                        <Button
                            onClick={() => selectedRole && onStartTraining(selectedRole as Role)}
                            disabled={!selectedRole || !canAfford || !slotsAvailable || tooTired}
                        >
                            {!slotsAvailable ? "No slots this week" : !canAfford ? "Not enough budget" : tooTired ? "Too exhausted" : "Start retraining"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
