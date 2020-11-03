import {
	CancellationToken,
	ProgressLocation,
	ProgressOptions,
	ProviderResult,
	QuickDiffProvider,
	Uri,
	window,
	workspace,
	WorkspaceFolder,
} from 'vscode';
import * as path from 'path';
import { ConfigurationManager } from '../configuration/configurationManager';
import { PortalData, PortalFileType } from '../models/portalData';
import { DynamicsApi } from '../api/dynamicsApi';
import { ALL_FILES_GLOB } from './afs';
import { WebTemplate } from '../models/WebTemplate';
import { getFileType } from './portalSourceControl';
import { ContentSnippet } from '../models/ContentSnippet';
import { WebFile } from '../models/WebFile';

export const POWERAPPSPORTAL_SCHEME = 'powerappsPortal';
export const FOLDER_CONTENT_SNIPPETS = 'Content Snippets';
export const FOLDER_TEMPLATES = 'Web Templates';
export const FOLDER_WEB_FILES = 'Web Files';

export class PowerAppsPortalRepository implements QuickDiffProvider {
	private workspaceFolder: WorkspaceFolder;
	private configurationManager: ConfigurationManager;
	private d365WebApi: DynamicsApi;
	public portalName: string | undefined;
	public portalId: string | undefined;
	private portalData: PortalData | undefined;

	constructor(workspaceFolder: WorkspaceFolder, configurationManager: ConfigurationManager) {
		this.workspaceFolder = workspaceFolder;
		this.configurationManager = configurationManager;
		this.d365WebApi = new DynamicsApi(this.configurationManager);
	}

	provideOriginalResource(uri: Uri, token: CancellationToken | null): ProviderResult<Uri> {
		const relativePath = workspace.asRelativePath(uri.fsPath);
		return Uri.parse(`${POWERAPPSPORTAL_SCHEME}:${relativePath}`);
	}

	/**
	 * Enumerates the resources under source control.
	 */
	async provideSourceControlledResources(): Promise<Set<Uri>> {
		const result: Set<Uri> = new Set<Uri>();
		const resultPaths = new Set<string>();

		if (!this.portalData) {
			return result;
		}

		for (const template of this.portalData.data.webTemplate.values()) {
			// const f = Uri.file(this.createLocalResourcePath(template.name, PortalFileType.webTemplate));
			resultPaths.add(this.createLocalResourcePath(template.name, PortalFileType.webTemplate));
		}

		for (const snippet of this.portalData.data.contentSnippet.values()) {
			// const f = Uri.file(this.createLocalResourcePath(snippet.name, PortalFileType.contentSnippet));
			resultPaths.add(this.createLocalResourcePath(snippet.name, PortalFileType.contentSnippet));
		}

		for (const file of this.portalData.data.webFile.values()) {
			// const f = Uri.file(this.createLocalResourcePath(file.d365Note.filename, PortalFileType.webFile));
			resultPaths.add(this.createLocalResourcePath(file.d365Note.filename, PortalFileType.webFile));
		}

		// iterate over all files currently in workspace folder. 
		// this allows us to add files to the scm even if they haven't been tracked
		// by scm before
		const filesInFolder = await workspace.findFiles(ALL_FILES_GLOB);
		for (const f of filesInFolder) {
			resultPaths.add(f.fsPath);
		}

		// prepare result
		for (const p of resultPaths) {
			result.add(Uri.file(p));
		}

		return result;
	}

	/**
	 * Creates a local file path in the local workspace that corresponds to the part of the
	 * fiddle denoted by the given extension.
	 *
	 * @param extension fiddle part, which is also used as a file extension
	 * @returns path of the locally cloned fiddle resource ending with the given extension
	 */
	createLocalResourcePath(fileName: string, fileType: PortalFileType) {
		let fileTypePath = '';
		fileName = fileName.replace(/\//g, '_');
		switch (fileType) {
			case PortalFileType.contentSnippet:
				fileTypePath = FOLDER_CONTENT_SNIPPETS;
				break;

			case PortalFileType.webFile:
				fileTypePath = FOLDER_WEB_FILES;
				return path.join(this.workspaceFolder.uri.fsPath, fileTypePath, fileName);

			case PortalFileType.webTemplate:
				fileTypePath = FOLDER_TEMPLATES;
				break;

			default:
				break;
		}
		return path.join(this.workspaceFolder.uri.fsPath, fileTypePath, fileName + '.html');
	}

	public async download(): Promise<PortalData> {
		const progressOptions: ProgressOptions = {
			location: ProgressLocation.Notification,
			title: 'Downloading data from Dynamics',
			cancellable: true
		};

		try {
			return window.withProgress(progressOptions, async (progress, token) => {
				token.onCancellationRequested(() => {
					console.log("User canceled the long running operation");
					return new PortalData(this.configurationManager.d365InstanceName || '', this.portalName || '');
				});
	
				let progressMessage = `Downloading data`;
				progress.report({
					message: progressMessage
				});
	
				let portalId: string | undefined;
				if (!this.configurationManager.isPortalDataConfigured) {
					portalId = await this.choosePortal();
				} else {
					portalId = this.configurationManager.portalId;
					this.portalName = this.configurationManager.portalName;
				}
	
	
				if (!portalId) {
					console.error('[REPO] Could not get portal id either from existing configuration or from user.');
					return new PortalData(this.configurationManager.d365InstanceName || '', this.portalName || '');
				}
	
				progressMessage += `\n\tPortal resolved: ${this.portalName}`;
				progress.report({
					increment: 25,
					message: progressMessage + `\n\t… Templates`
				});
	
				const result = new PortalData(this.configurationManager.d365InstanceName || '', this.portalName || '');
				const webTemplates = await this.d365WebApi.getWebTemplates(portalId);
	
				progressMessage += `\n\t✓ Templates: ${webTemplates.length}`;
				progress.report({
					increment: 25,
					message: progressMessage + `\n\t… Content Snippets`
				});
	
				for (const template of webTemplates) {
					result.data.webTemplate.set(template.name, template);
				}
	
				const contentSnippets = await this.d365WebApi.getContentSnippets(portalId);
				
				progressMessage += `\n\t✓ Content Snippets: ${webTemplates.length}`;
				progress.report({
					increment: 25,
					message: progressMessage + `\n\t… Files`
				});
	
				for (const snippet of contentSnippets) {
					result.data.contentSnippet.set(snippet.name, snippet);
				}
	
				const webFiles = await this.d365WebApi.getWebFiles(portalId);
				for (const file of webFiles) {
					result.data.webFile.set(file.d365Note.filename, file);
				}
	
				progressMessage += `\n\t✓ Files: ${webTemplates.length}`;
				progress.report({
					increment: 25,
					message: progressMessage
				});
	
				window.showInformationMessage(progressMessage);
	
				this.portalData = result;
				return result;
			});
		} catch (error) {
			window.showErrorMessage('Could not download data: ' + error);
			throw new Error(error);
		}
	}

	public async deleteFile(fileType: PortalFileType, uri: Uri) {

	}

	public async updateFile(fileType: PortalFileType, uri: Uri, updatedFileContent: string): Promise<void> {
		if (!this.portalData) {
			throw Error('Could not update file because portal data in repo class was not set.');
		}

		switch (fileType) {
			case PortalFileType.webTemplate:
				const existingTemplate = this.portalData.getWebTemplate(uri);
				const resultT = await this.updateWebTemplate(existingTemplate, updatedFileContent);
				if (resultT) {
					this.portalData.data.webTemplate.set(resultT.name, resultT);
					console.log(`\t[REPO] Template ${resultT.name} was updated.`);
				} else {
					throw new Error(`Could not find file for uri ${uri}`);
				}
				
				break;

			case PortalFileType.contentSnippet:
				const existingSnippet = this.portalData.getContentSnippet(uri);
				const resultS = await this.updateContentSnippet(existingSnippet, updatedFileContent);

				if (resultS) {
					this.portalData.data.contentSnippet.set(resultS.name, resultS);
					console.log(`\t[REPO] Snippet ${resultS.name} was updated.`);
				} else {
					throw new Error(`Could not find file for uri ${uri}`);
				}

				break;


			case PortalFileType.webFile:
				const existingFile = this.portalData.getWebFile(uri);
				const resultF = await this.updateWebFile(existingFile, updatedFileContent);

				if (resultF) {
					this.portalData.data.webFile.set(resultF.d365Note.filename, resultF);
					console.log(`\t[REPO] File ${resultF.d365Note.filename} was updated.`);
				} else {
					throw new Error(`Could not find file for uri ${uri}`);
				}

				break;

			default:
				break;
		}
	}

	private async updateWebTemplate(existingTemplate: WebTemplate | undefined, updatedFileContent: string): Promise<WebTemplate | undefined> {
		if (!existingTemplate) {
			return;
		}

		existingTemplate.source = updatedFileContent;
		return await this.d365WebApi.updateWebTemplate(existingTemplate);
	}

	private async updateContentSnippet(existingSnippet: ContentSnippet | undefined, updatedFileContent: string): Promise<ContentSnippet | undefined> {
		if(!existingSnippet) {
			return;
		}

		existingSnippet.source = updatedFileContent;
		return await this.d365WebApi.updateContentSnippet(existingSnippet);
	}

	private async updateWebFile(existingFile: WebFile | undefined, updatedFileContent: string): Promise<WebFile | undefined> {
		if (!existingFile) {
			return;
		}

		existingFile.updateDocumentContent = updatedFileContent;

		const updatedNote = await this.d365WebApi.upateFiles([existingFile.d365Note]);

		if (updatedNote.length > 0) {
			existingFile.updateNote = updatedNote[0];
			return existingFile;
		}

		throw Error(`Could not update file ${existingFile.d365File.adx_name}. Result set from dynamics was empty.`);
	}

	public async addFile(fileType: PortalFileType, uri: Uri, newFileContent: string) {

	}

	public getPortalData(): PortalData {
		if (this.portalData) {
			return this.portalData;
		}

		return new PortalData(this.configurationManager.d365InstanceName || '', this.portalName || '');
	}

	private async choosePortal(): Promise<string | undefined> {
		const portals = await this.d365WebApi.getPortals();
		const portalChoice = await window.showQuickPick(new Array(...portals.keys()), {
			placeHolder: 'Select Portal',
			ignoreFocusOut: true,
		});

		if (!portalChoice) {
			return;
		}

		this.portalName = portalChoice;
		this.portalId = portals.get(portalChoice);
		return this.portalId;
	}
}
