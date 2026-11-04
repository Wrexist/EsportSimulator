/**
 * News items and storyline lines keep their English text and, when written
 * with translation keys, a TextRef next to it: these show the active language.
 */
import { isTextRef, tRef, type TextRef } from "./i18n"
import "./stored-text"

export const newsTitle = (n: { title: string; titleRef?: TextRef }): string => (isTextRef(n.titleRef) ? tRef(n.titleRef) : n.title)
export const newsContent = (n: { content: string; contentRef?: TextRef }): string => (isTextRef(n.contentRef) ? tRef(n.contentRef) : n.content)
/** A storyline beat, a choice or any `{ text, ref }` line. */
export const lineText = (l: { text: string; ref?: TextRef }): string => (isTextRef(l.ref) ? tRef(l.ref) : l.text)
