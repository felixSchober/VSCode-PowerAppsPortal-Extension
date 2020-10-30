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
import { ContentSnippet } from '../models/ContentSnippet';
import { PortalData, PortalFileType } from '../models/portalData';
import { WebTemplate } from '../models/WebTemplate';
import * as path from 'path';
import { FOLDER_TEMPLATES } from './portalRepository';

export class PowerAppsPortalDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private webTemplates = new Map<string, WebTemplate>();
	private contentSnippets = new Map<string, ContentSnippet>();
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

		this.portalData = updatedPortalData;
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) {
			return 'Canceled';
		}

		if (!this.portalData) {
			return 'Canceled';
		}

		return this.portalData.getDocumentContent(uri);
	}
}
