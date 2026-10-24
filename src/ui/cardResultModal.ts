import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import { CardOperation, AnkiController, TrackedCard } from '../services/controller';
import { t } from '../i18n';

export class CardResultModal extends Modal {
	private isRetrying = false;

	constructor(
		app: App,
		private readonly controller: AnkiController,
		private readonly operation: CardOperation,
	) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: t('results.title') });
		const created = this.operation.cards.filter((card) => card.status === 'created').length;
		const summary = contentEl.createDiv({ cls: 'ankinator-result-summary' });
		summary.createSpan({ text: t('results.summary', { created, total: this.operation.cards.length }) });
		for (const status of ['created', 'failed', 'uncertain'] as const) {
			const count = this.operation.cards.filter((card) => card.status === status).length;
			if (count > 0) this.createStatusBadge(summary, status, count);
		}

		const grouped = new Map<string, TrackedCard[]>();
		for (const card of this.operation.cards) {
			const cards = grouped.get(card.source) ?? [];
			cards.push(card);
			grouped.set(card.source, cards);
		}

		for (const [source, cards] of grouped) {
			const successCount = cards.filter((card) => card.status === 'created').length;
			const details = contentEl.createEl('details');
			const summaryEl = details.createEl('summary');
			const sourceEl = summaryEl.createSpan({ text: this.getShortSource(source) });
			sourceEl.addClass('ankinator-result-source');
			sourceEl.title = source;
			const countEl = summaryEl.createSpan({ text: t('results.sourceCount', {
				created: successCount,
				total: cards.length,
			}) });
			countEl.addClass('ankinator-result-count');
			for (const status of ['failed', 'uncertain'] as const) {
				const count = cards.filter((card) => card.status === status).length;
				if (count > 0) this.createStatusBadge(summaryEl, status, count, cards.find((card) => card.status === status)?.error);
			}

			const errors = new Map<string, number>();
			for (const card of cards) {
				if (card.error) errors.set(card.error, (errors.get(card.error) ?? 0) + 1);
			}
			for (const [message, count] of errors) {
				details.createEl('p', {
					text: t('results.errorCount', { count, message }),
					cls: 'ankinator-result-error',
				});
			}

			const list = details.createEl('ul');
			for (const item of cards) {
				const line = list.createEl('li');
				this.createStatusBadge(line, item.status, undefined, item.error);
				line.createSpan({ text: item.card.q, cls: 'ankinator-result-question' });
			}
		}

		if (this.operation.cards.some((card) => card.status !== 'created')) {
			new Setting(contentEl)
				.addButton((button) => button
					.setButtonText(this.isRetrying ? t('results.retrying') : t('results.retry'))
					.setCta()
					.setDisabled(this.isRetrying)
					.onClick(() => { void this.retry(); }));
		}
	}

	private createStatusBadge(container: HTMLElement, status: TrackedCard['status'], count?: number, error?: string): void {
		const statusLabel = status === 'created'
			? t('results.status.created')
			: status === 'failed'
				? t('results.status.failed')
				: t('results.status.uncertain');
		const badge = container.createSpan({
			cls: `ankinator-result-status is-${status}`,
			attr: { 'aria-label': statusLabel, title: error ? `${statusLabel}: ${error}` : statusLabel },
		});
		const icon = badge.createSpan({ cls: 'ankinator-result-icon' });
		setIcon(icon, status === 'created' ? 'circle-check' : status === 'failed' ? 'circle-x' : 'info');
		if (count !== undefined) badge.createSpan({ text: String(count), cls: 'ankinator-result-status-count' });
	}

	private getShortSource(source: string): string {
		const segments = source.replace(/\\/g, '/').split('/').filter(Boolean);
		return segments.slice(-2).join('/') || source;
	}

	private async retry(): Promise<void> {
		if (this.isRetrying) return;
		this.isRetrying = true;
		this.render();
		try {
			await this.controller.retryPending(this.operation);
			const remaining = this.operation.cards.filter((card) => card.status !== 'created').length;
			if (remaining === 0) {
				const count = this.operation.cards.length;
				this.close();
				new Notice(t('notices.success', { count }));
				return;
			}
		} finally {
			this.isRetrying = false;
			if (this.containerEl.isConnected) this.render();
		}
	}
}
