"use client"

import { AnimationShowcase } from "@/components/debug/AnimationShowcase"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function AnimationPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-4xl space-y-4">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="text-white/50 hover:text-white"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </Button>
                <AnimationShowcase />
            </div>
        </div>
    )
}
