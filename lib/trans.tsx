"use client"

import { Fragment, type ReactNode } from "react"
import { t } from "./i18n"

const TAG = /<([a-z][a-z0-9]*)>([\s\S]*?)<\/\1>/g

/**
 * A translated sentence with styled parts. The text marks them with simple
 * tags, "Press <kbd>F1</kbd> anywhere", and `tags` says how each one renders,
 * so a translator can move the styled word to wherever it belongs.
 */
export function Trans({ k, params, tags }: {
    k: string
    params?: Record<string, string | number>
    tags: Record<string, (text: string) => ReactNode>
}) {
    const text = t(k, params)
    const out: ReactNode[] = []
    let last = 0
    for (const m of text.matchAll(TAG)) {
        if (m.index! > last) out.push(text.slice(last, m.index))
        const render = tags[m[1]]
        out.push(<Fragment key={out.length}>{render ? render(m[2]) : m[2]}</Fragment>)
        last = m.index! + m[0].length
    }
    if (last < text.length) out.push(text.slice(last))
    return <>{out}</>
}
