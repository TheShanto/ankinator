import { MarkdownView, Notice, TFile } from 'obsidian';
import type AnkiOpenCodePlugin from '../main';
import { AnkiConnectApi } from './ankiConnectApi';
import { LLMConnector, LLMSettings } from './llmApi';
import { LLM_PROVIDERS } from '../settings';
import { t } from '../i18n';

export interface CreateCardsOptions {
	cardCount: number;
	files?: TFile[];
	deckName?: string;
	ankiModels: AnkiModel[];
}

export interface AnkiModel {
	name: string;
	fieldNames: string[];
}

export const MAX_GENERATED_CARDS = 100;

export class AnkiController {
	constructor(private readonly plugin: AnkiOpenCodePlugin) {}

	getAnkiConnectUrl(): string {
		return this.plugin.settings.ankiConnectUrl;
	}

	async createCards({
		cardCount,
		files,
		deckName,
		ankiModels,
	}: CreateCardsOptions): Promise<number[]> {
		const normalizedCardCount = this.normalizeCardCount(cardCount);
		const selectedFiles = files && files.length > 0 ? files : undefined;
		if (ankiModels.length === 0) {
			throw new Error(t('errors.missingModelName'));
		}
		const modelFields = new Map(ankiModels.map((model) => [model.name, model.fieldNames]));

		const notes = selectedFiles
			? await Promise.all(selectedFiles.map(async (file) => ({
				file,
				text: await this.plugin.app.vault.cachedRead(file),
			})))
			: [{ file: undefined, text: this.getActiveNoteText() }];

		if (notes.length * normalizedCardCount > MAX_GENERATED_CARDS) {
			throw new Error(t('errors.cardLimit', { count: MAX_GENERATED_CARDS }));
		}

		if (notes.some(({ text }) => !text.trim())) {
			throw new Error(t('notices.emptyNote'));
		}

		const requestedCardCount = normalizedCardCount * notes.length;
		new Notice(t('notices.generating', { count: requestedCardCount }));

		const flashcards = [];
		const ankiCardTypes = ankiModels.map((model) => model.name);
		for (const { text } of notes) {
			const cards = await LLMConnector.generateFlashcards(
				text,
				this.getLLMSettings(),
				this.plugin.settings.selectedModel,
				normalizedCardCount,
				ankiModels[0]?.fieldNames ?? ['Front', 'Back'],
				ankiCardTypes,
			);
			flashcards.push(...cards);
		}

		if (flashcards.length === 0) {
			throw new Error(t('notices.noCards'));
		}

		const url = this.plugin.settings.ankiConnectUrl;
		const groupedCards = new Map<string, typeof flashcards>();

		for (const card of flashcards) {
			const cardModelName = card.modelName?.trim();
			if (!cardModelName || !modelFields.has(cardModelName)) {
				throw new Error(t('errors.missingModelName'));
			}

			const cardsForModel = groupedCards.get(cardModelName) ?? [];
			cardsForModel.push({ ...card, modelName: cardModelName });
			groupedCards.set(cardModelName, cardsForModel);
		}

		const noteIds: number[] = [];
		for (const [cardModelName, cardsForModel] of groupedCards) {
			noteIds.push(...await AnkiConnectApi.addNotes(cardsForModel, {
				url,
				deckName: deckName ?? this.plugin.settings.defaultDeck,
				modelName: cardModelName,
				fieldNames: modelFields.get(cardModelName) ?? [],
			}));
		}

		new Notice(t('notices.success', { count: noteIds.length }));
		return noteIds;
	}

	private getActiveNoteText(): string {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

		if (!activeView) {
			throw new Error(t('notices.noActiveFile'));
		}

		const selection = activeView.editor.getSelection();
		return selection || activeView.editor.getValue();
	}

	private getLLMSettings(): LLMSettings {
		const { settings } = this.plugin;
		const baseUrl = settings.llmMode === 'local'
			? settings.localUrl
			: settings.providerId === 'custom'
				? settings.customProviderUrl
				: LLM_PROVIDERS[settings.providerId]?.baseUrl ?? '';

		return {
			baseUrl,
			apiKey: settings.llmMode === 'local' ? '' : settings.apiKey,
			defaultModel: settings.selectedModel,
		};
	}

	private normalizeCardCount(cardCount: number): number {
		if (!Number.isInteger(cardCount) || cardCount < 1) {
			throw new Error(t('errors.invalidCardCount'));
		}

		return cardCount;
	}
}
