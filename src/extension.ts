import * as vscode from 'vscode';
import { DynamicsApi } from './api/dynamicsApi';
import { Utils } from './utils';
import { ConfigurationManager } from './configuration/configurationManager';
import { PowerAppsPortalDocumentContentProvider } from './scm/portalDocumentsContentProvider';
import { PowerAppsPortalSourceControl } from './scm/portalSourceControl';
import { POWERAPPSPORTAL_SCHEME } from './scm/portalRepository';
import path = require('path');

const SOURCE_CONTROL_OPEN_COMMAND = 'extension.source-control.open';
let portalDocumentContentProvider: PowerAppsPortalDocumentContentProvider;
const portalSourceControlRegister = new Map<vscode.Uri, PowerAppsPortalSourceControl>();

export function activate(context: vscode.ExtensionContext) {
	// check if workspace folder is opened
	let workspaceFolder: vscode.WorkspaceFolder;
	try {
		workspaceFolder = getWorkspaceFolder();
	} catch (error) {
		vscode.window.showErrorMessage(`Please open a work folder first.`);
		return;
	}

	// initialize configuration manager
	const configurationManager = new ConfigurationManager(workspaceFolder);
	portalDocumentContentProvider = new PowerAppsPortalDocumentContentProvider(workspaceFolder);

	const configureExtensionCommand = vscode.commands.registerCommand(
		'powerapps-portal-local-development.configureExtension',
		async () => {
			await configureExtension(configurationManager, workspaceFolder, context);
		}
	);
	context.subscriptions.push(configureExtensionCommand);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(POWERAPPSPORTAL_SCHEME, portalDocumentContentProvider)
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders((e) => {
			try {
				// initialize new source control for manually added workspace folders
				e.added.forEach((wf) => {
					initializeFolderFromConfiguration(configurationManager, wf, context);
				});
			} catch (ex) {
				vscode.window.showErrorMessage(ex.message);
			} finally {
				// dispose source control for removed workspace folders
				e.removed.forEach((wf) => {
					unregisterPortalSourceControl(wf.uri);
				});
			}
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function initializeFolderFromConfiguration(
	configurationManager: ConfigurationManager,
	folder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext
): Promise<void> {
	await configurationManager.load(context);
	const powerappsSourceControl = new PowerAppsPortalSourceControl(context, folder, configurationManager);
	registerPowerAppsPortalSourceControl(powerappsSourceControl, context);
}

function registerPowerAppsPortalSourceControl(
	powerappsSourceControl: PowerAppsPortalSourceControl,
	context: vscode.ExtensionContext
) {
	// update the fiddle document content provider with the latest content
	portalDocumentContentProvider.updated(powerappsSourceControl.getPortalData());

	// every time the repository is updated with new fiddle version, notify the content provider
	powerappsSourceControl.onRepositoryChange((fiddle) => portalDocumentContentProvider.updated(fiddle));

	if (portalSourceControlRegister.has(powerappsSourceControl.getWorkspaceFolder().uri)) {
		// the folder was already under source control
		const previousSourceControl = portalSourceControlRegister.get(powerappsSourceControl.getWorkspaceFolder().uri)!;
		previousSourceControl.dispose();
	}

	portalSourceControlRegister.set(powerappsSourceControl.getWorkspaceFolder().uri, powerappsSourceControl);

	context.subscriptions.push(powerappsSourceControl);
}

function unregisterPortalSourceControl(folderUri: vscode.Uri): void {
	if (portalSourceControlRegister.has(folderUri)) {
		const previousSourceControl = portalSourceControlRegister.get(folderUri)!;
		previousSourceControl.dispose();

		portalSourceControlRegister.delete(folderUri);
	}
}

async function start(
	folder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext,
	configurationManager: ConfigurationManager
) {}

async function configureExtension(
	configurationManager: ConfigurationManager,
	workspaceFolder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext
) {
	try {
		await configurationManager.load(context);
	} catch (error) {
		vscode.window.showErrorMessage('Could not load configuration. Please try again. Error: ' + error);
	}

	if (configurationManager.isConfigured) {
		vscode.window.showInformationMessage('Configuration successfully loaded.');
	} else {
		vscode.window.showErrorMessage('Could not load configuration. Please try again.');
	}

	// only overwrite data if new instance which hasn't been configured before
	const overwriteData = configurationManager.isPortalDataConfigured;

	// register source control
	let portalScm: PowerAppsPortalSourceControl;
	try {
		portalScm = await PowerAppsPortalSourceControl.getPortalScm(
			context,
			workspaceFolder,
			configurationManager,
			overwriteData
		);
	} catch (error) {
		vscode.window.showErrorMessage(error);
		return;
	}

	registerPowerAppsPortalSourceControl(portalScm, context);

	// show the file explorer with the three new files
	vscode.commands.executeCommand('workbench.view.explorer');
}

function getWorkspaceFolder(): vscode.WorkspaceFolder {
	const ws = vscode.workspace.workspaceFolders || [];
	if (ws.length === 0) {
		throw new Error('There is no open folder in visual studio code.');
	}

	return ws[0];
}
