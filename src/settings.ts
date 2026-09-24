import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import AnkiOpenCodePlugin from './main';
import { AnkiConnectApi, DEFAULT_ANKI_CONNECT_SETTINGS } from './services/ankiConnectApi';
import { LLMConnector } from './services/llmApi';
import { t } from './i18n';

export const LLM_PROVIDERS: Record<string, { baseUrl: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
    groq: { baseUrl: 'https://api.groq.com/openai/v1' },
    together: { baseUrl: 'https://api.together.xyz/v1' },
    deepseek: { baseUrl: 'https://api.deepseek.com/v1' },
    mistral: { baseUrl: 'https://api.mistral.ai/v1' },
    custom: { baseUrl: '' },
};

export interface AnkiPluginSettings {
    llmMode: 'local' | 'provider';
    localUrl: string;
    providerId: string;
    customProviderUrl: string;
    apiKey: string;
    selectedModel: string;
    ankiConnectUrl: string;
    defaultDeck: string;
}

export const DEFAULT_SETTINGS: AnkiPluginSettings = {
    llmMode: 'local',
    localUrl: 'http://localhost:11434/v1',
    providerId: 'openai',
    customProviderUrl: '',
    apiKey: '',
    selectedModel: '',
    ankiConnectUrl: DEFAULT_ANKI_CONNECT_SETTINGS.url,
    defaultDeck: 'Default',
};

export class AnkiOpenCodeSettingTab extends PluginSettingTab {
    plugin: AnkiOpenCodePlugin;
    availableModels: string[] = [];
    isFetchingModels = false;
    isTestingAnkiConnection = false;

    constructor(app: App, plugin: AnkiOpenCodePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private getCurrentRemoteBaseUrl(): string {
        const customUrl = this.plugin.settings.customProviderUrl.trim().replace(/\/+$/, '');

        if (this.plugin.settings.providerId === 'custom') {
            return customUrl;
        }

        return (LLM_PROVIDERS[this.plugin.settings.providerId]?.baseUrl ?? customUrl).replace(/\/+$/, '');
    }

    private getCurrentBaseUrl(): string {
        if (this.plugin.settings.llmMode === 'local') {
            return this.plugin.settings.localUrl.trim().replace(/\/+$/, '');
        }
        return this.getCurrentRemoteBaseUrl();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: t('settings.title') });

        new Setting(containerEl)
            .setName(t('settings.aiEnvironment'))
            .setDesc(t('settings.aiEnvironmentDesc'))
            .addDropdown(drop => drop
                .addOption('local', t('settings.local'))
                .addOption('provider', t('settings.externalProvider'))
                .setValue(this.plugin.settings.llmMode)
                .onChange(async (value) => {
                    const nextMode = value === 'provider' ? 'provider' : 'local';
                    this.plugin.settings.llmMode = nextMode;
                    this.availableModels = [];
                    this.plugin.settings.selectedModel = '';
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.llmMode === 'local') {
            new Setting(containerEl)
                .setName(t('settings.localBaseUrl'))
                .setDesc(t('settings.localBaseUrlDesc'))
                .addText(text => text
                    .setPlaceholder(t('settings.localBaseUrlPlaceholder'))
                    .setValue(this.plugin.settings.localUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.localUrl = value.trim();
                        await this.plugin.saveSettings();
                    }));
        } else {
            new Setting(containerEl)
                .setName(t('settings.aiProvider'))
                .setDesc(t('settings.aiProviderDesc'))
                .addDropdown(drop => {
                    Object.entries(LLM_PROVIDERS).forEach(([providerId, option]) => {
                        drop.addOption(providerId, providerId === 'custom'
                            ? t('settings.customProvider')
                            : t(`providers.${providerId}`));
                    });

                    drop.setValue(this.plugin.settings.providerId)
                        .onChange(async (value) => {
                            this.plugin.settings.providerId = value;
                            this.availableModels = [];
                            this.plugin.settings.selectedModel = '';
                            await this.plugin.saveSettings();
                            this.display();
                        });
                });

            if (this.plugin.settings.providerId === 'custom') {
                new Setting(containerEl)
                    .setName(t('settings.customProviderUrl'))
                    .setDesc(t('settings.customProviderUrlDesc'))
                    .addText(text => text
                        .setPlaceholder(t('settings.customProviderUrlPlaceholder'))
                        .setValue(this.plugin.settings.customProviderUrl)
                        .onChange(async (value) => {
                            this.plugin.settings.customProviderUrl = value.trim();
                            await this.plugin.saveSettings();
                        }));
            }

            new Setting(containerEl)
                .setName(t('settings.apiKey'))
                .setDesc(t('settings.apiKeyDesc'))
                .addText(text => {
                    text.setPlaceholder(t('settings.apiKeyPlaceholder'))
                        .setValue(this.plugin.settings.apiKey);
                    text.inputEl.type = 'password';
                    text.onChange(async (value) => {
                        this.plugin.settings.apiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
                });
        }

        containerEl.createEl('hr');

        const modelSetting = new Setting(containerEl)
            .setName(t('settings.selectedModel'))
            .setDesc(this.plugin.settings.selectedModel
                ? t('settings.currentlyUsing', { model: this.plugin.settings.selectedModel })
                : t('settings.loadModelsHint'));

        if (this.availableModels.length > 0) {
            modelSetting.addDropdown(drop => {
                this.availableModels.forEach((model) => drop.addOption(model, model));

                const valueToSet = this.availableModels.includes(this.plugin.settings.selectedModel)
                    ? this.plugin.settings.selectedModel
                    : this.availableModels[0] ?? '';

                drop.setValue(valueToSet);

                if (valueToSet !== this.plugin.settings.selectedModel) {
                    this.plugin.settings.selectedModel = valueToSet;
                    void this.plugin.saveSettings();
                }

                drop.onChange(async (value) => {
                    this.plugin.settings.selectedModel = value;
                    await this.plugin.saveSettings();
                });
            });
        }

        modelSetting.addButton(btn => btn
            .setButtonText(this.isFetchingModels ? t('settings.loading') : t('settings.loadModels'))
            .setDisabled(this.isFetchingModels)
            .onClick(async () => {
                this.isFetchingModels = true;
                this.display();

                try {
                    const currentUrl = this.getCurrentBaseUrl();
                    const currentKey = this.plugin.settings.llmMode === 'local' ? '' : this.plugin.settings.apiKey.trim();

                    if (this.plugin.settings.llmMode !== 'local' && !currentUrl) {
                        throw new Error(t('errors.missingProviderUrl'));
                    }

                    if (this.plugin.settings.llmMode !== 'local' && !currentKey) {
                        throw new Error(t('errors.missingApiKey'));
                    }

                    this.availableModels = await LLMConnector.getAvailableModels({
                        baseUrl: currentUrl,
                        apiKey: currentKey,
                        defaultModel: this.plugin.settings.selectedModel,
                    });

                    if (this.availableModels.length === 0) {
                        new Notice(t('errors.noModels'));
                    } else {
                        new Notice(t('errors.modelsLoaded', { count: this.availableModels.length }));
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : t('errors.modelsConnection');
                    new Notice(message);
                } finally {
                    this.isFetchingModels = false;
                    this.display();
                }
            }));

        containerEl.createEl('hr');
        new Setting(containerEl)
            .setName(t('settings.ankiConnectTitle'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('settings.ankiConnectUrl'))
            .setDesc(t('settings.ankiConnectUrlDesc'))
            .addText(text => text
                .setPlaceholder(t('settings.ankiConnectUrlPlaceholder'))
                .setValue(this.plugin.settings.ankiConnectUrl)
                .onChange(async (value) => {
                    this.plugin.settings.ankiConnectUrl = value.trim();
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText(this.isTestingAnkiConnection
                    ? t('settings.testingAnkiConnection')
                    : t('settings.testAnkiConnection'))
                .setDisabled(this.isTestingAnkiConnection)
                .onClick(async () => {
                    this.isTestingAnkiConnection = true;
                    this.display();

                    try {
                        const version = await AnkiConnectApi.testConnection(
                            this.plugin.settings.ankiConnectUrl,
                        );
                        new Notice(t('settings.ankiConnectionSuccess', { version }));
                    } catch (error) {
                        const message = error instanceof Error
                            ? error.message
                            : t('errors.ankiConnection');
                        new Notice(message);
                    } finally {
                        this.isTestingAnkiConnection = false;
                        this.display();
                    }
                }));

    }
}
