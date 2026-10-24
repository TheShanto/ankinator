import { MarkdownView, Notice, TFile } from 'obsidian';
import type AnkiOpenCodePlugin from '../main';
import { AnkiConnectApi, DEFAULT_ANKI_CONNECT_SETTINGS } from './ankiConnectApi';
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

export type CardSendStatus = 'created' | 'failed' | 'uncertain';

export interface TrackedCard {
	card: { q: string; a: string; modelName?: string };
	source: string;
	status: CardSendStatus;
	error?: string;
}

export interface CardOperation {
	deckName: string;
	models: AnkiModel[];
	cards: TrackedCard[];
}

export const MAX_GENERATED_CARDS = 100;

export class AnkiController {
	constructor(private readonly plugin: AnkiOpenCodePlugin) {}

	getAnkiConnectUrl(): string {
		return this.plugin.settings.ankiConnectUrl;
	}

	async createCards({ cardCount, files, deckName, ankiModels }: CreateCardsOptions): Promise<CardOperation | null> {
		const normalizedCardCount = this.normalizeCardCount(cardCount);
		const selectedFiles = files && files.length > 0 ? files : undefined;
		if (ankiModels.length === 0) throw new Error(t('errors.missingModelName'));

		const notes = selectedFiles
			? await Promise.all(selectedFiles.map(async (file) => {
				const currentFile = this.plugin.app.vault.getAbstractFileByPath(file.path);
				if (!(currentFile instanceof TFile)) {
					throw new Error(t('errors.selectedFileUnavailable', { file: file.path }));
				}

				return {
					source: currentFile.path,
					text: await this.plugin.app.vault.cachedRead(currentFile),
				};
			}))
			: [this.getActiveNote()];

		if (this.plugin.isUnloaded()) return null;
		if (notes.length * normalizedCardCount > MAX_GENERATED_CARDS) {
			throw new Error(t('errors.cardLimit', { count: MAX_GENERATED_CARDS }));
		}
		if (notes.some(({ text }) => !text.trim())) throw new Error(t('notices.emptyNote'));

		new Notice(t('notices.generating', { count: normalizedCardCount * notes.length }));
		const cards: TrackedCard[] = [];
		const ankiCardTypes = ankiModels.map((model) => model.name);
		const ankiModelFields = Object.fromEntries(ankiModels.map((model) => [model.name, model.fieldNames]));
		for (const { text, source } of notes) {
			const generated = await LLMConnector.generateFlashcards(
				text,
				this.getLLMSettings(),
				this.plugin.settings.selectedModel,
				normalizedCardCount,
				ankiModels[0]?.fieldNames ?? ['Front', 'Back'],
				ankiCardTypes,
				ankiModelFields,
			);
			if (this.plugin.isUnloaded()) return null;

			cards.push(...generated.map((card) => ({
				card,
				source,
				status: 'failed' as const,
				error: t('errors.notSent'),
			})));
		}

		if (cards.length > MAX_GENERATED_CARDS) throw new Error(t('errors.cardLimit', { count: MAX_GENERATED_CARDS }));
		if (cards.length === 0) throw new Error(t('notices.noCards'));
		const modelNames = new Set(ankiModels.map((model) => model.name));
		for (const { card } of cards) {
			if (!card.modelName?.trim() || !modelNames.has(card.modelName.trim())) {
				throw new Error(t('errors.missingModelName'));
			}
			card.modelName = card.modelName.trim();
		}

		const operation: CardOperation = {
			deckName: deckName ?? DEFAULT_ANKI_CONNECT_SETTINGS.deckName,
			models: ankiModels,
			cards,
		};
		await this.sendCards(operation, false);
		return this.plugin.isUnloaded() ? null : operation;
	}

	async retryPending(operation: CardOperation): Promise<void> {
		await this.sendCards(operation, true);
	}

	private async sendCards(operation: CardOperation, verifyUncertain: boolean): Promise<void> {
		if (this.plugin.isUnloaded()) return;
		const modelMap = new Map(operation.models.map((model) => [model.name, model]));
		const candidates = operation.cards.filter((item) =>
			item.status === 'failed' || (verifyUncertain && item.status === 'uncertain'));

		for (const item of candidates) {
			if (this.plugin.isUnloaded()) return;
			if (item.status !== 'uncertain') continue;
			const modelName = item.card.modelName ?? '';
			const model = modelMap.get(modelName);
			const [questionField, answerField] = model?.fieldNames ?? [];
			if (!questionField || !answerField) {
				item.error = t('errors.verificationFailed');
				continue;
			}
			try {
				const exists = await AnkiConnectApi.findMatchingNote({
					[questionField]: item.card.q,
					[answerField]: item.card.a,
				}, {
					url: this.plugin.settings.ankiConnectUrl,
					deckName: operation.deckName,
					modelName,
				});
				if (exists) {
					item.status = 'created';
					delete item.error;
				} else {
					item.status = 'failed';
				}
			} catch (error) {
				item.error = `${t('errors.verificationFailed')}: ${error instanceof Error ? error.message : String(error)}`;
			}
		}

		const groups = new Map<string, TrackedCard[]>();
		for (const item of operation.cards.filter((entry) => entry.status === 'failed')) {
			const modelName = item.card.modelName ?? '';
			const group = groups.get(modelName) ?? [];
			group.push(item);
			groups.set(modelName, group);
		}

		for (const [modelName, items] of groups) {
			if (this.plugin.isUnloaded()) return;
			const model = modelMap.get(modelName);
			if (!model) {
				items.forEach((item) => { item.error = t('errors.missingModelName'); });
				continue;
			}
			try {
				const ids = await AnkiConnectApi.addNotes(items.map((item) => item.card), {
					url: this.plugin.settings.ankiConnectUrl,
					deckName: operation.deckName,
					modelName,
					fieldNames: model.fieldNames,
				});
				items.forEach((item, index) => {
					if (typeof ids[index] === 'number') {
						item.status = 'created';
						delete item.error;
					} else {
						item.status = 'uncertain';
						item.error = t('errors.cardNotAdded');
					}
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				items.forEach((item) => {
					item.status = 'uncertain';
					item.error = message;
				});
			}
		}
	}

	private getActiveNote(): { source: string; text: string } {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) throw new Error(t('notices.noActiveFile'));
		const selection = view.editor.getSelection();
		return {
			source: view.file?.path ?? t('notices.activeNote'),
			text: selection || view.editor.getValue(),
		};
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
		if (!Number.isInteger(cardCount) || cardCount < 1) throw new Error(t('errors.invalidCardCount'));
		return cardCount;
	}
}
