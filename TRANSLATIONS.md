# Translations

Ankinator is localized through a small, type-safe i18n layer. This guide explains how strings are stored, how to change or add them, and how they are tested. It is aimed at contributors and maintainers.

## Supported languages

| Language | Code | Role                |
| -------- | ---- | ------------------- |
| English  | `en` | Reference language  |
| Spanish  | `es` | Translation         |

The active language follows Obsidian's own language setting. Any language that is not listed falls back to English.

## How it works

- `t(key, values?, language?)` in `src/i18n/index.ts` is the single entry point for user-facing text.
- Keys use dot notation, for example `settings.apiKey` or `modal.createButton`.
- Values may contain `{placeholder}` tokens that are replaced at runtime, for example `notices.success` → `"{count} cards sent to Anki."`.
- Resolution order: the requested language → English fallback → the key itself.
- `TranslationKey` is a union type derived from `en.json`, so an unknown key such as `t('modal.titel')` fails the TypeScript build. This is the main guard against typos and missing strings.
- The LLM system prompts are **not** part of the JSON files. They are bilingual templates built in `getLlmSystemPrompt()` inside `src/i18n/index.ts`, because they embed Anki metadata generated at runtime.

## Files

```text
src/i18n/
  index.ts       # t(), language detection, key types, system prompt builder
  en.json        # English strings (reference language)
  es.json        # Spanish strings
tests/
  i18n.test.mjs  # verification suite
TRANSLATIONS.md
```

## Changing or adding strings

1. Add the key to `en.json` (the reference) with a clear, descriptive name.
2. Add the exact same key to every other language file (`es.json`, and any new ones).
3. Use it in code through `t('section.key')`.
4. Run `npm test`.

Rules:

- Every user-facing string must go through `t()`: notices, settings labels and descriptions, button text, placeholders, headings, and command names.
- Keep placeholders identical across languages (`{count}` in English must also be `{count}` in Spanish).
- Never remove a key while the code still references it.
- Follow the tone, terminology, and casing of the existing entries so the UI stays consistent.
- Keep values short and action-oriented. See the [Obsidian style guide](https://help.obsidian.md/style-guide).

## Adding a new language

1. Copy `en.json` to `<code>.json` (for example `fr.json`).
2. Translate every value. **Do not** change keys or placeholders.
3. In `src/i18n/index.ts`:
   - import the new file,
   - add it to the `translations` map,
   - add its code to the `Language` union type.
4. Run `npm test`. The suite fails until the new language covers every key, which keeps all languages in sync.

## Testing

```bash
npm test
```

The suite (`tests/i18n.test.mjs`) uses Node's built-in test runner, so there are no extra dependencies. It verifies:

1. **Key parity** — every language defines exactly the same keys as the reference language.
2. **No empty values** — no translation is blank.
3. **Placeholder parity** — `{...}` tokens match across languages.
4. **Referenced keys exist** — every literal key used with `t('...')` exists in every language.
5. **No unused keys** — no orphan keys linger in the JSON files.
6. **No hardcoded UI strings** — literals passed to `new Notice(...)`, `createEl({ text })`, and `Setting` / `setText()` setters must be wrapped in `t()`.

The suite runs in CI on every push and pull request, alongside the build and lint steps.
