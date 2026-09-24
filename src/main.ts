import { Plugin } from 'obsidian';
import { AnkiPluginSettings, DEFAULT_SETTINGS, AnkiOpenCodeSettingTab } from './settings';
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
        // Object.assign fusiona los ajustes por defecto con los que el usuario ya guardó
        const savedSettings = await this.loadData() as Partial<AnkiPluginSettings>;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    }

    async saveSettings() {
        // loadData y saveData son funciones nativas de Obsidian
        // Guardan la info en un archivo 'data.json' dentro de la carpeta de tu plugin
        await this.saveData(this.settings);
    }
}
