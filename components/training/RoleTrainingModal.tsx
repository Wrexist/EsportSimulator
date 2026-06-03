import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { Role } from "@/types"
import { PlayerSaveData } from "@/engine/save-types"
import { formatRole } from "@/lib/utils-extended"
import { Coins, Clock, ArrowRight, Activity, TrendingUp, Users } from "lucide-react"

interface RoleTrainingModalProps {
    player: PlayerSaveData
    isOpen: boolean
    onClose: () => void
    onStartTraining: (targetRole: Role) => void
    currentBudget: number
    trainingSlotsUsed?: number
    maxTrainingSlots?: number
}

const ROLES: { id: Role, label: string, desc: string }[] = [
    { id: "igl", label: "In-Game Leader", desc: "Focus on Tactics & Leadership" },
    { id: "entry", label: "Entry Fragger", desc: "Focus on Reaction & Aim" },
    { id: "support", label: "Support", desc: "Focus on Utility & Teamwork" },
    { id: "awper", label: "AWPer", desc: "Focus on AWPing & Positioning" },
    { id: "rifler", label: "Rifler", desc: "General Rifle Proficiency" },
]

const ROLE_BONUSES: Record<string, { stat: string, amount: number }[]> = {
    igl: [{ stat: "Tactics", amount: 5 }, { stat: "Leadership", amount: 3 }],
    entry: [{ stat: "Reaction", amount: 4 }, { stat: "Rifle", amount: 4 }],
    support: [{ stat: "Grenades", amount: 5 }, { stat: "Teamwork", amount: 3 }],
    awper: [{ stat: "AWP", amount: 6 }],
    rifler: [{ stat: "Rifle", amount: 4 }, { stat: "Skill", amount: 4 }],
}

export function RoleTrainingModal({ player, isOpen, onClose, onStartTraining, currentBudget, trainingSlotsUsed = 0, maxTrainingSlots = 10 }: RoleTrainingModalProps) {
    const [selectedRole, setSelectedRole] = useState<Role | "">("")

    const COST = 5000
    const DURATION = 8
    const TOTAL_COST = COST * DURATION

    // Can afford at least one week?
    const canAfford = currentBudget >= COST
    const hasSecondaryRole = !!player.secondaryRole
    const slotsAvailable = trainingSlotsUsed < maxTrainingSlots


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="glass-panel border-white/10 bg-black/90 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        {hasSecondaryRole ? "Training Limit Reached" : "Add Secondary Role"}
                        <span className="text-primary ml-auto text-sm">{player.nickname}</span>
                    </DialogTitle>
                    <DialogDescription className="text-white/60">
                        {hasSecondaryRole
                            ? "This player has already mastered 2 roles (Primary + Secondary). No further role training is possible."
                            : "Enroll player in an intensive 8-week bootcamp. On completion, the new role becomes their primary and the current role becomes secondary."
                        }
                    </DialogDescription>
                </DialogHeader>

                {!hasSecondaryRole ? (
                    <div className="space-y-5 py-4">
                        {/* Role Selection */}
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-white/40">Target Secondary Role</label>
                            <Select onValueChange={(val) => setSelectedRole(val as Role)}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-12">
                                    <SelectValue placeholder="Select a secondary role" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                    {ROLES.filter(r => r.id !== player.role.toLowerCase()).map(role => (
                                        <SelectItem key={role.id} value={role.id}>
                                            <div className="flex flex-col text-left">
                                                <span className="font-bold">{role.label}</span>
                                                <span className="text-xs text-white/50">{role.desc}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Cost Breakdown */}
                        {selectedRole && (
                            <div className="bg-white/5 rounded-xl p-4 space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-white/60 flex items-center gap-2">
                                        <Clock size={14} /> Duration
                                    </span>
                                    <span className="font-bold text-white">{DURATION} Weeks</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-white/60 flex items-center gap-2">
                                        <Coins size={14} /> Weekly Cost
                                    </span>
                                    <span className="font-bold text-rose-400">-${COST.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-white/60 flex items-center gap-2">
                                        <Activity size={14} /> Energy Drain
                                    </span>
                                    <span className="font-bold text-amber-400">-10/week</span>
                                </div>
                                <div className="h-px bg-white/10" />
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-white/60">Total Cost</span>
                                    <span className="font-bold text-rose-400">-${TOTAL_COST.toLocaleString()}</span>
                                </div>
                            </div>
                        )}

                        {/* Stat Bonuses Preview */}
                        {selectedRole && ROLE_BONUSES[selectedRole] && (
                            <div className="bg-emerald-500/5 rounded-xl p-4 space-y-2 border border-emerald-500/10">
                                <div className="flex items-center gap-2 text-xs uppercase font-bold text-emerald-400/70 tracking-wider mb-1">
                                    <TrendingUp size={12} /> Completion Bonuses
                                </div>
                                {ROLE_BONUSES[selectedRole].map(bonus => (
                                    <div key={bonus.stat} className="flex justify-between items-center text-sm">
                                        <span className="text-white/60">{bonus.stat}</span>
                                        <span className="font-bold text-emerald-400">+{bonus.amount}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Slot Status */}
                        {selectedRole && (
                            <div className="flex items-center justify-between text-[11px] text-white/40 px-1">
                                <span className="flex items-center gap-1.5">
                                    <Users size={12} />
                                    Training Slots: {trainingSlotsUsed}/{maxTrainingSlots}
                                </span>
                                {!slotsAvailable && (
                                    <span className="text-red-400 font-bold">No slots available</span>
                                )}
                            </div>
                        )}

                        {/* Comparison */}
                        {selectedRole && (
                            <div className="flex items-center justify-center gap-3 text-sm font-bold uppercase">
                                <Badge variant="outline" className="border-white/20 text-white/60">{formatRole(player.role)}</Badge>
                                <ArrowRight size={14} className="text-white/20" />
                                <Badge className="bg-primary/20 text-primary hover:bg-primary/30">{ROLES.find(r => r.id === selectedRole)?.label}</Badge>
                                <span className="text-[10px] text-white/30 font-normal normal-case">(new primary)</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 text-center space-y-4">
                        <div className="text-4xl">🔒</div>
                        <p className="text-white/40 max-w-[200px] mx-auto text-sm">
                            Maximum role capability reached.
                        </p>
                        <div className="flex justify-center gap-2">
                            <Badge variant="secondary">{formatRole(player.role)}</Badge>
                            <span className="text-white/20">+</span>
                            <Badge variant="secondary">{formatRole(player.secondaryRole)}</Badge>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} className="hover:bg-white/10">Close</Button>
                    {!hasSecondaryRole && (
                        <Button
                            onClick={() => selectedRole && onStartTraining(selectedRole as Role)}
                            disabled={!selectedRole || !canAfford || !slotsAvailable}
                            className="bg-primary hover:bg-primary/80 text-black font-bold"
                        >
                            {!slotsAvailable ? "No Slots Available" : !canAfford ? "Insufficient Funds" : "Start Training"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
