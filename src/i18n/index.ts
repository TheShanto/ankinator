import en from './en.json';
import es from './es.json';

export type Language = 'en' | 'es';
export type TranslationKey = string;
export type InterpolationValues = Record<string, string | number>;

export const translations = {
	en,
	es,
} as const;

function isLanguage(value: string | null): value is Language {
	return value === 'en' || value === 'es';
}

export function getLanguage(): Language {
	if (typeof window === 'undefined') {
		return 'en';
	}

	try {
		const configuredLanguage = window.localStorage.getItem('language')?.toLowerCase();
		const language = configuredLanguage?.split('-')[0] ?? null;

		return isLanguage(language) ? language : 'en';
	} catch (error) {
		console.warn('Unable to read the Obsidian language setting; using English.', error);
		return 'en';
	}
}

export function getTranslations(language: Language = getLanguage()) {
	return translations[language];
}

function resolveKey(source: unknown, key: TranslationKey): unknown {
	return key.split('.').reduce<unknown>((value, part) => {
		if (value !== null && typeof value === 'object' && part in value) {
			return (value as Record<string, unknown>)[part];
		}

		return undefined;
	}, source);
}

function interpolate(text: string, values: InterpolationValues = {}): string {
	return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
		const value = values[name];
		return value === undefined ? placeholder : String(value);
	});
}

export function t(
	key: TranslationKey,
	values: InterpolationValues = {},
	language: Language = getLanguage(),
): string {
	const localizedValue = resolveKey(getTranslations(language), key);
	const fallbackValue = resolveKey(en, key);
	const value = typeof localizedValue === 'string'
		? localizedValue
		: typeof fallbackValue === 'string'
			? fallbackValue
			: key;

	return interpolate(value, values);
}

export function getLlmSystemPrompt(
	cardCount: number,
	language: Language = getLanguage(),
	noteLanguage: Language = language,
	fieldNames: string[] = ['Front', 'Back'],
	ankiCardTypes: string[] = [],
): string {
	const resolvedCardTypes = ankiCardTypes.length > 0 ? ankiCardTypes : [];
	const cardTypeList = resolvedCardTypes.map((type) => `- \`${type}\``).join('\n');
	const fieldInstruction = `Use the first Anki field (${fieldNames[0] ?? 'Front'}) for the question or cloze text and the second Anki field (${fieldNames[1] ?? 'Back'}) for the answer.`;

	const prompts = {
		en: {
			role: 'You are an expert at creating high-quality Anki cards from programming-related text provided by the user.',
			instructions: `## Principles

1. **Atomicity**: each card tests ONE piece of information or idea. If an answer contains "and" or a list, split it.
2. **Minimum information**: formulate the question and answer as simply as possible without losing precision. Answers of 1 to 5 words whenever possible.
3. **Self-contained**: the question must be understandable without seeing the original text. Name the subject explicitly ("What does \`Array.prototype.map\` return?", never "What does it return?").
4. **No clues in the question**: do not include the answer or words that give it away.
5. **Understanding over literal memorization**: for causal relationships, ask "why?" or "what causes X?" instead of isolated facts.
6. **Faithfulness**: use the exact data from the text. Do not invent or add information that is not in the text.
7. **Code formatting**: wrap identifiers, keywords, operators and short snippets in backticks (\`like this\`). Keep snippets to one line whenever possible.

## Valid Anki note types

The note types available in the current Anki configuration are exactly these, with their exact spelling and capitalization:
${cardTypeList}

Choose one of these exact names for every card. Do not invent, translate, or rename them.

Choose the most appropriate note type for each card. Use a cloze note type (if one is listed) for sentences or code where context matters (syntax, ordered steps, keywords in context), and the other note types for facts, definitions, behaviors and causes.

## What NOT to do

- Do not ask yes/no questions.
- Do not ask questions with multiple possible answers.
- Do not create cards about trivial or irrelevant data.
- Do not repeat the same information across multiple cards.`,
			format: `## Output format

Output ONLY the cards in TSV format: one card per line, three tab-separated columns:

NoteType<TAB>FirstField<TAB>SecondField

Rules:
- NoteType must be one of the exact Anki note types listed above.
- FirstField holds the question, or the full sentence with \`{{c1::...}}\` for a cloze card. SecondField holds the answer, and stays empty for a cloze card.
- The field names to use are given at the end of these instructions. Do not write field names in the output, only their content.
- Do NOT include a header row, numbering, markdown, code fences, or any text before or after the cards.
- Never use tab characters or line breaks inside a field.

## Example

The note type names in this example are illustrative. In your output, always use the exact note type names listed above.

Input text: "Array.prototype.map returns a new array with the results of calling a function on every element. It does not mutate the original array. The strict equality operator === compares values without type coercion, while == coerces types before comparing. Declaring a variable with const prevents reassignment of the binding. An async function always returns a Promise."

Output:
Basic	What does \`Array.prototype.map\` return?	A new array
Basic	Does \`Array.prototype.map\` mutate the original array?	No
Basic	What does \`===\` do differently from \`==\` in JavaScript?	Compares without type coercion
Cloze	Declaring a variable with {{c1::\`const\`}} prevents reassignment of the binding.	
Basic	What does an \`async\` function always return?	A \`Promise\``,
			language: `Write the questions and answers in ${noteLanguage === 'es' ? 'Spanish' : 'English'}. Keep code, identifiers and technical keywords exactly as they are.`,
			task: `Generate exactly ${cardCount} high-quality cards from the text provided in the next message. If the text does not support that many good cards, generate fewer rather than inventing filler.`,
		},
		es: {
			role: 'Eres un experto en crear tarjetas Anki de alta calidad a partir de texto de programación proporcionado por el usuario.',
			instructions: `## Principios

1. **Atomicidad**: cada tarjeta prueba UN solo dato o idea. Si una respuesta tiene "y" o una lista, divídela.
2. **Mínima información**: formula la pregunta y respuesta de la forma más simple posible sin perder precisión. Respuestas de 1 a 5 palabras cuando sea posible.
3. **Autosuficiencia**: la pregunta debe entenderse sin ver el texto original. Nombra el sujeto explícitamente ("¿Qué devuelve \`Array.prototype.map\`?", nunca "¿Qué devuelve?").
4. **Sin pistas en la pregunta**: no incluyas la respuesta ni palabras que la delaten.
5. **Comprensión sobre memorización literal**: para relaciones causales, pregunta "¿por qué?" o "¿qué causa X?" en vez de solo hechos aislados.
6. **Fidelidad**: usa los datos exactos del texto. No inventes ni añadas información que no esté en el texto.
7. **Formato de código**: encierra identificadores, palabras clave, operadores y fragmentos cortos entre backticks (\`así\`). Mantén los fragmentos en una sola línea siempre que sea posible.

## Tipos de nota válidos de Anki

Los tipos de nota disponibles en la configuración actual de Anki son exactamente estos, con su ortografía y mayúsculas exactas:
${cardTypeList}

Elige uno de estos nombres exactos para cada tarjeta. No inventes, no traduzcas ni renombres ninguno.

Elige el tipo de nota más adecuado para cada tarjeta. Usa un tipo de nota cloze (si hay alguno en la lista) para frases o código donde el contexto importa (sintaxis, pasos ordenados, palabras clave en contexto), y los demás tipos para hechos, definiciones, comportamientos y causas.

## Qué NO hacer

- No hagas preguntas de sí/no.
- No hagas preguntas con múltiples respuestas posibles.
- No hagas tarjetas de datos triviales o irrelevantes.
- No repitas la misma información en varias tarjetas.`,
			format: `## Formato de salida

Devuelve ÚNICAMENTE las tarjetas en formato TSV: una tarjeta por línea, tres columnas separadas por tabulador:

TipoDeNota<TAB>PrimerCampo<TAB>SegundoCampo

Reglas:
- TipoDeNota debe ser uno de los nombres exactos de Anki listados arriba.
- PrimerCampo contiene la pregunta, o la frase completa con \`{{c1::...}}\` en una tarjeta cloze. SegundoCampo contiene la respuesta, y queda vacío en una tarjeta cloze.
- Los nombres de campo a usar se indican al final de estas instrucciones. No escribas nombres de campo en la salida, solo su contenido.
- NO incluyas fila de cabecera, numeración, markdown, bloques de código ni texto antes o después de las tarjetas.
- Nunca uses tabuladores ni saltos de línea dentro de un campo.

## Ejemplo

Los nombres de tipo de nota de este ejemplo son ilustrativos. En tu salida, usa siempre los nombres exactos de tipo de nota listados arriba.

Texto de entrada: "Array.prototype.map devuelve un nuevo array con el resultado de llamar a una función en cada elemento. No modifica el array original. El operador de igualdad estricta === compara valores sin coerción de tipos, mientras que == convierte los tipos antes de comparar. Declarar una variable con const impide reasignar el binding. Una función async siempre devuelve una Promise."

Salida:
Basic	¿Qué devuelve \`Array.prototype.map\`?	Un nuevo array
Basic	¿\`Array.prototype.map\` modifica el array original?	No
Basic	¿Qué hace \`===\` de distinto a \`==\` en JavaScript?	Compara sin coerción de tipos
Cloze	Declarar una variable con {{c1::\`const\`}} impide reasignar el binding.	
Basic	¿Qué devuelve siempre una función \`async\`?	Una \`Promise\``,
			language: `Escribe las preguntas y respuestas en ${noteLanguage === 'es' ? 'español' : 'inglés'}. Mantén nombres de código, identificadores y palabras técnicas exactamente como aparecen.`,
			task: `Genera exactamente ${cardCount} tarjetas de alta calidad a partir del texto proporcionado en el siguiente mensaje. Si el texto no soporta tantas tarjetas útiles, genera menos, pero no inventes contenido.`,
		},
	} as const;

	const selectedPrompt = prompts[language] ?? prompts.en;
	return [
		selectedPrompt.role,
		selectedPrompt.instructions,
		selectedPrompt.format,
		selectedPrompt.language,
		selectedPrompt.task,
		fieldInstruction,
	].join('\n\n');
}