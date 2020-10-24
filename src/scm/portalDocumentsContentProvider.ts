import { CancellationToken, Disposable, Event, EventEmitter, ProviderResult, TextDocumentContentProvider, Uri } from "vscode";
import { ContentSnippet } from "../models/ContentSnippet";
import { WebTemplate } from "../models/WebTemplate";

export class PowerAppsPortalDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private webTemplates = new Map<string, WebTemplate>();
	private contentSnippets = new Map<string, ContentSnippet>();

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) { return "Canceled"; }

		console.log(uri);
		return '';
	}

}