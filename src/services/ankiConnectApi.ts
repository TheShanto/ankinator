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
	private static readonly requestTimeoutMs = 15_000;

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
			throw: false,
			body: JSON.stringify({
				action,
				version: this.apiVersion,
				params,
			}),
		};

		try {
			const response = await this.withTimeout(requestUrl(requestParams));
			if (response.status !== 200) {
				throw new Error(`AnkiConnect: HTTP ${response.status}`);
			}

			const data = this.validateResponse<T>(response.json);

			if (data.error) {
				throw new Error(`AnkiConnect: ${data.error}`);
			}

			return this.validateResult(action, data.result);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('AnkiConnect:')) {
				throw error;
			}

			console.error('Error al conectar con AnkiConnect:', error);
			throw new Error(t('errors.ankiConnection'));
		}
	}

	private static async withTimeout<T>(promise: Promise<T>): Promise<T> {
		let timeoutId: number | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timeoutId = window.setTimeout(() => {
				reject(new Error(`AnkiConnect: ${t('errors.ankiTimeout')}`));
			}, this.requestTimeoutMs);
		});

		try {
			return await Promise.race([promise, timeout]);
		} finally {
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
			}
		}
	}

	private static validateResponse<T>(value: unknown): AnkiConnectResponse<T> {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('result' in value) ||
			!('error' in value)
		) {
			throw new Error(`AnkiConnect: ${t('errors.invalidAnkiResponse')}`);
		}

		const response = value;
		if (response.error !== null && typeof response.error !== 'string') {
			throw new Error(`AnkiConnect: ${t('errors.invalidAnkiResponse')}`);
		}

		return {
			result: response.result as T,
			error: response.error,
		};
	}

	private static validateResult<T>(action: string, result: T): T {
		if (result === undefined) {
			throw new Error(`AnkiConnect: ${t('errors.invalidAnkiResponse')}`);
		}

		if (
			['deckNames', 'modelNames', 'modelFieldNames'].includes(action) &&
			(!Array.isArray(result) || result.some((value) => typeof value !== 'string'))
		) {
			throw new Error(`AnkiConnect: ${t('errors.invalidAnkiResponse')}`);
		}

		if (action === 'version' && (
			typeof result !== 'number' ||
			!Number.isFinite(result)
		)) {
			throw new Error(`AnkiConnect: ${t('errors.invalidAnkiResponse')}`);
		}

		if (action === 'addNotes' && (
			!Array.isArray(result) ||
			result.some((noteId) => typeof noteId !== 'number' || !Number.isSafeInteger(noteId))
		)) {
			throw new Error(`AnkiConnect: ${t('errors.invalidAnkiResponse')}`);
		}

		return result;
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

		const fieldNames = settings.fieldNames
			.slice(0, 2)
			.map((fieldName) => fieldName.trim());
		if (
			fieldNames.some((fieldName) => !fieldName) ||
			new Set(fieldNames).size !== fieldNames.length
		) {
			throw new Error(t('errors.missingModelFields'));
		}
		const [questionField, answerField] = fieldNames;
		if (!questionField || !answerField) {
			throw new Error(t('errors.missingModelFields'));
		}

		const payloadNotes = notes.map((note) => {
			if (typeof note.q !== 'string' || typeof note.a !== 'string') {
				throw new Error(t('errors.invalidNoteFields'));
			}

			const noteModelName = 'modelName' in note && note.modelName?.trim();
			const tags = 'tags' in note ? note.tags ?? [] : [];
			if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
				throw new Error(t('errors.invalidNoteFields'));
			}

			return {
				deckName,
				modelName: noteModelName || modelName,
				fields: {
					[questionField]: note.q,
					[answerField]: note.a,
				},
				tags,
				options: {
					allowDuplicate: false,
				},
			};
		});

		return this.request<number[]>('addNotes', {
			notes: payloadNotes,
		}, settings.url);
	}
}
