import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { t } from '../i18n';

export class NoteSelectionModal extends Modal {
	private readonly files: TFile[];
	private readonly selectedPaths = new Set<string>();
	private searchTerm = '';
	private listEl!: HTMLElement;
	private selectionCountEl!: HTMLElement;

	constructor(app: App, private readonly onSelect: (files: TFile[]) => void) {
		super(app);
		this.files = app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: t('noteSelection.title') });

		new Setting(contentEl)
			.setName(t('noteSelection.search'))
			.addText((text) => {
				text.setPlaceholder(t('noteSelection.searchPlaceholder'));
				text.onChange((value) => {
					this.searchTerm = value.trim().toLowerCase();
					this.renderFileList();
				});
			});

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText(t('noteSelection.selectAll'))
				.onClick(() => {
					this.files
						.filter((file) => this.matchesSearch(file))
						.forEach((file) => this.selectedPaths.add(file.path));
					this.renderFileList();
				}))
			.addButton((button) => button
				.setButtonText(t('noteSelection.clearAll'))
				.onClick(() => {
					this.selectedPaths.clear();
					this.renderFileList();
				}));

		this.selectionCountEl = contentEl.createEl('p');
		this.listEl = contentEl.createDiv();
		this.listEl.addClass('ankinator-note-selection-list');
		this.renderFileList();

		new Setting(contentEl)
			.addButton((button) => button
				.setButtonText(t('noteSelection.confirm'))
				.setCta()
				.onClick(() => this.submit()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderFileList(): void {
		this.listEl.empty();
		const visibleFiles = this.files.filter((file) => this.matchesSearch(file));

		this.selectionCountEl.setText(t('noteSelection.selected', {
			count: this.selectedPaths.size,
			total: this.files.length,
		}));

		if (visibleFiles.length === 0) {
			this.listEl.createEl('p', { text: t('noteSelection.noMatches') });
			return;
		}

		for (const file of visibleFiles) {
			const row = this.listEl.createDiv();
			const checkbox = row.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedPaths.has(file.path);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedPaths.add(file.path);
				} else {
					this.selectedPaths.delete(file.path);
				}
				this.updateSelectionCount();
			});
			row.createEl('span', { text: file.path });
		}
	}

	private updateSelectionCount(): void {
		this.selectionCountEl.setText(t('noteSelection.selected', {
			count: this.selectedPaths.size,
			total: this.files.length,
		}));
	}

	private matchesSearch(file: TFile): boolean {
		return !this.searchTerm || file.path.toLowerCase().includes(this.searchTerm);
	}

	private submit(): void {
		const selectedFiles = this.files.filter((file) => this.selectedPaths.has(file.path));
		if (selectedFiles.length === 0) {
			new Notice(t('noteSelection.noneSelected'));
			return;
		}

		this.close();
		this.onSelect(selectedFiles);
	}
}
