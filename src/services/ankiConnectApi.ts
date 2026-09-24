import { requestUrl, RequestUrlParam } from 'obsidian';
import { Flashcard } from './llmApi';
import { t } from '../i18n';

export interface AnkiConnectSettings {
	url: string;
	deckName: string;
	modelName: string;
	fieldNames: string[];
}

export interface AnkiNote {
	q: string;
	a: string;
	modelName?: string;
	tags?: string[];
}

interface AnkiConnectResponse<T> {
	result: T;
	error: string | null;
}

export const DEFAULT_ANKI_CONNECT_SETTINGS: AnkiConnectSettings = {
	url: 'http://localhost:8765',
	deckName: 'Predeterminado',
	modelName: 'Basic',
	fieldNames: ['Front', 'Back'],
};

export class AnkiConnectApi {
	private static readonly apiVersion = 6;

	static async testConnection(url: string): Promise<number> {
		return this.request<number>('version', {}, url);
	}

	static async getDeckNames(
		url: string = DEFAULT_ANKI_CONNECT_SETTINGS.url,
	): Promise<string[]> {
		return this.request<string[]>('deckNames', {}, url);
	}

	static async getModelNames(
		url: string = DEFAULT_ANKI_CONNECT_SETTINGS.url,
	): Promise<string[]> {
		return this.request<string[]>('modelNames', {}, url);
	}

	static async getModelFieldNames(
		modelName: string,
		url: string = DEFAULT_ANKI_CONNECT_SETTINGS.url,
	): Promise<string[]> {
		return this.request<string[]>('modelFieldNames', { modelName }, url);
	}

	static async createDeck(
		deckName: string,
		url: string = DEFAULT_ANKI_CONNECT_SETTINGS.url,
	): Promise<number> {
		const cleanDeckName = deckName.trim();
		if (!cleanDeckName) {
			throw new Error(t('errors.missingDeck'));
		}

		return this.request<number>('createDeck', { deck: cleanDeckName }, url);
	}

	static async request<T>(
		action: string,
		params: Record<string, unknown> = {},
		url: string = DEFAULT_ANKI_CONNECT_SETTINGS.url,
	): Promise<T> {
		const cleanUrl = url.trim();

		if (!cleanUrl) {
			throw new Error(t('errors.invalidAnkiUrl'));
		}

		const requestParams: RequestUrlParam = {
			url: cleanUrl,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action,
				version: this.apiVersion,
				params,
			}),
		};

		try {
			const response = await requestUrl(requestParams);
			const data = response.json as AnkiConnectResponse<T>;

			if (data.error) {
				throw new Error(`AnkiConnect: ${data.error}`);
			}

			return data.result;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('AnkiConnect:')) {
				throw error;
			}

			console.error('Error al conectar con AnkiConnect:', error);
			throw new Error(t('errors.ankiConnection'));
		}
	}

	static async addNote(
		note: AnkiNote | Flashcard,
		settings: AnkiConnectSettings = DEFAULT_ANKI_CONNECT_SETTINGS,
	): Promise<number> {
		const noteIds = await this.addNotes([note], settings);
		const noteId = noteIds[0];

		if (noteId === undefined) {
			throw new Error(t('errors.missingNoteId'));
		}

		return noteId;
	}

	static async addNotes(
		notes: Array<AnkiNote | Flashcard>,
		settings: AnkiConnectSettings = DEFAULT_ANKI_CONNECT_SETTINGS,
	): Promise<number[]> {
		if (notes.length === 0) {
			return [];
		}

		const deckName = settings.deckName.trim();
		if (!deckName) {
			throw new Error(t('errors.missingDeck'));
		}

		const modelName = settings.modelName.trim();
		if (!modelName) {
			throw new Error(t('errors.missingModelName'));
		}

		if (settings.fieldNames.length < 2) {
			throw new Error(t('errors.missingModelFields'));
		}

		return this.request<number[]>('addNotes', {
			notes: notes.map((note) => ({
				deckName,
				modelName: ('modelName' in note && note.modelName?.trim()) ? note.modelName.trim() : modelName,
				fields: {
					[settings.fieldNames[0] ?? 'Front']: note.q,
					[settings.fieldNames[1] ?? 'Back']: note.a,
				},
				tags: 'tags' in note ? note.tags ?? [] : [],
				options: {
					allowDuplicate: false,
				},
			})),
		}, settings.url);
	}
}
