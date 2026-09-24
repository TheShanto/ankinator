# Ankinator

Ankinator is an Obsidian plugin that turns notes, selected text, or multiple files into study cards for Anki using large language models (LLMs) and AnkiConnect.

The goal is to speed up flashcard creation without leaving your Obsidian workflow: select the content, choose how many cards to generate, and send them directly into your Anki deck.

## Privacy and external services

Ankinator does not require payment or an account. It does not display advertisements and does not collect server-side telemetry. The plugin does not include a separate privacy policy because it does not send analytics or usage data to a telemetry service.

The plugin uses network requests only for the services required to generate and create cards:

- **LLM provider:** You can use a local OpenAI-compatible service, such as Ollama, or an external provider such as OpenAI, OpenRouter, Groq, Together AI, DeepSeek, Mistral, or a custom endpoint. When an external provider is selected, the note content or selected text is sent to that provider to generate cards. The provider API key is sent only as authentication for that request. Review the provider's privacy policy and terms before sending sensitive content.
- **AnkiConnect:** The plugin connects to the AnkiConnect URL configured by you, normally a local Anki instance at `http://localhost:8765`, to read available decks and note types and to create cards. Generated card content is sent to Anki through this connection.

When a local LLM is selected, the note content is sent to the configured local endpoint instead of a cloud provider. The plugin does not access files outside the Obsidian vault; it reads only the active note, selected notes, or files explicitly selected in the plugin.

## What this project does

- Generates study cards from the active note.
- Generates cards from selected text in the editor.
- Generates cards from multiple Markdown files at once.
- Supports a local LLM setup (for example, an OpenAI-compatible local server such as Ollama) or an external provider.
- Supports OpenAI, OpenRouter, Groq, Together, DeepSeek, Mistral, and a custom provider.
- Sends generated cards to Anki through AnkiConnect.
- Lets you configure the target deck, Anki model, and card field names.
- Enforces a total card generation limit to prevent excessive use.

## Use cases

- Turn lecture notes or reading summaries into review cards.
- Create study cards from meeting notes or lesson materials.
- Generate vocabulary or concept cards from multiple files.
- Keep your study workflow in Obsidian without manually copying content into Anki.

## Workflow

1. Configure the LLM environment in the plugin settings tab.
2. Choose whether to use a local model or an external provider.
3. Configure the AnkiConnect URL and the target deck/model.
4. Open a note in Obsidian or select text.
5. Run the plugin command to create cards.
6. The plugin reads the content, sends it to the LLM with a generation prompt, parses the response, and creates notes in Anki.

In simple terms, the workflow is:

Obsidian note -> LLM generation -> flashcards -> AnkiConnect -> Anki

### Recommended setup

- Local LLM: use an OpenAI-compatible endpoint such as a local Ollama server or equivalent local API.
- External LLM: provide the provider API key and select an available model.
- AnkiConnect: make sure Anki is running and that the AnkiConnect add-on is installed and reachable at the configured URL.

## Project structure

```text
.
├── src/
│   ├── main.ts                 # Plugin entry point
│   ├── settings.ts             # Plugin settings and configuration
│   ├── i18n.ts                 # Internationalized strings
│   ├── services/
│   │   ├── ankiConnectApi.ts    # AnkiConnect integration
│   │   ├── controller.ts        # Card creation logic
│   │   └── llmApi.ts            # LLM connection and generation logic
│   └── ui/
│       ├── modal.ts             # Main modal for creating cards
│       └── noteSelectionModal.ts
├── manifest.json
├── package.json
├── LICENSE
├── README.md
├── esbuild.config.mjs
└── styles.css
```

## Development and running

Requirements:

- Node.js 18+
- npm
- Obsidian
- Anki + AnkiConnect

Install dependencies:

```bash
npm install
```

Development mode:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

### Manual testing

1. Build the plugin with `npm run build`.
2. Copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder in your Obsidian vault.
3. Restart Obsidian and enable the plugin from **Settings → Community plugins**.
4. Open a note and run the plugin command.

## Contributing

Contributions are welcome. To contribute in a clean and consistent way:

1. Fork the repository.
2. Create a branch for your change.
3. Keep the change focused and small.
4. Run `npm run build` and `npm run lint` before submitting a pull request.
5. Open a pull request with a clear description of:
   - the problem being solved,
   - the proposed fix,
   - and any configuration or usage changes required.

### Contribution guidelines

- Keep changes small and specific.
- Avoid adding large dependencies unless they are clearly necessary.
- Favor compatibility with Obsidian and standard LLM interfaces.
- If you change plugin settings, document the new option in the README or relevant workflow notes.
- If you add new features, aim for clear, testable behavior.

## Contribution style

- Use descriptive branch names.
- Keep the code readable and modular.
- Keep logic separate from UI concerns whenever possible.
- Document behavioral changes that may affect existing users.

## License

This project is licensed under the MIT License.

The MIT License allows you to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, provided that the copyright notice and permission notice are included in all copies or substantial portions of the software.

The full license text is included in [LICENSE](./LICENSE).

## Final note

Ankinator is designed to simplify flashcard creation directly from Obsidian, keeping the workflow focused on your notes, your content, and your study productivity.

If you want to extend the project, you can contribute new model integrations, parsing improvements, user experience enhancements, or additional card format support.
