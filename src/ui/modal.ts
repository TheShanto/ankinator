import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { AnkiConnectApi } from '../services/ankiConnectApi';
import { AnkiController, AnkiModel } from '../services/controller';
import { t } from '../i18n';

const NEW_DECK_VALUE = '__new_deck__';
export class AnkiCardsModal extends Modal {
	private cardCount = 3;
	private selectedDeck = '';
	private newDeckName = '';
	private ankiModels: AnkiModel[] = [];
	private selectedModelNames = new Set<string>();
	private isSubmitting = false;
	private deckDropdown?: Setting;
	private newDeckSetting?: Setting;

	constructor(
		app: App,
		private readonly controller: AnkiController,
		private readonly files?: TFile[],
	) {
		super(app);
	}

	onOpen(): void {
		void this.loadDecks();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async loadDecks(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: t('modal.title') });
		contentEl.createEl('p', { text: t('modal.loadingDecks') });

		try {
			const url = this.controller.getAnkiConnectUrl();
			const [decks, modelNames] = await Promise.all([
				AnkiConnectApi.getDeckNames(url),
				AnkiConnectApi.getModelNames(url),
			]);
			if (modelNames.length === 0) {
				throw new Error(t('errors.noModels'));
			}
			this.ankiModels = await Promise.all(modelNames.map(async (name) => ({
				name,
				fieldNames: await AnkiConnectApi.getModelFieldNames(name, url),
			})));
			this.selectedModelNames.clear();
			this.selectedDeck = decks[0] ?? NEW_DECK_VALUE;
			this.render(decks);
		} catch (error) {
			const message = error instanceof Error ? error.message : t('modal.deckLoadError');
			new Notice(message);
			this.close();
		}
	}

	private render(decks: string[]): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: t('modal.title') });

		new Setting(contentEl)
			.setName(t('modal.cardCount'))
			.setDesc(t('modal.cardCountDesc'))
			.addText((text) => {
				text.setValue(String(this.cardCount));
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.step = '1';
				text.inputEl.select();
				text.onChange((value) => {
					this.cardCount = Number(value);
				});
			});

		this.deckDropdown = new Setting(contentEl)
			.setName(t('modal.deck'))
			.setDesc(t('modal.deckDesc'))
			.addDropdown((dropdown) => {
				decks.forEach((deck) => {
					dropdown.addOption(deck, deck);
				});
				dropdown.addOption(NEW_DECK_VALUE, t('modal.newDeck'));
				dropdown.setValue(this.selectedDeck);
				dropdown.onChange((value) => {
					this.selectedDeck = value;
					this.updateNewDeckVisibility();
				});
			});

		const modelDetails = contentEl.createEl('details');
		modelDetails.createEl('summary', { text: t('modal.model') });
		const modelSection = modelDetails.createDiv();
		modelSection.createEl('p', { text: t('modal.modelDesc') });

		for (const model of this.ankiModels) {
			new Setting(modelSection)
				.setName(model.name)
				.setDesc(t('modal.fields', { fields: model.fieldNames.join(', ') }))
				.addToggle((toggle) => toggle
					.setValue(this.selectedModelNames.has(model.name))
					.onChange((enabled) => {
						if (enabled) {
							this.selectedModelNames.add(model.name);
						} else {
							this.selectedModelNames.delete(model.name);
						}
					}));
		}

		this.newDeckSetting = new Setting(contentEl)
			.setName(t('modal.newDeckName'))
			.setDesc(t('modal.newDeckNameDesc'))
			.addText((text) => {
				text.setPlaceholder(t('modal.newDeckNamePlaceholder'));
				text.onChange((value) => {
					this.newDeckName = value;
				});
			});
		this.updateNewDeckVisibility();

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText(t('modal.createButton'))
				.setCta()
				.onClick(() => {
					void this.submit();
				}));
	}

	private updateNewDeckVisibility(): void {
		this.newDeckSetting?.settingEl.toggleVisibility(this.selectedDeck === NEW_DECK_VALUE);
	}

	private async submit(): Promise<void> {
		if (this.isSubmitting) {
			return;
		}

		const deckName = this.selectedDeck === NEW_DECK_VALUE
			? this.newDeckName.trim()
			: this.selectedDeck.trim();

		if (!deckName) {
			new Notice(t('errors.missingDeck'));
			return;
		}
		const selectedModels = this.ankiModels.filter((model) => this.selectedModelNames.has(model.name));
		if (selectedModels.length === 0) {
			new Notice(t('errors.missingModelName'));
			return;
		}

		this.isSubmitting = true;
		try {
			if (this.selectedDeck === NEW_DECK_VALUE) {
				await AnkiConnectApi.createDeck(deckName, this.controller.getAnkiConnectUrl());
			}

			this.close();
			await this.controller.createCards({
				cardCount: this.cardCount,
				files: this.files,
				deckName,
				ankiModels: selectedModels,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : t('modal.generationError');
			new Notice(message);
		} finally {
			this.isSubmitting = false;
		}
	}
}
