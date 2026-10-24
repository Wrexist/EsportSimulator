# Translations

English is the source language: `locales/en.ts`. A translation is a JSON file
at `public/locales/<code>.json` (for example `de.json`, `pt-BR.json`) with the
same keys and the text in that language. Translations are written by people
who speak the language; the game does not translate anything itself.

## Making a translation

1. `npx tsx scripts/i18n-report.ts --template` writes `locales/template.json`
   with every English string.
2. Copy it to `public/locales/<code>.json` and replace each value.
   - Keep `{{name}}` parts exactly as they are; the game fills them in.
   - Keys ending in `.one` / `.other` are plurals. Add the forms your
     language uses (`zero`, `one`, `two`, `few`, `many`, `other`), following
     the CLDR plural rules. A form may leave out `{{count}}`.
3. `npx tsx scripts/i18n-report.ts` lists missing keys, keys English does not
   have, and placeholder mistakes.

A language is only offered once its file has every key, so a half-done file
never shows mixed text.

## For developers

- Use `t("key")`, or `tn("key", count)` for a plural, from `@/lib/i18n`, and
  call `useLocale()` in the component so it re-renders on a language change.
- Add every new string to `locales/en.ts`, grouped under its screen.
- So far the top bar, the screen search and the main menu go through the
  translation layer; the report counts what is left. A language picker in
  Settings comes with the first translation (`loadLocaleFile` + `setLocale`).
