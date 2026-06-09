"use client"

import React, { useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Search, CheckCircle, ChevronLeft, Users, TrendingUp, Hash, MessageCircle, Heart, Repeat2, Bookmark, MoreHorizontal, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TeamSaveData, SocialPost } from "@/engine/save-types"

interface SocialAppProps {
    posts: SocialPost[]
    teams: TeamSaveData[]
    playerTeam?: TeamSaveData
    currentWeek?: number
    onPublish?: (content: string) => void
}

// Render a handle without doubling the "@" — stored handles already include it.
function displayHandle(handle: string): string {
    return handle.startsWith("@") ? handle : `@${handle}`
}

// Avatars are short initials (e.g. "MC"), not asset paths. Only treat a value
// as an image when it actually looks like one — otherwise render the initials.
function isImagePath(avatar: string): boolean {
    return /^(\/|https?:|data:)/.test(avatar) || /\.(png|jpe?g|webp|svg|gif)$/i.test(avatar)
}

// Cross-week aging for the persisted timeline: this week shows the intra-week
// hint ("2h"), older posts show "{N}w".
function postAge(post: SocialPost, currentWeek?: number): string {
    if (currentWeek == null || !post.week) return post.timestamp
    const diff = currentWeek - post.week
    if (diff <= 0) return post.timestamp
    return `${diff}w`
}

export function SocialApp({ posts, teams, playerTeam, currentWeek, onPublish }: SocialAppProps) {
    const [activeTab, setActiveTab] = useState<"feed" | "trending" | "profiles" | "profile">("feed")
    const [selectedTeamProfile, setSelectedTeamProfile] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [draft, setDraft] = useState("")

    const submitPost = () => {
        const text = draft.trim()
        if (!text || !onPublish) return
        onPublish(text)
        setDraft("")
    }

    const selectedTeam = teams.find(t => t.id === selectedTeamProfile)

    // Generate trending topics
    const trendingTopics = [
        { tag: "MajorChampionship", posts: "2.4K", category: "Tournament" },
        { tag: "TransferRumors", posts: "1.8K", category: "Market" },
        { tag: "ProPlayerMoves", posts: "1.2K", category: "Transfers" },
        { tag: "ESLProLeague", posts: "956", category: "Tournament" },
        { tag: "StrategyTalk", posts: "743", category: "Discussion" },
    ]

    const tabs = [
        { id: "feed" as const, label: "For You", icon: Hash },
        { id: "trending" as const, label: "Trending", icon: TrendingUp },
        { id: "profiles" as const, label: "Orgs", icon: Users },
        { id: "profile" as const, label: "Profile", icon: User },
    ]

    return (
        <div className="flex flex-col h-full bg-black/20">
            {/* Header Tabs */}
            <div className="flex items-center border-b border-white/5 bg-white/[0.02] shrink-0">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-semibold transition-colors duration-75 ease-out relative active:scale-[0.97] active:duration-0",
                            activeTab === tab.id ? "text-white" : "text-white/50 hover:text-white/70"
                        )}
                    >
                        <tab.icon size={12} />
                        {tab.label}
                        {activeTab === tab.id && (
                            <motion.div
                                initial={{ opacity: 0, scaleX: 0 }}
                                animate={{ opacity: 1, scaleX: 1 }}
                                className="absolute bottom-0 left-4 right-4 h-0.5 bg-cyan-400 rounded-full"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                <AnimatePresence mode="wait">
                    {activeTab === "feed" && (
                        <motion.div
                            key="feed"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="h-full overflow-y-auto custom-scrollbar"
                        >
                            {/* Compose */}
                            <div className="p-3 border-b border-white/5">
                                <div className="flex gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                        {playerTeam?.name?.substring(0, 2).toUpperCase() || "ME"}
                                    </div>
                                    <div className="flex-1">
                                        <textarea
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value.slice(0, 280))}
                                            onKeyDown={(e) => {
                                                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitPost()
                                            }}
                                            placeholder="What's happening in esports?"
                                            rows={draft ? 2 : 1}
                                            aria-label="Write a post"
                                            className="w-full resize-none bg-white/5 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all"
                                        />
                                        {draft.trim() && (
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-[9px] text-white/30">{280 - draft.length} left · ⌘↵ to post</span>
                                                <Button
                                                    size="sm"
                                                    onClick={submitPost}
                                                    className="h-7 px-4 rounded-full text-[10px] font-bold bg-cyan-500 hover:bg-cyan-400 text-black"
                                                >
                                                    Post
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Posts */}
                            {posts.map((post, idx) => (
                                <motion.div
                                    key={post.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="p-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex gap-2">
                                        <div
                                            onClick={() => post.teamId && setSelectedTeamProfile(post.teamId)}
                                            className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center text-[10px] font-bold shrink-0 cursor-pointer hover:ring-2 hover:ring-cyan-500/30 transition-shadow duration-75 ease-out overflow-hidden active:scale-95 active:duration-0"
                                        >
                                            {isImagePath(post.user.avatar) ? (
                                                <Image src={post.user.avatar} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
                                            ) : (
                                                post.user.avatar || post.user.name.substring(0, 2).toUpperCase()
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1 mb-0.5">
                                                <span className="text-[11px] font-semibold text-white truncate">{post.user.name}</span>
                                                {post.user.isVerified && <CheckCircle size={10} className="text-blue-400 shrink-0" />}
                                                <span className="text-[10px] text-white/40 truncate">{displayHandle(post.user.handle)}</span>
                                                <span className="text-[10px] text-white/30">·</span>
                                                <span className="text-[10px] text-white/30">{postAge(post, currentWeek)}</span>
                                            </div>
                                            <p className="text-[11px] text-white/80 leading-relaxed mb-2">{post.content}</p>

                                            {/* Post Actions */}
                                            <div className="flex items-center gap-4">
                                                <button className="flex items-center gap-1 text-[9px] text-white/40 hover:text-cyan-400 transition-colors">
                                                    <MessageCircle size={12} />
                                                    {post.replies}
                                                </button>
                                                <button className="flex items-center gap-1 text-[9px] text-white/40 hover:text-emerald-400 transition-colors">
                                                    <Repeat2 size={12} />
                                                    {post.retweets}
                                                </button>
                                                <button className="flex items-center gap-1 text-[9px] text-white/40 hover:text-rose-400 transition-colors">
                                                    <Heart size={12} />
                                                    {post.likes}
                                                </button>
                                                <button type="button" aria-label="Bookmark post" className="text-white/40 hover:text-white active:text-white/90 active:scale-90 transition-all">
                                                    <Bookmark size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}

                    {activeTab === "trending" && (
                        <motion.div
                            key="trending"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="h-full overflow-y-auto custom-scrollbar p-3"
                        >
                            <h3 className="text-xs font-bold text-white mb-3">Trending in Esports</h3>
                            <div className="space-y-1">
                                {trendingTopics.map((topic, idx) => (
                                    <motion.div
                                        key={topic.tag}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="p-2.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors duration-75 ease-out group active:scale-[0.99] active:duration-0"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-[9px] text-white/40">{topic.category} · Trending</p>
                                                <p className="text-[12px] font-bold text-white group-hover:text-cyan-400 transition-colors">#{topic.tag}</p>
                                                <p className="text-[9px] text-white/40">{topic.posts} posts</p>
                                            </div>
                                            <button type="button" aria-label="More options" className="p-1 hover:bg-white/10 active:bg-white/15 active:scale-90 rounded transition-all opacity-0 group-hover:opacity-100">
                                                <MoreHorizontal size={14} className="text-white/40" />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Who to Follow */}
                            <h3 className="text-xs font-bold text-white mt-6 mb-3">Who to Follow</h3>
                            <div className="space-y-2">
                                {teams.slice(0, 5).map(team => (
                                    <div
                                        key={team.id}
                                        onClick={() => setSelectedTeamProfile(team.id)}
                                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors duration-75 ease-out active:scale-[0.99] active:duration-0"
                                    >
                                        <div
                                            className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center text-[10px] font-bold overflow-hidden border"
                                            style={{ borderColor: team.branding?.primaryColor ?? "transparent" }}
                                        >
                                            {team.logoPath ? (
                                                <Image src={team.logoPath || "/team_placeholder.webp"} alt={team.name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                                            ) : (
                                                team.name.substring(0, 2).toUpperCase()
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[11px] font-semibold text-white truncate">{team.name}</span>
                                                {(team.reputation ?? 0) > 80 && <CheckCircle size={10} className="text-blue-400 shrink-0" />}
                                            </div>
                                            <p className="text-[9px] text-white/40">@{team.name.replace(/\s/g, "").toLowerCase()}</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="h-6 text-[9px] rounded-full border-white/20 px-3">
                                            Follow
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "profiles" && (
                        <motion.div
                            key="profiles"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="h-full overflow-y-auto custom-scrollbar p-3 space-y-3"
                        >
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search organizations..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 placeholder:text-white/30"
                                />
                            </div>

                            {/* Team List */}
                            <div className="space-y-1">
                                {[...teams]
                                    .filter(t => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .sort((a, b) => (b.followers || 0) - (a.followers || 0))
                                    .slice(0, 15)
                                    .map(team => (
                                        <div
                                            key={team.id}
                                            onClick={() => setSelectedTeamProfile(team.id)}
                                            className="flex items-center gap-2.5 p-2.5 hover:bg-white/5 rounded-xl cursor-pointer transition-[background-color,transform] duration-75 ease-out group hover:translate-x-1 active:translate-x-0 active:scale-[0.99] active:duration-0"
                                        >
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 flex items-center justify-center shrink-0 border border-white/10 font-bold text-[10px] overflow-hidden">
                                                {team.logoPath ? (
                                                    <Image src={team.logoPath || "/team_placeholder.webp"} alt={team.name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                                                ) : (
                                                    team.name.substring(0, 2).toUpperCase()
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-semibold text-[11px] truncate text-white/90">{team.name}</span>
                                                    {(team.reputation ?? 0) > 80 && (
                                                        <CheckCircle size={10} className="text-blue-400 shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-white/40">@{team.name.replace(/\s/g, "").toLowerCase()}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-[11px] text-white/80">{(team.followers || 0).toLocaleString()}</p>
                                                <p className="text-[8px] text-white/50 uppercase tracking-wider">Followers</p>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Team Profile Overlay */}
                <AnimatePresence>
                    {activeTab === "profile" && playerTeam && (
                        <motion.div
                            key="profile"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="h-full overflow-y-auto custom-scrollbar bg-black/40"
                        >
                            {/* Banner */}
                            <div className="h-24 bg-gradient-to-br from-cyan-900 to-blue-900 relative">
                                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 to-transparent" />
                            </div>

                            {/* Info */}
                            <div className="px-5 -mt-8 pb-6 relative">
                                <div className="flex justify-between items-end mb-4">
                                    <div className="w-16 h-16 rounded-2xl bg-neutral-900 border-4 border-neutral-950 flex items-center justify-center text-xl font-normal shadow-2xl shadow-cyan-900/20 overflow-hidden">
                                        {playerTeam.logoPath ? (
                                            <Image src={playerTeam.logoPath || "/team_placeholder.webp"} alt={playerTeam.name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                                        ) : (
                                            playerTeam.name.substring(0, 2).toUpperCase()
                                        )}
                                    </div>
                                    <Button variant="outline" className="rounded-full text-xs px-4 h-8 bg-white/5 border-white/10 hover:bg-white/10 text-white">
                                        Edit Profile
                                    </Button>
                                </div>

                                <div className="mb-6">
                                    <h2 className="text-xl font-bold text-white mb-0.5 flex items-center gap-2">
                                        {playerTeam.name}
                                        <CheckCircle size={14} className="text-blue-400" />
                                    </h2>
                                    <p className="text-xs text-white/50">@{playerTeam.name.replace(/\s/g, "").toLowerCase()}</p>
                                </div>

                                <div className="flex gap-6 text-xs text-white/50 border-y border-white/5 py-4 mb-6">
                                    <div>
                                        <span className="font-bold text-white text-sm mr-1">{(playerTeam.followers || 0).toLocaleString()}</span>
                                        Followers
                                    </div>
                                    <div>
                                        <span className="font-bold text-white text-sm mr-1">{playerTeam.reputation || 50}%</span>
                                        Reputation
                                    </div>
                                    <div>
                                        <span className="font-bold text-white text-sm mr-1">#{playerTeam.worldRanking || "?"}</span>
                                        Rank
                                    </div>
                                </div>

                                <h3 className="font-bold text-sm text-white mb-3">Posts</h3>
                                <div className="space-y-4">
                                    {posts.filter(p => p.teamId === playerTeam.id).map(post => (
                                        <div key={post.id} className="p-3 bg-white/5 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] text-white/50">{postAge(post, currentWeek)}</span>
                                            </div>
                                            <p className="text-xs text-white/80">{post.content}</p>
                                        </div>
                                    ))}
                                    {posts.filter(p => p.teamId === playerTeam.id).length === 0 && (
                                        <div className="text-center py-10" role="status" aria-live="polite">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 mb-1">
                                                Nothing trending
                                            </p>
                                            <p className="text-xs text-white/55 max-w-[220px] mx-auto leading-relaxed">
                                                Win a match or sign a marquee player to start building your brand on the timeline.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {selectedTeamProfile && selectedTeam && (
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="absolute inset-0 bg-neutral-950 flex flex-col overflow-hidden"
                        >
                            {/* Header */}
                            <div className="px-3 py-2.5 flex items-center gap-3 bg-black/40 backdrop-blur-sm border-b border-white/5 shrink-0">
                                <button
                                    onClick={() => setSelectedTeamProfile(null)}
                                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-sm truncate">{selectedTeam.name}</h3>
                                    <p className="text-[9px] text-white/40">Organization Profile</p>
                                </div>
                            </div>

                            {/* Profile Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {/* Banner */}
                                <div className="h-20 bg-gradient-to-br from-neutral-800 to-neutral-900 relative">
                                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 to-transparent" />
                                </div>

                                {/* Info */}
                                <div className="px-3 -mt-6 pb-6 relative">
                                    <div className="flex justify-between items-end mb-3">
                                        <div className="w-14 h-14 rounded-2xl bg-neutral-900 border-4 border-neutral-950 flex items-center justify-center text-lg font-normal overflow-hidden">
                                            {selectedTeam.logoPath ? (
                                                <Image src={selectedTeam.logoPath || "/team_placeholder.webp"} alt={selectedTeam.name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                                            ) : (
                                                selectedTeam.name.substring(0, 2).toUpperCase()
                                            )}
                                        </div>
                                        <Button variant="outline" size="sm" className="rounded-full text-[10px] border-white/20 h-7">
                                            Follow
                                        </Button>
                                    </div>

                                    <h2 className="text-base font-bold mb-0.5">{selectedTeam.name}</h2>
                                    <p className="text-[10px] text-white/50 mb-2">@{selectedTeam.name.replace(/\s/g, "").toLowerCase()}</p>

                                    <p className="text-[11px] text-white/70 leading-relaxed mb-3">
                                        Official esports organization competing at the highest level. Driven by excellence.
                                    </p>

                                    <div className="flex gap-4 text-[10px] text-white/50 border-y border-white/5 py-2.5">
                                        <div>
                                            <span className="font-bold text-white">{(selectedTeam.followers || 0).toLocaleString()}</span> Followers
                                        </div>
                                        <div>
                                            <span className="font-bold text-white">{selectedTeam.reputation || 50}%</span> Rep
                                        </div>
                                        <div>
                                            <span className="font-bold text-white">#{selectedTeam.worldRanking || "?"}</span> Rank
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
