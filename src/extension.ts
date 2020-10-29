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
	let workFolderPath: string;
	try {
		workFolderPath = getWorkspacePath();
	} catch (error) {
		vscode.window.showErrorMessage(`Please open a work folder first.`);
		return;
	}

	const workspaceFolder = getWorkspaceFolder();

	const configurationManager = new ConfigurationManager();
	portalDocumentContentProvider = new PowerAppsPortalDocumentContentProvider(workspaceFolder);

	const configureExtensionCommand = vscode.commands.registerCommand(
		'powerapps-portal-local-development.configureExtension',
		async () => {
			await configureExtension(configurationManager, workFolderPath, workspaceFolder, context);
		}
	);
	context.subscriptions.push(configureExtensionCommand);


	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(POWERAPPSPORTAL_SCHEME, portalDocumentContentProvider));
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		try {
			// initialize new source control for manually added workspace folders
			e.added.forEach(wf => {
				initializeFolderFromConfiguration(wf, context);
			});
		} catch (ex) {
			vscode.window.showErrorMessage(ex.message);
		} finally {
			// dispose source control for removed workspace folders
			e.removed.forEach(wf => {
				unregisterPortalSourceControl(wf.uri);
			});
		}
	}));

	
	
	// let disposable = vscode.commands.registerCommand('powerapps-portal-local-development.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed

	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from PowerApps Portal Local Development!');

	// 	const workspace = vscode.workspace;
	// 	console.log(vscode.workspace.workspaceFile);
	// });

	// context.subscriptions.push(disposable);

	// const d365SyncCommand = vscode.commands.registerCommand('powerapps-portal-local-development.syncD365Instance', async () => {
	// 	await syncFromDynamicsInstance(d365Api);
	// });

	// context.subscriptions.push(d365SyncCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}


async function initializeFolderFromConfiguration(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext): Promise<void> {
	
	const configurationManager = new ConfigurationManager();
	await configurationManager.load(context);
	const powerappsSourceControl = new PowerAppsPortalSourceControl(context, folder, configurationManager);
	registerPowerAppsPortalSourceControl(powerappsSourceControl, context);
}

function registerPowerAppsPortalSourceControl(powerappsSourceControl: PowerAppsPortalSourceControl, context: vscode.ExtensionContext) {
	// update the fiddle document content provider with the latest content
	portalDocumentContentProvider.updated(powerappsSourceControl.getPortalData());

	// every time the repository is updated with new fiddle version, notify the content provider
	powerappsSourceControl.onRepositoryChange(fiddle => portalDocumentContentProvider.updated(fiddle));

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

async function start(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext, configurationManager: ConfigurationManager) {
	
}

async function configureExtension(
	configurationManager: ConfigurationManager,
	workFolderPath: string,
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

	// register source control
	const portalScm = await PowerAppsPortalSourceControl.getPortalScm(context, workspaceFolder, configurationManager);
	registerPowerAppsPortalSourceControl(portalScm, context);

	
	// show the file explorer with the three new files
	vscode.commands.executeCommand("workbench.view.explorer");

}

function getWorkspacePath(): string {
	return getWorkspaceFolder().uri.fsPath;
}

function getWorkspaceFolder(): vscode.WorkspaceFolder {
	const ws = vscode.workspace.workspaceFolders || [];
	if (ws.length === 0) {
		throw new Error('There is no open folder in visual studio code.');
	}

	return ws[0];
}
