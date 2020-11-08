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
import * as path from 'path';
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

	updated(updatedPortalData: PortalData): void {
		for (const updatedDocument of updatedPortalData.data.webTemplate.values()) {
			const fn = path.join(this.workspaceFolder.uri.fsPath, FOLDER_TEMPLATES, updatedDocument.name + '.html');
			this._onDidChange.fire(Uri.parse(fn));
		}

		for (const updatedDocument of updatedPortalData.data.contentSnippet.values()) {
			const fn = path.join(this.workspaceFolder.uri.fsPath, FOLDER_CONTENT_SNIPPETS, updatedDocument.name + '.html');
			this._onDidChange.fire(Uri.parse(fn));
		}

		for (const updatedFile of updatedPortalData.data.webFile.values()) {
			const fn = path.join(this.workspaceFolder.uri.fsPath, FOLDER_WEB_FILES, updatedFile.d365Note.filename);
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
