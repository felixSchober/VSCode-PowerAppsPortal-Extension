import {
	Command,
	Disposable,
	Event,
	EventEmitter,
	ExtensionContext,
	RelativePattern,
	scm,
	SourceControl,
	SourceControlResourceGroup,
	SourceControlResourceState,
	TextDocument,
	Uri,
	window,
	workspace,
	WorkspaceFolder,
} from 'vscode';
import { ConfigurationManager } from '../configuration/configurationManager';
import * as afs from './afs';
import { PowerAppsPortalRepository } from './portalRepository';
import path = require('path');
import { PortalData, PortalFileType } from '../models/portalData';

export class PowerAppsPortalSourceControl implements Disposable {
	private portalScm: SourceControl;
	private changedResources: SourceControlResourceGroup;
	private portalRepository: PowerAppsPortalRepository;
	private _onRepositoryChange = new EventEmitter<PortalData>();
	private timeout?: NodeJS.Timer;
	private portalData!: PortalData;

	constructor(
		context: ExtensionContext,
		private readonly workspaceFolder: WorkspaceFolder,
		configurationManager: ConfigurationManager
	) {
		this.portalScm = scm.createSourceControl(
			'powerappsPortal',
			'PowerApps Portal ' + configurationManager.d365InstanceName,
			workspaceFolder.uri
		);
		this.changedResources = this.portalScm.createResourceGroup('workingTree', 'Changes');
		this.portalRepository = new PowerAppsPortalRepository(workspaceFolder, configurationManager);
		this.portalScm.quickDiffProvider = this.portalRepository;
		this.portalScm.inputBox.placeholder = 'Not supported';

		context.subscriptions.push(this.portalScm);
		this.registerFileSystemWatcher(context, workspaceFolder);
	}

	private registerFileSystemWatcher(context: ExtensionContext, workspaceFolder: WorkspaceFolder) {
		const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(workspaceFolder, '*.*'));
		fileSystemWatcher.onDidChange((uri) => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidCreate((uri) => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete((uri) => this.onResourceChange(uri), context.subscriptions);
		context.subscriptions.push(fileSystemWatcher);
	}

	private async getLocalResourceText(extension: string) {
		const document = await workspace.openTextDocument(this.portalRepository.createLocalResourcePath(extension));
		return document.getText();
	}

	/**
	 * Throws away all local changes and resets all files to the checked out version of the repository.
	 */
	resetFilesToCheckedOutVersion(): void {
		for (const snippet of this.portalData.data.contentSnippet.values()) {
			this.resetFile(snippet.id, PortalFileType.contentSnippet);
		}

		for (const template of this.portalData.data.webTemplate.values()) {
			this.resetFile(template.name, PortalFileType.contentSnippet);
		}
	}

	/** Resets the given local file content to the checked-out version. */
	private async resetFile(fileId: string, fileType: PortalFileType): Promise<void> {
		const filePath = this.portalRepository.createLocalResourcePath(fileType);

		let fileContent: string = '';

		switch (fileType) {
			case PortalFileType.contentSnippet:
				fileContent = this.portalData.data.contentSnippet.get(fileId)?.source || '';
				break;

			case PortalFileType.webTemplate:
				fileContent = this.portalData.data.webTemplate.get(fileId)?.source || '';
				break;
		
			default:
				break;
		}

		await afs.writeFile(filePath, fileContent);
	}

	getWorkspaceFolder(): WorkspaceFolder {
		return this.workspaceFolder;
	}

	getSourceControl(): SourceControl {
		return this.portalScm;
	}

	get onRepositoryChange(): Event<PortalData> {
		return this._onRepositoryChange.event;
	}

	onResourceChange(_uri: Uri): void {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		this.timeout = setTimeout(() => this.tryUpdateChangedGroup(), 500);
	}

	async tryUpdateChangedGroup(): Promise<void> {
		try {
			await this.updateChangedGroup();
		} catch (ex) {
			window.showErrorMessage(ex);
		}
	}

	/** This is where the source control determines, which documents were updated, removed, and theoretically added. */
	async updateChangedGroup(): Promise<void> {
		// for simplicity we ignore which document was changed in this event and scan all of them
		const changedResources: SourceControlResourceState[] = [];

		const uris = this.portalRepository.provideSourceControlledResources();

		for (const uri of uris) {
			let isDirty: boolean;
			let wasDeleted: boolean;

			const pathExists = await afs.exists(uri.fsPath);

			if (pathExists) {
				const document = await workspace.openTextDocument(uri);
				isDirty = this.isDirty(document);
				wasDeleted = false;
			} else {
				isDirty = true;
				wasDeleted = true;
			}

			if (isDirty) {
				const resourceState = this.toSourceControlResourceState(uri, wasDeleted);
				changedResources.push(resourceState);
			}
		}

		this.changedResources.resourceStates = changedResources;

		// the number of modified resources needs to be assigned to the SourceControl.count filed to let VS Code show the number.
		this.portalScm.count = this.changedResources.resourceStates.length;
	}

	/** Determines whether the resource is different, regardless of line endings. */
	isDirty(doc: TextDocument): boolean {
		const originalText = this.portalData.data[toExtension(doc.uri)];
		return originalText.replace('\r', '') !== doc.getText().replace('\r', '');
	}

	toSourceControlResourceState(docUri: Uri, deleted: boolean): SourceControlResourceState {
		const repositoryUri = this.portalRepository.provideOriginalResource(docUri, null);

		const fiddlePart = toExtension(docUri).toUpperCase();

		const command: Command = !deleted
			? {
					title: 'Show changes',
					command: 'diff',
					arguments: [repositoryUri, docUri, `JSFiddle#${this.portalData.instanceName} ${fiddlePart} ↔ Local changes`],
					tooltip: 'Diff your changes',
			  }
			: null;

		const resourceState: SourceControlResourceState = {
			resourceUri: docUri,
			command: command,
			decorations: {
				strikeThrough: deleted,
				tooltip: 'File was locally deleted.',
			},
		};

		return resourceState;
	}

	dispose() {
		this._onRepositoryChange.dispose();
		this.portalScm.dispose();
	}
}

/**
 * Gets extension trimming the dot character.
 * @param uri document uri
 */
export function toExtension(uri: Uri): string {
	return path.extname(uri.fsPath).substr(1);
}
