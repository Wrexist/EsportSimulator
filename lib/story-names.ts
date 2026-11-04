import type { StoryArcKind } from "@/engine/storylines/types"
import { t } from "@/lib/i18n"

/** A storyline's kind ("Rising star", "Slump"), in the active language. */
export const storyKindName = (kind: StoryArcKind): string => t(`story.kind.${kind}`)
