import {
	Command,
	Disposable,
	Event,
	EventEmitter,
	ExtensionContext,
	ProgressLocation,
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
import { Utils } from '../utils';
import path = require('path');
import { ALL_FILES_GLOB } from './afs';

export class PowerAppsPortalSourceControl implements Disposable {
	private portalScm: SourceControl;
	private changedResources: SourceControlResourceGroup;
	private portalRepository: PowerAppsPortalRepository;
	private _onRepositoryChange = new EventEmitter<PortalData>();
	private timeout?: NodeJS.Timer;
	private portalData!: PortalData;
	private changedGroup: Set<Uri> = new Set<Uri>();
	private changedResourceStates: Map<string, SourceControlResourceState> = new Map<string, SourceControlResourceState>();

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
		this.portalScm.inputBox.placeholder = 'This feature is not supported';
		this.portalScm.inputBox.visible = false;

		context.subscriptions.push(this.portalScm);
		this.registerFileSystemWatcher(context, workspaceFolder);
	}

	private async downloadData(): Promise<PortalData> {
		this.refreshStatusBar('$(sync~spin)', `Portal: Downloading`);
		let result: PortalData;
		try {
			result = await this.portalRepository.download();
		} catch (error) {
			this.refreshStatusBar('$(dialog-error)', `Portal: Download Error`);
			window.showErrorMessage(`Could not download portal data: ${error}`);
			throw new Error(`[SCM] Could not download portal data: ${error.message}`);
		}
		this.refreshStatusBar('$(sync)', `${result.portalName}@${result.instanceName}`);
		console.log('[SCM] Download complete');
		return result;
	}

	public static async getPortalScm(
		context: ExtensionContext,
		workspaceFolder: WorkspaceFolder,
		configurationManager: ConfigurationManager,
		overwrite: boolean
	): Promise<PowerAppsPortalSourceControl> {
		const portalScm = new PowerAppsPortalSourceControl(context, workspaceFolder, configurationManager);

		console.log('[SCM] Downloading portal data');
		let portalData: PortalData;

		try {
			portalData = await portalScm.downloadData();
		} catch (error) {
			throw new Error(`[SCM] Could not download portal data: ${error}`);
		}

		console.log('[SCM] Portal Data downloaded');

		// save chosen portal id and name to config file so that the user doesn't need to
		// specify the portal again
		// also, this helps activating the extension on future runs.
		configurationManager.portalId = portalScm.portalRepository.portalId;
		configurationManager.portalName = portalScm.portalRepository.portalName;
		await configurationManager.storeConfigurationFile();

		portalScm.portalData = portalData;

		// clone portal to the local workspace
		try {
			await portalScm.setPortalData(portalData, overwrite);
		} catch (ex) {
			window.showErrorMessage(ex);
		}
		return portalScm;
	}

	private registerFileSystemWatcher(context: ExtensionContext, workspaceFolder: WorkspaceFolder) {
		const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(workspaceFolder, ALL_FILES_GLOB));
		fileSystemWatcher.onDidChange((uri) => {
			this.onResourceChange(uri);
		}, context.subscriptions);
		fileSystemWatcher.onDidCreate((uri) => this.onResourceChange(uri), context.subscriptions);
		fileSystemWatcher.onDidDelete((uri) => this.onResourceChange(uri), context.subscriptions);
		context.subscriptions.push(fileSystemWatcher);
	}

	private async getLocalResourceText(fileName: string, fileType: PortalFileType) {
		const document = await workspace.openTextDocument(
			await this.portalRepository.createLocalResourcePath(fileName, fileType)
		);
		return document.getText();
	}

	private async getLocalFile(uri: Uri, fileType: PortalFileType, fileAsBase64: boolean = false): Promise<string> {
		if (fileType !== PortalFileType.webFile) {
			const document = await workspace.openTextDocument(uri);
			return document.getText();
		} else {
			const fileBuffer = await afs.readFile(uri.fsPath);
			
			if (fileAsBase64) {
				return fileBuffer.toString(afs.BASE64);
			} else {
				return fileBuffer.toString();
			}
		}
	}

	public refreshStatusBar(icon: string, text: string) {
		this.portalScm.statusBarCommands = [
			{
				command: 'powerapps-portal-local-development.source-control.refresh',
				arguments: [this],
				title: `${icon} ${text}`,
				tooltip: 'Download latest portal changes',
			}
		];
	}

	async commitAll(): Promise<void> {
		if (!this.changedResources.resourceStates.length) {
			window.showErrorMessage('[SCM] There is nothing to commit.');
		} else {
			console.log('[SCM] Commit data');

			// commit all files to the repo
			try {
				await this.commitAllToRepo();
			} catch (error) {
				window.showErrorMessage(`Could not commit all documents to Dynamics: ${error}`);
			}
			
			try {
				await this.setPortalData(this.portalRepository.getPortalData(), false);
			} catch (ex) {
				window.showErrorMessage(ex);
			}

			window.showInformationMessage(`Data uploaded`);
		}
	}

	private async commitAllToRepo() {
		return await window.withProgress({location: ProgressLocation.SourceControl}, async (progress, cancellationToken) => {
			for (const changedResource of this.changedResourceStates.values()) {
				const fileType = getFileType(changedResource.resourceUri);
				// was deleted?
				if (changedResource.decorations?.strikeThrough) {
					await this.portalRepository.deleteFile(fileType, changedResource.resourceUri);
					continue;
				}

				const updatedContents = await this.getLocalFile(changedResource.resourceUri, fileType, true);
				// was the file modified?
				if (this.portalData.fileExists(changedResource.resourceUri)) {
					await this.portalRepository.updateFile(fileType, changedResource.resourceUri, updatedContents);
				} else {
					await this.portalRepository.addFile(fileType, changedResource.resourceUri, updatedContents);
				}
			}
		});
	}

	/**
	 * Throws away all local changes and resets all files to the checked out version of the repository.
	 */
	async resetFilesToCheckedOutVersion(): Promise<void> {
		// create folder structure
		Utils.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_CONTENT_SNIPPETS));
		Utils.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_WEB_FILES));
		Utils.createFolder(path.join(this.workspaceFolder.uri.fsPath, FOLDER_TEMPLATES));

		for (const snippet of this.portalData.data.contentSnippet.values()) {
			await this.resetFile(snippet.name, PortalFileType.contentSnippet);
		}

		for (const template of this.portalData.data.webTemplate.values()) {
			await this.resetFile(template.name, PortalFileType.webTemplate);
		}

		for (const webFile of this.portalData.data.webFile.values()) {
			await this.resetFile(webFile.d365Note.filename, PortalFileType.webFile);
		}

		// delete new existing non-tracked files
		if (this.changedResourceStates.size > 0) {
			console.log(`[SCM] found ${this.changedResourceStates.size} untracked new files to reset.`);
			for (const f of this.changedResourceStates.values()) {
				// don't delete file if the file is tracked
				if (this.portalData.fileExists(f.resourceUri)) {
					continue;
				}
				console.log(`[SCM] Deleting ${f.resourceUri}.`);
				await afs.unlink(f.resourceUri.fsPath);
			}
		}

		this.changedResourceStates.clear();
	}

	/** Resets the given local file content to the checked-out version. */
	private async resetFile(fileName: string, fileType: PortalFileType): Promise<void> {
		const filePath = await this.portalRepository.createLocalResourcePath(fileName, fileType);

		let fileContent: string = '';

		switch (fileType) {
			case PortalFileType.contentSnippet:
				fileContent = this.portalData.data.contentSnippet.get(fileName)?.source || '';
				await afs.writeDocument(filePath, fileContent);
				break;

			case PortalFileType.webTemplate:
				fileContent = this.portalData.data.webTemplate.get(fileName)?.source || '';
				await afs.writeDocument(filePath, fileContent);
				break;

			case PortalFileType.webFile:
				fileContent = this.portalData.data.webFile.get(fileName)?.b64Content || '';
				await afs.writeBase64File(filePath, fileContent);
				break;

			default:
				break;
		}

	}

	async tryCheckout(): Promise<void> {
		if (this.changedResources.resourceStates.length) {
			const changedResourcesCount = this.changedResources.resourceStates.length;
			window.showErrorMessage(
				`There is one or more changed resources. Discard or commit your local changes before checking out another version.`
			);
		} else {
			try {
				const newPortalData = await this.downloadData();

				// force set data (overwrite = true)
				await this.setPortalData(newPortalData, true);
			} catch (ex) {
				window.showErrorMessage(ex);
			}
		}
	}

	/**
	 * Refresh is used when the information on the server may have changed.
	 * For example another user updates the Fiddle online.
	 */
	async refresh(): Promise<void> {
		try {
			const latestPortalData = await this.downloadData();
			await this.setPortalData(latestPortalData, false);
		} catch (ex) {
			window.showErrorMessage(ex);
		}
	}

	private async setPortalData(newPortalData: PortalData, overwrite: boolean) {
		console.log(`[SCM] Setting portal data. Overwrite: ${overwrite}.\n[SCM] =========================================`);
		console.log(`\tOld Snippets: ${this.portalData?.data.contentSnippet.size}.`);
		console.log(`\tNew Snippets: ${newPortalData.data.contentSnippet.size}.`);
		console.log(`\tOld Templates: ${this.portalData?.data.webTemplate.size}.`);
		console.log(`\tNew Templates: ${newPortalData.data.webTemplate.size}.`);
		console.log(`\tOld Files: ${this.portalData?.data.webFile.size}.`);
		console.log(`\tNew Files: ${newPortalData.data.webFile.size}.`);

		this.portalData = newPortalData;
		if (overwrite) {
			// overwrite local file content
			await this.resetFilesToCheckedOutVersion();
		}

		// initially, mark all files as changed
		this.changedGroup = await this.portalRepository.provideSourceControlledResources();


		this._onRepositoryChange.fire(this.portalData);
		this.refreshStatusBar('$(refresh)', `${this.portalData.portalName}@${this.portalData.instanceName}`);
		await this.tryUpdateChangedGroup();
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
		this.changedGroup.add(_uri);
		this.timeout = setTimeout(() => this.tryUpdateChangedGroup(), 500);
	}

	async tryUpdateChangedGroup(): Promise<void> {
		console.log(`[SCM] Update ${this.changedGroup.size} files.`);
		try {
			await this.updateChangedGroup();
		} catch (ex) {
			window.showErrorMessage(ex);
		}
	}

	/** This is where the source control determines, which documents were updated, removed, and theoretically added. */
	async updateChangedGroup(): Promise<void> {
		// for simplicity we ignore which document was changed in this event and scan all of them
		

		const uris = this.changedGroup;
		this.changedGroup = new Set<Uri>();

		try {
			await window.withProgress({location: ProgressLocation.SourceControl}, async () => {

				for (const uri of uris) {

					// if the current file is not a "portal file" ignore it
					if (getFileType(uri) === PortalFileType.other) {
						continue;
					}

					let isDirty: boolean;
					let wasDeleted: boolean;
		
					const pathExists = await afs.exists(uri.fsPath);
		
					if (pathExists) {
						let document: TextDocument;
						try {
							document = await workspace.openTextDocument(uri);
							isDirty = this.isDirty(document);
						} catch (error) {
							const fileBuffer = await afs.readFile(uri.fsPath);
							const encodedFile = fileBuffer.toString(afs.BASE64);
							isDirty = this.isDirtyBase64(uri, encodedFile);
						}
						
						wasDeleted = false;
					} else {
						// does the file exist in the repo? 
						// if it doesn't then we can remove it from scm directly
						const fileExistsInPortalData = this.portalData.fileExists(uri);
						if (!fileExistsInPortalData) {
							console.log('[SCM] File was deleted but is not tracked for portal.');
							isDirty = false;
							wasDeleted = true;
						} else {
							isDirty = true;
							wasDeleted = true;
						}
					}
		
					if (isDirty) {
						const resourceState = this.toSourceControlResourceState(uri, wasDeleted);
		
						// use a map to prevent duplicate change entries
						this.changedResourceStates.set(uri.fsPath, resourceState);
					} else {
						// uri is not dirty. check if it is in 'changedresouce' state (could have been previously changed but then changed back)
						if (this.changedResourceStates.has(uri.fsPath)) {
							console.log(`[SCM]\t${uri} no longer dirty`);
							this.changedResourceStates.delete(uri.fsPath);
						}
					}
				}
			});
		} catch (error) {
			console.error('Could not get scm state.');
			console.error(error);
		}

		this.changedResources.resourceStates = [...this.changedResourceStates.values()];

		// the number of modified resources needs to be assigned to the SourceControl.count filed to let VS Code show the number.
		this.portalScm.count = this.changedResources.resourceStates.length;
	}

	/** Determines whether the resource is different, regardless of line endings. */
	isDirty(doc: TextDocument): boolean {
		const originalText = this.portalData.getDocumentContent(doc.uri) || '';
		// if (!originalText) {
		// 	return true;
		// }
		const isDirty =
			originalText.replace(/\n/g, '').replace(/\r/g, '') !== doc.getText().replace(/\n/g, '').replace(/\r/g, '');

		if (isDirty) {
			console.log(`[SCM]\t${doc.fileName} is dirty`);
		}
		return isDirty;
	}

	isDirtyBase64(originalDocUri: Uri, doc: string): boolean {
		const originalText = this.portalData.getDocumentContent(originalDocUri, true) || '';
		// if (!originalText) {
		// 	return true;
		// }
		const isDirty =
			originalText !== doc;

		if (isDirty) {
			console.log(`[SCM]\t${originalDocUri.fsPath} is dirty`);
		}

		return isDirty;
	}

	toSourceControlResourceState(docUri: Uri, deleted: boolean): SourceControlResourceState {
		const repositoryUri = this.portalRepository.provideOriginalResource(docUri, null);

		const fileName = getFilename(docUri).split('.')[0];

		const command: Command | undefined = !deleted
			? {
					title: 'Show changes',
					command: 'vscode.diff',
					arguments: [
						repositoryUri,
						docUri,
						`${this.portalData.instanceName} ${fileName} ↔ Local changes`,
					],
					tooltip: 'Diff your changes',
			  }
			: undefined;

		const resourceState: SourceControlResourceState = {
			resourceUri: docUri,
			command: command,
			decorations: {
				strikeThrough: deleted,
				tooltip: 'File was locally deleted.'
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
export function getFilename(uri: Uri, fileType?: PortalFileType): string {
	if (fileType && fileType === PortalFileType.webFile) {
		return path.basename(uri.fsPath);
	}

	if (fileType === PortalFileType.contentSnippet) {
		// get base path up from FOLDER_CONTENT_SNIPPETS
		const folders = uri.fsPath.split(path.sep);
		const contentSnippetIndex = folders.indexOf(FOLDER_CONTENT_SNIPPETS);
		const fileName = folders.slice(contentSnippetIndex + 1);
		const fn = fileName.join('/').split('.')[0];
		return fn;
	}
	return path.basename(uri.fsPath).split('.')[0];
}

export function getFileType(uri: Uri): PortalFileType {
	const folders = path.dirname(uri.fsPath).split(path.sep);

	if (folders.includes(FOLDER_CONTENT_SNIPPETS)) {
		return PortalFileType.contentSnippet;
	}

	if (folders.includes(FOLDER_TEMPLATES)) {
		return PortalFileType.webTemplate;
	}

	if (folders.includes(FOLDER_WEB_FILES)) {
		return PortalFileType.webFile;
	}

	return PortalFileType.other;
}
