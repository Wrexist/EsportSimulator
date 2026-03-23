"use client"

import React from "react"
import { motion } from "framer-motion"
import { MessageSquare, Heart, Repeat2, Share, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SocialPost {
    id: string
    teamId?: string
    user: {
        name: string
        handle: string
        avatar: string
        isVerified?: boolean
    }
    content: string
    timestamp: string
    likes: number
    retweets: number
    replies: number
    image?: string
}

interface SocialFeedProps {
    posts: SocialPost[]
    onProfileClick?: (teamId: string) => void
}

export function SocialFeed({ posts, onProfileClick }: SocialFeedProps) {
    return (
        <div className="flex flex-col bg-black min-h-full">
            {posts.map((post, idx) => (
                <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="px-4 py-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                    <div className="flex gap-3">
                        {/* Avatar */}
                        <div
                            onClick={() => post.teamId && onProfileClick?.(post.teamId)}
                            className={cn(
                                "w-10 h-10 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-700 flex items-center justify-center shrink-0 border border-white/10 font-bold text-xs transition-transform",
                                post.teamId && "cursor-pointer hover:scale-105 active:scale-95"
                            )}
                        >
                            {post.user.avatar}
                        </div>

                        <div className="flex-1 min-w-0">
                            {/* Header */}
                            <div
                                onClick={() => post.teamId && onProfileClick?.(post.teamId)}
                                className={cn("flex items-center gap-1 mb-0.5", post.teamId && "cursor-pointer group/header")}
                            >
                                <span className={cn("font-bold text-[14px] text-white truncate", post.teamId && "group-hover/header:underline")}>
                                    {post.user.name}
                                </span>
                                {post.user.isVerified && <CheckCircle2 size={12} className="text-blue-400 shrink-0" />}
                                <span className="text-muted-foreground text-[14px] truncate">{post.user.handle}</span>
                                <span className="text-muted-foreground text-[14px] px-1">·</span>
                                <span className="text-muted-foreground text-[14px] whitespace-nowrap">{post.timestamp}</span>
                            </div>

                            {/* Content */}
                            <p className="text-[14px] leading-normal text-white/90 mb-3 whitespace-pre-wrap">
                                {post.content}
                            </p>

                            {/* Media (Optional) */}
                            {post.image && (
                                <div className="mb-3 rounded-2xl overflow-hidden border border-white/10">
                                    <img src={post.image} alt="Post content" className="w-full aspect-video object-cover" />
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center justify-between max-w-sm text-muted-foreground">
                                <button className="flex items-center gap-1.5 hover:text-blue-400 transition-colors group">
                                    <div className="p-2 rounded-full group-hover:bg-blue-400/10 transition-colors">
                                        <MessageSquare size={16} />
                                    </div>
                                    <span className="text-[12px]">{post.replies}</span>
                                </button>
                                <button className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors group">
                                    <div className="p-2 rounded-full group-hover:bg-emerald-400/10 transition-colors">
                                        <Repeat2 size={16} />
                                    </div>
                                    <span className="text-[12px]">{post.retweets}</span>
                                </button>
                                <button className="flex items-center gap-1.5 hover:text-rose-400 transition-colors group">
                                    <div className="p-2 rounded-full group-hover:bg-rose-400/10 transition-colors">
                                        <Heart size={16} />
                                    </div>
                                    <span className="text-[12px]">{post.likes}</span>
                                </button>
                                <button className="flex items-center gap-1.5 hover:text-blue-400 transition-colors group">
                                    <div className="p-2 rounded-full group-hover:bg-blue-400/10 transition-colors">
                                        <Share size={16} />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}
