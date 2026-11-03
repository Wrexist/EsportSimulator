# Translations

English is the source language: `locales/en.ts` and the files it gathers from
`locales/en/`. A translation is a JSON file at `public/locales/<code>.json`
with the same keys and the text in that language.

## Languages in the game

German (`de`), Spanish (`es`), French (`fr`), Polish (`pl`), Brazilian
Portuguese (`pt-BR`) and Russian (`ru`), picked in Settings → Language. These
files are first drafts: players who speak the language are welcome to review
them and send corrections. `locales/GLOSSARY.md` lists the agreed word for
each core idea per language, plus the shared rules (Counter-Strike terms,
informal address, names left unchanged). Change a term there first.

Screens are moved over a few at a time. Until a screen is moved, it shows in
English in every language; `npx tsx scripts/i18n-report.ts` counts what is
left.

## Making or fixing a translation

1. `npx tsx scripts/i18n-report.ts --template` writes `locales/template.json`
   with every English string.
2. Copy it to `public/locales/<code>.json` (or edit the existing file) and
   replace each value.
   - Keep `{{name}}` parts exactly as they are; the game fills them in.
   - Keep `<b>…</b>`-style tags around the same words; they style that part.
   - Keys ending in `.one` / `.other` are plurals. Add the forms your
     language uses (`zero`, `one`, `two`, `few`, `many`, `other`), following
     the CLDR plural rules. A form may leave out `{{count}}`.
3. `npx tsx scripts/i18n-report.ts` lists missing keys, keys English does not
   have, and placeholder or tag mistakes. The test suite runs the same checks
   on every shipped file.

A language is only offered once its file has every key, so a half-done file
never shows mixed text.

## For developers

- Use `t("key")`, or `tn("key", count)` for a plural, from `@/lib/i18n`. For a
  sentence with styled parts use `<Trans k="key" tags={{ b: v => <b>{v}</b> }} />`
  from `@/lib/trans`.
- Translate at render time, never when a module loads: a module-level
  `t()` freezes English (a test fails on it). Turn such constants into
  functions or store the key.
- The whole interface re-mounts when the language changes (GameShell keys on
  the locale), so components need no extra hook to update.
- Names saved in a career in English (regions, divisions, stages) go through
  `lib/display-names.ts` when shown.
- Add every new string to the English files, grouped under its screen, and
  the same key to every file in `public/locales/`; the test suite fails until
  each language has it.
- Developer tools (dev tools tab, map editor, debug views) stay in English.
