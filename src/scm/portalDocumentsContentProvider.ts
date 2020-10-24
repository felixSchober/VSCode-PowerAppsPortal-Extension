import { CancellationToken, Disposable, Event, EventEmitter, ProviderResult, TextDocumentContentProvider, Uri } from "vscode";
import { ContentSnippet } from "../models/ContentSnippet";
import { PortalData } from "../models/portalData";
import { WebTemplate } from "../models/WebTemplate";
import { getFilename, getFileType } from "./portalSourceControl";

export class PowerAppsPortalDocumentContentProvider implements TextDocumentContentProvider, Disposable {
	private _onDidChange = new EventEmitter<Uri>();
	private webTemplates = new Map<string, WebTemplate>();
	private contentSnippets = new Map<string, ContentSnippet>();
	private portalData: PortalData | undefined;

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	updated(portalData: PortalData): void {
		this.portalData = portalData;

		// let's assume all 3 documents actually changed and notify the quick-diff
		this._onDidChange.fire(Uri.parse(`${JSFIDDLE_SCHEME}:${newFiddle.slug}.html`));
		this._onDidChange.fire(Uri.parse(`${JSFIDDLE_SCHEME}:${newFiddle.slug}.css`));
		this._onDidChange.fire(Uri.parse(`${JSFIDDLE_SCHEME}:${newFiddle.slug}.js`));
	}

	provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		if (token.isCancellationRequested) { return "Canceled"; }

		return Porta

	}

}