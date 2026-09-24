import { requestUrl, RequestUrlParam } from 'obsidian';
import { getLanguage, getLlmSystemPrompt, t } from '../i18n';

export interface LLMSettings {
    baseUrl: string; // ex. http://localhost:11434/v1
    apiKey: string;
    defaultModel: string;
}

export interface Flashcard {
    q: string;
    a: string;
    modelName?: string;
}

interface ModelsResponse {
    data?: unknown;
}

interface ChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: unknown;
        };
    }>;
}

function parseFlashcards(content: string): Flashcard[] {
    const normalizedContent = content
        .replace(/^```(?:json|tsv|text)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    if (normalizedContent.startsWith('[')) {
        const parsed: unknown = JSON.parse(normalizedContent);
        if (!Array.isArray(parsed)) {
            throw new Error('Expected an array of flashcards.');
        }

        return parsed.map((card): Flashcard => {
            if (
                typeof card !== 'object' ||
                card === null ||
                typeof (card as { q?: unknown }).q !== 'string' ||
                typeof (card as { a?: unknown }).a !== 'string'
            ) {
                throw new Error('Invalid flashcard structure.');
            }

            const modelName = (card as { modelName?: unknown }).modelName;

            return {
                q: (card as { q: string }).q,
                a: (card as { a: string }).a,
                modelName: typeof modelName === 'string' ? modelName : undefined,
            };
        });
    }

    const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim());
    const cards = lines.map((line): Flashcard => {
        const columns = line.split('\t');
        if (columns.length !== 3) {
            throw new Error('Invalid TSV flashcard row.');
        }

        const [modelNameRaw, question, answer] = columns;
        const modelName = modelNameRaw?.trim();
        if (!modelName || !question?.trim() || (!answer?.trim() && modelName.toLowerCase() !== 'cloze')) {
            throw new Error('Incomplete TSV flashcard row.');
        }

        return {
            q: question,
            a: answer ?? '',
            modelName,
        };
    });

    if (cards.length === 0) {
        throw new Error('No flashcards were returned.');
    }

    return cards;
}

export class LLMConnector {
    private static buildHeaders(apiKey: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (apiKey && apiKey.trim()) {
            headers.Authorization = `Bearer ${apiKey.trim()}`;
        }

        return headers;
    }

    static async getAvailableModels(settings: LLMSettings): Promise<string[]> {
        const cleanBaseUrl = settings.baseUrl.trim().replace(/\/+$/, '');

        if (!cleanBaseUrl) {
            throw new Error(t('errors.invalidModelUrl'));
        }

        const requestParams: RequestUrlParam = {
            url: `${cleanBaseUrl}/models`,
            method: 'GET',
            headers: this.buildHeaders(settings.apiKey),
        };

        try {
            const response = await requestUrl(requestParams);

            if (response.status !== 200) {
                throw new Error(t('errors.server', { status: response.status }));
            }

            const modelsData = (response.json as ModelsResponse).data;
            if (!Array.isArray(modelsData)) return [];

            return modelsData.flatMap((model): string[] => {
                if (
                    typeof model === 'object' &&
                    model !== null &&
                    typeof (model as { id?: unknown }).id === 'string'
                ) {
                    return [(model as { id: string }).id];
                }

                return [];
            });
        } catch (error) {
            console.error('Error al obtener modelos del LLM:', error);
            return [];
        }
    }

    static async generateFlashcards(
        text: string,
        settings: LLMSettings,
        modelName: string,
        cardCount: number = 3,
        fieldNames: string[] = ['Front', 'Back'],
        ankiCardTypes: string[] = [],
    ): Promise<Flashcard[]> {
        const cleanBaseUrl = settings.baseUrl.trim().replace(/\/+$/, '');

        if (!cleanBaseUrl) {
            throw new Error(t('errors.invalidModelUrl'));
        }

        const language = getLanguage();
        const systemPrompt = getLlmSystemPrompt(cardCount, language, language, fieldNames, ankiCardTypes);

        const requestParams: RequestUrlParam = {
            url: `${cleanBaseUrl}/chat/completions`,
            method: 'POST',
            headers: this.buildHeaders(settings.apiKey),
            body: JSON.stringify({
                model: modelName || settings.defaultModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text },
                ],
                temperature: 0.2,
                reasoning_effort: 'low',
            }),
        };

        try {
            const response = await requestUrl(requestParams);

            if (response.status !== 200) {
                throw new Error(t('errors.generation', { status: response.status }));
            }

            const responseData = response.json as ChatCompletionResponse;
            const rawContent = responseData.choices?.[0]?.message?.content;
            if (typeof rawContent !== 'string' || !rawContent.trim()) {
                throw new Error('The model returned an empty response.');
            }

            try {
                return parseFlashcards(rawContent);
            } catch (error) {
                console.error('Formato de tarjetas no válido:', error);
                throw new Error(t('errors.invalidJson'));
            }
        } catch (error) {
            if (error instanceof Error && error.message === t('errors.invalidJson')) {
                throw error;
            }

            console.error('Error al generar flashcards:', error);
            throw error instanceof Error
                ? error
                : new Error(t('errors.invalidJson'));
        }
    }
}