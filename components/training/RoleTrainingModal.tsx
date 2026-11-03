import { t } from "@/lib/i18n"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Role } from "@/types"
import { PlayerSaveData } from "@/engine/save-types"
import { formatRole, formatCurrency } from "@/lib/utils-extended"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { statLabel } from "@/components/training/weekly-training"

interface RoleTrainingModalProps {
    player: PlayerSaveData
    isOpen: boolean
    onClose: () => void
    onStartTraining: (targetRole: Role) => void
    currentBudget: number
    trainingSlotsUsed?: number
    maxTrainingSlots?: number
}

/** Retraining targets; the label is t(`tr.role.${id}`). */
const ROLES: { id: Role }[] = [{ id: "igl" }, { id: "entry" }, { id: "support" }, { id: "awper" }, { id: "rifler" }]

/** Completion boosts from TrainingManager.applyRoleBonuses (scaled up by the coach's development). Stats are player stat keys. */
const ROLE_BONUSES: Record<string, { stat: string, amount: number }[]> = {
    igl: [{ stat: "tactic", amount: 5 }, { stat: "leader", amount: 3 }],
    entry: [{ stat: "reaction", amount: 4 }, { stat: "rifle", amount: 4 }],
    support: [{ stat: "grenades", amount: 5 }, { stat: "teamwork", amount: 3 }],
    awper: [{ stat: "awp", amount: 6 }],
    rifler: [{ stat: "rifle", amount: 4 }, { stat: "skill", amount: 4 }],
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
                    <DialogTitle>{hasSecondaryRole ? t("tr.rt.twoRoles") : t("tr.rt.title")}</DialogTitle>
                    <DialogDescription className="text-ink-3">
                        {hasSecondaryRole
                            ? t("tr.rt.twoRolesBody", { name: player.nickname })
                            : t("tr.rt.body", { weeks: DURATION, name: player.nickname, role: formatRole(player.role) })}
                    </DialogDescription>
                </DialogHeader>

                {!hasSecondaryRole ? (
                    <div className="space-y-4">
                        <label className="block space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("tr.rt.newPrimary")}</span>
                            <Select onValueChange={val => setSelectedRole(val as Role)}>
                                <SelectTrigger className="h-10 w-full">
                                    <SelectValue placeholder={t("tr.rt.choose")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.filter(r => formatRole(r.id) !== formatRole(player.role)).map(role => (
                                        <SelectItem key={role.id} value={role.id}>{t(`tr.role.${role.id}`)}</SelectItem>
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
                                    <span className="text-xs text-ink-3">{t("tr.rt.newPrimaryShort")}</span>
                                </div>
                                <dl className="divide-y divide-line rounded-lg border border-line">
                                    <Line label={t("tr.rt.duration")} value={t("tr.rt.weeks", { n: DURATION })} />
                                    <Line label={t("tr.rt.cost")} value={t("tr.rt.costValue", { weekly: formatCurrency(WEEKLY_COST, "$", false), total: formatCurrency(WEEKLY_COST * DURATION, "$", false) })} />
                                    <Line label={t("tr.rt.energy")} value={t("tr.rt.energyValue")} />
                                    <Line label={t("tr.rt.slots")} value={t("tr.rt.slotsValue", { n: maxTrainingSlots })} tone={slotsAvailable ? "text-ink-1" : "text-negative"} />
                                    <Line label={t("tr.rt.completion")} value={[...(ROLE_BONUSES[selectedRole] || []).map(b => `+${b.amount} ${statLabel(b.stat)}`), t("tr.rt.morale")].join(", ")} />
                                </dl>
                                <p className="text-xs leading-relaxed text-ink-3">
                                    {t("tr.rt.note")}
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
                    <Button variant="outline" onClick={onClose}>{t("tr.close")}</Button>
                    {!hasSecondaryRole && (
                        <Button
                            onClick={() => selectedRole && onStartTraining(selectedRole as Role)}
                            disabled={!selectedRole || !canAfford || !slotsAvailable || tooTired}
                        >
                            {!slotsAvailable ? t("tr.rt.noSlots") : !canAfford ? t("tr.rt.noBudget") : tooTired ? t("tr.rt.tired") : t("tr.rt.start")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
