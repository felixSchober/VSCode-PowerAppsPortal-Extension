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
import { Utils } from '../utils';
import path = require('path');

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
		this.portalScm.inputBox.placeholder = 'Not supported';

		context.subscriptions.push(this.portalScm);
		this.registerFileSystemWatcher(context, workspaceFolder);
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
			portalData = await portalScm.portalRepository.download();
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
		await portalScm.setPortalData(portalData, overwrite);
		return portalScm;
	}

	private registerFileSystemWatcher(context: ExtensionContext, workspaceFolder: WorkspaceFolder) {
		const fileSystemWatcher = workspace.createFileSystemWatcher(new RelativePattern(workspaceFolder, '**/*.*'));
		fileSystemWatcher.onDidChange((uri) => {
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
				title: `🔗 ${this.portalData.portalName}@${this.portalData.instanceName}`,
				tooltip: 'Checkout portal.',
			},
		];
	}

	async commitAll(): Promise<void> {
		if (!this.changedResources.resourceStates.length) {
			window.showErrorMessage('[SCM] There is nothing to commit.');
		} else {
			console.log('[SCM] Commit data');
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

		for (const webFile of this.portalData.data.webFile.values()) {
			this.resetFile(webFile.d365Note.filename, PortalFileType.webFile);
		}
	}

	/** Resets the given local file content to the checked-out version. */
	private async resetFile(fileName: string, fileType: PortalFileType): Promise<void> {
		const filePath = this.portalRepository.createLocalResourcePath(fileName, fileType);

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
				const newPortalData = await this.portalRepository.download();

				// force set data (overwrite = true)
				await this.setPortalData(newPortalData, true);
			} catch (ex) {
				window.showErrorMessage(ex);
			}
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
			this.resetFilesToCheckedOutVersion();
		}

		// initially, mark all files as changed
		this.changedGroup = new Set<Uri>(this.portalRepository.provideSourceControlledResources());


		this._onRepositoryChange.fire(this.portalData);
		this.refreshStatusBar();
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

		for (const uri of uris) {
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
				isDirty = true;
				wasDeleted = true;
			}

			if (isDirty) {
				const resourceState = this.toSourceControlResourceState(uri, wasDeleted);

				// use a map to prevent duplicate change entriees
				this.changedResourceStates.set(uri.fsPath, resourceState);
			} else {
				// uri is not dirty. check if it is in changedresouce state (could have been previously changed but then changed back)
				if (this.changedResourceStates.has(uri.fsPath)) {
					console.log(`[SCM]\t${uri} no longer dirty`);
					this.changedResourceStates.delete(uri.fsPath);
				}
			}
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
export function getFilename(uri: Uri, fileType?: PortalFileType): string {
	if (fileType && fileType === PortalFileType.webFile) {
		return path.basename(uri.fsPath);
	}
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
			throw Error(`[SCM] Unknown portal file type: ${fileFolder}.`);
	}
}
