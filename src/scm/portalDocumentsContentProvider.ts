import * as path from 'path';

import {
	CancellationToken,
	Disposable,
	Event,
	EventEmitter,
	ProviderResult,
	TextDocumentContentProvider,
	Uri,
	WorkspaceFolder,
} from 'vscode';

import { PortalData } from '../models/portalData';

import { FOLDER_CONTENT_SNIPPETS, FOLDER_TEMPLATES, FOLDER_WEB_FILES } from './portalRepository';

export class PowerAppsPortalDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private portalData: PortalData | undefined;

	constructor(private readonly workspaceFolder: WorkspaceFolder) {}

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	updated(updatedPortalData: PortalData, useFoldersForWebFiles: boolean): void {
		for (const updatedDocument of updatedPortalData.data.webTemplate.values()) {
			const fn = path.join(this.workspaceFolder.uri.fsPath, FOLDER_TEMPLATES, updatedDocument.name + '.html');
			this._onDidChange.fire(Uri.parse(fn));
		}

		for (const updatedDocument of updatedPortalData.data.contentSnippet.values()) {
			const fn = path.join(this.workspaceFolder.uri.fsPath, FOLDER_CONTENT_SNIPPETS, updatedDocument.name + '.html');
			this._onDidChange.fire(Uri.parse(fn));
		}

		for (const updatedFile of updatedPortalData.data.webFile.values()) {
			let fileFolder: string;
			if (useFoldersForWebFiles) {
				fileFolder = updatedFile.fullPath;
			} else {
				fileFolder = updatedFile.d365Note.filename;
			}
			const fn = path.join(this.workspaceFolder.uri.fsPath, FOLDER_WEB_FILES, fileFolder);
			this._onDidChange.fire(Uri.parse(fn));
		}

		this.portalData = updatedPortalData;
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) {
			return 'Canceled';
		}

		if (!this.portalData) {
			console.warn(`Could not get data for document ${uri.fsPath}`);
			return '';
		}

		const c = this.portalData.getDocumentContent(uri);
		return c;
	}
}
