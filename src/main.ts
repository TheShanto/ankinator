import { Plugin } from 'obsidian';
import {
    AnkiPluginSettings,
    DEFAULT_SETTINGS,
    AnkiOpenCodeSettingTab,
    LLM_PROVIDERS,
} from './settings';
import { AnkiController } from './services/controller';
import { AnkiCardsModal } from './ui/modal';
import { NoteSelectionModal } from './ui/noteSelectionModal';
import { t } from './i18n';

export default class AnkiOpenCodePlugin extends Plugin {
    settings!: AnkiPluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new AnkiOpenCodeSettingTab(this.app, this));

        this.addCommand({
            id: 'create-anki-cards',
            name: t('command.createCards'),
            callback: () => {
                new AnkiCardsModal(this.app, new AnkiController(this)).open();
            },
        });

        this.addCommand({
            id: 'create-anki-cards-from-notes',
            name: t('command.createCardsFromNotes'),
            callback: () => {
                new NoteSelectionModal(this.app, (files) => {
                    new AnkiCardsModal(this.app, new AnkiController(this), files).open();
                }).open();
            },
        });
    }

    onunload() {
        
    }

    // Auxiliar Functions to load data and save data in the plugin's data.json file
    async loadSettings() {
        const savedSettings: unknown = await this.loadData();
        this.settings = normalizeSettings(savedSettings);
    }

    async saveSettings() {
        // loadData y saveData son funciones nativas de Obsidian
        // Guardan la info en un archivo 'data.json' dentro de la carpeta de tu plugin
        await this.saveData(this.settings);
    }
}

function normalizeSettings(value: unknown): AnkiPluginSettings {
    if (typeof value !== 'object' || value === null) {
        return { ...DEFAULT_SETTINGS };
    }

    const saved = value as Record<string, unknown>;
    const llmMode = saved.llmMode === 'provider' || saved.llmMode === 'local'
        ? saved.llmMode
        : DEFAULT_SETTINGS.llmMode;
    const providerId = typeof saved.providerId === 'string' && saved.providerId in LLM_PROVIDERS
        ? saved.providerId
        : DEFAULT_SETTINGS.providerId;

    return {
        llmMode,
        localUrl: typeof saved.localUrl === 'string' ? saved.localUrl : DEFAULT_SETTINGS.localUrl,
        providerId,
        customProviderUrl: typeof saved.customProviderUrl === 'string'
            ? saved.customProviderUrl
            : DEFAULT_SETTINGS.customProviderUrl,
        apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : DEFAULT_SETTINGS.apiKey,
        selectedModel: typeof saved.selectedModel === 'string'
            ? saved.selectedModel
            : DEFAULT_SETTINGS.selectedModel,
        ankiConnectUrl: typeof saved.ankiConnectUrl === 'string'
            ? saved.ankiConnectUrl
            : DEFAULT_SETTINGS.ankiConnectUrl,
        defaultDeck: typeof saved.defaultDeck === 'string'
            ? saved.defaultDeck
            : DEFAULT_SETTINGS.defaultDeck,
    };
}
