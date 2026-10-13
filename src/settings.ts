import {AbstractInputSuggest, App, Modal, normalizePath, Notice, PluginSettingTab, Setting, TFolder} from 'obsidian';
import SimpleIcalExportPlugin from './main';

export type UpdateIntervalUnit = 'disabled' | 'minutes' | 'hours' | 'days' | 'months';

export interface IcalCalendarSettings {
	id: string;
	name: string;
	datePropertyName: string;
	outputFolderPath: string;
	outputFileName: string;
	updateIntervalValue: number;
	updateIntervalUnit: UpdateIntervalUnit;
}

export interface SimpleIcalExportSettings {
	calendars: IcalCalendarSettings[];
	activeCalendarId: string;
	showStatusBarUpdates: boolean;
	hideEventIdProperty: boolean;
	developerMode: boolean;
}

export function createDefaultCalendarSettings(index = 1): IcalCalendarSettings {
	return {
		id: `calendar-${index}`,
		name: `Calendar ${index}`,
		datePropertyName: '',
		outputFolderPath: '',
		outputFileName: index === 1 ? 'calendar.ics' : `calendar-${index}.ics`,
		updateIntervalValue: 60,
		updateIntervalUnit: 'disabled'
	};
}

export const DEFAULT_SETTINGS: SimpleIcalExportSettings = {
	calendars: [createDefaultCalendarSettings()],
	activeCalendarId: 'calendar-1',
	showStatusBarUpdates: true,
	hideEventIdProperty: true,
	developerMode: false
};

/**
 * Shape of the declarative setting rows used on Obsidian 1.13.0 and later.
 * Only `render` is needed here: every row is built by the same imperative
 * helpers that `display()` uses, so both code paths render an identical UI.
 */
type DeclarativeSettingDefinition = {
	name: string;
	render: (setting: Setting) => void;
};

export class SimpleIcalExportSettingTab extends PluginSettingTab {
	plugin: SimpleIcalExportPlugin;

	constructor(app: App, plugin: SimpleIcalExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		const activeCalendar = this.plugin.getActiveCalendarSettings();

		containerEl.empty();

		this.renderCalendarTabs(containerEl);
		this.renderCalendarSettings(containerEl, activeCalendar);
		this.renderGlobalSettings(containerEl);
	}

	/**
	 * Declarative entry point introduced in Obsidian 1.13.0. When this returns a
	 * non-empty array Obsidian skips `display()` and renders these rows instead,
	 * which also makes the settings searchable. `display()` stays as the fallback
	 * for older Obsidian versions.
	 *
	 * Every row delegates to the same helper used by `display()`, so the two
	 * paths stay in sync and `minAppVersion` does not need to be raised.
	 */
	getSettingDefinitions(): DeclarativeSettingDefinition[] {
		return [
			{
				name: 'Calendars',
				render: (setting) => {
					this.renderCalendarTabs(setting.settingEl);
				}
			},
			{
				name: 'Calendar settings',
				render: (setting) => {
					this.renderCalendarSettings(setting.controlEl, this.plugin.getActiveCalendarSettings());
				}
			},
			{
				name: 'General',
				render: (setting) => {
					this.renderGlobalSettings(setting.controlEl);
				}
			}
		];
	}

	/**
	 * Re-renders the tab on both code paths: `update()` on Obsidian 1.13.0+ where
	 * `display()` is bypassed, `display()` on older versions.
	 */
	private refresh(): void {
		const declarativeTab = this as PluginSettingTab & {update?: () => void};

		if (typeof declarativeTab.update === 'function') {
			declarativeTab.update();
			return;
		}

		this.display();
	}

	private renderCalendarTabs(containerEl: HTMLElement): void {
		const tabsEl = containerEl.createDiv({cls: 'simple-ical-export-tabs'});

		for (const calendar of this.plugin.settings.calendars) {
			const tabEl = tabsEl.createEl('button', {
				cls: 'simple-ical-export-tab',
				text: calendar.name,
				type: 'button'
			});
			tabEl.toggleClass('is-active', calendar.id === this.plugin.settings.activeCalendarId);
			tabEl.addEventListener('click', () => {
				void this.selectCalendar(calendar.id);
			});
		}

		const addTabEl = tabsEl.createEl('button', {
			cls: 'simple-ical-export-tab simple-ical-export-add-tab',
			text: '+',
			type: 'button'
		});
		addTabEl.setAttr('aria-label', 'Add calendar');
		addTabEl.addEventListener('click', () => {
			void this.addCalendar();
		});
	}

	private async selectCalendar(calendarId: string): Promise<void> {
		this.plugin.settings.activeCalendarId = calendarId;
		await this.plugin.saveSettings();
		this.refresh();
	}

	private async addCalendar(): Promise<void> {
		const calendar = this.plugin.createCalendarSettings();
		this.plugin.settings.calendars.push(calendar);
		this.plugin.settings.activeCalendarId = calendar.id;
		await this.plugin.saveSettings();
		this.refresh();
	}

	private renderCalendarSettings(containerEl: HTMLElement, calendar: IcalCalendarSettings): void {
		new Setting(containerEl)
			.setName('Calendar name')
			.then((setting) => setting.settingEl.addClasses(['simple-ical-export-setting-block', 'simple-ical-export-delete-calendar-setting']))
			.addText(text => text
				.setPlaceholder('Calendar 1')
				.setValue(calendar.name)
				.then((text) => text.inputEl.addClass('simple-ical-export-text-input'))
				.onChange(async (value) => {
					calendar.name = value.trim() || 'Calendar';
					await this.plugin.saveSettings();
				}))
			.addButton(button => {
				button
					.setButtonText('Delete calendar')
					.setWarning()
					.onClick(() => {
						new DeleteCalendarConfirmModal(this.app, calendar.name, async () => {
							this.plugin.deleteCalendarSettings(calendar.id);
							await this.plugin.saveSettings();
							this.refresh();
						}).open();
					});
				button.buttonEl.toggle(this.plugin.settings.calendars.length > 1);
			});

		const setting = new Setting(containerEl)
			.setName('Choose date property');
		setting.settingEl.addClass('simple-ical-export-setting-block');

		setting.addText(text => text
			.setPlaceholder('Date')
			.setValue(calendar.datePropertyName)
			.then((text) => {
				text.inputEl.addClass('simple-ical-export-text-input');
				new FrontmatterPropertySuggest(this.app, text.inputEl, async (propertyName) => {
					calendar.datePropertyName = propertyName;
					await this.plugin.saveSettings();
				});
			})
			.onChange(async (value) => {
				calendar.datePropertyName = value;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Choose folder location')
			.then((setting) => setting.settingEl.addClass('simple-ical-export-setting-block'))
			.addText(text => text
				.setPlaceholder('Archive/calendars')
				.setValue(calendar.outputFolderPath)
				.then((text) => {
					text.inputEl.addClass('simple-ical-export-text-input');
					new FolderSuggest(this.app, text.inputEl, async (folderPath) => {
						calendar.outputFolderPath = folderPath;
						await this.plugin.saveSettings();
					});
				})
				.onChange(async (value) => {
					calendar.outputFolderPath = normalizePath(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Choose file name')
			.then((setting) => setting.settingEl.addClass('simple-ical-export-setting-block'))
			.addText(text => text
				.setPlaceholder('Calendar.ics')
				.setValue(calendar.outputFileName)
				.then((text) => text.inputEl.addClass('simple-ical-export-text-input'))
				.onChange(async (value) => {
					calendar.outputFileName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Update interval')
			.then((setting) => setting.settingEl.addClass('simple-ical-export-interval-setting'))
			.addText(text => text
				.setPlaceholder('60')
				.setValue(String(calendar.updateIntervalValue))
				.then((text) => {
					text.inputEl.addClass('simple-ical-export-interval-input');
					text.inputEl.toggle(calendar.updateIntervalUnit !== 'disabled');
				})
				.onChange(async (value) => {
					const intervalValue = Number.parseInt(value, 10);
					calendar.updateIntervalValue = Number.isFinite(intervalValue) && intervalValue > 0 ? intervalValue : 1;
					await this.plugin.saveSettings();
				}))
			.addDropdown(dropdown => dropdown
				.addOption('disabled', 'Disabled')
				.addOption('minutes', 'Minutes')
				.addOption('hours', 'Hours')
				.addOption('days', 'Days')
				.addOption('months', 'Months')
				.setValue(calendar.updateIntervalUnit)
				.onChange(async (value: UpdateIntervalUnit) => {
					calendar.updateIntervalUnit = value;
					await this.plugin.saveSettings();
					this.refresh();
				}));

		new Setting(containerEl)
			.setName('Update now')
			.then((setting) => setting.settingEl.addClass('simple-ical-export-update-now-setting'))
			.addButton(button => button
				.setButtonText('Update now')
				.setCta()
				.onClick(() => {
					void this.plugin.updateIcalNow(calendar);
				}));

	}

	private renderGlobalSettings(containerEl: HTMLElement): void {
		;

		new Setting(containerEl)
			.setName('Show status bar updates')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatusBarUpdates)
				.onChange(async (value) => {
					this.plugin.settings.showStatusBarUpdates = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hide event ID property')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideEventIdProperty)
				.onChange(async (value) => {
					this.plugin.settings.hideEventIdProperty = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName('Developer tools').setHeading();

		new Setting(containerEl)
			.setName('Developer mode')
			.setDesc('Enables extra controls for debugging.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.developerMode)
				.onChange(async (value) => {
					this.plugin.settings.developerMode = value;
					await this.plugin.saveSettings();
					this.refresh();
				}));

		if (this.plugin.settings.developerMode) {
			new Setting(containerEl)
				.setName('Restart plugin')
				.setDesc('Disables and enables the plugin.')
				.then((setting) => setting.settingEl.addClass('simple-ical-export-developer-action'))
				.addButton(button => button
					.setButtonText('Restart plugin')
					.setWarning()
					.setCta()
					.onClick(() => {
						void this.restartPlugin();
					}));
		}
	}

	private async restartPlugin(): Promise<void> {
		type PluginManager = {
			disablePlugin?: (pluginId: string) => Promise<void>;
			enablePlugin?: (pluginId: string) => Promise<void>;
		};
		type SettingManager = {
			open?: () => void;
			openTabById?: (tabId: string) => void;
		};

		const appWithInternals = this.app as App & {
			plugins?: PluginManager;
			setting?: SettingManager;
		};
		const pluginManager = appWithInternals.plugins;

		if (!pluginManager?.disablePlugin || !pluginManager.enablePlugin) {
			new Notice('Plugin restart is not available in this Obsidian version.');
			return;
		}

		const pluginId = this.plugin.manifest.id;
		new Notice('Restarting the plugin...');
		await pluginManager.disablePlugin(pluginId);
		await pluginManager.enablePlugin(pluginId);
		window.setTimeout(() => {
			appWithInternals.setting?.open?.();
			appWithInternals.setting?.openTabById?.(pluginId);
		}, 150);
	}
}

class DeleteCalendarConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly calendarName: string,
		private readonly onConfirm: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('simple-ical-export-confirm-modal');
		contentEl.createEl('h2', {text: 'Delete calendar'});
		contentEl.createEl('p', {
			text: `Delete "${this.calendarName}"? This removes the tab settings, but does not delete any existing .ics file.`
		});

		const buttonsEl = contentEl.createDiv({cls: 'simple-ical-export-confirm-actions'});
		new Setting(buttonsEl)
			.addButton(button => button
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(button => button
				.setButtonText('Delete calendar')
				.setWarning()
				.setCta()
				.onClick(async () => {
					await this.onConfirm();
					this.close();
				}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class FrontmatterPropertySuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly onChoose: (propertyName: string) => void | Promise<void>
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const normalizedQuery = query.trim().toLowerCase();

		if (!normalizedQuery) {
			return [];
		}

		return this.getFrontmatterPropertyNames()
			.filter((propertyName) => propertyName.toLowerCase().includes(normalizedQuery))
			.slice(0, 12);
	}

	renderSuggestion(propertyName: string, el: HTMLElement): void {
		el.setText(propertyName);
	}

	selectSuggestion(propertyName: string): void {
		this.setValue(propertyName);
		void this.onChoose(propertyName);
		this.close();
	}

	private getFrontmatterPropertyNames(): string[] {
		const propertyNames = new Set<string>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

			if (!frontmatter) {
				continue;
			}

			for (const propertyName of Object.keys(frontmatter)) {
				if (propertyName !== 'position') {
					propertyNames.add(propertyName);
				}
			}
		}

		return [...propertyNames].sort((a, b) => a.localeCompare(b));
	}
}

class FolderSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly onChoose: (folderPath: string) => void | Promise<void>
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const normalizedQuery = query.trim().toLowerCase();
		const folders = this.app.vault.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => folder.path)
			.filter((folderPath) => folderPath !== '/')
			.sort((a, b) => a.localeCompare(b));

		if (!normalizedQuery) {
			return folders.slice(0, 12);
		}

		return folders
			.filter((folderPath) => folderPath.toLowerCase().includes(normalizedQuery))
			.slice(0, 12);
	}

	renderSuggestion(folderPath: string, el: HTMLElement): void {
		el.setText(folderPath);
	}

	selectSuggestion(folderPath: string): void {
		this.setValue(folderPath);
		void this.onChoose(folderPath);
		this.close();
	}
}
