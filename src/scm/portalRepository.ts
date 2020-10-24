import { CancellationToken, ProviderResult, QuickDiffProvider, Uri, workspace, WorkspaceFolder } from "vscode";
import * as path from 'path';
import { ConfigurationManager } from "../configuration/configurationManager";
import { PortalFileType } from "../models/portalData";

export const POWERAPPSPORTAL_SCHEME = 'powerappsPortal';
export const FOLDER_CONTENT_SNIPPETS = 'Content Snippets';
export const FOLDER_TEMPLATES = 'Web Templates';

export class PowerAppsPortalRepository implements QuickDiffProvider {

	private workspaceFolder: WorkspaceFolder; 
	private configurationManager: ConfigurationManager;

	constructor(workspaceFolder: WorkspaceFolder, configurationManager: ConfigurationManager) {
		this.workspaceFolder = workspaceFolder;
		this.configurationManager = configurationManager;
	}

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		const relativePath = workspace.asRelativePath(uri.fsPath);
		return Uri.parse(`${POWERAPPSPORTAL_SCHEME}:${relativePath}`);
	}

	/**
	 * Enumerates the resources under source control.
	 */
	provideSourceControlledResources(): Uri[] {
		return [
			Uri.file(this.createLocalResourcePath('html')),
			Uri.file(this.createLocalResourcePath('js')),
			Uri.file(this.createLocalResourcePath('css'))];
	}

	/**
	 * Creates a local file path in the local workspace that corresponds to the part of the 
	 * fiddle denoted by the given extension.
	 *
	 * @param extension fiddle part, which is also used as a file extension
	 * @returns path of the locally cloned fiddle resource ending with the given extension
	 */
	createLocalResourcePath(fileType: PortalFileType) {
		
		switch (fileType) {
			case PortalFileType.contentSnippet:
				
				break;
		
			default:
				break;
		}
		return path.join(this.workspaceFolder.uri.fsPath, 'test' + '.' + extension);
	}
}