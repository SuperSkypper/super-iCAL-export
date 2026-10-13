import {normalizePath, Notice, Plugin, TFile} from 'obsidian';
import {
	createDefaultCalendarSettings,
	DEFAULT_SETTINGS,
	IcalCalendarSettings,
	SimpleIcalExportSettingTab,
	SimpleIcalExportSettings,
	UpdateIntervalUnit
} from './settings';

interface CalendarEvent {
	date: Date;
	isAllDay: boolean;
	sourceFile: TFile;
	title: string;
	uid: string;
}

const ICAL_EVENT_ID_PROPERTY = 'iCAL-Event-ID';

export default class SimpleIcalExportPlugin extends Plugin {
	settings: SimpleIcalExportSettings;
	private updateIntervalIds = new Map<string, number>();
	private statusBarItemEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SimpleIcalExportSettingTab(this.app, this));
		this.statusBarItemEl = this.addStatusBarItem();
		this.hideStatusBarItem();
		this.updateEventIdPropertyVisibility();
		this.scheduleAutomaticUpdates();

		this.addCommand({
			id: 'show-selected-date-property',
			name: 'Show export settings',
			callback: () => {
				const calendar = this.getActiveCalendarSettings();
				const propertyName = calendar.datePropertyName.trim();
				const outputFolderPath = calendar.outputFolderPath.trim();
				const outputFileName = calendar.outputFileName.trim();
				const outputFilePath = [outputFolderPath, outputFileName].filter(Boolean).join('/');
				new Notice(`${calendar.name}: ${propertyName || 'not selected'} | ${outputFilePath || 'not selected'}`);
			}
		});
	}

	onunload() {
		this.clearAutomaticUpdates();
		document.body.removeClass('simple-ical-export-hide-event-id-property');
	}

	async loadSettings() {
		this.settings = this.normalizeSettings(await this.loadData() as Partial<SimpleIcalExportSettings> & Partial<IcalCalendarSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateEventIdPropertyVisibility();
		this.scheduleAutomaticUpdates();
	}

	private updateEventIdPropertyVisibility(): void {
		document.body.toggleClass('simple-ical-export-hide-event-id-property', this.settings.hideEventIdProperty);
	}

	getActiveCalendarSettings(): IcalCalendarSettings {
		const activeCalendar = this.settings.calendars.find((calendar) => calendar.id === this.settings.activeCalendarId);

		if (activeCalendar) {
			return activeCalendar;
		}

		const firstCalendar = this.settings.calendars[0] ?? createDefaultCalendarSettings();
		this.settings.calendars = this.settings.calendars.length > 0 ? this.settings.calendars : [firstCalendar];
		this.settings.activeCalendarId = firstCalendar.id;
		return firstCalendar;
	}

	createCalendarSettings(): IcalCalendarSettings {
		const nextIndex = this.settings.calendars.length + 1;
		return {
			...createDefaultCalendarSettings(nextIndex),
			id: `calendar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
		};
	}

	deleteCalendarSettings(calendarId: string): void {
		if (this.settings.calendars.length <= 1) {
			return;
		}

		this.settings.calendars = this.settings.calendars.filter((calendar) => calendar.id !== calendarId);

		if (!this.settings.calendars.some((calendar) => calendar.id === this.settings.activeCalendarId)) {
			this.settings.activeCalendarId = this.settings.calendars[0]?.id ?? createDefaultCalendarSettings().id;
		}
	}

	async updateIcalNow(calendar = this.getActiveCalendarSettings()) {
		this.setStatusBarText(`Updating ${calendar.name}...`);
		new Notice(`Updating ${calendar.name}...`);

		try {
			const propertyName = calendar.datePropertyName.trim();

			if (!propertyName) {
				new Notice(`Choose a date property before updating ${calendar.name}.`);
				return;
			}

			const outputPath = this.getOutputPath(calendar);

			if (!outputPath) {
				new Notice(`Choose a file name before updating ${calendar.name}.`);
				return;
			}

			const events = await this.collectCalendarEvents(propertyName, (current, total) => {
				this.setStatusBarText(`Updating ${calendar.name}: ${current}/${total}`);
			});
			const calendarText = this.buildCalendar(events);
			await this.ensureOutputFolder(calendar);
			await this.app.vault.adapter.write(outputPath, calendarText);

			this.setStatusBarText(`${calendar.name} updated: ${events.length} event${events.length === 1 ? '' : 's'}`);
			new Notice(`Updated ${outputPath} with ${events.length} event${events.length === 1 ? '' : 's'}.`);
		} catch (error) {
			console.error('Super iCAL Export update failed', error);
			const message = error instanceof Error ? error.message : String(error);
			this.setStatusBarText(`${calendar.name} update failed`);
			new Notice(`Failed to update ${calendar.name}: ${message}`);
		} finally {
			window.setTimeout(() => this.hideStatusBarItem(), 5000);
		}
	}

	private setStatusBarText(text: string): void {
		if (!this.statusBarItemEl || !this.settings.showStatusBarUpdates) {
			return;
		}

		this.statusBarItemEl.setText(text);
		this.statusBarItemEl.show();
	}

	private hideStatusBarItem(): void {
		this.statusBarItemEl?.hide();
	}

	private scheduleAutomaticUpdates(): void {
		this.clearAutomaticUpdates();

		for (const calendar of this.settings.calendars) {
			const intervalMs = this.getUpdateIntervalMs(calendar);

			if (intervalMs <= 0) {
				continue;
			}

			const intervalId = window.setInterval(() => {
				void this.updateIcalNow(calendar);
			}, intervalMs);
			this.updateIntervalIds.set(calendar.id, intervalId);
			this.registerInterval(intervalId);
		}
	}

	private clearAutomaticUpdates(): void {
		for (const intervalId of this.updateIntervalIds.values()) {
			window.clearInterval(intervalId);
		}

		this.updateIntervalIds.clear();
	}

	private getUpdateIntervalMs(calendar: IcalCalendarSettings): number {
		const intervalValue = Math.max(1, calendar.updateIntervalValue);
		const multipliers: Record<UpdateIntervalUnit, number> = {
			disabled: 0,
			minutes: 60 * 1000,
			hours: 60 * 60 * 1000,
			days: 24 * 60 * 60 * 1000,
			months: 30 * 24 * 60 * 60 * 1000
		};

		return intervalValue * multipliers[calendar.updateIntervalUnit];
	}

	private async collectCalendarEvents(
		propertyName: string,
		onProgress?: (current: number, total: number) => void
	): Promise<CalendarEvent[]> {
		const events: CalendarEvent[] = [];
		const usedEventIds = new Set<string>();
		const filesWithDate = this.app.vault.getMarkdownFiles()
			.map((file) => ({
				file,
				parsedDate: this.parseDateValue(this.getFrontmatterValue(file, propertyName))
			}))
			.filter((entry): entry is {file: TFile; parsedDate: {date: Date; isAllDay: boolean}} => entry.parsedDate !== null)
			.sort((a, b) => this.getFileAge(a.file) - this.getFileAge(b.file));
		let processedCount = 0;

		onProgress?.(processedCount, filesWithDate.length);

		for (const {file, parsedDate} of filesWithDate) {
			let uid: string;

			try {
				uid = await this.getOrCreateUniqueEventUid(file, usedEventIds);
			} catch (error) {
				console.error(`Super iCAL Export could not create an event ID for ${file.path}`, error);
				processedCount++;
				onProgress?.(processedCount, filesWithDate.length);
				continue;
			}

			events.push({
				date: parsedDate.date,
				isAllDay: parsedDate.isAllDay,
				sourceFile: file,
				title: file.basename,
				uid
			});
			processedCount++;
			onProgress?.(processedCount, filesWithDate.length);
		}

		return events.sort((a, b) => a.date.getTime() - b.date.getTime());
	}

	private getFileAge(file: TFile): number {
		return file.stat.ctime || file.stat.mtime || 0;
	}

	private parseDateValue(value: unknown): {date: Date; isAllDay: boolean} | null {
		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			return {date: value, isAllDay: false};
		}

		if (Array.isArray(value)) {
			return this.parseDateValue(value[0]);
		}

		if (typeof value !== 'string' && typeof value !== 'number') {
			return null;
		}

		const text = String(value).trim();

		if (!text) {
			return null;
		}

		if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
			const date = new Date(`${text}T00:00:00`);
			return Number.isNaN(date.getTime()) ? null : {date, isAllDay: true};
		}

		const date = new Date(text);
		return Number.isNaN(date.getTime()) ? null : {date, isAllDay: false};
	}

	private buildCalendar(events: CalendarEvent[]): string {
		const lines = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Super iCAL Export//Obsidian Plugin//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH'
		];
		const generatedAt = this.formatDateTime(new Date());

		for (const event of events) {
			lines.push(
				'BEGIN:VEVENT',
				`UID:${event.uid}`,
				`DTSTAMP:${generatedAt}`,
				`SUMMARY:${this.escapeText(event.title)}`
			);

			if (event.isAllDay) {
				lines.push(
					`DTSTART;VALUE=DATE:${this.formatDate(event.date)}`,
					`DTEND;VALUE=DATE:${this.formatDate(this.addDays(event.date, 1))}`
				);
			} else {
				lines.push(
					`DTSTART:${this.formatDateTime(event.date)}`,
					`DTEND:${this.formatDateTime(new Date(event.date.getTime() + 60 * 60 * 1000))}`
				);
			}

			const obsidianUri = this.createObsidianUri(event.sourceFile);
			lines.push(
				`DESCRIPTION:${this.escapeText('Go To Obsidian')}`,
				`URL:${this.escapeText(obsidianUri)}`,
				'END:VEVENT'
			);
		}

		lines.push('END:VCALENDAR');
		return `${lines.map((line) => this.foldLine(line)).join('\r\n')}\r\n`;
	}

	private getOutputPath(calendar: IcalCalendarSettings): string {
		const outputFolderPath = normalizePath(calendar.outputFolderPath.trim());
		const outputFileName = this.ensureIcalExtension(calendar.outputFileName.trim());

		if (!outputFileName) {
			return '';
		}

		return normalizePath([outputFolderPath, outputFileName].filter(Boolean).join('/'));
	}

	private async ensureOutputFolder(calendar: IcalCalendarSettings): Promise<void> {
		const outputFolderPath = normalizePath(calendar.outputFolderPath.trim());

		if (!outputFolderPath || await this.app.vault.adapter.exists(outputFolderPath)) {
			return;
		}

		const pathParts = outputFolderPath.split('/');
		let currentPath = '';

		for (const pathPart of pathParts) {
			currentPath = normalizePath([currentPath, pathPart].filter(Boolean).join('/'));

			if (!await this.app.vault.adapter.exists(currentPath)) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	private ensureIcalExtension(fileName: string): string {
		if (!fileName) {
			return '';
		}

		return fileName.toLowerCase().endsWith('.ics') ? fileName : `${fileName}.ics`;
	}

	private formatDate(date: Date): string {
		return [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, '0'),
			String(date.getDate()).padStart(2, '0')
		].join('');
	}

	private formatDateTime(date: Date): string {
		return [
			date.getUTCFullYear(),
			String(date.getUTCMonth() + 1).padStart(2, '0'),
			String(date.getUTCDate()).padStart(2, '0'),
			'T',
			String(date.getUTCHours()).padStart(2, '0'),
			String(date.getUTCMinutes()).padStart(2, '0'),
			String(date.getUTCSeconds()).padStart(2, '0'),
			'Z'
		].join('');
	}

	private addDays(date: Date, days: number): Date {
		const nextDate = new Date(date);
		nextDate.setDate(nextDate.getDate() + days);
		return nextDate;
	}

	private escapeText(text: string): string {
		return text
			.replace(/\\/g, '\\\\')
			.replace(/;/g, '\\;')
			.replace(/,/g, '\\,')
			.replace(/\r?\n/g, '\\n');
	}

	private createObsidianUri(file: TFile): string {
		return `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(file.path)}`;
	}

	private async getOrCreateUniqueEventUid(file: TFile, usedEventIds: Set<string>): Promise<string> {
		const existingEventId = this.getFrontmatterValue(file, ICAL_EVENT_ID_PROPERTY);

		if (typeof existingEventId === 'string' && existingEventId.trim()) {
			const trimmedEventId = existingEventId.trim();

			if (!usedEventIds.has(trimmedEventId)) {
				usedEventIds.add(trimmedEventId);
				return trimmedEventId;
			}
		}

		const uid = this.createUniqueRandomId(usedEventIds);

		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[ICAL_EVENT_ID_PROPERTY] = uid;
		});

		return uid;
	}

	private getFrontmatterValue(file: TFile, propertyName: string): unknown {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return (frontmatter as Record<string, unknown> | undefined)?.[propertyName];
	}

	private createUniqueRandomId(usedEventIds: Set<string>): string {
		let eventId = this.createRandomId();

		while (usedEventIds.has(eventId)) {
			eventId = this.createRandomId();
		}

		usedEventIds.add(eventId);
		return eventId;
	}

	private createRandomId(): string {
		const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
		const randomValues = new Uint8Array(26);

		if (window.crypto?.getRandomValues) {
			window.crypto.getRandomValues(randomValues);
			return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
		}

		for (let index = 0; index < randomValues.length; index++) {
			randomValues[index] = Math.floor(Math.random() * alphabet.length);
		}

		return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
	}

	private foldLine(line: string): string {
		const limit = 75;
		const encoder = new TextEncoder();

		if (encoder.encode(line).length <= limit) {
			return line;
		}

		const parts: string[] = [];
		let currentLine = '';
		let currentLineBytes = 0;

		for (const character of line) {
			const characterBytes = encoder.encode(character).length;

			if (currentLineBytes + characterBytes > limit) {
				parts.push(currentLine);
				currentLine = ` ${character}`;
				currentLineBytes = 1 + characterBytes;
				continue;
			}

			currentLine += character;
			currentLineBytes += characterBytes;
		}

		if (currentLine) {
			parts.push(currentLine);
		}

		return parts.join('\r\n');
	}

	private normalizeSettings(
		loadedSettings: Partial<SimpleIcalExportSettings> & Partial<IcalCalendarSettings>
	): SimpleIcalExportSettings {
		const calendars = Array.isArray(loadedSettings.calendars) && loadedSettings.calendars.length > 0
			? loadedSettings.calendars.map((calendar, index) => this.normalizeCalendarSettings(calendar, index + 1))
			: [this.normalizeCalendarSettings(loadedSettings, 1)];
		const firstCalendar = calendars[0] ?? createDefaultCalendarSettings();
		const activeCalendarId = typeof loadedSettings.activeCalendarId === 'string'
			&& calendars.some((calendar) => calendar.id === loadedSettings.activeCalendarId)
			? loadedSettings.activeCalendarId
			: firstCalendar.id;

		return {
			...DEFAULT_SETTINGS,
			calendars,
			activeCalendarId,
			showStatusBarUpdates: loadedSettings.showStatusBarUpdates ?? DEFAULT_SETTINGS.showStatusBarUpdates,
			hideEventIdProperty: loadedSettings.hideEventIdProperty ?? DEFAULT_SETTINGS.hideEventIdProperty,
			developerMode: loadedSettings.developerMode ?? DEFAULT_SETTINGS.developerMode
		};
	}

	private normalizeCalendarSettings(calendar: Partial<IcalCalendarSettings>, index: number): IcalCalendarSettings {
		const defaults = createDefaultCalendarSettings(index);

		return {
			...defaults,
			id: calendar.id || defaults.id,
			name: calendar.name || defaults.name,
			datePropertyName: calendar.datePropertyName ?? defaults.datePropertyName,
			outputFolderPath: calendar.outputFolderPath ?? defaults.outputFolderPath,
			outputFileName: calendar.outputFileName ?? defaults.outputFileName,
			updateIntervalUnit: calendar.updateIntervalUnit || defaults.updateIntervalUnit,
			updateIntervalValue: calendar.updateIntervalValue || defaults.updateIntervalValue
		};
	}
}
