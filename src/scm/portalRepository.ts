import {
	CancellationToken,
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
	provideSourceControlledResources(): Uri[] {
		const result: Array<Uri> = new Array<Uri>();

		if (!this.portalData) {
			return result;
		}

		for (const template of this.portalData.data.webTemplate.values()) {
			const f = Uri.file(this.createLocalResourcePath(template.name, PortalFileType.webTemplate));
			result.push(f);
		}

		for (const snippet of this.portalData.data.contentSnippet.values()) {
			const f = Uri.file(this.createLocalResourcePath(snippet.name, PortalFileType.contentSnippet));
			result.push(f);
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
				break;

			case PortalFileType.webTemplate:
				fileTypePath = FOLDER_TEMPLATES;
				break;

			default:
				break;
		}
		return path.join(this.workspaceFolder.uri.fsPath, fileTypePath, fileName + '.html');
	}

	public async download(): Promise<PortalData> {
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

		const result = new PortalData(this.configurationManager.d365InstanceName || '', this.portalName || '');
		const webTemplates = await this.d365WebApi.getWebTemplates(portalId);

		for (const template of webTemplates) {
			result.data.webTemplate.set(template.name, template);
		}

		const contentSnippets = await this.d365WebApi.getContentSnippets(portalId);

		for (const snippet of contentSnippets) {
			result.data.contentSnippet.set(snippet.name, snippet);
		}

		this.portalData = result;
		return result;
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
