import { NextRequest, NextResponse } from "next/server"

// ANSI color codes for terminal
const colors = {
    ERROR: "\x1b[31m", // Red
    WARN: "\x1b[33m",  // Yellow
    UNCAUGHT: "\x1b[35m", // Magenta
    PROMISE_REJECT: "\x1b[36m", // Cyan
    RESET: "\x1b[0m",
}

export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Disabled in production" }, { status: 404 })
    }

    try {
        const body = await request.json()
        const type = typeof body?.type === "string" ? body.type : "INFO"
        const message = typeof body?.message === "string" ? body.message : ""

        if (message.length === 0 || message.length > 8000) {
            return NextResponse.json({ error: "Invalid message length" }, { status: 400 })
        }

        const color = colors[type as keyof typeof colors] || colors.RESET
        const timestamp = new Date().toLocaleTimeString()

        // Output to terminal with colors
        console.log(`\n${color}[BROWSER ${type}] ${timestamp}${colors.RESET}`)
        console.log(message)
        console.log(`${color}${"─".repeat(60)}${colors.RESET}`)

        return NextResponse.json({ ok: true })
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
}
