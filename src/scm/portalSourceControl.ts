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
import {
	FOLDER_CONTENT_SNIPPETS,
	FOLDER_TEMPLATES,
	FOLDER_WEB_FILES,
	PowerAppsPortalRepository,
} from './portalRepository';
import { PortalData, PortalFileType } from '../models/portalData';
import path = require('path');
import { Utils } from '../utils';

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

	public static async getPortalScm(
		context: ExtensionContext,
		workspaceFolder: WorkspaceFolder,
		configurationManager: ConfigurationManager
	) {
		const portalScm = new PowerAppsPortalSourceControl(context, workspaceFolder, configurationManager);
		console.log('Downloading portal data');
		const portalData = await portalScm.portalRepository.download();
		console.log('Portal Data downloaded');
		portalScm.portalData = portalData;
		// clone portal to the local workspace
		portalScm.setPortalData(portalData, true);
		return portalScm;
	}

	private registerFileSystemWatcher(context: ExtensionContext, workspaceFolder: WorkspaceFolder) {
		const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(workspaceFolder, '**/*.*'));
		fileSystemWatcher.onDidChange((uri) => {
			console.log("File change");
			this.onResourceChange(uri);
		}, context.subscriptions);
		fileSystemWatcher.onDidCreate((uri) => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete((uri) => this.onResourceChange(uri), context.subscriptions);
		context.subscriptions.push(fileSystemWatcher);
	}

	private async getLocalResourceText(fileName: string, fileType: PortalFileType) {
		const document = await workspace.openTextDocument(
			this.portalRepository.createLocalResourcePath(fileName, fileType)
		);
		return document.getText();
	}

	private refreshStatusBar() {
		this.portalScm.statusBarCommands = [
			{
				command: 'extension.source-control.checkout',
				arguments: [this],
				title: `↕ ${this.portalData.portalName}@${this.portalData.instanceName}`,
				tooltip: 'Checkout portal.',
			},
		];
	}

	async commitAll(): Promise<void> {
		if (!this.changedResources.resourceStates.length) {
			window.showErrorMessage('There is nothing to commit.');
		} else {
			console.log('Commit data');
			// const html = await this.getLocalResourceText('html');
			// const js = await this.getLocalResourceText('js');
			// const css = await this.getLocalResourceText('css');

			// // here we assume nobody updated the Fiddle on the server since we refreshed the list of versions
			// try {
			// 	const newFiddle = await uploadFiddle(
			// 		this.fiddle.slug,
			// 		this.fiddle.version + 1,
			// 		html,
			// 		js,
			// 		css
			// 	);
			// 	if (!newFiddle) {
			// 		return;
			// 	}
			// 	this.setFiddle(newFiddle, false);
			// 	this.jsFiddleScm.inputBox.value = '';
			// } catch (ex) {
			// 	vscode.window.showErrorMessage('Cannot commit changes to JS Fiddle. ' + ex.message);
			// }
		}
	}

	/**
	 * Throws away all local changes and resets all files to the checked out version of the repository.
	 */
	resetFilesToCheckedOutVersion(): void {
		// create folder structure
		Utils.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_CONTENT_SNIPPETS));
		Utils.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_WEB_FILES));
		Utils.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_TEMPLATES));

		for (const snippet of this.portalData.data.contentSnippet.values()) {
			this.resetFile(snippet.name, PortalFileType.contentSnippet);
		}

		for (const template of this.portalData.data.webTemplate.values()) {
			this.resetFile(template.name, PortalFileType.webTemplate);
		}
	}

	/** Resets the given local file content to the checked-out version. */
	private async resetFile(fileName: string, fileType: PortalFileType): Promise<void> {
		const filePath = this.portalRepository.createLocalResourcePath(fileName, fileType);

		let fileContent: string = '';

		switch (fileType) {
			case PortalFileType.contentSnippet:
				fileContent = this.portalData.data.contentSnippet.get(fileName)?.source || '';
				break;

			case PortalFileType.webTemplate:
				fileContent = this.portalData.data.webTemplate.get(fileName)?.source || '';
				break;

			default:
				break;
		}

		await afs.writeFile(filePath, fileContent);
	}

	async tryCheckout(): Promise<void> {
		if (this.changedResources.resourceStates.length) {
			const changedResourcesCount = this.changedResources.resourceStates.length;
			window.showErrorMessage(
				`There is one or more changed resources. Discard or commit your local changes before checking out another version.`
			);
		} else {
			try {
				const newPortalData = await this.portalRepository.download();
				this.setPortalData(newPortalData, true);
			} catch (ex) {
				window.showErrorMessage(ex);
			}
		}
	}

	private setPortalData(newPortalData: PortalData, overwrite: boolean) {
		this.portalData = newPortalData;
		if (overwrite) {
			this.resetFilesToCheckedOutVersion();
		} // overwrite local file content
		this._onRepositoryChange.fire(this.portalData);
		this.refreshStatusBar();
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
		const originalText = this.portalData.getDocumentContent(doc.uri) || '';
		// if (!originalText) {
		// 	return true;
		// }
		const isDirty = originalText.replace(/\n/g, '').replace(/\r/g, '') !== doc.getText().replace(/\n/g, '').replace(/\r/g, '');
		return isDirty;
	}

	toSourceControlResourceState(docUri: Uri, deleted: boolean): SourceControlResourceState {
		const repositoryUri = this.portalRepository.provideOriginalResource(docUri, null);

		const fiddlePart = getFilename(docUri).toUpperCase();

		const command: Command | undefined = !deleted
			? {
					title: 'Show changes',
					command: 'diff',
					arguments: [
						repositoryUri,
						docUri,
						`JSFiddle#${this.portalData.instanceName} ${fiddlePart} ↔ Local changes`,
					],
					tooltip: 'Diff your changes',
			  }
			: undefined;

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

	getPortalData(): PortalData {
		return this.portalData;
	}
}

/**
 * Gets extension trimming the dot character.
 * @param uri document uri
 */
export function getFilename(uri: Uri): string {
	return path.basename(uri.fsPath).split('.')[0];
}

export function getFileType(uri: Uri): PortalFileType {
	const folders = path.dirname(uri.fsPath).split(path.sep);
	const fileFolder = folders[folders.length - 1];
	switch (fileFolder) {
		case FOLDER_CONTENT_SNIPPETS:
			return PortalFileType.contentSnippet;
		case FOLDER_TEMPLATES:
			return PortalFileType.webTemplate;
		case FOLDER_WEB_FILES:
			return PortalFileType.webFile;
		default:
			throw Error(`Unknown portal file type: ${fileFolder}.`);
	}
}
